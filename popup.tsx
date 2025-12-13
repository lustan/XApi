
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { LoggedRequest } from './types';
import { formatUrl, formatTime } from './utils';

const Popup = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState<LoggedRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Load initial state
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['isRecording', 'logs'], (result) => {
        setIsRecording(!!result.isRecording);
        setLogs(result.logs || []);
      });

      const listener = (changes: any) => {
         if (changes.logs) {
           setLogs(changes.logs.newValue || []);
         }
         if (changes.isRecording) {
            setIsRecording(changes.isRecording.newValue);
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
    <div className="w-80 bg-white flex flex-col h-[500px]">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-900 text-white flex justify-between items-center shadow-md flex-shrink-0">
         <h1 className="font-bold text-sm flex items-center">
            <span className="mr-2 text-green-400">⚡</span> HTTP Debugger
         </h1>
         <div className="flex items-center space-x-2">
             <button 
                onClick={toggleRecording}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isRecording ? 'bg-green-500' : 'bg-gray-600'}`}
                title={isRecording ? "Stop Recording" : "Start Recording"}
            >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isRecording ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
         </div>
      </div>

      {/* Search Filter */}
      <div className="px-2 py-2 bg-gray-100 border-b border-gray-200 flex-shrink-0">
         <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter requests..."
            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-300 rounded focus:outline-none focus:border-green-500"
         />
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {validLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
                <span className="text-2xl">📡</span>
                <span className="text-xs">No requests found</span>
                {isRecording && !searchTerm && <span className="text-[10px] text-green-600 animate-pulse">Recording...</span>}
            </div>
        ) : (
            <ul className="divide-y divide-gray-200">
                {validLogs.map(log => {
                    const { origin, path } = formatUrl(log.url);
                    return (
                    <li 
                        key={log.id} 
                        onClick={() => openDashboard(log.id)}
                        className="px-4 py-2 hover:bg-white cursor-pointer transition-colors border-l-4 border-transparent hover:border-green-500 bg-white mb-0.5"
                    >
                        <div className="flex items-center justify-between mb-1">
                             <span className={`text-[10px] font-bold px-1.5 rounded ${
                                log.method === 'GET' ? 'bg-green-100 text-green-700' :
                                log.method === 'POST' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-blue-100 text-blue-700'
                             }`}>{log.method}</span>
                             <div className="flex items-center space-x-2">
                                <span className="text-[10px] text-gray-400 font-mono">
                                    {formatTime(log.timestamp)}
                                </span>
                                <span className={`text-[10px] ${log.status >= 400 ? 'text-red-500' : 'text-gray-500'}`}>
                                    {log.status > 0 ? log.status : 'Pending...'}
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
            Clear
         </button>
         <button 
            onClick={() => openDashboard()}
            className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2 rounded transition-colors flex items-center justify-center"
         >
            Open Dashboard
         </button>
      </div>
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<Popup />);
}
