
import React, { useState } from 'react';
import { HttpResponse } from '../types';
import { formatBytes } from '../utils';

interface ResponseViewerProps {
  response: HttpResponse | null;
  error?: string | null;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({ response, error }) => {
  const [activeTab, setActiveTab] = useState<'body' | 'headers'>('body');

  // 获取国际化文本
  const bodyText = chrome.i18n.getMessage("responseBody");
  const headersText = chrome.i18n.getMessage("responseHeaders");
  const requestFailedText = chrome.i18n.getMessage("requestFailed");
  const sendRequestText = chrome.i18n.getMessage("sendRequestToSeeResponse");

  const getStatusColor = (status: number) => {
      if (status >= 200 && status < 300) return 'text-green-600';
      if (status >= 400) return 'text-red-600';
      return 'text-yellow-600';
  };

  const getStatusIcon = (status: number) => {
      if (status >= 200 && status < 300) return (
          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      );
      if (status >= 400) return (
          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      );
      return (
           <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header: Tabs + Status */}
      <div className="flex justify-between items-center border-b border-gray-200 px-2 mt-1 min-h-[33px]">
          {/* Left: Tabs */}
          <div className="flex">
            <button
              onClick={() => setActiveTab('body')}
              className={`px-4 py-2 text-xs font-bold tracking-wide uppercase border-b-2 transition-colors mb-[-1px] ${
                activeTab === 'body' 
                  ? 'border-green-600 text-green-700' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {bodyText}
            </button>
            <button
              onClick={() => setActiveTab('headers')}
              className={`px-4 py-2 text-xs font-bold tracking-wide uppercase border-b-2 transition-colors mb-[-1px] ${
                activeTab === 'headers' 
                  ? 'border-green-600 text-green-700' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {headersText}
            </button>
          </div>

          {/* Right: Status Metrics */}
          {response && (
             <div className="flex items-center text-xs space-x-3 pb-1 mr-2 select-text">
                <div className={`flex items-center font-bold ${getStatusColor(response.status)}`}>
                    {getStatusIcon(response.status)}
                    <span>{response.status} {response.statusText}</span>
                </div>
                
                <div className="text-gray-300">|</div>
                
                <div className="text-gray-600 flex items-center">
                    <span className="font-medium mr-1">{response.time}</span> ms
                </div>

                <div className="text-gray-300">|</div>

                <div className="text-gray-600 flex items-center">
                    <span className="font-medium mr-1">{formatBytes(response.size)}</span>
                </div>
             </div>
          )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-white relative">
        {error && (
            <div className="flex items-center justify-center h-full text-red-600 p-4">
                <div className="text-center">
                    <div className="text-lg font-bold mb-1">{requestFailedText}</div>
                    <p>{error}</p>
                </div>
            </div>
        )}
        
        {!response && !error && (
            <div className="flex items-center justify-center h-full text-gray-300 text-sm italic">
                {sendRequestText}
            </div>
        )}

        {response && !error && activeTab === 'body' && (
             <ResponseContent body={response.body} />
        )}
        
        {response && !error && activeTab === 'headers' && (
          <div className="space-y-0.5">
            {Object.entries(response.headers).map(([key, val]) => (
              <div key={key} className="grid grid-cols-[120px_1fr] gap-2 text-xs py-1 border-b border-gray-50 hover:bg-gray-50">
                <div className="font-semibold text-gray-700 truncate select-text" title={key}>{key}</div>
                <div className="text-gray-600 break-all select-text font-mono">{val}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ResponseContent = ({ body }: { body: string }) => {
    let content = body;
    try {
        const json = JSON.parse(body);
        content = JSON.stringify(json, null, 2);
    } catch {}

    return (
        <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap overflow-x-auto h-full select-text">
            {content}
        </pre>
    );
};
