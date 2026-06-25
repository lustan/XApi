
import React, { useState, useRef, useEffect } from 'react';
import { LoggedRequest, SidebarTab, CollectionItem, HttpRequest, TabItem, MockRule } from '../types';
import { formatUrl, formatTime, getMethodColor, generateCurl, generateCurlFromRequest } from '../utils';
import { Logo } from './Logo';
import { APP_CONFIG } from '../config';
import { MockList } from './MockList';
import { ListItem } from './ListItem';
import type { AppLanguage } from '../i18n';

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  history: LoggedRequest[];
  onImportLoggedRequest: (req: LoggedRequest) => void;
  collections: CollectionItem[];
  rootRequests: HttpRequest[];
  tabs: TabItem[];
  activeRequestId?: string;
  activeCapturedId?: string;
  activeMockRuleId?: string;
  onSelectRequest: (req: HttpRequest) => void;
  onCreateCollection: () => void;
  onCreateRequest: () => void;
  onImportCurl: () => void;
  onClearHistory: () => void;
  onDeleteLog: (id: string) => void;
  onRenameCollection: (id: string, newName: string) => void;
  onRenameRequest: (reqId: string, newName: string) => void;
  onDeleteCollection: (id: string) => void;
  onDeleteRequest: (req: HttpRequest) => void;
  onDuplicateRequest: (reqId: string) => void;
  onToggleCollapse: (colId: string) => void;
  onMoveRequest: (reqId: string, targetColId: string | null) => void;
  isRecording?: boolean;
  onToggleRecording?: () => void;
  onCollapseSidebar: () => void;
  onResetAllData: () => void;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  // mock
  mockRules: MockRule[];
  mockGlobalEnabled: boolean;
  onSelectMockRule: (rule: MockRule) => void;
  onCreateMockRule: () => void;
  onToggleMockGlobal: () => void;
  onToggleMockRule: (id: string) => void;
  onDeleteMockRule: (id: string) => void;
  onDuplicateMockRule: (id: string) => void;
  onClearMockRules: () => void;
  onRenameMockRule: (id: string, newName: string) => void;
  onMockFromLog: (log: LoggedRequest) => void;
}

const copyToClipboard = (text: string): boolean => {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) { return false; }
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab, onTabChange, history, onImportLoggedRequest, collections, rootRequests, tabs, activeRequestId, activeCapturedId, activeMockRuleId, onSelectRequest, onCreateCollection, onCreateRequest, onImportCurl, onClearHistory, onDeleteLog, onRenameCollection, onRenameRequest, onDeleteCollection, onDeleteRequest, onDuplicateRequest, onToggleCollapse, onMoveRequest, isRecording, onToggleRecording, onCollapseSidebar, onResetAllData, language, onLanguageChange,
  mockRules, mockGlobalEnabled, onSelectMockRule, onCreateMockRule, onToggleMockGlobal, onToggleMockRule, onDeleteMockRule, onDuplicateMockRule, onClearMockRules, onRenameMockRule, onMockFromLog
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'collection' | 'request' | 'log', id: string, data?: any } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'collection' | 'request' | null>(null);
  const [editName, setEditName] = useState('');
  // Bumped per-request to retrigger ListItem rename via right-click menu.
  const [reqRenameTicks, setReqRenameTicks] = useState<Record<string, number>>({});
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [isDragOverRootZone, setIsDragOverRootZone] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
          setContextMenu(null);
          if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
              setIsSettingsOpen(false);
          }
      };
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleDragStart = (e: React.DragEvent, id: string) => { 
      e.dataTransfer.setData('text/plain', id); 
      e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent, id: string | null) => { 
      e.preventDefault(); 
      if (id === null) setIsDragOverRootZone(true); 
      else setDragOverColId(id); 
  };
  
  const handleDragLeave = () => {
      setDragOverColId(null);
      setIsDragOverRootZone(false);
  };

  const handleDrop = (e: React.DragEvent, id: string | null) => { 
      e.preventDefault(); 
      const reqId = e.dataTransfer.getData('text/plain'); 
      if (reqId) onMoveRequest(reqId, id); 
      handleDragLeave();
  };

  const submitRename = () => {
      if (editingId && editName.trim()) {
          if (editingType === 'collection') onRenameCollection(editingId, editName);
          else onRenameRequest(editingId, editName);
      }
      setEditingId(null);
      setEditingType(null);
  };

  const filteredHistory = history.filter(item => {
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    return item.url.toLowerCase().includes(lower) || item.method.toLowerCase().includes(lower);
  });

  const renderRequestItem = (req: HttpRequest) => {
    const isActive = activeRequestId === req.id;
    const { origin, path } = formatUrl(req.url);
    const subtitle = origin && path
      ? `${origin}${path}`
      : (origin || path || '');
    return (
      <ListItem
        key={req.id}
        isActive={isActive}
        method={req.method}
        methodColorClass={getMethodColor(req.method)}
        title={req.name}
        titleFallback={origin || 'Request'}
        subtitle={subtitle}
        editable
        editTrigger={reqRenameTicks[req.id]}
        onRename={(next) => onRenameRequest(req.id, next)}
        onClick={() => onSelectRequest(req)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'request', id: req.id, data: req }); }}
        draggable
        onDragStart={(e) => handleDragStart(e, req.id)}
        title_={req.name}
      />
    );
  };

  // 获取国际化文本
  const importCurlText = chrome.i18n.getMessage("importCurl");
  const newCollectionText = chrome.i18n.getMessage("newCollection");
  const newRequestText = chrome.i18n.getMessage("newRequest");
  const settingsText = chrome.i18n.getMessage("settings");
  const collapseSidebarText = chrome.i18n.getMessage("collapseSidebar");
  const collectionsText = chrome.i18n.getMessage("collections");
  const capturedText = chrome.i18n.getMessage("captured");
  const recordText = chrome.i18n.getMessage("record");
  const pausedText = chrome.i18n.getMessage("paused");
  const clearText = chrome.i18n.getMessage("clear");
  const filterCapturedRequestsText = chrome.i18n.getMessage("filterCapturedRequests");
  const deleteLogText = chrome.i18n.getMessage("deleteLog");
  const noMatchingRequestsText = chrome.i18n.getMessage("noMatchingRequests");
  const requestsText = chrome.i18n.getMessage("requests");
  const collectionsSectionText = chrome.i18n.getMessage("collectionsSection");
  const emptyText = chrome.i18n.getMessage("empty");
  const saveText = chrome.i18n.getMessage("save");
  const copyCurlText = chrome.i18n.getMessage("copyCurl");
  const deleteText = chrome.i18n.getMessage("delete");
  const renameText = chrome.i18n.getMessage("rename");
  const duplicateText = chrome.i18n.getMessage("duplicate");
  const githubRepositoryText = chrome.i18n.getMessage("githubRepository");
  const sendFeedbackText = chrome.i18n.getMessage("sendFeedback");
  const resetWorkspaceText = chrome.i18n.getMessage("resetWorkspace");
  const languageText = chrome.i18n.getMessage("language") || 'Language';
  const systemLanguageText = chrome.i18n.getMessage("systemLanguage") || 'System';
  const englishText = chrome.i18n.getMessage("english") || 'English';
  const chineseText = chrome.i18n.getMessage("chineseSimplified") || '简体中文';

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200 w-72 flex-shrink-0 relative select-none">
      {/* Header height is h-9 (36px) to match TabBar */}
      <div className="h-9 px-3 border-b border-gray-200 bg-white flex items-center justify-between">
         <div className="flex items-center">
            <Logo size={18} />
         </div>
         <div className="flex items-center space-x-1">
            <button onClick={onImportCurl} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title={importCurlText}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth={2}/></svg></button>
            <button onClick={onCreateCollection} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title={newCollectionText}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" strokeWidth={2}/></svg></button>
            <button onClick={onCreateRequest} className="p-1 text-green-500 hover:text-green-600 hover:bg-green-50 rounded" title={newRequestText}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth={2}/></svg></button>

            <div className="relative" ref={settingsRef}>
                <button
                    onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(!isSettingsOpen); }}
                    className={`p-1 rounded transition-colors ${isSettingsOpen ? 'bg-gray-100 text-gray-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                    title={settingsText}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth={2}/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth={2}/></svg>
                </button>
                {isSettingsOpen && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 shadow-xl rounded-md z-[110] py-1 animate-fadeIn overflow-hidden">
                        <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/50">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Version {APP_CONFIG.VERSION}</span>
                        </div>
                        <a href={APP_CONFIG.GITHUB_URL} target="_blank" rel="noopener noreferrer" className="flex items-center w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-green-50 transition-colors">
                            <svg className="w-3.5 h-3.5 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                            </svg>
                            {githubRepositoryText}
                        </a>
                        <a href={APP_CONFIG.FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="flex items-center w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-green-50 transition-colors">
                            <svg className="w-3.5 h-3.5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" strokeWidth={2}/></svg>
                            {sendFeedbackText}
                        </a>
                        <div className="px-4 py-2 border-t border-gray-100">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{languageText}</label>
                            <select
                                value={language}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => onLanguageChange(e.target.value as AppLanguage)}
                                className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-green-500"
                            >
                                <option value="system">{systemLanguageText}</option>
                                <option value="en">{englishText}</option>
                                <option value="zh_CN">{chineseText}</option>
                            </select>
                        </div>
                        <div className="h-px bg-gray-100 my-1"></div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onResetAllData(); setIsSettingsOpen(false); }}
                            className="flex items-center w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                            {resetWorkspaceText}
                        </button>
                    </div>
                )}
            </div>

            <button onClick={onCollapseSidebar} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title={collapseSidebarText}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" strokeWidth={2}/></svg>
            </button>
         </div>
      </div>

      <div className="flex text-xs font-bold border-b border-gray-200 bg-white uppercase tracking-wider">
        <button onClick={() => onTabChange('collections')} className={`flex-1 py-2 text-center transition-all ${activeTab === 'collections' ? 'text-green-600 border-b-2 border-green-500 bg-green-50/30' : 'text-gray-400 hover:text-gray-600'}`}>{collectionsText}</button>
        <button onClick={() => onTabChange('history')} className={`flex-1 py-2 text-center transition-all ${activeTab === 'history' ? 'text-green-600 border-b-2 border-green-500 bg-green-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
            {capturedText} ({history.length})
        </button>
        <button onClick={() => onTabChange('mock')} className={`flex-1 py-2 text-center transition-all ${activeTab === 'mock' ? 'text-green-600 border-b-2 border-green-500 bg-green-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
            {chrome.i18n.getMessage("mockTab") || 'Mock'} ({mockRules.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {activeTab === 'mock' ? (
          <MockList
            rules={mockRules}
            globalEnabled={mockGlobalEnabled}
            activeRuleId={activeMockRuleId}
            onSelect={onSelectMockRule}
            onCreate={onCreateMockRule}
            onToggleGlobal={onToggleMockGlobal}
            onToggleRule={onToggleMockRule}
            onDelete={onDeleteMockRule}
            onDuplicate={onDuplicateMockRule}
            onClear={onClearMockRules}
            onRename={onRenameMockRule}
          />
        ) : activeTab === 'history' ? (
          <div className="space-y-0.5">
             <div className="p-2 bg-gray-50 flex flex-col space-y-2 sticky top-0 z-10 border-b border-gray-200">
                 <div className="flex items-center justify-between">
                    <button onClick={onToggleRecording} className={`flex items-center px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ${isRecording ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-400 border-gray-200'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
                        {isRecording ? recordText : pausedText}
                    </button>
                    <button onClick={onClearHistory} className="text-[10px] text-gray-400 hover:text-red-500 font-bold uppercase">{clearText}</button>
                 </div>
                 <div className="relative">
                    <input
                        type="text"
                        placeholder={filterCapturedRequestsText}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="w-full text-[10px] pl-7 pr-2 py-1 bg-white border border-gray-200 rounded focus:outline-none focus:border-indigo-400 transition-colors"
                    />
                    <svg className="w-3 h-3 absolute left-2 top-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                    {filterText && (
                        <button
                            onClick={() => setFilterText('')}
                            className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2}/></svg>
                        </button>
                    )}
                 </div>
             </div>
             {filteredHistory.map(item => {
                 const { origin, path } = formatUrl(item.url);
                 const isActive = activeCapturedId === item.id;
                 return (
                   <ListItem
                     key={item.id}
                     isActive={isActive}
                     method={item.method}
                     methodColorClass={getMethodColor(item.method)}
                     metaExtras={
                       <>
                         <span className="text-[9px] text-gray-400 font-mono">{formatTime(item.timestamp)}</span>
                         <span className={`text-[9px] px-1 rounded font-bold ${item.status >= 400 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>{item.status || '...'}</span>
                       </>
                     }
                     title={origin}
                     titleFallback="—"
                     subtitle={path || '/'}
                     onClick={() => onImportLoggedRequest(item)}
                     onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'log', id: item.id, data: item }); }}
                     draggable
                     onDragStart={(e) => handleDragStart(e, item.id)}
                     hoverActions={
                       <button
                         onClick={(e) => { e.stopPropagation(); onDeleteLog(item.id); }}
                         className="p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                         title={deleteLogText}
                       >
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                       </button>
                     }
                   />
                 );
             })}
             {filteredHistory.length === 0 && history.length > 0 && (
                 <div className="p-4 text-center text-[11px] text-gray-400 italic">{noMatchingRequestsText}</div>
             )}
          </div>
        ) : (
          <div className="flex flex-col min-h-full">
            <div
                className={`flex flex-col p-2 min-h-[40px] transition-colors ${isDragOverRootZone ? 'bg-green-100/50 outline-dashed outline-2 outline-green-400 rounded-md m-1' : ''}`}
                onDragOver={(e) => handleDragOver(e, null)}
                onDrop={(e) => handleDrop(e, null)}
                onDragLeave={handleDragLeave}
            >
                <div className="space-y-0.5">
                    {rootRequests.map(renderRequestItem)}
                </div>
            </div>

            <div className="flex flex-col p-2 space-y-1">
                {collections.map(col => (
                    <div
                        key={col.id}
                        className={`rounded-md overflow-hidden transition-all pb-1 ${dragOverColId === col.id ? 'bg-green-100 outline-dashed outline-2 outline-green-400 m-0.5' : ''}`}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDrop={(e) => handleDrop(e, col.id)}
                        onDragLeave={handleDragLeave}
                    >
                        <div className="flex items-center px-2 py-1.5 hover:bg-gray-200 cursor-pointer group" onClick={() => onToggleCollapse(col.id)} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'collection', id: col.id, data: col }); }}>
                            <svg className={`w-3.5 h-3.5 text-gray-400 mr-1 transform transition-transform ${col.collapsed ? '-rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                            {col.collapsed ? (
                                <svg className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1H2V6z"/><path d="M2 10h16v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/></svg>
                            ) : (
                                <svg className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h4l2 2h3a2 2 0 012 2v1H4.5a2 2 0 00-1.94 1.515L2 12.755V6z"/><path d="M4.5 10h13.32a1 1 0 01.97 1.243l-1 4A1 1 0 0116.82 16H3.5a1 1 0 01-.97-1.243l1-4A1 1 0 014.5 10z"/></svg>
                            )}
                            {editingId === col.id && editingType === 'collection' ? (
                                <input autoFocus value={editName} onClick={(e)=>e.stopPropagation()} onChange={(e) => setEditName(e.target.value)} onBlur={submitRename} onKeyDown={(e) => e.key === 'Enter' && submitRename()} className="flex-1 text-sm border border-blue-400 rounded px-1 outline-none h-6" />
                            ) : (
                                <span className="text-sm font-bold text-gray-700 flex-1 truncate select-none" onDoubleClick={(e) => { e.stopPropagation(); setEditingId(col.id); setEditingType('collection'); setEditName(col.name); }}>{col.name}</span>
                            )}
                            <span className="text-[10px] text-gray-400 font-bold ml-1">{col.requests.length}</span>
                        </div>
                        {!col.collapsed && (
                            <div className="pl-2 py-0.5 space-y-0.5 mr-1">
                                {col.requests.map(renderRequestItem)}
                                {col.requests.length === 0 && <div className="text-[10px] text-gray-400 italic py-1 pl-2">{emptyText}</div>}
                            </div>
                        )}
                    </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
          <div className="fixed bg-white border border-gray-200 shadow-xl rounded-md py-1.5 z-[100] w-52 animate-fadeIn border-t-2 border-t-indigo-500" style={{ top: contextMenu.y, left: contextMenu.x }}>
              {contextMenu.type === 'log' && (
                  <>
                      <button className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center" onClick={() => { onMoveRequest(contextMenu.id, null); setContextMenu(null); }}><svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth={2}/></svg>{saveText}</button>
                      <button className="w-full text-left px-4 py-2 text-xs text-indigo-600 hover:bg-indigo-50 flex items-center" onClick={() => { onMockFromLog(contextMenu.data); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        {chrome.i18n.getMessage("mockThis") || 'Mock this response'}
                      </button>
                      <button className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center" onClick={() => { copyToClipboard(generateCurl(contextMenu.data)); setContextMenu(null); }}><svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" strokeWidth={2}/></svg>{copyCurlText}</button>
                      <button className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center" onClick={() => { onDeleteLog(contextMenu.id); setContextMenu(null); }}><svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>{deleteText}</button>
                  </>
              )}
              {contextMenu.type === 'request' && (
                  <>
                      <button className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center" onClick={() => { copyToClipboard(generateCurlFromRequest(contextMenu.data)); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" strokeWidth={2}/></svg>
                        {copyCurlText}
                      </button>
                      <button className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center" onClick={() => { setReqRenameTicks(prev => ({ ...prev, [contextMenu.id]: (prev[contextMenu.id] || 0) + 1 })); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth={2}/></svg>
                        {renameText}
                      </button>
                      <button className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center" onClick={() => { onDuplicateRequest(contextMenu.id); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" strokeWidth={2}/></svg>
                        {duplicateText}
                      </button>
                      <button className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center" onClick={() => { onDeleteRequest(contextMenu.data); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                        {deleteText}
                      </button>
                  </>
              )}
              {contextMenu.type === 'collection' && (
                  <>
                      <button className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center" onClick={() => { setEditingId(contextMenu.id); setEditingType('collection'); setEditName(contextMenu.data.name); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth={2}/></svg>
                        {renameText}
                      </button>
                      <button className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center" onClick={() => { onDeleteCollection(contextMenu.id); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                        {deleteText}
                      </button>
                  </>
              )}
          </div>
      )}
    </div>
  );
};
