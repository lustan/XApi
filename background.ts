
// background.ts

const MAX_LOGS = 100;

// Store pending requests in memory to correlate headers/body/completion
const pendingRequests: Record<string, any> = {};

const updateBadge = (recording: boolean) => {
  if (recording) {
    chrome.action.setBadgeText({ text: "REC" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ isRecording: false, logs: [] });
  updateBadge(false);
  // Clear any existing dynamic rules on startup
  chrome.declarativeNetRequest.updateSessionRules({
     removeRuleIds: [1] // We use ID 1 for the singleton active request rule
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isRecording) {
    updateBadge(changes.isRecording.newValue);
  }
});

// --- DNR Rule Manager for Header Overrides ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SET_REQUEST_HEADERS') {
        const { url, headers } = message;
        // headers: { name: string, value: string }[]
        
        // We use a fixed Rule ID (1) for the "Active Debug Request".
        // This simplifies management. Each "Send" overwrites the rule for that specific URL.
        const ruleId = 1;

        const requestHeaders = headers.map((h: any) => ({
            header: h.name,
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: h.value
        }));

        const rule = {
            id: ruleId,
            priority: 1,
            action: {
                type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
                requestHeaders: requestHeaders
            },
            condition: {
                // We match the exact URL to avoid side effects on other requests
                urlFilter: url, 
                resourceTypes: [
                    chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
                    chrome.declarativeNetRequest.ResourceType.OTHER
                ]
            }
        };

        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [ruleId],
            addRules: [rule]
        }).then(() => {
            sendResponse({ success: true });
        });

        return true; // Keep channel open for async response
    }
});

// --- Storage Queue for Race Condition Fix ---
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
            // Merge existing log with new data
            currentLogs[idx] = { ...currentLogs[idx], ...logToSave };
            newLogs = currentLogs;
        } else {
            // New log
            newLogs = [logToSave, ...currentLogs].slice(0, MAX_LOGS);
        }

        chrome.storage.local.set({ logs: newLogs }, () => {
            isSaving = false;
            if (saveQueue.length > 0) {
                processQueue();
            }
        });
    });
};

const saveLog = (log: any) => {
  if (!log.url && !log.id) return;
  // Push to queue
  saveQueue.push(log);
  processQueue();
};
// --------------------------------------------

// 1. Capture Request Body & Basic Info
chrome.webRequest.onBeforeRequest.addListener(
  (details: any) => {
    if (
        details.url.startsWith('chrome-extension://') || 
        details.url.startsWith('data:') || 
        details.url.startsWith('blob:') ||
        details.type === 'ping'
    ) {
        return;
    }

    chrome.storage.local.get(['isRecording'], (result) => {
      if (!result.isRecording) return;
      if (details.type !== 'xmlhttprequest' && details.type !== 'fetch' && details.type !== 'main_frame') return;

      const log: any = {
        id: details.requestId,
        url: details.url,
        method: details.method,
        status: 0,
        timestamp: Date.now(),
        type: details.type,
      };

      if (details.requestBody) {
        if (details.requestBody.raw && details.requestBody.raw[0]) {
           const enc = new TextDecoder("utf-8");
           try {
             log.requestBody = enc.decode(details.requestBody.raw[0].bytes);
           } catch (e) {
             log.requestBody = "[Binary Data]";
           }
        } else if (details.requestBody.formData) {
           log.requestBody = details.requestBody.formData;
        }
      }
      
      pendingRequests[details.requestId] = log;
      saveLog(log);
    });
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// 2. Capture Request Headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details: any) => {
    if (!pendingRequests[details.requestId]) return;
    
    const headers: Record<string, string> = {};
    details.requestHeaders?.forEach((h: any) => {
      headers[h.name] = h.value || '';
    });
    
    const update = { id: details.requestId, requestHeaders: headers };
    pendingRequests[details.requestId] = { ...pendingRequests[details.requestId], ...update };
    saveLog(update);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

// 3. Capture Response Headers
chrome.webRequest.onHeadersReceived.addListener(
  (details: any) => {
    if (!pendingRequests[details.requestId]) return;

    const headers: Record<string, string> = {};
    details.responseHeaders?.forEach((h: any) => {
      headers[h.name] = h.value || '';
    });

    const update = { id: details.requestId, responseHeaders: headers };
    pendingRequests[details.requestId] = { ...pendingRequests[details.requestId], ...update };
    saveLog(update);
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

// 4. Capture Completion
chrome.webRequest.onCompleted.addListener(
  (details: any) => {
    if (pendingRequests[details.requestId]) {
      const update = { id: details.requestId, status: details.statusCode };
      saveLog(update);
      // Keep in pendingRequests briefly in case of late-arriving events or just delete
      setTimeout(() => {
          delete pendingRequests[details.requestId];
      }, 5000);
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details: any) => {
    if (pendingRequests[details.requestId]) {
      const update = { id: details.requestId, status: 0, error: details.error };
      saveLog(update);
      delete pendingRequests[details.requestId];
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "import-request") {
    chrome.tabs.create({ url: "panel.html" });
  }
});
