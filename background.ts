
// background.ts

const MAX_LOGS = 100;
const EXTENSION_ID = chrome.runtime.id;

// Rule IDs for declarativeNetRequest session rules.
//  1 = dashboard replay header override (single URL, high priority)
//  2 = global headers injected into every network request (Header tab)
const REPLAY_HEADER_RULE_ID = 1;
const GLOBAL_HEADER_RULE_ID = 2;
const GLOBAL_HEADERS_KEY = 'globalHeaders';
const GLOBAL_HEADERS_ENABLED_KEY = 'globalHeadersEnabled';

// Store pending requests in memory to correlate headers/body/completion
const pendingRequests: Record<string, any> = {};
let isRecordingCached = false;

chrome.storage.local.get(['isRecording'], (result) => {
  isRecordingCached = !!result?.isRecording;
});

const updateBadge = (recording: boolean) => {
  if (chrome.action) {
    if (recording) {
      chrome.action.setBadgeText({ text: "REC" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  }
};

chrome.runtime.onInstalled.addListener(() => {
  isRecordingCached = false;
  chrome.storage.local.set({ isRecording: false, logs: [] });
  updateBadge(false);
  // Clear any existing dynamic replay rule on startup
  chrome.declarativeNetRequest.updateSessionRules({
     removeRuleIds: [REPLAY_HEADER_RULE_ID]
  });
  // Rebuild the global header rule from persisted state.
  applyGlobalHeaderRule();
});

// Session rules are cleared when the service worker/browser restarts, so
// rebuild the global header rule whenever the SW spins back up.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['isRecording'], (result) => {
    isRecordingCached = !!result?.isRecording;
    updateBadge(isRecordingCached);
  });
  applyGlobalHeaderRule();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isRecording) {
    isRecordingCached = !!changes.isRecording.newValue;
    updateBadge(isRecordingCached);
  }
  if (changes[GLOBAL_HEADERS_KEY] || changes[GLOBAL_HEADERS_ENABLED_KEY]) {
    applyGlobalHeaderRule();
  }
});

// --- Global Header DNR Rule ---
// Reads globalHeadersEnabled + globalHeaders from storage and maintains a
// single session rule (id=2) that SETs each enabled header on every network
// request. Removes the rule when disabled or when no enabled headers exist.
const applyGlobalHeaderRule = () => {
    chrome.storage.local.get([GLOBAL_HEADERS_KEY, GLOBAL_HEADERS_ENABLED_KEY], (result) => {
        if (chrome.runtime.lastError) return;
        const enabled = result[GLOBAL_HEADERS_ENABLED_KEY] === true; // default OFF
        const headers = (result[GLOBAL_HEADERS_KEY] || []) as any[];
        const requestHeaders = headers
            .filter(h => h && h.enabled && h.key)
            .map(h => ({
                header: h.key,
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: h.value ?? ''
            }));

        if (!enabled || requestHeaders.length === 0) {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [GLOBAL_HEADER_RULE_ID]
            }).catch(() => { /* noop */ });
            return;
        }

        const rule = {
            id: GLOBAL_HEADER_RULE_ID,
            // Lower than the replay rule (999) so a dashboard replay can still
            // override the same header for its specific request.
            priority: 1,
            action: {
                type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
                requestHeaders
            },
            condition: {
                // DNR excludes main_frame when resourceTypes is omitted, so
                // enumerate every type explicitly to include page navigation.
                resourceTypes: Object.values(
                    chrome.declarativeNetRequest.ResourceType
                )
            }
        };

        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [GLOBAL_HEADER_RULE_ID],
            addRules: [rule as any]
        }).catch(error => {
            console.error('Failed to apply global header rule:', error);
        });
    });
};

// --- DNR Rule Manager for Header Overrides ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SET_REQUEST_HEADERS') {
        const { url, headers } = message;
        const ruleId = REPLAY_HEADER_RULE_ID;
        const requestHeaders = (headers || [])
            .filter((h: any) => h && (h.key || h.name))
            .map((h: any) => ({
                header: h.key || h.name,
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: h.value ?? ''
            }));

        const cleanUrl = typeof url === 'string' ? url.split('?')[0].trim() : '';

        if (!cleanUrl || requestHeaders.length === 0) {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [ruleId]
            }).then(() => {
                sendResponse({ success: true });
            }).catch(err => {
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        const rule = {
            id: ruleId,
            priority: 999,
            action: {
                type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
                requestHeaders: requestHeaders
            },
            condition: {
                urlFilter: cleanUrl,
                // Only modify headers for API requests (fetch/XHR)
                resourceTypes: [
                    chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST
                ]
            }
        };

        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [ruleId],
            addRules: [rule]
        }).then(() => {
            sendResponse({ success: true });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (message.type === 'CLEAR_REQUEST_HEADERS') {
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [REPLAY_HEADER_RULE_ID]
        }).then(() => {
            sendResponse({ success: true });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    // Captured JSON response body from the page-side mock-injector.
    // Best-effort match to the most recent log entry for the same url+method.
    if (message.type === 'XAPI_RESPONSE_BODY' && message.payload) {
        const { url, method, body, truncated } = message.payload;
        if (typeof url !== 'string' || typeof body !== 'string') return;
        if (!isRecordingCached) return;
        attachResponseBody(url, method, body, !!truncated);
        return; // no async sendResponse
    }
});

// Locate the most recent matching log entry (in pendingRequests first, else
// in stored logs) and write responseBody onto it.
const attachResponseBody = (url: string, method: string, body: string, truncated: boolean) => {
    const m = (method || 'GET').toUpperCase();
    // 1) Try in-memory pending requests (preferred — matches by exact request).
    const matches = Object.values(pendingRequests).filter((p: any) =>
        p && p.url === url && (p.method || '').toUpperCase() === m
    ) as any[];
    if (matches.length > 0) {
        // Most recent wins.
        const log = matches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        log.responseBody = body;
        if (truncated) log.responseTruncated = true;
        saveLog(log);
        return;
    }
    // 2) Fallback: patch the most recent matching entry already in storage,
    //    bounded to the last 10s to avoid overwriting unrelated old logs.
    chrome.storage.local.get(['logs'], (res) => {
        const logs = (res.logs || []) as any[];
        const now = Date.now();
        const idx = logs.findIndex((l: any) =>
            l && l.url === url &&
            (l.method || '').toUpperCase() === m &&
            now - (l.timestamp || 0) < 10_000
        );
        if (idx === -1) return;
        const nextLog = { ...logs[idx], responseBody: body };
        if (truncated) nextLog.responseTruncated = true;
        saveLog(nextLog);
    });
};

// --- Storage Queue ---
let isSaving = false;
const saveQueue: any[] = [];

const processQueue = () => {
    if (isSaving || saveQueue.length === 0) return;

    isSaving = true;
    const logToSave = saveQueue.shift();

    chrome.storage.local.get(['logs'], (result) => {
        const currentLogs = result.logs || [];
        const idx = currentLogs.findIndex((l: any) => l.id === logToSave.id);
        let newLogs;

        if (idx !== -1) {
            // Merge update into existing entry
            currentLogs[idx] = { ...currentLogs[idx], ...logToSave };
            newLogs = currentLogs;
        } else {
            // Don't save partial logs that don't at least have a URL
            if (!logToSave.url) {
                isSaving = false;
                if (saveQueue.length > 0) processQueue();
                return;
            }
            newLogs = [logToSave, ...currentLogs].slice(0, MAX_LOGS);
        }

        chrome.storage.local.set({ logs: newLogs }, () => {
            isSaving = false;
            if (saveQueue.length > 0) processQueue();
        });
    });
};

const saveLog = (log: any) => {
  saveQueue.push({ ...log }); // Push a copy
  processQueue();
};

const isExtensionRequest = (details: any) => {
    return (
        details.initiator?.includes(EXTENSION_ID) ||
        details.url.startsWith('chrome-extension://') ||
        details.url.startsWith('data:') ||
        details.url.startsWith('blob:')
    );
};

/**
 * Filter for API requests only.
 * In Chrome's webRequest API, 'xmlhttprequest' covers both XHR and Fetch.
 */
const isApiRequest = (details: any) => {
    return details.type === 'xmlhttprequest';
};

// Internal helper to get or create a pending request object
const getOrCreatePending = (requestId: string) => {
    if (!pendingRequests[requestId]) {
        pendingRequests[requestId] = {
            id: requestId,
            status: 0,
            timestamp: Date.now(),
            requestHeaders: {},
            responseHeaders: {}
        };
    }
    return pendingRequests[requestId];
};

// 1. Capture Basic Info & Body
chrome.webRequest.onBeforeRequest.addListener(
  (details: any) => {
    if (!isRecordingCached || isExtensionRequest(details) || details.type === 'ping' || !isApiRequest(details)) return;

    const log = getOrCreatePending(details.requestId);
    log.url = details.url;
    log.method = details.method;
    log.type = details.type;

    if (details.requestBody) {
      if (details.requestBody.raw && details.requestBody.raw[0]) {
         const enc = new TextDecoder("utf-8");
         try { log.requestBody = enc.decode(details.requestBody.raw[0].bytes); }
         catch (e) { log.requestBody = "[Binary Data]"; }
      } else if (details.requestBody.formData) {
         log.requestBody = details.requestBody.formData;
      }
    }

    saveLog(log);
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// 2. Capture Request Headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details: any) => {
    if (!isRecordingCached || isExtensionRequest(details) || !isApiRequest(details)) return;

    const log = getOrCreatePending(details.requestId);
    const headers: Record<string, string> = {};
    details.requestHeaders?.forEach((h: any) => { headers[h.name] = h.value || ''; });
    log.requestHeaders = { ...log.requestHeaders, ...headers };

    saveLog(log);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

// 3. Capture Response Headers
chrome.webRequest.onHeadersReceived.addListener(
  (details: any) => {
    if (!isRecordingCached || isExtensionRequest(details) || !isApiRequest(details)) return;

    const log = getOrCreatePending(details.requestId);
    const headers: Record<string, string> = {};
    details.responseHeaders?.forEach((h: any) => { headers[h.name] = h.value || ''; });
    log.responseHeaders = { ...log.responseHeaders, ...headers };

    saveLog(log);
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

// 4. Capture Completion
chrome.webRequest.onCompleted.addListener(
  (details: any) => {
    if (pendingRequests[details.requestId] && isApiRequest(details)) {
      const log = pendingRequests[details.requestId];
      log.status = details.statusCode;
      saveLog(log);
      // Clean up after a short delay to allow last-second async tasks
      setTimeout(() => { delete pendingRequests[details.requestId]; }, 2000);
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details: any) => {
    if (pendingRequests[details.requestId] && isApiRequest(details)) {
      const log = pendingRequests[details.requestId];
      log.status = 0;
      log.error = details.error;
      saveLog(log);
      delete pendingRequests[details.requestId];
    }
  },
  { urls: ["<all_urls>"] }
);
