
import './chromePolyfill';
import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { applyLanguage, LANGUAGE_STORAGE_KEY } from './i18n';
import type { AppLanguage } from './i18n';
import { LoggedRequest, MockRule, GlobalHeader } from './types';
import { formatUrl, formatTime, getMethodBadgeColor, generateId } from './utils';
import {
  MOCK_RULES_KEY,
  MOCK_GLOBAL_ENABLED_KEY,
  GLOBAL_HEADERS_KEY,
  GLOBAL_HEADERS_ENABLED_KEY,
} from './mockUtils';
import { APP_CONFIG } from './config';
import { Logo } from './components/Logo';

type PopupTab = 'capture' | 'mock' | 'header';

const POPUP_ACTIVE_TAB_KEY = 'popupActiveTab';

const Popup = () => {
  const [activeTab, setActiveTab] = useState<PopupTab>('capture');
  const [isRecording, setIsRecording] = useState(false);
  const [mockGlobalEnabled, setMockGlobalEnabled] = useState(false);
  const [logs, setLogs] = useState<LoggedRequest[]>([]);
  const [mockRules, setMockRules] = useState<MockRule[]>([]);
  const [globalHeaders, setGlobalHeaders] = useState<GlobalHeader[]>([]);
  const [globalHeadersEnabled, setGlobalHeadersEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [languageVersion, setLanguageVersion] = useState(0);
  const [language, setLanguage] = useState<AppLanguage>('system');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // 获取国际化文本
  const startRecordingText = chrome.i18n.getMessage("startRecording");
  const stopRecordingText = chrome.i18n.getMessage("stopRecording");
  const noRequestsFoundText = chrome.i18n.getMessage("noRequestsFound");
  const recordingText = chrome.i18n.getMessage("recording");
  const filterRequestsText = chrome.i18n.getMessage("filterRequests");
  const clearText = chrome.i18n.getMessage("clear");
  const openDashboardText = chrome.i18n.getMessage("openDashboard");
  const pendingText = chrome.i18n.getMessage("pending");
  const captureTabText = chrome.i18n.getMessage("captureTab") || 'Capture';
  const mockTabText = chrome.i18n.getMessage("mockTab") || 'Mock';
  const headerTabText = chrome.i18n.getMessage("headerTab") || 'Header';
  const settingsText = chrome.i18n.getMessage("settings") || 'Settings';
  const githubRepositoryText = chrome.i18n.getMessage("githubRepository") || 'GitHub Repository';
  const sendFeedbackText = chrome.i18n.getMessage("sendFeedback") || 'Send Feedback';
  const languageText = chrome.i18n.getMessage("language") || 'Language';
  const systemLanguageText = chrome.i18n.getMessage("systemLanguage") || 'System';
  const englishText = chrome.i18n.getMessage("english") || 'English';
  const chineseText = chrome.i18n.getMessage("chineseSimplified") || '简体中文';
  const activatingText = chrome.i18n.getMessage("mockGlobalActive") || 'Activating';
  const pausedText = chrome.i18n.getMessage("paused") || 'Paused';
  const resetWorkspaceText = chrome.i18n.getMessage("resetWorkspace") || 'Reset Workspace';

  useEffect(() => {
    // Load initial state
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        ['isRecording', 'logs', MOCK_GLOBAL_ENABLED_KEY, MOCK_RULES_KEY, GLOBAL_HEADERS_KEY, GLOBAL_HEADERS_ENABLED_KEY, POPUP_ACTIVE_TAB_KEY, LANGUAGE_STORAGE_KEY],
        (result) => {
          const storedLanguage = result[LANGUAGE_STORAGE_KEY];
          if (storedLanguage === 'en' || storedLanguage === 'zh_CN') {
            applyLanguage(storedLanguage);
            setLanguage(storedLanguage);
            setLanguageVersion(v => v + 1);
          }
          const savedTab = result[POPUP_ACTIVE_TAB_KEY];
          if (savedTab === 'capture' || savedTab === 'mock' || savedTab === 'header') {
            setActiveTab(savedTab);
          }
          setIsRecording(!!result.isRecording);
          setMockGlobalEnabled(result[MOCK_GLOBAL_ENABLED_KEY] === true);
          setLogs(result.logs || []);
          setMockRules(result[MOCK_RULES_KEY] || []);
          setGlobalHeaders(result[GLOBAL_HEADERS_KEY] || []);
          setGlobalHeadersEnabled(result[GLOBAL_HEADERS_ENABLED_KEY] === true);
        });

      const listener = (changes: any) => {
         if (changes.logs) {
           setLogs(changes.logs.newValue || []);
         }
         if (changes.isRecording) {
            setIsRecording(changes.isRecording.newValue);
         }
         if (changes[MOCK_GLOBAL_ENABLED_KEY]) {
            setMockGlobalEnabled(changes[MOCK_GLOBAL_ENABLED_KEY].newValue === true);
         }
         if (changes[MOCK_RULES_KEY]) {
            setMockRules(changes[MOCK_RULES_KEY].newValue || []);
         }
         if (changes[GLOBAL_HEADERS_KEY]) {
            setGlobalHeaders(changes[GLOBAL_HEADERS_KEY].newValue || []);
         }
         if (changes[GLOBAL_HEADERS_ENABLED_KEY]) {
            setGlobalHeadersEnabled(changes[GLOBAL_HEADERS_ENABLED_KEY].newValue === true);
         }
         if (changes[LANGUAGE_STORAGE_KEY]) {
            const nextLanguage = changes[LANGUAGE_STORAGE_KEY].newValue;
            const normalized = nextLanguage === 'en' || nextLanguage === 'zh_CN' ? nextLanguage : 'system';
            applyLanguage(normalized);
            setLanguage(normalized);
            setLanguageVersion(v => v + 1);
         }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  const toggleRecording = () => {
    const newState = !isRecording;
    setIsRecording(newState);
    chrome.storage.local.set({ isRecording: newState });
  };

  // Close settings dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (next: AppLanguage) => {
    applyLanguage(next);
    setLanguage(next);
    setLanguageVersion(v => v + 1);
    chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: next });
  };

  const handleResetAllData = () => {
    if (confirm(chrome.i18n.getMessage("clearAllDataConfirm") || 'Reset all data?')) {
      chrome.storage.local.clear(() => {
        window.location.reload();
      });
    }
  };

  const selectTab = (tab: PopupTab) => {
    setActiveTab(tab);
    chrome.storage.local.set({ [POPUP_ACTIVE_TAB_KEY]: tab });
  };

  const toggleMockGlobal = () => {
    const newState = !mockGlobalEnabled;
    setMockGlobalEnabled(newState);
    chrome.storage.local.set({ [MOCK_GLOBAL_ENABLED_KEY]: newState });
  };

  const clearLogs = () => {
      chrome.storage.local.set({ logs: [] });
  };

  const openDashboard = (logId?: string) => {
    const url = logId ? `panel.html?logId=${logId}` : 'panel.html';
    if (chrome.tabs) {
      chrome.tabs.create({ url });
    }
  };

  const openDashboardMock = (mockId: string) => {
    if (chrome.tabs) {
      chrome.tabs.create({ url: `panel.html?mockId=${mockId}` });
    }
  };

  // --- Mock rule helpers ---
  const persistMockRules = (next: MockRule[]) => {
    setMockRules(next);
    chrome.storage.local.set({ [MOCK_RULES_KEY]: next });
  };
  const toggleMockRule = (id: string) => {
    persistMockRules(mockRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  // --- Global header helpers ---
  const persistHeaders = (next: GlobalHeader[]) => {
    setGlobalHeaders(next);
    chrome.storage.local.set({ [GLOBAL_HEADERS_KEY]: next });
  };
  const toggleHeadersEnabled = () => {
    const newState = !globalHeadersEnabled;
    setGlobalHeadersEnabled(newState);
    chrome.storage.local.set({ [GLOBAL_HEADERS_ENABLED_KEY]: newState });
  };
  const addHeader = () => {
    persistHeaders([...globalHeaders, { id: generateId(), key: '', value: '', enabled: true }]);
  };
  const updateHeader = (id: string, patch: Partial<GlobalHeader>) => {
    persistHeaders(globalHeaders.map(h => h.id === id ? { ...h, ...patch } : h));
  };
  const removeHeader = (id: string) => {
    persistHeaders(globalHeaders.filter(h => h.id !== id));
  };

  // Filter logs to ensure valid data display
  const validLogs = logs.filter(log => {
      if (!log || !log.url || log.url.startsWith('chrome-extension')) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return log.url.toLowerCase().includes(term) || log.method.toLowerCase().includes(term);
  });

  const Toggle = ({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title?: string }) => (
    <button
      onClick={onClick}
      title={title}
      className={`relative inline-flex h-5 w-16 items-center rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-gray-600'}`}
    >
      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${on ? 'translate-x-12' : 'translate-x-1'}`} />
      <span className={`absolute text-[9px] font-bold uppercase tracking-wide text-white pointer-events-none ${on ? 'left-1.5' : 'right-1.5'}`}>
        {label}
      </span>
    </button>
  );

  const tabButtonClass = (tab: PopupTab) =>
    `flex-1 text-xs font-medium py-2 transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-green-500 text-green-600 bg-white'
        : 'border-transparent text-gray-500 hover:text-gray-700 bg-gray-50'
    }`;

  return (
    <div key={languageVersion} className="w-80 bg-white flex flex-col h-[500px]">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-900 text-white flex justify-between items-center shadow-md flex-shrink-0">
         <Logo size={18} textColor="text-white" />
         <div className="relative" ref={settingsRef}>
            <button
               onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(!isSettingsOpen); }}
               className={`p-1 rounded transition-colors ${isSettingsOpen ? 'bg-white/20 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
               title={settingsText}
            >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth={2}/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth={2}/></svg>
            </button>
            {isSettingsOpen && (
               <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 shadow-xl rounded-md z-[110] py-1 animate-fadeIn overflow-hidden text-gray-700">
                  <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/50">
                     <span className="text-[10px] font-bold text-gray-400 uppercase">Version {APP_CONFIG.VERSION}</span>
                  </div>
                  <a href={APP_CONFIG.GITHUB_URL} target="_blank" rel="noopener noreferrer" className="flex items-center w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-green-50 transition-colors">
                     <svg className="w-3.5 h-3.5 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>
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
                        onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-green-500"
                     >
                        <option value="system">{systemLanguageText}</option>
                        <option value="en">{englishText}</option>
                        <option value="zh_CN">{chineseText}</option>
                     </select>
                  </div>
                  <div className="h-px bg-gray-100 my-1"></div>
                  <button
                     onClick={(e) => { e.stopPropagation(); handleResetAllData(); setIsSettingsOpen(false); }}
                     className="flex items-center w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                  >
                     <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                     {resetWorkspaceText}
                  </button>
               </div>
            )}
         </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
         <button className={tabButtonClass('capture')} onClick={() => selectTab('capture')}>
            <span className="inline-flex items-center justify-center gap-1.5">
               {captureTabText}
               <span className={`h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse ${isRecording ? '' : 'invisible'}`} title={recordingText} />
            </span>
         </button>
         <button className={tabButtonClass('mock')} onClick={() => selectTab('mock')}>
            <span className="inline-flex items-center justify-center gap-1.5">
               {mockTabText}
               <span className={`h-1.5 w-1.5 rounded-full bg-green-500 ${mockGlobalEnabled ? '' : 'invisible'}`} />
            </span>
         </button>
         <button className={tabButtonClass('header')} onClick={() => selectTab('header')}>
            <span className="inline-flex items-center justify-center gap-1.5">
               {headerTabText}
               <span className={`h-1.5 w-1.5 rounded-full bg-green-500 ${globalHeadersEnabled ? '' : 'invisible'}`} />
            </span>
         </button>
      </div>

      {/* ===================== CAPTURE TAB ===================== */}
      {activeTab === 'capture' && (
        <>
          <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
             <span className="text-xs text-gray-600">{isRecording ? activatingText : pausedText}</span>
             <Toggle on={isRecording} onClick={toggleRecording} label={captureTabText} title={isRecording ? stopRecordingText : startRecordingText} />
          </div>
          <div className="px-2 py-2 bg-gray-100 border-b border-gray-200 flex-shrink-0">
             <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={filterRequestsText}
                className="w-full text-xs px-2 py-1.5 bg-white border border-gray-300 rounded focus:outline-none focus:border-green-500"
             />
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-100">
            {validLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2 bg-gray-50">
                    <span className="text-2xl">📡</span>
                    <span className="text-xs">{noRequestsFoundText}</span>
                    {isRecording && !searchTerm && <span className="text-[10px] text-green-600 animate-pulse">{recordingText}</span>}
                </div>
            ) : (
                <ul className="flex flex-col gap-px">
                    {validLogs.map(log => {
                        const { origin, path } = formatUrl(log.url);
                        return (
                        <li
                            key={log.id}
                            onClick={() => openDashboard(log.id)}
                            className="px-4 py-2 cursor-pointer transition-all border-l-4 border-transparent hover:border-green-500 bg-white hover:bg-gray-100"
                        >
                            <div className="flex items-center justify-between mb-1">
                                 <span className={`text-[10px] font-bold px-1.5 rounded ${getMethodBadgeColor(log.method)}`}>
                                    {log.method}
                                 </span>
                                 <div className="flex items-center space-x-2">
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        {formatTime(log.timestamp)}
                                    </span>
                                    <span className={`text-[10px] ${log.status >= 400 ? 'text-red-500' : 'text-gray-500'}`}>
                                        {log.status > 0 ? log.status : pendingText}
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
            )}
          </div>
          <div className="p-3 bg-white border-t border-gray-200 flex space-x-2 flex-shrink-0">
             <button
                onClick={clearLogs}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium py-2 rounded transition-colors"
             >
                {clearText}
             </button>
             <button
                onClick={() => openDashboard()}
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2 rounded transition-colors flex items-center justify-center"
             >
                {openDashboardText}
             </button>
          </div>
        </>
      )}

      {/* ===================== MOCK TAB ===================== */}
      {activeTab === 'mock' && (
        <>
          <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
             <span className="text-xs text-gray-600">
                {mockGlobalEnabled
                   ? activatingText
                   : pausedText}
             </span>
             <Toggle on={mockGlobalEnabled} onClick={toggleMockGlobal} label={mockTabText} />
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-100">
            {mockRules.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2 bg-gray-50 px-6 text-center">
                    <span className="text-2xl">🧪</span>
                    <span className="text-xs">{chrome.i18n.getMessage("mockListEmpty") || 'No mock rules yet'}</span>
                    <span className="text-[10px] text-gray-400">{chrome.i18n.getMessage("mockListEmptyHint") || ''}</span>
                </div>
            ) : (
                <ul className="flex flex-col gap-px">
                    {mockRules.map(rule => (
                        <li key={rule.id} className="px-3 py-2 bg-white flex items-center justify-between gap-2">
                            <div className="flex flex-col min-w-0 flex-1 cursor-pointer" onClick={() => openDashboardMock(rule.id)}>
                               <div className="flex items-center gap-1.5">
                                  <span className={`text-[9px] font-bold px-1 rounded ${getMethodBadgeColor(rule.method === 'ANY' ? '' : rule.method)}`}>
                                     {rule.method}
                                  </span>
                                  <span className="text-xs font-semibold text-gray-700 truncate">{rule.name}</span>
                               </div>
                               <span className="text-[10px] text-gray-500 truncate font-mono" title={rule.urlPattern}>{rule.urlPattern || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                               {typeof rule.hitCount === 'number' && rule.hitCount > 0 && (
                                  <span className="text-[9px] text-gray-400" title={chrome.i18n.getMessage("mockHits") || 'Hits'}>
                                     {rule.hitCount}
                                  </span>
                               )}
                               <button
                                  onClick={() => toggleMockRule(rule.id)}
                                  title={rule.enabled ? 'On' : 'Off'}
                                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${rule.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                               >
                                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                               </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
          </div>
          <div className="p-3 bg-white border-t border-gray-200 flex-shrink-0">
             <button
                onClick={() => openDashboard()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2 rounded transition-colors"
             >
                {openDashboardText}
             </button>
          </div>
        </>
      )}

      {/* ===================== HEADER TAB ===================== */}
      {activeTab === 'header' && (
        <>
          <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
             <span className="text-xs text-gray-600">
                {globalHeadersEnabled
                   ? activatingText
                   : pausedText}
             </span>
             <Toggle on={globalHeadersEnabled} onClick={toggleHeadersEnabled} label={headerTabText} />
          </div>
          <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-100 flex-shrink-0">
             <span className="text-[10px] text-yellow-700 leading-tight block">
                {chrome.i18n.getMessage("globalHeaderHint") || 'When enabled, every XHR/Fetch request will carry the enabled headers.'}
             </span>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-100">
            {globalHeaders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2 bg-gray-50 px-6 text-center">
                    <span className="text-2xl">🧩</span>
                    <span className="text-xs">{chrome.i18n.getMessage("headerListEmpty") || 'No headers yet'}</span>
                </div>
            ) : (
                <>
                    <ul className="flex flex-col gap-px">
                        {globalHeaders.map(h => (
                            <li key={h.id} className="px-2 py-2 bg-white flex items-center gap-1.5">
                                <input
                                   type="checkbox"
                                   checked={h.enabled}
                                   onChange={(e) => updateHeader(h.id, { enabled: e.target.checked })}
                                   className="h-3.5 w-3.5 flex-shrink-0 appearance-none rounded border border-gray-300 bg-white checked:bg-green-500 checked:border-green-500 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22/%3E%3C/svg%3E')] bg-no-repeat bg-center cursor-pointer"
                                />
                                <input
                                   type="text"
                                   value={h.key}
                                   onChange={(e) => updateHeader(h.id, { key: e.target.value })}
                                   placeholder={chrome.i18n.getMessage("headerKeyPlaceholder") || 'Header'}
                                   className="w-1/2 text-[11px] px-1.5 py-1 bg-white border border-gray-300 rounded focus:outline-none focus:border-green-500 font-mono"
                                />
                                <input
                                   type="text"
                                   value={h.value}
                                   onChange={(e) => updateHeader(h.id, { value: e.target.value })}
                                   placeholder={chrome.i18n.getMessage("headerValuePlaceholder") || 'Value'}
                                   className="flex-1 min-w-0 text-[11px] px-1.5 py-1 bg-white border border-gray-300 rounded focus:outline-none focus:border-green-500 font-mono"
                                />
                                <button
                                   onClick={() => removeHeader(h.id)}
                                   title={chrome.i18n.getMessage("delete") || 'Delete'}
                                   className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0 px-1"
                                >
                                   ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="px-3 py-2">
                        <button
                          onClick={addHeader}
                          className="text-xs font-medium text-gray-500 hover:text-green-600 flex items-center transition-colors"
                        >
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            {chrome.i18n.getMessage("addHeader") || 'Add Header'}
                        </button>
                    </div>
                </>
            )}
          </div>
          <div className="p-3 bg-white border-t border-gray-200 flex-shrink-0">
             <button
                onClick={() => openDashboard()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2 rounded transition-colors flex items-center justify-center"
             >
                {openDashboardText}
             </button>
          </div>
        </>
      )}
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<Popup />);
}
