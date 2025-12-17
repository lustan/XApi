
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { RequestHeader } from './components/RequestHeader';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Modal } from './components/Modal';
import { TabBar } from './components/TabBar';
import { HttpRequest, HttpResponse, LoggedRequest, SidebarTab, CollectionItem, KeyValue, TabItem } from './types';
import { generateId, queryStringToParams, parseCurl } from './utils';

// Helper to create empty request
const createNewRequest = (collectionId?: string): HttpRequest => ({
  id: generateId(),
  collectionId,
  name: 'New Request',
  url: '',
  method: 'GET',
  headers: [],
  params: [],
  bodyType: 'none',
  bodyRaw: '',
  bodyForm: []
});

const App: React.FC = () => {
  // --- State ---
  // Tabs System
  const [tabs, setTabs] = useState<TabItem[]>([{ id: 'welcome', type: 'welcome', title: 'Welcome' }]);
  const [activeTabId, setActiveTabId] = useState<string>('welcome');

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('history');
  const [history, setHistory] = useState<LoggedRequest[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  // Modals
  const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);
  const [curlInput, setCurlInput] = useState('');
  
  // --- Computed ---
  // Helper to find the active request object from the tabs
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeRequest = activeTab?.data || null;
  const activeResponse = activeTab?.response || null;
  const activeError = activeTab?.error || null;
  const activeIsLoading = activeTab?.isLoading || false;

  // --- Effects ---

  // 1. Load Data from Storage (Logs, Collections, and PERSISTED TABS)
  useEffect(() => {
    if (chrome && chrome.storage && chrome.storage.local) {
      // Initial Load
      chrome.storage.local.get(['collections', 'logs', 'savedTabs', 'savedActiveTabId'], (result) => {
        if (result.collections) setCollections(result.collections);
        
        // Restore Tabs
        if (result.savedTabs && result.savedTabs.length > 0) {
            setTabs(result.savedTabs);
        }
        if (result.savedActiveTabId) {
            setActiveTabId(result.savedActiveTabId);
        }

        const logs = result.logs || [];
        setHistory(logs);

        // Check for URL Param "logId" to load specific log (Overrides saved tabs if present)
        const params = new URLSearchParams(window.location.search);
        const logId = params.get('logId');
        if (logId) {
             const found = logs.find((l: LoggedRequest) => l.id === logId);
             if (found) {
                 handleImportLoggedRequest(found);
             }
        }
      });

      // Listen for background updates (History logs)
      const listener = (changes: any) => {
        if (changes.logs) {
          setHistory(changes.logs.newValue);
        }
        if (changes.collections) {
          setCollections(changes.collections.newValue);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  // 2. Persist Tabs whenever they change
  useEffect(() => {
      if (chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ 
              savedTabs: tabs,
              savedActiveTabId: activeTabId 
          });
      }
  }, [tabs, activeTabId]);

  // --- Tab Handlers ---

  const openRequestInTab = (req: HttpRequest) => {
      // Check if already open
      const existing = tabs.find(t => t.id === req.id);
      if (existing) {
          setActiveTabId(req.id);
          return;
      }
      
      const newTab: TabItem = {
          id: req.id,
          type: 'request',
          title: req.name,
          method: req.method,
          data: req,
          isLoading: false,
          response: null,
          error: null
      };
      
      // Remove welcome tab if it's the only one
      let newTabs = [...tabs];
      if (newTabs.length === 1 && newTabs[0].type === 'welcome') {
          newTabs = [newTab];
      } else {
          newTabs.push(newTab);
      }
      
      setTabs(newTabs);
      setActiveTabId(req.id);
  };

  const handleTabClose = (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const newTabs = tabs.filter(t => t.id !== id);
      
      if (newTabs.length === 0) {
          setTabs([{ id: 'welcome', type: 'welcome', title: 'Welcome' }]);
          setActiveTabId('welcome');
      } else {
          setTabs(newTabs);
          if (activeTabId === id) {
              setActiveTabId(newTabs[newTabs.length - 1].id);
          }
      }
  };

  const handleTabClick = (id: string) => {
      setActiveTabId(id);
  };

  const handleTabReorder = (fromIndex: number, toIndex: number) => {
      const newTabs = [...tabs];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      setTabs(newTabs);
  };

  const handleTabRename = (id: string, newName: string) => {
      const tab = tabs.find(t => t.id === id);
      
      // If it's a saved request, update the collection as well
      if (tab && tab.data && tab.data.collectionId) {
          handleRenameRequest(tab.data.id, newName);
      } else {
          // Draft request: Update Tab State directly
          setTabs(prev => prev.map(t => 
            t.id === id 
            ? { ...t, title: newName, data: t.data ? { ...t.data, name: newName } : undefined } 
            : t
          ));
      }
  };

  const handleTabAction = (action: 'close-others' | 'close-right' | 'close-left' | 'close-all', targetId: string) => {
      const targetIndex = tabs.findIndex(t => t.id === targetId);
      if (targetIndex === -1) return;

      let newTabs: TabItem[] = [];

      switch (action) {
          case 'close-others':
              newTabs = tabs.filter(t => t.id === targetId);
              break;
          case 'close-right':
              newTabs = tabs.filter((_, i) => i <= targetIndex);
              break;
          case 'close-left':
              newTabs = tabs.filter((_, i) => i >= targetIndex);
              break;
          case 'close-all':
              newTabs = [];
              break;
      }

      if (newTabs.length === 0) {
          setTabs([{ id: 'welcome', type: 'welcome', title: 'Welcome' }]);
          setActiveTabId('welcome');
      } else {
          setTabs(newTabs);
          // If active tab was closed, switch to the target tab (or last available)
          if (!newTabs.find(t => t.id === activeTabId)) {
             setActiveTabId(newTabs[newTabs.length - 1].id);
          }
      }
  };

  // --- Request Logic ---

  const handleSendRequest = async () => {
    if (!activeRequest) return;
    
    // Set Loading State for this tab
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isLoading: true, response: null, error: null } : t));
    
    const startTime = Date.now();

    try {
      const headersInit: Record<string, string> = {};
      const dnrHeaders: { name: string, value: string }[] = [];
      // List of headers that fetch/browser often blocks or ignores, which we should offload to DNR
      const forbiddenHeaders = ['origin', 'referer', 'user-agent', 'cookie', 'host', 'date', 'via', 'connection', 'upgrade'];

      activeRequest.headers.filter(h => h.enabled).forEach(h => {
        const key = h.key.trim();
        const lowerKey = key.toLowerCase();
        
        // Filter out pseudo-headers
        if (key && !key.startsWith(':')) {
             if (forbiddenHeaders.includes(lowerKey) || lowerKey.startsWith('sec-') || lowerKey.startsWith('proxy-')) {
                 dnrHeaders.push({ name: key, value: h.value });
             } else {
                 headersInit[key] = h.value;
             }
        }
      });

      // If we have restricted headers, send them to background to set up a rule
      if (dnrHeaders.length > 0 && chrome.runtime) {
          await new Promise<void>((resolve) => {
              chrome.runtime.sendMessage({ 
                  type: 'SET_REQUEST_HEADERS', 
                  url: activeRequest.url, 
                  headers: dnrHeaders 
              }, () => resolve());
          });
      }

      const options: RequestInit = {
        method: activeRequest.method,
        headers: headersInit,
      };

      if (activeRequest.method !== 'GET' && activeRequest.method !== 'HEAD') {
        if (activeRequest.bodyType === 'raw') {
          options.body = activeRequest.bodyRaw;
        } else if (activeRequest.bodyType === 'x-www-form-urlencoded') {
            const usp = new URLSearchParams();
            activeRequest.bodyForm.filter(f => f.enabled).forEach(f => usp.append(f.key, f.value));
            options.body = usp;
        } else if (activeRequest.bodyType === 'form-data') {
            const fd = new FormData();
            activeRequest.bodyForm.filter(f => f.enabled).forEach(f => {
                if (f.type === 'file' && f.file) {
                    fd.append(f.key, f.file);
                } else {
                    fd.append(f.key, f.value);
                }
            });
            options.body = fd;
        }
      }

      if (!activeRequest.url.startsWith('http')) {
          throw new Error("URL must start with http:// or https://");
      }

      const res = await fetch(activeRequest.url, options);
      const endTime = Date.now();
      const text = await res.text();
      
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => { resHeaders[key] = val; });

      const newResponse: HttpResponse = {
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: text,
        time: endTime - startTime,
        size: new Blob([text]).size
      };

      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isLoading: false, response: newResponse } : t));

    } catch (err: any) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isLoading: false, error: err.message || 'Network Error.' } : t));
    }
  };

  const updateActiveRequest = (updatedReq: HttpRequest) => {
      // 1. Update Tabs State
      const updatedTabs = tabs.map(t => 
          t.id === updatedReq.id 
          ? { ...t, data: updatedReq, title: updatedReq.name, method: updatedReq.method } 
          : t
      );
      setTabs(updatedTabs);

      // 2. If it belongs to a collection, update collection state immediately (Real-time rename support)
      if (updatedReq.collectionId) {
          const updatedCols = collections.map(c => {
              if (c.id === updatedReq.collectionId) {
                  return {
                      ...c,
                      requests: c.requests.map(r => r.id === updatedReq.id ? updatedReq : r)
                  };
              }
              return c;
          });
          setCollections(updatedCols);
      }
  };

  const handleSaveToCollection = (reqId: string, colId: string) => {
      const tab = tabs.find(t => t.id === reqId);
      if (!tab || !tab.data) return;

      // reuse current ID, just assign collection ID
      const reqToSave = { ...tab.data, collectionId: colId }; 
      
      const updatedCols = collections.map(c => {
          if (c.id === colId) {
              return { ...c, requests: [...c.requests, reqToSave] };
          }
          return c;
      });

      setCollections(updatedCols);
      chrome.storage.local.set({ collections: updatedCols });
      setSidebarTab('collections');
      
      // Update the current tab to reflect it's now part of a collection
      updateActiveRequest(reqToSave);
  };

  // --- Sidebar & CRUD Actions ---

  const handleImportLoggedRequest = (log: LoggedRequest) => {
    // Logic to parse log to request...
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
        if (typeof log.requestBody === 'string') {
            bodyType = 'raw';
            bodyRaw = log.requestBody;
        } else if (typeof log.requestBody === 'object') {
             bodyType = 'form-data'; 
             Object.entries(log.requestBody).forEach(([k, v]) => {
                 const val = Array.isArray(v) ? v[0] : v;
                 bodyForm.push({ id: generateId(), key: k, value: val, enabled: true, type: 'text' });
             });
        }
    }
    
    // Better naming logic: use pathname instead of full URL
    let smartName = log.url;
    try {
        const urlObj = new URL(log.url);
        smartName = urlObj.pathname;
        if (smartName === '/' || smartName === '') {
            smartName = urlObj.origin;
        }
    } catch (e) {
        // fallback to full url
    }

    const newReq: HttpRequest = {
        ...createNewRequest(),
        id: log.id, // IMPORTANT: Use log.id to prevent duplicates in Tabs
        url: log.url,
        method: log.method as any,
        name: smartName,
        params: queryStringToParams(log.url.split('?')[1] || ''),
        headers: headers,
        bodyType,
        bodyRaw,
        bodyForm
    };
    openRequestInTab(newReq);
  };

  const handleCreateCollection = () => {
      const newCol: CollectionItem = {
          id: generateId(),
          name: 'New Collection',
          requests: [],
          collapsed: false
      };
      const updated = [...collections, newCol];
      setCollections(updated);
      chrome.storage.local.set({ collections: updated });
      setSidebarTab('collections');
  };

  const handleCreateRequest = () => {
      openRequestInTab(createNewRequest());
  };

  const handleRenameCollection = (id: string, newName: string) => {
      const updated = collections.map(c => c.id === id ? { ...c, name: newName } : c);
      setCollections(updated);
      chrome.storage.local.set({ collections: updated });
  };

  const handleRenameRequest = (reqId: string, newName: string) => {
      const updatedCols = collections.map(c => ({
          ...c,
          requests: c.requests.map(r => r.id === reqId ? { ...r, name: newName } : r)
      }));
      setCollections(updatedCols);
      chrome.storage.local.set({ collections: updatedCols });

      // Update tab title if open, AND update the inner data name to prevent revert on edit
      setTabs(prev => prev.map(t => 
          t.id === reqId 
          ? { ...t, title: newName, data: t.data ? { ...t.data, name: newName } : undefined } 
          : t
      ));
  };

  const handleDeleteCollection = (id: string) => {
      if (confirm('Delete this collection and all its requests?')) {
          const updated = collections.filter(c => c.id !== id);
          setCollections(updated);
          chrome.storage.local.set({ collections: updated });
          // Also close tabs belonging to this collection
          const col = collections.find(c => c.id === id);
          if (col) {
              const reqIds = col.requests.map(r => r.id);
              const newTabs = tabs.filter(t => !reqIds.includes(t.id));
              setTabs(newTabs.length ? newTabs : [{ id: 'welcome', type: 'welcome', title: 'Welcome' }]);
              if (newTabs.length > 0) setActiveTabId(newTabs[0].id);
              else setActiveTabId('welcome');
          }
      }
  };

  const handleDeleteRequest = (req: HttpRequest) => {
      // Direct delete without confirmation
      const updatedCols = collections.map(c => ({
          ...c,
          requests: c.requests.filter(r => r.id !== req.id)
      }));
      setCollections(updatedCols);
      chrome.storage.local.set({ collections: updatedCols });
      
      // Close tab
      const newTabs = tabs.filter(t => t.id !== req.id);
      setTabs(newTabs.length ? newTabs : [{ id: 'welcome', type: 'welcome', title: 'Welcome' }]);
      if (activeTabId === req.id) {
          setActiveTabId(newTabs.length ? newTabs[0].id : 'welcome');
      }
  };

  const handleDuplicateRequest = (reqId: string) => {
      let foundReq: HttpRequest | undefined;
      let foundColId: string | undefined;

      collections.forEach(col => {
          const r = col.requests.find(x => x.id === reqId);
          if (r) {
              foundReq = r;
              foundColId = col.id;
          }
      });

      if (foundReq && foundColId) {
          const newReq = { 
              ...foundReq, 
              id: generateId(), 
              name: `${foundReq.name} Copy` 
          };
          
          const updatedCols = collections.map(c => {
              if (c.id === foundColId) {
                  return { ...c, requests: [...c.requests, newReq] };
              }
              return c;
          });
          
          setCollections(updatedCols);
          chrome.storage.local.set({ collections: updatedCols });
      }
  };
  
  const handleDeleteLog = (id: string) => {
      const newHistory = history.filter(h => h.id !== id);
      setHistory(newHistory);
      chrome.storage.local.set({ logs: newHistory });
      // We do NOT close the tab automatically if open, to allow user to continue using the imported request data
  };

  const handleToggleCollapse = (colId: string) => {
      const updated = collections.map(c => c.id === colId ? { ...c, collapsed: !c.collapsed } : c);
      setCollections(updated);
      chrome.storage.local.set({ collections: updated });
  };

  const handleMoveRequest = (reqId: string, targetColId: string) => {
      // Find the request and its current collection
      let req: HttpRequest | undefined;
      let sourceColId: string | undefined;

      collections.forEach(c => {
          const r = c.requests.find(x => x.id === reqId);
          if (r) {
              req = r;
              sourceColId = c.id;
          }
      });

      if (!req || !sourceColId || sourceColId === targetColId) return;

      // Remove from source, add to target
      const updatedCols = collections.map(c => {
          if (c.id === sourceColId) {
              return { ...c, requests: c.requests.filter(r => r.id !== reqId) };
          }
          if (c.id === targetColId) {
              return { ...c, requests: [...c.requests, { ...req!, collectionId: targetColId }] };
          }
          return c;
      });

      setCollections(updatedCols);
      chrome.storage.local.set({ collections: updatedCols });
      
      // Update tab info
      updateActiveRequest({ ...req, collectionId: targetColId });
  };

  const handleImportCurlConfirm = () => {
      const parsed = parseCurl(curlInput);
      if (parsed) {
          const newReq = {
              ...createNewRequest(),
              ...parsed,
              name: 'Imported cURL'
          };
          openRequestInTab(newReq as HttpRequest);
          setIsCurlModalOpen(false);
          setCurlInput('');
      } else {
          alert("Could not parse cURL command.");
      }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <Sidebar 
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        history={history}
        onImportLoggedRequest={handleImportLoggedRequest}
        collections={collections}
        activeRequestId={activeTabId}
        onSelectRequest={openRequestInTab}
        // Actions
        onCreateCollection={handleCreateCollection}
        onCreateRequest={handleCreateRequest}
        onImportCurl={() => setIsCurlModalOpen(true)}
        onClearHistory={() => chrome.storage.local.set({ logs: [] })}
        onDeleteLog={handleDeleteLog}
        // CRUD
        onRenameCollection={handleRenameCollection}
        onRenameRequest={handleRenameRequest}
        onDeleteCollection={handleDeleteCollection}
        onDeleteRequest={handleDeleteRequest}
        onDuplicateRequest={handleDuplicateRequest}
        onToggleCollapse={handleToggleCollapse}
        onMoveRequest={handleMoveRequest}
      />
      
      <div className="flex-1 flex flex-col min-w-0 bg-white">
         {/* Tab Bar */}
         <TabBar 
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onTabReorder={handleTabReorder}
            onTabRename={handleTabRename}
            onTabAction={handleTabAction}
            collections={collections}
            onSaveToCollection={handleSaveToCollection}
         />

         <div className="flex-1 flex flex-col relative overflow-hidden">
            {!activeRequest || activeTabId === 'welcome' ? (
                <WelcomeScreen 
                    onCreateRequest={handleCreateRequest}
                    onCreateCollection={handleCreateCollection}
                    onImportCurl={() => setIsCurlModalOpen(true)}
                />
            ) : (
                <>
                    {/* Header: Full width URL bar */}
                    <RequestHeader 
                        request={activeRequest}
                        onRequestChange={updateActiveRequest}
                        onSend={handleSendRequest}
                        isSending={activeIsLoading}
                    />
                    
                    {/* Split View */}
                    <div className="flex-1 flex h-full overflow-hidden">
                        <div className="w-1/2 min-w-[400px] h-full overflow-hidden">
                            <RequestEditor 
                                request={activeRequest}
                                onRequestChange={updateActiveRequest}
                            />
                        </div>
                        <div className="w-1/2 min-w-[400px] border-l border-gray-200 h-full overflow-hidden">
                            <ResponseViewer response={activeResponse} error={activeError} />
                        </div>
                    </div>
                </>
            )}
         </div>
      </div>

      {/* Modals */}
      <Modal 
        isOpen={isCurlModalOpen} 
        onClose={() => setIsCurlModalOpen(false)} 
        title="Import cURL"
        onConfirm={handleImportCurlConfirm}
        confirmText="Import"
        confirmDisabled={!curlInput.trim()}
      >
          <p className="text-sm text-gray-500 mb-2">Paste your cURL command below.</p>
          <textarea
            value={curlInput}
            onChange={(e) => setCurlInput(e.target.value)}
            className="w-full h-40 border border-gray-300 rounded p-3 font-mono text-xs focus:outline-none focus:border-blue-500 bg-gray-50"
            placeholder="curl 'https://api.example.com' ..."
          />
      </Modal>
    </div>
  );
};

export default App;
