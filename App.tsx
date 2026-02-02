import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { RequestHeader } from './components/RequestHeader';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Modal } from './components/Modal';
import { TabBar } from './components/TabBar';
import { HttpRequest, HttpResponse, LoggedRequest, SidebarTab, CollectionItem, KeyValue, TabItem } from './types';
import { generateId, queryStringToParams, parseCurl } from './utils';

// 浏览器禁止通过 fetch 接口设置的请求头列表
const FORBIDDEN_HEADERS = [
    'cookie', 'cookie2', 'origin', 'referer', 'host', 'connection', 'content-length', 
    'date', 'expect', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via'
];

const createNewRequest = (collectionId?: string): HttpRequest => ({
  id: generateId(),
  collectionId,
  name: chrome.i18n.getMessage("newRequestDefault"),
  url: '',
  method: 'GET',
  headers: [],
  params: [],
  bodyType: 'none',
  bodyRaw: '',
  bodyForm: []
});

const convertLogToRequest = (log: LoggedRequest): HttpRequest => {
    const headers: KeyValue[] = [];
    if (log.requestHeaders) {
        Object.entries(log.requestHeaders).forEach(([k, v]) => {
            headers.push({ id: generateId(), key: k, value: v, enabled: true });
        });
    }
    let bodyType: HttpRequest['bodyType'] = 'none';
    let bodyRaw = '';
    let bodyForm: KeyValue[] = [];
    if (log.requestBody) {
        if (typeof log.requestBody === 'string') { bodyType = 'raw'; bodyRaw = log.requestBody; }
        else if (typeof log.requestBody === 'object') {
             bodyType = 'form-data'; 
             Object.entries(log.requestBody).forEach(([k, v]) => {
                 const val = Array.isArray(v) ? v[0] : v;
                 bodyForm.push({ id: generateId(), key: k, value: val, enabled: true, type: 'text' });
             });
        }
    }
    let smartName = log.url;
    try {
        const urlObj = new URL(log.url);
        smartName = urlObj.pathname === '/' ? urlObj.origin : urlObj.pathname;
    } catch (e) {}
    return { ...createNewRequest(), id: log.id, url: log.url, method: log.method as any, name: smartName, params: queryStringToParams(log.url.split('?')[1] || ''), headers, bodyType, bodyRaw, bodyForm };
};

const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabItem[]>([{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage("welcomeTabTitle") }]);
  const [activeTabId, setActiveTabId] = useState<string>('welcome');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('history');
  const [history, setHistory] = useState<LoggedRequest[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [rootRequests, setRootRequests] = useState<HttpRequest[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [curlInput, setCurlInput] = useState('');
  const initializedRef = useRef(false);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeRequest = activeTab?.data || null;
  const activeResponse = activeTab?.response || null;
  const activeError = activeTab?.error || null;
  const activeIsLoading = activeTab?.isLoading || false;

  useEffect(() => {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['collections', 'logs', 'savedTabs', 'savedActiveTabId', 'isRecording', 'rootRequests'], (result) => {
        if (result.collections) setCollections(result.collections);
        if (result.rootRequests) setRootRequests(result.rootRequests);
        setIsRecording(!!result.isRecording);
        
        const logs = result.logs || [];
        setHistory(logs);

        if (result.savedTabs && result.savedTabs.length > 0) {
            setTabs(result.savedTabs);
            if (result.savedActiveTabId) setActiveTabId(result.savedActiveTabId);
        }

        const params = new URLSearchParams(window.location.search);
        const logId = params.get('logId');
        if (logId) {
             const found = logs.find((l: LoggedRequest) => l.id === logId);
             if (found) {
                handleImportLoggedRequest(found);
                setSidebarTab('history');
             }
        }
        initializedRef.current = true;
      });

      const listener = (changes: any) => {
        if (changes.logs) setHistory(changes.logs.newValue || []);
        if (changes.collections) setCollections(changes.collections.newValue || []);
        if (changes.rootRequests) setRootRequests(changes.rootRequests.newValue || []);
        if (changes.isRecording) setIsRecording(changes.isRecording.newValue);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  useEffect(() => {
      if (initializedRef.current && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ 
              savedTabs: tabs,
              savedActiveTabId: activeTabId 
          });
      }
  }, [tabs, activeTabId]);

  const openRequestInTab = (req: HttpRequest) => {
      const existing = tabs.find(t => t.id === req.id);
      if (existing) { setActiveTabId(req.id); return; }
      const newTab: TabItem = { id: req.id, type: 'request', title: req.name, method: req.method, data: req, isLoading: false, response: null, error: null };
      setTabs(prev => prev[0]?.type === 'welcome' ? [newTab] : [...prev, newTab]);
      setActiveTabId(req.id);
  };

  const handleTabClose = (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const newTabs = tabs.filter(t => t.id !== id);
      if (newTabs.length === 0) {
          setTabs([{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage("welcomeTabTitle") }]);
          setActiveTabId('welcome');
      } else {
          setTabs(newTabs);
          if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1].id);
      }
  };

  const handleTabClick = (id: string) => setActiveTabId(id);

  const updateActiveRequest = (updatedReq: HttpRequest) => {
      setTabs(prev => prev.map(t => t.id === updatedReq.id ? { ...t, data: updatedReq, title: updatedReq.name, method: updatedReq.method } : t));
      const nextRoots = rootRequests.map(r => r.id === updatedReq.id ? updatedReq : r);
      const nextCols = collections.map(c => ({
          ...c,
          requests: c.requests.map(r => r.id === updatedReq.id ? updatedReq : r)
      }));
      setRootRequests(nextRoots);
      setCollections(nextCols);
      chrome.storage.local.set({ rootRequests: nextRoots, collections: nextCols });
  };

  const handleSaveToCollection = (reqId: string, colId: string | null) => {
      let reqToMove: HttpRequest | undefined;
      reqToMove = rootRequests.find(r => r.id === reqId);
      if (!reqToMove) {
          for (const col of collections) {
              const r = col.requests.find(x => x.id === reqId);
              if (r) { reqToMove = r; break; }
          }
      }
      if (!reqToMove) {
          const log = history.find(h => h.id === reqId);
          if (log) reqToMove = convertLogToRequest(log);
      }
      if (!reqToMove) return;

      const updatedReq = { ...reqToMove, collectionId: colId || undefined };
      const nextRoots = rootRequests.filter(r => r.id !== reqId);
      const nextCols = collections.map(c => ({
          ...c,
          requests: c.requests.filter(r => r.id !== reqId)
      }));

      if (colId) {
          const target = nextCols.find(c => c.id === colId);
          if (target) { target.requests.push(updatedReq); target.collapsed = false; }
      } else {
          nextRoots.push(updatedReq);
      }

      setRootRequests(nextRoots);
      setCollections(nextCols);
      setTabs(prev => prev.map(t => t.id === reqId ? { ...t, data: updatedReq } : t));
      chrome.storage.local.set({ rootRequests: nextRoots, collections: nextCols });
  };

  const handleImportLoggedRequest = (log: LoggedRequest) => {
    const req = convertLogToRequest(log);
    openRequestInTab(req);
  };

  const handleCreateRequest = () => {
      const newReq = createNewRequest();
      const nextRoots = [...rootRequests, newReq];
      setRootRequests(nextRoots);
      chrome.storage.local.set({ rootRequests: nextRoots });
      openRequestInTab(newReq);
  };

  const handleRenameRequest = (reqId: string, newName: string) => {
      const nextRoots = rootRequests.map(r => r.id === reqId ? { ...r, name: newName } : r);
      const nextCols = collections.map(c => ({
          ...c,
          // Fixed: Use reqId and newName instead of undefined updatedReq
          requests: c.requests.map(r => r.id === reqId ? { ...r, name: newName } : r)
      }));
      setRootRequests(nextRoots);
      setCollections(nextCols);
      setTabs(prev => prev.map(t => t.id === reqId ? { ...t, title: newName, data: t.data ? { ...t.data, name: newName } : undefined } : t));
      chrome.storage.local.set({ rootRequests: nextRoots, collections: nextCols });
  };

  const handleTabRename = (id: string, newName: string) => handleRenameRequest(id, newName);

  const handleSendRequest = async () => {
    if (!activeRequest) return;
    setTabs(prev => prev.map(t => t.id === activeRequest.id ? { ...t, isLoading: true, error: null, response: null } : t));
    const startTime = Date.now();
    try {
      const enabledHeaders = activeRequest.headers.filter(h => h.enabled && h.key);
      
      // 核心修改：区分 fetch 能够设置的普通 Header 和 需要通过 DNR 强制修改的敏感 Header
      const safeHeaderObj: Record<string, string> = {};
      enabledHeaders.forEach(h => { 
          const lowerKey = h.key.toLowerCase();
          // 如果不是禁止修改的请求头，且不以 Sec- 或 Proxy- 开头，则可以放入 fetch 的 headers 中
          if (!FORBIDDEN_HEADERS.includes(lowerKey) && !lowerKey.startsWith('sec-') && !lowerKey.startsWith('proxy-')) {
              safeHeaderObj[h.key] = h.value; 
          }
      });

      // 所有的 Header（包括 Cookie/Origin）都通过 background 设置 DNR 规则
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                  type: 'SET_REQUEST_HEADERS',
                  url: activeRequest.url,
                  headers: enabledHeaders.map(h => ({ key: h.key, value: h.value }))
              }, resolve);
          });
      }

      let body: any = undefined;
      if (activeRequest.method !== 'GET' && activeRequest.method !== 'HEAD') {
        if (activeRequest.bodyType === 'raw') {
          body = activeRequest.bodyRaw;
        } else if (activeRequest.bodyType === 'x-www-form-urlencoded') {
          const params = new URLSearchParams();
          activeRequest.bodyForm.filter(f => f.enabled && f.key).forEach(f => {
            params.append(f.key, f.value);
          });
          body = params.toString();
          if (!safeHeaderObj['Content-Type']) safeHeaderObj['Content-Type'] = 'application/x-www-form-urlencoded';
        } else if (activeRequest.bodyType === 'form-data') {
          const formData = new FormData();
          activeRequest.bodyForm.filter(f => f.enabled && f.key).forEach(f => {
            if (f.type === 'file' && f.file) { formData.append(f.key, f.file); } 
            else { formData.append(f.key, f.value); }
          });
          body = formData;
        }
      }

      const response = await fetch(activeRequest.url, { 
          method: activeRequest.method, 
          headers: safeHeaderObj, 
          body,
          // 如果有自定义 Cookie，我们依赖 DNR 规则强制覆盖。
          // credentials: 'include' 会让浏览器发送已有的 Cookie，DNR 的 HeaderOperation.SET 会将其替换为我们的值。
          credentials: 'include' 
      });

      const responseBody = await response.text();
      const endTime = Date.now();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => responseHeaders[k] = v);
      
      const httpResponse: HttpResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        time: endTime - startTime,
        size: new Blob([responseBody]).size
      };

      setTabs(prev => prev.map(t => t.id === activeRequest.id ? { ...t, isLoading: false, response: httpResponse } : t));

      // 任务完成，清除 DNR 规则
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'CLEAR_REQUEST_HEADERS' });
      }

    } catch (err: any) {
      setTabs(prev => prev.map(t => t.id === activeRequest.id ? { ...t, isLoading: false, error: err.message || 'An error occurred' } : t));
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'CLEAR_REQUEST_HEADERS' });
      }
    }
  };

  const handleImportCurlConfirm = () => {
    const parsed = parseCurl(curlInput);
    if (parsed) {
        let smartName = chrome.i18n.getMessage("importedRequest");
        if (parsed.url) {
            try {
                const urlObj = new URL(parsed.url);
                smartName = urlObj.pathname === '/' ? urlObj.origin : urlObj.pathname;
            } catch (e) {}
        }
        const newReq: HttpRequest = { ...createNewRequest(), ...parsed, id: generateId(), name: smartName };
        const nextRoots = [...rootRequests, newReq];
        setRootRequests(nextRoots);
        chrome.storage.local.set({ rootRequests: nextRoots });
        openRequestInTab(newReq);
        setIsCurlModalOpen(false);
        setCurlInput('');
    } else { 
        alert(chrome.i18n.getMessage("invalidCurl")); 
    }
  };

  const handleClearAllData = () => {
    if (confirm(chrome.i18n.getMessage("clearAllDataConfirm"))) {
        chrome.storage.local.clear(() => {
            setCollections([]);
            setHistory([]);
            setRootRequests([]);
            setTabs([{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage("welcomeTabTitle") }]);
            setActiveTabId('welcome');
            window.location.reload(); 
        });
    }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {!isSidebarCollapsed && (
        <Sidebar 
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          history={history}
          onImportLoggedRequest={handleImportLoggedRequest}
          collections={collections}
          rootRequests={rootRequests}
          tabs={tabs}
          activeRequestId={activeTabId}
          onSelectRequest={openRequestInTab}
          onCreateCollection={() => { const newCol = { id: generateId(), name: chrome.i18n.getMessage("newCollection"), requests: [], collapsed: false }; const next = [...collections, newCol]; setCollections(next); chrome.storage.local.set({ collections: next }); setSidebarTab('collections'); }}
          onCreateRequest={handleCreateRequest}
          onImportCurl={() => setIsCurlModalOpen(true)}
          onClearHistory={() => { setHistory([]); chrome.storage.local.set({ logs: [] }); }}
          onDeleteLog={(id) => { const next = history.filter(h => h.id !== id); setHistory(next); chrome.storage.local.set({ logs: next }); handleTabClose(id); }}
          onRenameCollection={(id, name) => { const next = collections.map(c => c.id === id ? { ...c, name } : c); setCollections(next); chrome.storage.local.set({ collections: next }); }}
          onRenameRequest={handleRenameRequest}
          onDeleteCollection={(id) => { if (confirm(chrome.i18n.getMessage("deleteCollectionConfirm"))) { const next = collections.filter(c => c.id !== id); setCollections(next); chrome.storage.local.set({ collections: next }); } }}
          onDeleteRequest={(req) => { const nextRoots = rootRequests.filter(r => r.id !== req.id); const nextCols = collections.map(c => ({ ...c, requests: c.requests.filter(r => r.id !== req.id) })); setRootRequests(nextRoots); setCollections(nextCols); chrome.storage.local.set({ rootRequests: nextRoots, collections: nextCols }); handleTabClose(req.id); }}
          onDuplicateRequest={(reqId) => {
              let found = rootRequests.find(r => r.id === reqId) || collections.flatMap(c => c.requests).find(r => r.id === reqId);
              if (found) {
                  const newReq = { ...found, id: generateId(), name: `${found.name} Copy` };
                  if (newReq.collectionId) {
                      const nextCols = collections.map(c => c.id === newReq.collectionId ? { ...c, requests: [...c.requests, newReq] } : c);
                      setCollections(nextCols); chrome.storage.local.set({ collections: nextCols });
                  } else {
                      const nextRoots = [...rootRequests, newReq];
                      setRootRequests(nextRoots); chrome.storage.local.set({ rootRequests: nextRoots });
                  }
              }
          }}
          onToggleCollapse={(id) => { setCollections(collections.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c)); }}
          onMoveRequest={handleSaveToCollection}
          isRecording={isRecording}
          onToggleRecording={() => { setIsRecording(!isRecording); chrome.storage.local.set({ isRecording: !isRecording }); }}
          onCollapseSidebar={() => setIsSidebarCollapsed(true)}
          onResetAllData={handleClearAllData}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
         {isSidebarCollapsed && (
             <button 
                onClick={() => setIsSidebarCollapsed(false)}
                className="absolute left-0 top-1.5 z-[60] p-1 bg-white border border-l-0 border-gray-200 rounded-r shadow-sm hover:bg-gray-50 transition-colors"
                title={chrome.i18n.getMessage("expandSidebar")}
             >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 5l7 7-7 7M5 5l7 7-7 7" strokeWidth={2}/></svg>
             </button>
         )}
         <TabBar tabs={tabs} activeTabId={activeTabId} onTabClick={handleTabClick} onTabClose={handleTabClose} onTabReorder={(f, t) => { const next = [...tabs]; const [m] = next.splice(f, 1); next.splice(t, 0, m); setTabs(next); }} onTabRename={handleTabRename} onTabAction={(a, tid) => { const idx = tabs.findIndex(t => t.id === tid); let next: TabItem[] = []; switch (a) { case 'close-others': next = tabs.filter(t => t.id === tid); break; case 'close-right': next = tabs.filter((_, i) => i <= idx); break; case 'close-left': next = tabs.filter((_, i) => i >= idx); break; case 'close-all': next = []; break; } setTabs(next.length === 0 ? [{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage("welcomeTabTitle") }] : next); if (!next.find(t => t.id === activeTabId)) setActiveTabId(next[next.length - 1]?.id || 'welcome'); }} collections={collections} onSaveToCollection={handleSaveToCollection} />
         <div className="flex-1 flex flex-col relative overflow-hidden">
            {!activeRequest || activeTabId === 'welcome' ? (
                <WelcomeScreen onCreateRequest={handleCreateRequest} onCreateCollection={() => {}} onImportCurl={() => setIsCurlModalOpen(true)} />
            ) : (
                <>
                    <RequestHeader request={activeRequest} onRequestChange={updateActiveRequest} onSend={handleSendRequest} isSending={activeIsLoading} />
                    <div className="flex-1 flex h-full overflow-hidden">
                        <div className="w-1/2 min-w-[400px] h-full overflow-hidden border-r border-gray-100">
                            <RequestEditor request={activeRequest} onRequestChange={updateActiveRequest} />
                        </div>
                        <div className="w-1/2 min-w-[400px] h-full overflow-hidden">
                            <ResponseViewer response={activeResponse} error={activeError} />
                        </div>
                    </div>
                </>
            )}
         </div>
      </div>
      <Modal isOpen={isCurlModalOpen} onClose={() => setIsCurlModalOpen(false)} title={chrome.i18n.getMessage("importCurlCommand")} onConfirm={handleImportCurlConfirm} confirmText={chrome.i18n.getMessage("import")} confirmDisabled={!curlInput.trim()}>
          <textarea value={curlInput} onChange={(e) => setCurlInput(e.target.value)} className="w-full h-40 border border-gray-300 rounded p-3 font-mono text-xs focus:outline-none focus:border-green-500 bg-gray-50" placeholder="curl 'https://api.example.com' ..." />
      </Modal>
    </div>
  );
};

export default App;
