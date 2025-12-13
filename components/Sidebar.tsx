
import React, { useState } from 'react';
import { LoggedRequest, SidebarTab, CollectionItem, HttpRequest } from '../types';
import { formatUrl, formatTime } from '../utils';

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  history: LoggedRequest[];
  onImportLoggedRequest: (req: LoggedRequest) => void;
  collections: CollectionItem[];
  activeRequestId?: string;
  onSelectRequest: (req: HttpRequest) => void;
  // Actions
  onCreateCollection: () => void;
  onCreateRequest: () => void;
  onImportCurl: () => void;
  onClearHistory: () => void;
  // New CRUD Actions
  onRenameCollection: (id: string, newName: string) => void;
  onRenameRequest: (reqId: string, newName: string) => void; // New Prop
  onDeleteCollection: (id: string) => void;
  onDeleteRequest: (req: HttpRequest) => void;
  onToggleCollapse: (colId: string) => void;
  onMoveRequest: (reqId: string, targetColId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onTabChange, 
  history, 
  onImportLoggedRequest,
  collections,
  activeRequestId,
  onSelectRequest,
  onCreateCollection,
  onCreateRequest,
  onImportCurl,
  onClearHistory,
  onRenameCollection,
  onRenameRequest,
  onDeleteCollection,
  onDeleteRequest,
  onToggleCollapse,
  onMoveRequest
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'collection' | 'request', id: string, data?: any } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'collection' | 'request' | null>(null);
  const [editName, setEditName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Drag and Drop State
  const [draggedReqId, setDraggedReqId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const validHistory = history.filter(log => {
      if (!log || !log.url || log.url.startsWith('chrome-extension')) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return log.url.toLowerCase().includes(term) || log.method.toLowerCase().includes(term);
  });

  // --- Context Menu Handlers ---
  const handleContextMenu = (e: React.MouseEvent, type: 'collection' | 'request', id: string, data?: any) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, type, id, data });
  };

  const closeContextMenu = () => setContextMenu(null);

  // --- Rename Handlers ---
  const startRename = (id: string, currentName: string, type: 'collection' | 'request') => {
      setEditingId(id);
      setEditingType(type);
      setEditName(currentName);
      closeContextMenu();
  };

  const submitRename = () => {
      if (editingId && editName.trim()) {
          if (editingType === 'collection') {
              onRenameCollection(editingId, editName);
          } else if (editingType === 'request') {
              onRenameRequest(editingId, editName);
          }
      }
      setEditingId(null);
      setEditingType(null);
  };

  // --- DnD Handlers ---
  const handleDragStart = (e: React.DragEvent, reqId: string) => {
      e.dataTransfer.setData('text/plain', reqId);
      setDraggedReqId(reqId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
      e.preventDefault();
      setDragOverColId(colId);
  };

  const handleDrop = (e: React.DragEvent, colId: string) => {
      e.preventDefault();
      const reqId = e.dataTransfer.getData('text/plain');
      if (reqId) {
          onMoveRequest(reqId, colId);
      }
      setDraggedReqId(null);
      setDragOverColId(null);
  };

  // Close context menu on click outside
  React.useEffect(() => {
      const listener = () => setContextMenu(null);
      document.addEventListener('click', listener);
      return () => document.removeEventListener('click', listener);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200 w-72 flex-shrink-0 relative select-none">
      {/* Header Actions */}
      <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between">
         <span className="font-bold text-gray-700">Workspace</span>
         <div className="flex space-x-1">
            <button onClick={onImportCurl} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Import cURL">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button onClick={onCreateCollection} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="New Collection">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            </button>
            <button onClick={onCreateRequest} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="New Request">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex text-sm font-medium border-b border-gray-200 bg-white">
        <button
          onClick={() => onTabChange('collections')}
          className={`flex-1 py-2 text-center transition-colors ${activeTab === 'collections' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Collections
        </button>
        <button
          onClick={() => onTabChange('history')}
          className={`flex-1 py-2 text-center transition-colors ${activeTab === 'history' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {activeTab === 'history' && (
          <div>
             <div className="p-2 bg-gray-100 flex justify-between items-center sticky top-0 z-10 border-b border-gray-200">
                 <span className="text-xs font-bold text-gray-500">CAPTURED REQUESTS</span>
                 <button onClick={onClearHistory} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
             </div>

             {/* Search Filter */}
             <div className="px-2 py-1 bg-white border-b border-gray-200 sticky top-8 z-10">
                 <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter url or method..."
                    className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-green-500"
                 />
             </div>
             
             <ul className="divide-y divide-gray-200">
               {validHistory.length === 0 && (
                 <li className="p-8 text-xs text-center text-gray-400 flex flex-col items-center">
                    <span className="mb-2 text-xl">📡</span>
                    <span>No requests found.</span>
                 </li>
               )}
               {validHistory.map(item => {
                   const { origin, path } = formatUrl(item.url);
                   return (
                     <li 
                        key={item.id} 
                        className="px-3 py-2 hover:bg-white cursor-pointer group transition-colors border-l-2 border-transparent hover:border-green-500"
                        onClick={() => onImportLoggedRequest(item)}
                     >
                       <div className="flex items-center justify-between mb-0.5">
                         <span className={`text-[10px] font-bold w-12 ${
                            item.method === 'GET' ? 'text-green-600' : 
                            item.method === 'POST' ? 'text-yellow-600' : 
                            item.method === 'DELETE' ? 'text-red-600' : 'text-blue-600'
                         }`}>
                            {item.method}
                         </span>
                         <div className="flex items-center space-x-2">
                             <span className="text-[10px] text-gray-400 font-mono">
                                 {formatTime(item.timestamp)}
                             </span>
                             <span className={`text-[10px] px-1 rounded ${item.status === 0 ? 'bg-gray-200 text-gray-500' : item.status >= 400 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                {item.status === 0 ? '...' : item.status}
                             </span>
                         </div>
                       </div>
                       <div className="flex flex-col">
                           <span className="text-xs font-semibold text-gray-700 truncate" title={origin}>{origin}</span>
                           <span className="text-[10px] text-gray-500 truncate font-mono" title={path}>{path}</span>
                       </div>
                     </li>
                   );
               })}
             </ul>
          </div>
        )}

        {activeTab === 'collections' && (
          <div className="p-2 space-y-1 pb-10">
            {collections.length === 0 && (
                <div className="mt-8 text-center text-gray-400 text-xs">
                    Right click workspace or click + to add collection
                </div>
            )}
            {collections.map(col => (
               <div 
                    key={col.id} 
                    className={`mb-1 rounded ${dragOverColId === col.id ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}
                    onDragOver={(e) => handleDragOver(e, col.id)}
                    onDrop={(e) => handleDrop(e, col.id)}
               >
                  {/* Collection Header */}
                  <div 
                    className="flex items-center px-2 py-1 hover:bg-gray-100 rounded cursor-pointer text-sm font-semibold text-gray-700 group"
                    onClick={() => onToggleCollapse(col.id)}
                    onContextMenu={(e) => handleContextMenu(e, 'collection', col.id)}
                  >
                     {/* SVG Arrow with rotation */}
                    <div className="mr-1 w-4 h-4 flex items-center justify-center">
                        <svg 
                            className={`w-3 h-3 text-gray-400 transform transition-transform duration-200 ${col.collapsed ? '-rotate-90' : 'rotate-0'}`} 
                            fill="currentColor" 
                            viewBox="0 0 20 20"
                        >
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </div>

                    <span className="mr-2 text-yellow-500">📁</span> 
                    
                    {editingId === col.id ? (
                        <input 
                            autoFocus
                            type="text" 
                            value={editName}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={submitRename}
                            onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                            className="flex-1 text-sm border border-blue-500 rounded px-1 outline-none"
                        />
                    ) : (
                        <span className="flex-1 truncate select-none" onDoubleClick={() => startRename(col.id, col.name, 'collection')}>{col.name}</span>
                    )}
                  </div>

                  {/* Requests List */}
                  {!col.collapsed && (
                    <div className="ml-2 pl-2 border-l border-gray-200 mt-1 space-y-0.5">
                        {col.requests.map(req => (
                            <div 
                                key={req.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, req.id)}
                                onClick={() => onSelectRequest(req)}
                                onContextMenu={(e) => handleContextMenu(e, 'request', req.id, req)}
                                className={`
                                    flex items-center px-2 py-1 rounded cursor-pointer text-xs group relative
                                    ${activeRequestId === req.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}
                                    ${draggedReqId === req.id ? 'opacity-50' : ''}
                                `}
                            >
                                <span className={`w-8 font-bold text-[9px] mr-1 ${
                                    req.method === 'GET' ? 'text-green-600' : 
                                    req.method === 'POST' ? 'text-yellow-600' : 
                                    req.method === 'DELETE' ? 'text-red-600' : 'text-blue-600'
                                }`}>{req.method}</span>
                                
                                {editingId === req.id ? (
                                    <input 
                                        autoFocus
                                        type="text" 
                                        value={editName}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onBlur={submitRename}
                                        onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                                        className="flex-1 text-xs border border-blue-500 rounded px-1 outline-none"
                                    />
                                ) : (
                                    <span 
                                        className="truncate flex-1 select-none" 
                                        title={req.name}
                                        onDoubleClick={() => startRename(req.id, req.name, 'request')}
                                    >
                                        {req.name}
                                    </span>
                                )}
                            </div>
                        ))}
                        {col.requests.length === 0 && (
                             <div className="ml-6 text-[10px] text-gray-400 py-1 italic">Empty</div>
                        )}
                    </div>
                  )}
               </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
          <div 
            className="fixed bg-white border border-gray-200 shadow-lg rounded py-1 z-50 w-32"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
              {contextMenu.type === 'collection' ? (
                  <>
                    <button 
                        className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 text-gray-700"
                        onClick={() => {
                            const col = collections.find(c => c.id === contextMenu.id);
                            if (col) startRename(contextMenu.id, col.name, 'collection');
                        }}
                    >
                        Rename
                    </button>
                    <button 
                        className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 text-red-600"
                        onClick={() => {
                            onDeleteCollection(contextMenu.id);
                            closeContextMenu();
                        }}
                    >
                        Delete
                    </button>
                  </>
              ) : (
                  <>
                    <button 
                        className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 text-gray-700"
                        onClick={() => {
                            const req = collections.flatMap(c => c.requests).find(r => r.id === contextMenu.id);
                            if (req) startRename(contextMenu.id, req.name, 'request');
                        }}
                    >
                        Rename
                    </button>
                     <button 
                        className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 text-red-600"
                        onClick={() => {
                            onDeleteRequest(contextMenu.data);
                            closeContextMenu();
                        }}
                    >
                        Delete Request
                    </button>
                  </>
              )}
          </div>
      )}
    </div>
  );
};
