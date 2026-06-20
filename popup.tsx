
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { applyLanguage, LANGUAGE_STORAGE_KEY } from './i18n';
import { LoggedRequest } from './types';
import { formatUrl, formatTime, getMethodBadgeColor } from './utils';
import { Logo } from './components/Logo';

// Shared with App.tsx and mock-bridge.ts. Default OFF when the value is missing.
const MOCK_GLOBAL_ENABLED_KEY = 'mockGlobalEnabled';

const Popup = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [mockGlobalEnabled, setMockGlobalEnabled] = useState(false);
  const [logs, setLogs] = useState<LoggedRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [languageVersion, setLanguageVersion] = useState(0);

  // 获取国际化文本
  const startRecordingText = chrome.i18n.getMessage("startRecording");
  const stopRecordingText = chrome.i18n.getMessage("stopRecording");
  const noRequestsFoundText = chrome.i18n.getMessage("noRequestsFound");
  const recordingText = chrome.i18n.getMessage("recording");
  const filterRequestsText = chrome.i18n.getMessage("filterRequests");
  const clearText = chrome.i18n.getMessage("clear");
  const openDashboardText = chrome.i18n.getMessage("openDashboard");
  const pendingText = chrome.i18n.getMessage("pending");
  const mockOnText = chrome.i18n.getMessage("mockGlobalOn") || 'MOCK ON';
  const mockOffText = chrome.i18n.getMessage("mockGlobalOff") || 'MOCK OFF';

  useEffect(() => {
    // Load initial state
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['isRecording', 'logs', MOCK_GLOBAL_ENABLED_KEY, LANGUAGE_STORAGE_KEY], (result) => {
        const storedLanguage = result[LANGUAGE_STORAGE_KEY];
        if (storedLanguage === 'en' || storedLanguage === 'zh_CN') {
          applyLanguage(storedLanguage);
          setLanguageVersion(v => v + 1);
        }
        setIsRecording(!!result.isRecording);
        setMockGlobalEnabled(result[MOCK_GLOBAL_ENABLED_KEY] === true);
        setLogs(result.logs || []);
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
         if (changes[LANGUAGE_STORAGE_KEY]) {
            const nextLanguage = changes[LANGUAGE_STORAGE_KEY].newValue;
            applyLanguage(nextLanguage === 'en' || nextLanguage === 'zh_CN' ? nextLanguage : 'system');
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

  // Filter logs to ensure valid data display
  const validLogs = logs.filter(log => {
      if (!log || !log.url || log.url.startsWith('chrome-extension')) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return log.url.toLowerCase().includes(term) || log.method.toLowerCase().includes(term);
  });

  return (
    <div key={languageVersion} className="w-80 bg-white flex flex-col h-[500px]">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-900 text-white flex justify-between items-center shadow-md flex-shrink-0">
         <Logo size={18} textColor="text-white" />
         <div className="flex items-center space-x-2">
             <button
                onClick={toggleMockGlobal}
                className={`relative inline-flex h-5 w-16 items-center rounded-full transition-colors ${mockGlobalEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
                title={mockGlobalEnabled ? mockOnText : mockOffText}
             >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${mockGlobalEnabled ? 'translate-x-12' : 'translate-x-1'}`} />
                <span className={`absolute text-[9px] font-bold uppercase tracking-wide text-white pointer-events-none ${mockGlobalEnabled ? 'left-1.5' : 'right-1.5'}`}>
                   {chrome.i18n.getMessage("mockTab") || 'Mock'}
                </span>
             </button>
             <button
                onClick={toggleRecording}
                className={`relative inline-flex h-5 w-16 items-center rounded-full transition-colors ${isRecording ? 'bg-green-500' : 'bg-gray-600'}`}
                title={isRecording ? stopRecordingText : startRecordingText}
            >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isRecording ? 'translate-x-12' : 'translate-x-1'}`} />
                <span className={`absolute text-[9px] font-bold uppercase tracking-wide text-white pointer-events-none ${isRecording ? 'left-1.5' : 'right-1.5'}`}>
                   {chrome.i18n.getMessage("captureTab") || 'Capture'}
                </span>
            </button>
         </div>
      </div>

      {/* Search Filter */}
      <div className="px-2 py-2 bg-gray-100 border-b border-gray-200 flex-shrink-0">
         <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={filterRequestsText}
            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-300 rounded focus:outline-none focus:border-green-500"
         />
      </div>
      
      {/* List */}
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

      {/* Footer Actions */}
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
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<Popup />);
}
