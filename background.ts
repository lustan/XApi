// background.ts

const MAX_LOGS = 100;
const EXTENSION_ID = chrome.runtime.id;

// Rule IDs for declarativeNetRequest session rules.
//  1 = dashboard replay header override (single URL, high priority)
//  2 = global headers injected into network requests (Header tab)
//  3 = CORS bypass response headers override
const REPLAY_HEADER_RULE_ID = 1;
const GLOBAL_HEADER_RULE_ID = 2;
const CORS_BYPASS_RULE_ID = 3;

const GLOBAL_HEADERS_KEY = 'globalHeaders';
const GLOBAL_HEADERS_ENABLED_KEY = 'globalHeadersEnabled';
const GLOBAL_HEADERS_URL_FILTER_KEY = 'globalHeadersUrlFilter';
const CORS_BYPASS_ENABLED_KEY = 'corsBypassEnabled';
const CORS_BYPASS_URL_FILTER_KEY = 'corsBypassUrlFilter';
const CAPTURE_EXCLUDE_DOMAINS_KEY = 'captureExcludeDomains';

// Store pending requests in memory to correlate headers/body/completion
const pendingRequests: Record<string, any> = {};
let isRecordingCached = false;
let excludedDomainsCached: string[] = [];

const normalizeExcludedDomains = (raw: any): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => String(d || '').trim().toLowerCase())
    .filter(Boolean);
};

chrome.storage.local.get(['isRecording', CAPTURE_EXCLUDE_DOMAINS_KEY], (result) => {
  isRecordingCached = !!result?.isRecording;
  excludedDomainsCached = normalizeExcludedDomains(result?.[CAPTURE_EXCLUDE_DOMAINS_KEY]);
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

const extractGraphqlOperationName = (body: any): string | undefined => {
  if (!body) return undefined;
  let obj = body;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed.startsWith('{')) return undefined;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object') return undefined;
  if (typeof obj.operationName === 'string' && obj.operationName.trim()) {
    return obj.operationName.trim();
  }
  if (typeof obj.query === 'string') {
    const m = obj.query.match(/\b(?:query|mutation|subscription)\s+([A-Za-z0-9_]+)/);
    if (m && m[1]) return m[1];
  }
  return undefined;
};

chrome.runtime.onInstalled.addListener(() => {
  isRecordingCached = false;
  chrome.storage.local.set({ isRecording: false, logs: [] });
  updateBadge(false);
  chrome.declarativeNetRequest.updateSessionRules({
     removeRuleIds: [REPLAY_HEADER_RULE_ID]
  });
  applyGlobalHeaderRule();
  syncCorsBypassOnBoot();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['isRecording', CAPTURE_EXCLUDE_DOMAINS_KEY], (result) => {
    isRecordingCached = !!result?.isRecording;
    excludedDomainsCached = normalizeExcludedDomains(result?.[CAPTURE_EXCLUDE_DOMAINS_KEY]);
    updateBadge(isRecordingCached);
  });
  applyGlobalHeaderRule();
  syncCorsBypassOnBoot();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isRecording) {
    isRecordingCached = !!changes.isRecording.newValue;
    updateBadge(isRecordingCached);
  }
  if (changes[CAPTURE_EXCLUDE_DOMAINS_KEY]) {
    excludedDomainsCached = normalizeExcludedDomains(changes[CAPTURE_EXCLUDE_DOMAINS_KEY].newValue);
  }
  if (changes[GLOBAL_HEADERS_KEY] || changes[GLOBAL_HEADERS_ENABLED_KEY] || changes[GLOBAL_HEADERS_URL_FILTER_KEY]) {
    applyGlobalHeaderRule();
  }
  if (changes[CORS_BYPASS_ENABLED_KEY] || changes[CORS_BYPASS_URL_FILTER_KEY]) {
    applyCorsBypassRule();
  }
});

// --- Global Header DNR Rule ---
const applyGlobalHeaderRule = () => {
    chrome.storage.local.get([GLOBAL_HEADERS_KEY, GLOBAL_HEADERS_ENABLED_KEY, GLOBAL_HEADERS_URL_FILTER_KEY], (result) => {
        if (chrome.runtime.lastError) return;
        const enabled = result[GLOBAL_HEADERS_ENABLED_KEY] === true;
        const headers = (result[GLOBAL_HEADERS_KEY] || []) as any[];
        const urlFilter = typeof result[GLOBAL_HEADERS_URL_FILTER_KEY] === 'string'
            ? result[GLOBAL_HEADERS_URL_FILTER_KEY].trim()
            : '';

        const removeOp = (chrome.declarativeNetRequest.HeaderOperation as any)?.REMOVE || 'remove';

        const requestHeaders = headers
            .filter(h => h && h.enabled && h.key)
            .map(h => {
                if (h.operation === 'remove') {
                    return {
                        header: h.key,
                        operation: removeOp
                    };
                }
                return {
                    header: h.key,
                    operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                    value: h.value ?? ''
                };
            });

        if (!enabled || requestHeaders.length === 0) {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [GLOBAL_HEADER_RULE_ID]
            }).catch(() => { /* noop */ });
            return;
        }

        const condition: any = {
            resourceTypes: Object.values(
                chrome.declarativeNetRequest.ResourceType
            )
        };
        if (urlFilter) {
            condition.urlFilter = urlFilter;
        }

        const rule = {
            id: GLOBAL_HEADER_RULE_ID,
            priority: 1,
            action: {
                type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
                requestHeaders
            },
            condition
        };

        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [GLOBAL_HEADER_RULE_ID],
            addRules: [rule as any]
        }).catch(error => {
            console.error('Failed to apply global header rule:', error);
        });
    });
};

// --- One-Click CORS Bypass DNR Rule ---
const syncCorsBypassOnBoot = () => {
    chrome.storage.local.get([CORS_BYPASS_ENABLED_KEY], (result) => {
        if (chrome.runtime.lastError) return;
        if (result[CORS_BYPASS_ENABLED_KEY] === true) {
            applyCorsBypassRule();
        }
    });
};

const applyCorsBypassRule = () => {
    chrome.storage.local.get([CORS_BYPASS_ENABLED_KEY, CORS_BYPASS_URL_FILTER_KEY], (result) => {
        if (chrome.runtime.lastError) return;
        const enabled = result[CORS_BYPASS_ENABLED_KEY] === true;
        if (!enabled) {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [CORS_BYPASS_RULE_ID]
            }).catch(() => { /* noop */ });
            return;
        }

        const urlFilter = typeof result[CORS_BYPASS_URL_FILTER_KEY] === 'string'
            ? result[CORS_BYPASS_URL_FILTER_KEY].trim()
            : '';

        const setOp = chrome.declarativeNetRequest.HeaderOperation.SET;
        const condition: any = {
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST]
        };
        if (urlFilter) {
            condition.urlFilter = urlFilter;
        }

        const rule = {
            id: CORS_BYPASS_RULE_ID,
            priority: 2,
            action: {
                type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
                responseHeaders: [
                    { header: 'Access-Control-Allow-Origin', operation: setOp, value: '*' },
                    { header: 'Access-Control-Allow-Methods', operation: setOp, value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD' },
                    { header: 'Access-Control-Allow-Headers', operation: setOp, value: '*' },
                    { header: 'Access-Control-Allow-Credentials', operation: setOp, value: 'true' }
                ]
            },
            condition
        };

        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [CORS_BYPASS_RULE_ID],
            addRules: [rule as any]
        }).catch(error => {
            console.error('Failed to apply CORS bypass rule:', error);
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

    if (message.type === 'XAPI_RESPONSE_BODY' && message.payload) {
        const { url, method, body, truncated } = message.payload;
        if (typeof url !== 'string' || typeof body !== 'string') return;
        if (!isRecordingCached) return;
        attachResponseBody(url, method, body, !!truncated);
        return;
    }
});

const attachResponseBody = (url: string, method: string, body: string, truncated: boolean) => {
    const m = (method || 'GET').toUpperCase();
    const matches = Object.values(pendingRequests).filter((p: any) =>
        p && p.url === url && (p.method || '').toUpperCase() === m
    ) as any[];
    if (matches.length > 0) {
        const log = matches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        log.responseBody = body;
        if (truncated) log.responseTruncated = true;
        saveLog(log);
        return;
    }
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
            currentLogs[idx] = { ...currentLogs[idx], ...logToSave };
            newLogs = currentLogs;
        } else {
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
  saveQueue.push({ ...log });
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

const isExcludedDomain = (url: string) => {
    if (excludedDomainsCached.length === 0) return false;
    try {
        const host = new URL(url).hostname.toLowerCase();
        return excludedDomainsCached.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
        return false;
    }
};

const isApiRequest = (details: any) => {
    return details.type === 'xmlhttprequest';
};

const getOrCreatePending = (requestId: string, tabId?: number) => {
    if (!pendingRequests[requestId]) {
        const now = Date.now();
        pendingRequests[requestId] = {
            id: requestId,
            status: 0,
            timestamp: now,
            startTime: now,
            tabId: typeof tabId === 'number' && tabId >= 0 ? tabId : undefined,
            requestHeaders: {},
            responseHeaders: {}
        };
    }
    return pendingRequests[requestId];
};

// 1. Capture Basic Info & Body
chrome.webRequest.onBeforeRequest.addListener(
  (details: any) => {
    if (!isRecordingCached || isExtensionRequest(details) || details.type === 'ping' || !isApiRequest(details) || isExcludedDomain(details.url)) return;

    const log = getOrCreatePending(details.requestId, details.tabId);
    log.url = details.url;
    log.method = details.method;
    log.type = details.type;

    if (details.requestBody) {
      if (details.requestBody.raw && details.requestBody.raw[0]) {
         const enc = new TextDecoder("utf-8");
         try {
           log.requestBody = enc.decode(details.requestBody.raw[0].bytes);
           const op = extractGraphqlOperationName(log.requestBody);
           if (op) log.graphqlOperationName = op;
         } catch {
           log.requestBody = "[Binary Data]";
         }
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
    if (!isRecordingCached || isExtensionRequest(details) || !isApiRequest(details) || isExcludedDomain(details.url)) return;

    const log = getOrCreatePending(details.requestId, details.tabId);
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
    if (!isRecordingCached || isExtensionRequest(details) || !isApiRequest(details) || isExcludedDomain(details.url)) return;

    const log = getOrCreatePending(details.requestId, details.tabId);
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
      if (log.startTime) {
        log.duration = Math.max(0, Date.now() - log.startTime);
      }
      saveLog(log);
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
      if (log.startTime) {
        log.duration = Math.max(0, Date.now() - log.startTime);
      }
      saveLog(log);
      delete pendingRequests[details.requestId];
    }
  },
  { urls: ["<all_urls>"] }
);
