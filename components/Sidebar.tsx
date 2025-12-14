
import React, { useState, useRef, useEffect } from 'react';
import { LoggedRequest, SidebarTab, CollectionItem, HttpRequest } from '../types';
import { formatUrl, formatTime, getMethodColor } from '../utils';
import { APP_CONFIG } from '../config';
import { Logo } from './Logo';

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
  onDeleteLog: (id: string) => void; // New prop for single deletion
  // CRUD Actions
  onRenameCollection: (id: string, newName: string) => void;
  onRenameRequest: (reqId: string, newName: string) => void;
  onDeleteCollection: (id: string) => void;
  onDeleteRequest: (req: HttpRequest) => void;
  onDuplicateRequest: (reqId: string) => void; // New Prop
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
  onDeleteLog,
  onRenameCollection,
  onRenameRequest,
  onDeleteCollection,
  onDeleteRequest,
  onDuplicateRequest,
  onToggleCollapse,
  onMoveRequest
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'collection' | 'request', id: string, data?: any } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'collection' | 'request' | null>(null);
  const [editName, setEditName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  
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

  // Close context menu and settings on click outside
  useEffect(() => {
      const listener = (e: MouseEvent) => {
          setContextMenu(null);
          if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
              setIsSettingsOpen(false);
          }
      };
      document.addEventListener('click', listener);
      return () => document.removeEventListener('click', listener);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200 w-72 flex-shrink-0 relative select-none">
      {/* Header Actions */}
      <div className="h-10 px-3 border-b border-gray-200 bg-white flex items-center justify-between">
         <div className="flex items-center space-x-2">
            <Logo size={18} className="text-green-600" />
            <span className="font-bold text-gray-700 text-sm">Workspace</span>
         </div>
         <div className="flex space-x-1 items-center">
            <button onClick={onImportCurl} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Import cURL">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button onClick={onCreateCollection} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="New Collection">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            </button>
            <button onClick={onCreateRequest} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="New Request">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            
            {/* Settings Menu */}
            <div className="relative" ref={settingsRef}>
                <button 
                    onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(!isSettingsOpen); }} 
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" 
                    title="Settings"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </button>
                {isSettingsOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50 py-1">
                        <div className="px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                            Version {APP_CONFIG.VERSION}
                        </div>
                        <a 
                            href={APP_CONFIG.GITHUB_URL} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 flex items-center"
                        >
                           <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                           GitHub
                        </a>
                        <a 
                            href={APP_CONFIG.FEEDBACK_URL} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 flex items-center"
                        >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                            Feedback
                        </a>
                    </div>
                )}
            </div>
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
          Captured
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {activeTab === 'history' && (
          <div>
             <div className="p-2 bg-gray-100 flex justify-between items-center sticky top-0 z-10 border-b border-gray-200">
                 <span className="text-xs font-semibold text-gray-400">{validHistory.length} requests</span>
                 <button onClick={onClearHistory} className="text-xs text-gray-400 hover:text-red-500">Clear All</button>
             </div>

             {/* Search Filter */}
             <div className="px-2 py-1 bg-white border-b border-gray-200 sticky top-8 z-10">
                 <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter url or method..."
                    className="w-full text-xs px-3 py-1.5 bg-gray-100 border-transparent focus:bg-white border focus:border-green-500 rounded transition-colors focus:outline-none"
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
                   const isActive = activeRequestId === item.id;
                   return (
                     <li 
                        key={item.id} 
                        className={`
                            relative px-3 py-2 cursor-pointer group transition-colors border-l-2
                            ${isActive 
                                ? 'bg-green-50 border-green-500' 
                                : 'hover:bg-white border-transparent hover:border-green-500'
                            }
                        `}
                        onClick={() => onImportLoggedRequest(item)}
                     >
                       <div className="flex items-center justify-between mb-0.5">
                         <span className={`text-[10px] font-bold w-12 ${getMethodColor(item.method)}`}>
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
                       <div className="flex flex-col pr-4">
                           <span className="text-xs font-semibold text-gray-700 truncate" title={origin}>{origin}</span>
                           <span className="text-[10px] text-gray-500 truncate font-mono" title={path}>{path}</span>
                       </div>

                       {/* Delete Button - Visible on Hover - Centered Vertically */}
                       <button
                         onClick={(e) => { e.stopPropagation(); onDeleteLog(item.id); }}
                         className="absolute right-2 top-1/2 transform -translate-y-1/2 hidden group-hover:block p-1 text-gray-400 hover:text-red-500 bg-white rounded shadow-sm border border-gray-100 hover:border-red-200 transition-all z-10"
                         title="Delete Log"
                       >
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                       </button>
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
                                <span className={`w-8 font-bold text-[9px] mr-1 ${getMethodColor(req.method)}`}>{req.method}</span>
                                
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
                        className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 text-gray-700"
                        onClick={() => {
                            onDuplicateRequest(contextMenu.id);
                            closeContextMenu();
                        }}
                    >
                        Duplicate
                    </button>
                     <button 
                        className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 text-red-600"
                        onClick={() => {
                            onDeleteRequest(contextMenu.data);
                            closeContextMenu();
                        }}
                    >
                        Delete
                    </button>
                  </>
              )}
          </div>
      )}
    </div>
  );
};
