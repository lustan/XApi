
import React, { useEffect, useMemo, useState } from 'react';
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
             <ResponseContent body={response.body} size={response.size} />
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

const AUTO_FORMAT_LIMIT = 200 * 1024;
const PREVIEW_LIMIT = 512 * 1024;
const PREVIEW_CHARS = 256 * 1024;

type BodyViewMode = 'auto' | 'preview' | 'raw' | 'formatted';

const getMessage = (key: string, fallback: string) => chrome.i18n.getMessage(key) || fallback;

const isJsonCandidate = (body: string) => {
    const firstChar = body.trimStart()[0];
    return firstChar === '{' || firstChar === '[';
};

const ResponseContent = ({ body, size }: { body: string; size: number }) => {
    const [viewMode, setViewMode] = useState<BodyViewMode>('auto');
    const [manualFormatted, setManualFormatted] = useState<string | null>(null);
    const [isFormatting, setIsFormatting] = useState(false);
    const [formatError, setFormatError] = useState<string | null>(null);

    useEffect(() => {
        setViewMode('auto');
        setManualFormatted(null);
        setIsFormatting(false);
        setFormatError(null);
    }, [body]);

    const largeResponseText = getMessage('largeResponsePreview', 'Large response preview');
    const showingPreviewText = getMessage('showingPreview', 'Showing a preview to keep the browser responsive.');
    const showPreviewText = getMessage('showPreview', 'Show Preview');
    const showFullRawText = getMessage('showFullRaw', 'Show Full Raw');
    const copyResponseText = getMessage('copyResponse', 'Copy Response');
    const formattingText = getMessage('formatting', 'Formatting...');
    const formatJsonText = getMessage('formatJSON', 'Format JSON');
    const invalidJsonText = getMessage('invalidJSON', 'Invalid JSON');

    const canAttemptJsonFormat = isJsonCandidate(body);
    const canAutoFormat = canAttemptJsonFormat && body.length <= AUTO_FORMAT_LIMIT;
    const isLarge = body.length > PREVIEW_LIMIT;
    const shouldShowBodyTools = isLarge || (canAttemptJsonFormat && !canAutoFormat);

    const autoFormatted = useMemo(() => {
        if (!canAutoFormat) return null;

        try {
            return JSON.stringify(JSON.parse(body), null, 2);
        } catch {
            return null;
        }
    }, [body, canAutoFormat]);

    const previewContent = useMemo(() => {
        if (!isLarge) return body;
        return body.slice(0, PREVIEW_CHARS);
    }, [body, isLarge]);

    const content = useMemo(() => {
        if (viewMode === 'formatted' && manualFormatted !== null) return manualFormatted;
        if (viewMode === 'raw') return body;
        if (viewMode === 'preview') return previewContent;
        if (isLarge) return previewContent;
        return autoFormatted ?? body;
    }, [autoFormatted, body, isLarge, manualFormatted, previewContent, viewMode]);

    const isPreviewing = (viewMode === 'auto' && isLarge) || viewMode === 'preview';

    const handleFormatJson = () => {
        setIsFormatting(true);
        setFormatError(null);

        window.setTimeout(() => {
            try {
                setManualFormatted(JSON.stringify(JSON.parse(body), null, 2));
                setViewMode('formatted');
            } catch {
                setFormatError(invalidJsonText);
            } finally {
                setIsFormatting(false);
            }
        }, 0);
    };

    const handleCopyResponse = async () => {
        try {
            await navigator.clipboard.writeText(body);
        } catch {
            setFormatError(getMessage('copyFailed', 'Copy failed'));
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            {shouldShowBodyTools && (
                <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2 text-xs">
                    {isLarge && (
                        <div className="mr-auto text-gray-500">
                            <span className="font-medium text-gray-700">{largeResponseText}</span>
                            <span className="ml-2">{showingPreviewText}</span>
                            <span className="ml-2">{formatBytes(size)}</span>
                        </div>
                    )}

                    {isLarge && (
                        <button
                            type="button"
                            onClick={() => setViewMode('preview')}
                            className="rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                        >
                            {showPreviewText}
                        </button>
                    )}

                    {isLarge && (
                        <button
                            type="button"
                            onClick={() => setViewMode('raw')}
                            className="rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                        >
                            {showFullRawText}
                        </button>
                    )}

                    {canAttemptJsonFormat && (
                        <button
                            type="button"
                            onClick={handleFormatJson}
                            disabled={isFormatting}
                            className="rounded border border-emerald-200 px-2 py-1 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isFormatting ? formattingText : formatJsonText}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleCopyResponse}
                        className="rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                    >
                        {copyResponseText}
                    </button>
                </div>
            )}

            {formatError && (
                <div className="mb-2 rounded border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-600">
                    {formatError}
                </div>
            )}

            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words text-xs font-mono text-gray-800 select-text">
                {content}
                {isPreviewing && body.length > previewContent.length ? '\n\n...' : ''}
            </pre>
        </div>
    );
};
