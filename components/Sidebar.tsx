import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LoggedRequest, SidebarTab, CollectionItem, HttpRequest, TabItem, MockRule } from '../types';
import { formatUrl, formatTime, getMethodColor, generateCurl, generateCurlFromRequest } from '../utils';
import { collectAllRequestIds, filterCollectionsTree } from '../collectionUtils';
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
  onCreateSubfolder?: (parentId: string) => void;
  onCreateRequest: () => void;
  onImportCurl: () => void;
  onExportWorkspace?: () => void;
  onExportMocks?: () => void;
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
  excludeDomains?: string[];
  onChangeExcludeDomains?: (domains: string[]) => void;
  onCompareLogs?: (left: LoggedRequest, right: LoggedRequest) => void;
  onSaveLogsAsCollection?: (logs: LoggedRequest[]) => void;
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
    } catch { return false; }
};

const clampPosition = (x: number, y: number, width: number, height: number) => {
  const maxX = Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 8);
  const maxY = Math.max(8, (typeof window !== 'undefined' ? window.innerHeight : 800) - height - 8);
  return {
    left: Math.min(Math.max(8, x), maxX),
    top: Math.min(Math.max(8, y), maxY),
  };
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab, onTabChange, history, onImportLoggedRequest, collections, rootRequests, activeRequestId, activeCapturedId, activeMockRuleId,
  onSelectRequest, onCreateCollection, onCreateSubfolder, onCreateRequest, onImportCurl, onExportWorkspace, onExportMocks,
  onClearHistory, onDeleteLog, onRenameCollection, onRenameRequest, onDeleteCollection, onDeleteRequest, onDuplicateRequest,
  onToggleCollapse, onMoveRequest, isRecording, onToggleRecording, onCollapseSidebar, onResetAllData, language, onLanguageChange,
  mockRules, mockGlobalEnabled, onSelectMockRule, onCreateMockRule, onToggleMockGlobal, onToggleMockRule, onDeleteMockRule, onDuplicateMockRule, onClearMockRules, onRenameMockRule, onMockFromLog,
  excludeDomains = [], onChangeExcludeDomains, onCompareLogs, onSaveLogsAsCollection,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'collection' | 'request' | 'log', id: string, data?: any } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [colFilterText, setColFilterText] = useState('');
  const [currentTabOnly, setCurrentTabOnly] = useState(false);
  const [currentBrowserTabId, setCurrentBrowserTabId] = useState<number | null>(null);
  const [showExcludeInput, setShowExcludeInput] = useState(false);
  const [excludeDraft, setExcludeDraft] = useState(excludeDomains.join(', '));
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'collection' | 'request' | null>(null);
  const [editName, setEditName] = useState('');
  const [reqRenameTicks, setReqRenameTicks] = useState<Record<string, number>>({});
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [isDragOverRootZone, setIsDragOverRootZone] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExcludeDraft(excludeDomains.join(', '));
  }, [excludeDomains]);

  useEffect(() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.query === 'function') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          setCurrentBrowserTabId(tabs?.[0]?.id ?? null);
        });
      }
    } catch { /* ignore */ }
  }, []);

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
      e.stopPropagation();
      if (id === null) setIsDragOverRootZone(true); 
      else setDragOverColId(id); 
  };
  
  const handleDragLeave = () => {
      setDragOverColId(null);
      setIsDragOverRootZone(false);
  };

  const handleDrop = (e: React.DragEvent, id: string | null) => { 
      e.preventDefault();
      e.stopPropagation();
      const reqId = e.dataTransfer.getData('text/plain'); 
      if (reqId) onMoveRequest(reqId, id); 
      handleDragLeave();
  };

  const submitRename = () => {
      if (editingId && editName.trim()) {
          if (editingType === 'collection') onRenameCollection(editingId, editName.trim());
          else onRenameRequest(editingId, editName.trim());
      }
      setEditingId(null);
      setEditingType(null);
  };

  const toggleSelectLog = (id: string) => {
    setSelectedLogIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const filteredHistory = history.filter(item => {
    if (currentTabOnly && currentBrowserTabId !== null && item.tabId !== currentBrowserTabId) {
      return false;
    }
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    return (
      item.url.toLowerCase().includes(lower) ||
      item.method.toLowerCase().includes(lower) ||
      (item.graphqlOperationName || '').toLowerCase().includes(lower)
    );
  });

  const visibleCollections = useMemo(
    () => filterCollectionsTree(collections, colFilterText),
    [collections, colFilterText]
  );

  const visibleRootRequests = useMemo(() => {
    const q = colFilterText.trim().toLowerCase();
    if (!q) return rootRequests;
    return rootRequests.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q)
    );
  }, [rootRequests, colFilterText]);

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
        titleFallback={origin || chrome.i18n.getMessage('requestFallback') || 'Request'}
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

  const renderCollectionNode = (col: CollectionItem, depth = 0) => {
    const totalCount = col.requests.length + collectAllRequestIds(col.collections || []).length;
    return (
      <div
        key={col.id}
        style={depth > 0 ? { paddingLeft: 10 } : undefined}
        className={`rounded-md overflow-hidden transition-all pb-0.5 ${dragOverColId === col.id ? 'bg-emerald-100 outline-dashed outline-2 outline-emerald-400 m-0.5' : ''}`}
        onDragOver={(e) => handleDragOver(e, col.id)}
        onDrop={(e) => handleDrop(e, col.id)}
        onDragLeave={handleDragLeave}
      >
        <div
          className="flex items-center px-2 py-1.5 hover:bg-slate-200/70 rounded cursor-pointer group"
          onClick={() => onToggleCollapse(col.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'collection', id: col.id, data: col });
          }}
        >
          <svg className={`w-3.5 h-3.5 text-slate-400 mr-1 transform transition-transform flex-shrink-0 ${col.collapsed ? '-rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
          {col.collapsed ? (
            <svg className="w-4 h-4 text-amber-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1H2V6z"/><path d="M2 10h16v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/></svg>
          ) : (
            <svg className="w-4 h-4 text-amber-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h4l2 2h3a2 2 0 012 2v1H4.5a2 2 0 00-1.94 1.515L2 12.755V6z"/><path d="M4.5 10h13.32a1 1 0 01.97 1.243l-1 4A1 1 0 0116.82 16H3.5a1 1 0 01-.97-1.243l1-4A1 1 0 014.5 10z"/></svg>
          )}
          {editingId === col.id && editingType === 'collection' ? (
            <input autoFocus value={editName} onClick={(e)=>e.stopPropagation()} onChange={(e) => setEditName(e.target.value)} onBlur={submitRename} onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); else if (e.key === 'Escape') { setEditingId(null); setEditingType(null); } }} className="flex-1 text-xs border border-emerald-500 rounded px-1 outline-none h-6 bg-white" />
          ) : (
            <span className="text-xs font-bold text-slate-700 flex-1 truncate select-none" onDoubleClick={(e) => { e.stopPropagation(); setEditingId(col.id); setEditingType('collection'); setEditName(col.name); }}>{col.name}</span>
          )}
          <span className="text-[10px] text-slate-400 font-semibold ml-1 tabular-nums">{totalCount}</span>
        </div>
        {!col.collapsed && (
          <div className="pl-2 py-0.5 space-y-0.5 mr-0.5">
            {(col.collections || []).map(sub => renderCollectionNode(sub, depth + 1))}
            {col.requests.map(renderRequestItem)}
            {col.requests.length === 0 && (!col.collections || col.collections.length === 0) && (
              <div className="text-[11px] text-slate-400 italic py-1 pl-2">{emptyText}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const importCurlText = chrome.i18n.getMessage("importUniversal") || chrome.i18n.getMessage("importCurl");
  const newCollectionText = chrome.i18n.getMessage("newCollection");
  const newSubfolderText = chrome.i18n.getMessage("newSubfolder") || 'New Subfolder';
  const newRequestText = chrome.i18n.getMessage("newRequest");
  const settingsText = chrome.i18n.getMessage("settings");
  const collapseSidebarText = chrome.i18n.getMessage("collapseSidebar");
  const collectionsText = chrome.i18n.getMessage("collections");
  const capturedText = chrome.i18n.getMessage("captured");
  const recordText = chrome.i18n.getMessage("record");
  const pausedText = chrome.i18n.getMessage("paused");
  const clearText = chrome.i18n.getMessage("clear");
  const filterCapturedRequestsText = chrome.i18n.getMessage("filterCapturedRequests");
  const filterCollectionsText = chrome.i18n.getMessage("filterCollections") || 'Search collections...';
  const deleteLogText = chrome.i18n.getMessage("deleteLog");
  const noMatchingRequestsText = chrome.i18n.getMessage("noMatchingRequests");
  const noRequestsFoundText = chrome.i18n.getMessage("noRequestsFound") || 'No requests found';
  const capturedEmptyHintText = chrome.i18n.getMessage("capturedEmptyHint") || 'Turn on Capture above and browse a page to record requests.';
  const collectionsEmptyText = chrome.i18n.getMessage("collectionsEmpty") || 'No saved requests yet';
  const collectionsEmptyHintText = chrome.i18n.getMessage("collectionsEmptyHint") || 'Create a request, group with collections, or import a cURL / Postman / OpenAPI spec.';
  const startRecordingText = chrome.i18n.getMessage("startRecording") || 'Start Capturing';
  const emptyText = chrome.i18n.getMessage("empty");
  const saveText = chrome.i18n.getMessage("save");
  const copyCurlText = chrome.i18n.getMessage("copyCurl");
  const deleteText = chrome.i18n.getMessage("delete");
  const renameText = chrome.i18n.getMessage("rename");
  const duplicateText = chrome.i18n.getMessage("duplicate");
  const githubRepositoryText = chrome.i18n.getMessage("githubRepository");
  const sendFeedbackText = chrome.i18n.getMessage("sendFeedback");
  const resetWorkspaceText = chrome.i18n.getMessage("resetWorkspace");
  const exportWorkspaceText = chrome.i18n.getMessage("exportWorkspace") || 'Export Workspace';
  const currentTabOnlyText = chrome.i18n.getMessage("currentTabOnly") || 'Current Tab';
  const excludeDomainsText = chrome.i18n.getMessage("excludeDomains") || 'Exclude Domains';
  const excludeDomainsPh = chrome.i18n.getMessage("excludeDomainsPlaceholder") || 'google-analytics.com, sentry.io';
  const compareText = chrome.i18n.getMessage("compareSelected") || 'Compare';
  const saveSelectedText = chrome.i18n.getMessage("saveToColBatch") || 'Save Selected';
  const languageText = chrome.i18n.getMessage("language") || 'Language';
  const systemLanguageText = chrome.i18n.getMessage("systemLanguage") || 'System';
  const englishText = chrome.i18n.getMessage("english") || 'English';
  const chineseText = chrome.i18n.getMessage("chineseSimplified") || '简体中文';

  const hasAnySavedItems = rootRequests.length > 0 || collections.length > 0;
  const selectedLogs = history.filter(h => selectedLogIds.includes(h.id));

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200 w-72 flex-shrink-0 relative select-none">
      {/* Header height is h-10 (40px) to match TabBar */}
      <div className="h-10 px-3 border-b border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
         <div className="flex items-center">
            <Logo size={22} />
         </div>
         <div className="flex items-center space-x-1">
            <button type="button" onClick={onImportCurl} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" title={importCurlText} aria-label={importCurlText}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth={2}/></svg>
            </button>
            <button type="button" onClick={onCreateCollection} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" title={newCollectionText} aria-label={newCollectionText}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" strokeWidth={2}/></svg>
            </button>
            <button type="button" onClick={onCreateRequest} className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors" title={newRequestText} aria-label={newRequestText}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth={2}/></svg>
            </button>

            <div className="relative" ref={settingsRef}>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(!isSettingsOpen); }}
                    className={`p-1.5 rounded transition-colors ${isSettingsOpen ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                    title={settingsText}
                    aria-label={settingsText}
                    aria-expanded={isSettingsOpen}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth={2}/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth={2}/></svg>
                </button>
                {isSettingsOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 shadow-xl rounded-lg z-[110] py-1 animate-fadeIn overflow-hidden">
                        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/70">
                            <span className="text-[11px] font-semibold text-slate-400">
                              {chrome.i18n.getMessage("versionLabel", [APP_CONFIG.VERSION]) || `Version ${APP_CONFIG.VERSION}`}
                            </span>
                        </div>
                        {onExportWorkspace && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onExportWorkspace(); setIsSettingsOpen(false); }}
                            className="flex items-center w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5 mr-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                            {exportWorkspaceText}
                          </button>
                        )}
                        <a href={APP_CONFIG.GITHUB_URL} target="_blank" rel="noopener noreferrer" className="flex items-center w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors">
                            <svg className="w-3.5 h-3.5 mr-2 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                            </svg>
                            {githubRepositoryText}
                        </a>
                        <a href={APP_CONFIG.FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="flex items-center w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors">
                            <svg className="w-3.5 h-3.5 mr-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" strokeWidth={2}/></svg>
                            {sendFeedbackText}
                        </a>
                        <div className="px-4 py-2 border-t border-slate-100">
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">{languageText}</label>
                            <select
                                value={language}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => onLanguageChange(e.target.value as AppLanguage)}
                                className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
                            >
                                <option value="system">{systemLanguageText}</option>
                                <option value="en">{englishText}</option>
                                <option value="zh_CN">{chineseText}</option>
                            </select>
                        </div>
                        <div className="h-px bg-slate-100 my-1"></div>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onResetAllData(); setIsSettingsOpen(false); }}
                            className="flex items-center w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                            {resetWorkspaceText}
                        </button>
                    </div>
                )}
            </div>

            <button type="button" onClick={onCollapseSidebar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" title={collapseSidebarText} aria-label={collapseSidebarText}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" strokeWidth={2}/></svg>
            </button>
         </div>
      </div>

      <div className="flex text-xs font-semibold border-b border-slate-200 bg-white">
        <button type="button" onClick={() => onTabChange('collections')} className={`flex-1 py-2 text-center transition-colors border-b-2 whitespace-nowrap ${activeTab === 'collections' ? 'text-emerald-700 border-emerald-600 bg-emerald-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'}`}>{collectionsText}</button>
        <button type="button" onClick={() => onTabChange('history')} className={`flex-1 py-2 text-center transition-colors border-b-2 tabular-nums whitespace-nowrap ${activeTab === 'history' ? 'text-emerald-700 border-emerald-600 bg-emerald-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'}`}>
            {capturedText} ({history.length})
        </button>
        <button type="button" onClick={() => onTabChange('mock')} className={`flex-1 py-2 text-center transition-colors border-b-2 tabular-nums whitespace-nowrap ${activeTab === 'mock' ? 'text-emerald-700 border-emerald-600 bg-emerald-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'}`}>
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
            onExport={onExportMocks}
          />
        ) : activeTab === 'history' ? (
          <div className="flex flex-col min-h-full">
             <div className="p-2 bg-slate-50 flex flex-col space-y-2 sticky top-0 z-10 border-b border-slate-200">
                 <div className="flex items-center justify-between gap-1.5">
                    <button type="button" onClick={onToggleRecording} className={`flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${isRecording ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
                        {isRecording ? recordText : pausedText}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCurrentTabOnly(v => !v)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap ${currentTabOnly ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                      >
                        {currentTabOnlyText}
                      </button>
                      {onChangeExcludeDomains && (
                        <button
                          type="button"
                          onClick={() => setShowExcludeInput(v => !v)}
                          title={excludeDomainsText}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap ${excludeDomains.length > 0 || showExcludeInput ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                        >
                          {excludeDomainsText}
                          {excludeDomains.length > 0 ? ` (${excludeDomains.length})` : ''}
                        </button>
                      )}
                      {history.length > 0 && (
                        <button type="button" onClick={() => { setSelectedLogIds([]); onClearHistory(); }} className="text-[11px] text-slate-400 hover:text-red-500 font-semibold transition-colors whitespace-nowrap">{clearText}</button>
                      )}
                    </div>
                 </div>

                 {showExcludeInput && onChangeExcludeDomains && (
                   <div className="flex items-center gap-1 bg-white p-1.5 rounded border border-slate-200">
                     <input
                       type="text"
                       value={excludeDraft}
                       onChange={(e) => setExcludeDraft(e.target.value)}
                       onBlur={() => onChangeExcludeDomains(excludeDraft.split(',').map(s => s.trim()).filter(Boolean))}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') {
                           onChangeExcludeDomains(excludeDraft.split(',').map(s => s.trim()).filter(Boolean));
                           setShowExcludeInput(false);
                         }
                       }}
                       placeholder={excludeDomainsPh}
                       className="flex-1 min-w-0 text-[11px] font-mono px-1.5 py-0.5 focus:outline-none"
                     />
                   </div>
                 )}

                 <div className="relative">
                    <input
                        type="text"
                        placeholder={filterCapturedRequestsText}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setFilterText(''); }}
                        className="w-full text-xs pl-7 pr-7 py-1 bg-white border border-slate-200 rounded focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                    {filterText && (
                        <button
                            type="button"
                            onClick={() => setFilterText('')}
                            aria-label={clearText}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2}/></svg>
                        </button>
                    )}
                 </div>

                 {selectedLogs.length > 0 && (
                   <div className="flex items-center justify-between gap-1.5 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-[11px]">
                     <span className="font-semibold text-emerald-800 tabular-nums">
                       {chrome.i18n.getMessage("selectedCountLabel", [String(selectedLogs.length)]) || `${selectedLogs.length} selected`}
                     </span>
                     <div className="flex items-center gap-1.5">
                       {selectedLogs.length === 2 && onCompareLogs && (
                         <button
                           type="button"
                           onClick={() => { onCompareLogs(selectedLogs[0], selectedLogs[1]); setSelectedLogIds([]); }}
                           className="px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 whitespace-nowrap"
                         >
                           {compareText}
                         </button>
                       )}
                       {onSaveLogsAsCollection && (
                         <button
                           type="button"
                           onClick={() => { onSaveLogsAsCollection(selectedLogs); setSelectedLogIds([]); }}
                           className="px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-700 font-semibold hover:bg-emerald-100 whitespace-nowrap"
                         >
                           {saveSelectedText}
                         </button>
                       )}
                       <button
                         type="button"
                         onClick={() => setSelectedLogIds([])}
                         aria-label={clearText}
                         className="text-slate-500 hover:text-slate-700 px-1"
                       >
                         ×
                       </button>
                     </div>
                   </div>
                 )}
             </div>
             {history.length === 0 ? (
                 <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                     <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                     </svg>
                     <div className="text-xs font-medium text-slate-600 mb-1">{noRequestsFoundText}</div>
                     <div className="text-[11px] text-slate-400 leading-relaxed mb-3">{capturedEmptyHintText}</div>
                     {!isRecording && onToggleRecording && (
                       <button
                         type="button"
                         onClick={onToggleRecording}
                         className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                       >
                         {startRecordingText}
                       </button>
                     )}
                 </div>
             ) : (
               <div className="space-y-0.5">
                 {filteredHistory.map(item => {
                     const { origin, path } = formatUrl(item.url);
                     const isActive = activeCapturedId === item.id;
                     const isChecked = selectedLogIds.includes(item.id);
                     return (
                       <ListItem
                         key={item.id}
                         isActive={isActive}
                         metaLeading={
                           <input
                             type="checkbox"
                             checked={isChecked}
                             aria-label={chrome.i18n.getMessage("selectItemLabel", [item.url]) || `Select ${item.url}`}
                             onClick={(e) => e.stopPropagation()}
                             onChange={() => toggleSelectLog(item.id)}
                             className="h-3 w-3 rounded accent-emerald-600 cursor-pointer flex-shrink-0"
                           />
                         }
                         method={item.method}
                         methodColorClass={getMethodColor(item.method)}
                         metaExtras={
                           <>
                             {item.graphqlOperationName && (
                               <span className="text-[9px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-1 rounded truncate max-w-[70px]" title={item.graphqlOperationName}>
                                 {item.graphqlOperationName}
                               </span>
                             )}
                             {typeof item.duration === 'number' && (
                               <span className="text-[10px] text-slate-400 font-mono tabular-nums">{item.duration}ms</span>
                             )}
                             <span className="text-[10px] text-slate-400 font-mono tabular-nums">{formatTime(item.timestamp)}</span>
                             <span className={`text-[10px] px-1 rounded font-bold font-mono tabular-nums ${item.status >= 400 ? 'text-red-600 bg-red-50' : item.status > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>{item.status || '...'}</span>
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
                             type="button"
                             onClick={(e) => { e.stopPropagation(); onDeleteLog(item.id); }}
                             className="p-0.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                             title={deleteLogText}
                             aria-label={deleteLogText}
                           >
                             <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                           </button>
                         }
                       />
                     );
                 })}
                 {filteredHistory.length === 0 && history.length > 0 && (
                     <div className="p-4 text-center text-xs text-slate-400">{noMatchingRequestsText}</div>
                 )}
               </div>
             )}
          </div>
        ) : (
          <div className="flex flex-col min-h-full">
            {!hasAnySavedItems ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <div className="text-xs font-medium text-slate-600 mb-1">{collectionsEmptyText}</div>
                <div className="text-[11px] text-slate-400 leading-relaxed mb-4">{collectionsEmptyHintText}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCreateRequest}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                  >
                    {newRequestText}
                  </button>
                  <button
                    type="button"
                    onClick={onImportCurl}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {importCurlText}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-2 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <div className="relative">
                    <input
                      type="text"
                      value={colFilterText}
                      onChange={(e) => setColFilterText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') setColFilterText(''); }}
                      placeholder={filterCollectionsText}
                      className="w-full text-xs pl-7 pr-6 py-1 bg-white border border-slate-200 rounded focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                    {colFilterText && (
                      <button
                        type="button"
                        onClick={() => setColFilterText('')}
                        aria-label={clearText}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {visibleRootRequests.length > 0 && (
                  <div
                      className={`flex flex-col p-2 min-h-[40px] transition-colors ${isDragOverRootZone ? 'bg-emerald-100/50 outline-dashed outline-2 outline-emerald-400 rounded-md m-1' : ''}`}
                      onDragOver={(e) => handleDragOver(e, null)}
                      onDrop={(e) => handleDrop(e, null)}
                      onDragLeave={handleDragLeave}
                  >
                      <div className="space-y-0.5">
                          {visibleRootRequests.map(renderRequestItem)}
                      </div>
                  </div>
                )}

                <div
                  className="flex flex-col p-2 space-y-1 flex-1"
                  onDragOver={(e) => handleDragOver(e, null)}
                  onDrop={(e) => handleDrop(e, null)}
                >
                    {visibleCollections.map(col => renderCollectionNode(col, 0))}
                    {colFilterText && visibleCollections.length === 0 && visibleRootRequests.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-400">{noMatchingRequestsText}</div>
                    )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {contextMenu && (
          <div
            className="fixed bg-white border border-slate-200 shadow-xl rounded-lg py-1.5 z-[100] w-52 animate-fadeIn border-t-2 border-t-emerald-600"
            style={clampPosition(contextMenu.x, contextMenu.y, 208, 170)}
          >
              {contextMenu.type === 'log' && (
                  <>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center" onClick={() => { onMoveRequest(contextMenu.id, null); setContextMenu(null); }}><svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth={2}/></svg>{saveText}</button>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-emerald-700 hover:bg-emerald-50 flex items-center font-medium" onClick={() => { onMockFromLog(contextMenu.data); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        {chrome.i18n.getMessage("mockThis") || 'Mock this response'}
                      </button>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center" onClick={() => { copyToClipboard(generateCurl(contextMenu.data)); setContextMenu(null); }}><svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" strokeWidth={2}/></svg>{copyCurlText}</button>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center" onClick={() => { onDeleteLog(contextMenu.id); setContextMenu(null); }}><svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>{deleteText}</button>
                  </>
              )}
              {contextMenu.type === 'request' && (
                  <>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center" onClick={() => { copyToClipboard(generateCurlFromRequest(contextMenu.data)); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" strokeWidth={2}/></svg>
                        {copyCurlText}
                      </button>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center" onClick={() => { setReqRenameTicks(prev => ({ ...prev, [contextMenu.id]: (prev[contextMenu.id] || 0) + 1 })); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth={2}/></svg>
                        {renameText}
                      </button>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center" onClick={() => { onDuplicateRequest(contextMenu.id); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" strokeWidth={2}/></svg>
                        {duplicateText}
                      </button>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center" onClick={() => { onDeleteRequest(contextMenu.data); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                        {deleteText}
                      </button>
                  </>
              )}
              {contextMenu.type === 'collection' && (
                  <>
                      {onCreateSubfolder && (
                        <button type="button" className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center" onClick={() => { onCreateSubfolder(contextMenu.id); setContextMenu(null); }}>
                          <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeWidth={2}/></svg>
                          {newSubfolderText}
                        </button>
                      )}
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center" onClick={() => { setEditingId(contextMenu.id); setEditingType('collection'); setEditName(contextMenu.data.name); setContextMenu(null); }}>
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth={2}/></svg>
                        {renameText}
                      </button>
                      <button type="button" className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center" onClick={() => { onDeleteCollection(contextMenu.id); setContextMenu(null); }}>
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
