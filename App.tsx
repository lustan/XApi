
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

  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('history');
  const [history, setHistory] = useState<LoggedRequest[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  // Modals
  const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);
  const [curlInput, setCurlInput] = useState('');
  
  // --- Computed ---
  // Helper to find the active request object from the tabs
  const activeRequest = tabs.find(t => t.id === activeTabId)?.data || null;

  // --- Effects ---

  // 1. Load Data from Storage & URL Params
  useEffect(() => {
    if (chrome && chrome.storage && chrome.storage.local) {
      // Initial Load
      chrome.storage.local.get(['collections', 'logs'], (result) => {
        if (result.collections) setCollections(result.collections);
        const logs = result.logs || [];
        setHistory(logs);

        // Check for URL Param "logId" to load specific log
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
          data: req
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
      setResponse(null); // Clear response on switch? Maybe keep per tab later
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
      // setResponse(null); // Optional: clear response when switching tabs? Or store response in tab
  };

  const handleTabReorder = (fromIndex: number, toIndex: number) => {
      const newTabs = [...tabs];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      setTabs(newTabs);
  };

  const handleTabRename = (id: string, newName: string) => {
      setTabs(tabs.map(t => t.id === id ? { ...t, title: newName } : t));
      
      // If it's a saved request, update the collection as well
      const tab = tabs.find(t => t.id === id);
      if (tab && tab.data && tab.data.collectionId) {
          handleRenameRequest(tab.data.id, newName);
      } else if (tab && tab.data) {
          // If draft, just update local data state so it persists in tab
          tab.data.name = newName;
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
    setIsSending(true);
    setResponse(null);
    setError(null);
    const startTime = Date.now();

    try {
      const headersInit: Record<string, string> = {};
      activeRequest.headers.filter(h => h.enabled).forEach(h => {
        headersInit[h.key] = h.value;
      });

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

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: text,
        time: endTime - startTime,
        size: new Blob([text]).size
      });

    } catch (err: any) {
      setError(err.message || 'Network Error.');
    } finally {
      setIsSending(false);
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
          // Persist strictly on save? Or debounce save? 
          // For name changes user expects sidebar update immediately.
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
    
    // Better naming logic: use last part of path or host
    let smartName = log.url;
    try {
        const u = new URL(log.url);
        const pathParts = u.pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
            smartName = pathParts[pathParts.length - 1];
        } else {
            smartName = u.hostname;
        }
    } catch (e) {
        smartName = log.url.substring(0, 20);
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

      // Update tab title if open
      setTabs(tabs.map(t => t.id === reqId ? { ...t, title: newName } : t));
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
      if (confirm(`Delete request "${req.name}"?`)) {
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
      }
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
        // CRUD
        onRenameCollection={handleRenameCollection}
        onRenameRequest={handleRenameRequest}
        onDeleteCollection={handleDeleteCollection}
        onDeleteRequest={handleDeleteRequest}
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
                        isSending={isSending}
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
                            <ResponseViewer response={response} error={error} />
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
