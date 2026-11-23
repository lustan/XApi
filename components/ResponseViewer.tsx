import React, { useEffect, useMemo, useState } from 'react';
import { HttpResponse } from '../types';
import { formatBytes } from '../utils';
import { JsonTree } from './JsonTree';

interface ResponseViewerProps {
  response: HttpResponse | null;
  error?: string | null;
  isLoading?: boolean;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({ response, error, isLoading = false }) => {
  const [activeTab, setActiveTab] = useState<'body' | 'headers'>('body');

  const bodyText = chrome.i18n.getMessage("responseBody");
  const headersText = chrome.i18n.getMessage("responseHeaders");
  const requestFailedText = chrome.i18n.getMessage("requestFailed");
  const sendRequestText = chrome.i18n.getMessage("sendRequestToSeeResponse");
  const sendingRequestText = chrome.i18n.getMessage("sendingRequest") || 'Sending request...';

  const getStatusColor = (status: number) => {
      if (status >= 200 && status < 300) return 'text-emerald-600';
      if (status >= 400) return 'text-red-600';
      return 'text-amber-600';
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

  const headerEntries = response ? Object.entries(response.headers) : [];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header: Tabs + Status */}
      <div className="flex justify-between items-center border-b border-slate-200 px-2 mt-1 min-h-[37px]">
          <div className="flex">
            <button
              type="button"
              onClick={() => setActiveTab('body')}
              className={`px-4 py-2 text-xs font-semibold tracking-wide border-b-2 transition-colors mb-[-1px] ${
                activeTab === 'body' 
                  ? 'border-emerald-600 text-emerald-700' 
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {bodyText}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('headers')}
              className={`px-4 py-2 text-xs font-semibold tracking-wide border-b-2 transition-colors mb-[-1px] flex items-center gap-1 ${
                activeTab === 'headers' 
                  ? 'border-emerald-600 text-emerald-700' 
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <span>{headersText}</span>
              {response && headerEntries.length > 0 && (
                <span className="text-[11px] font-mono tabular-nums text-emerald-600">({headerEntries.length})</span>
              )}
            </button>
          </div>

          {response && (
             <div className="flex items-center text-xs gap-3 pb-1 mr-2 select-text tabular-nums">
                <div className={`flex items-center font-bold font-mono ${getStatusColor(response.status)}`}>
                    {getStatusIcon(response.status)}
                    <span>{response.status} {response.statusText}</span>
                </div>
                
                <span className="text-slate-300" aria-hidden="true">|</span>
                
                <div className="text-slate-600 flex items-center font-mono">
                    <span className="font-semibold mr-1">{response.time}</span>ms
                </div>

                <span className="text-slate-300" aria-hidden="true">|</span>

                <div className="text-slate-600 flex items-center font-mono">
                    <span className="font-semibold">{formatBytes(response.size)}</span>
                </div>
             </div>
          )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-white relative">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2.5">
            <svg className="w-6 h-6 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-xs font-medium">{sendingRequestText}</span>
          </div>
        )}

        {!isLoading && error && (
            <div className="flex items-center justify-center h-full p-4">
                <div className="text-center max-w-md rounded-lg border border-red-200 bg-red-50/70 px-6 py-5 text-red-700">
                    <div className="text-sm font-bold mb-1">{requestFailedText}</div>
                    <p className="text-xs font-mono break-all">{error}</p>
                </div>
            </div>
        )}
        
        {!isLoading && !response && !error && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs gap-2">
                <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{sendRequestText}</span>
            </div>
        )}

        {!isLoading && response && !error && activeTab === 'body' && (
             <ResponseContent body={response.body} size={response.size} />
        )}
        
        {!isLoading && response && !error && activeTab === 'headers' && (
          <div className="divide-y divide-slate-100">
            {headerEntries.map(([key, val]) => (
              <div key={key} className="grid grid-cols-[150px_1fr] gap-3 text-xs py-2 hover:bg-slate-50 px-1">
                <div className="font-semibold text-slate-700 truncate select-text" title={key}>{key}</div>
                <div className="text-slate-600 break-all select-text font-mono">{val}</div>
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

type BodyViewMode = 'auto' | 'preview' | 'raw' | 'formatted' | 'tree';

const getMessage = (key: string, fallback: string) => chrome.i18n.getMessage(key) || fallback;

const isJsonCandidate = (body: string) => {
    const firstChar = body.trimStart()[0];
    return firstChar === '{' || firstChar === '[';
};

const ResponseContent = ({ body, size }: { body: string; size: number }) => {
    const canAttemptJsonFormat = isJsonCandidate(body);
    const canAutoFormat = canAttemptJsonFormat && body.length <= AUTO_FORMAT_LIMIT;
    const isLarge = body.length > PREVIEW_LIMIT;
    const defaultMode: BodyViewMode = canAutoFormat ? 'tree' : 'auto';

    const [viewMode, setViewMode] = useState<BodyViewMode>(defaultMode);
    const [manualFormatted, setManualFormatted] = useState<string | null>(null);
    const [isFormatting, setIsFormatting] = useState(false);
    const [formatError, setFormatError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setViewMode(defaultMode);
        setManualFormatted(null);
        setIsFormatting(false);
        setFormatError(null);
        setCopied(false);
    }, [body, defaultMode]);

    const largeResponseText = getMessage('largeResponsePreview', 'Large response preview');
    const showingPreviewText = getMessage('showingPreview', 'Showing a preview to keep the browser responsive.');
    const showPreviewText = getMessage('showPreview', 'Show Preview');
    const showFullRawText = getMessage('showFullRaw', 'Show Full Raw');
    const copyResponseText = getMessage('copyResponse', 'Copy Response');
    const copiedText = getMessage('copied', 'Copied');
    const formattingText = getMessage('formatting', 'Formatting...');
    const formatJsonText = getMessage('formatJSON', 'Format JSON');
    const invalidJsonText = getMessage('invalidJSON', 'Invalid JSON');
    const treeViewText = getMessage('jsonTreeView', 'Tree');
    const rawViewText = getMessage('jsonRawView', 'Raw');

    const shouldShowBodyTools = isLarge || canAttemptJsonFormat || body.length > 0;

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
        let ok = false;
        try {
            await navigator.clipboard.writeText(body);
            ok = true;
        } catch {
            try {
                const textArea = document.createElement('textarea');
                textArea.value = body;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                textArea.style.top = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                ok = document.execCommand('copy');
                document.body.removeChild(textArea);
            } catch {
                ok = false;
            }
        }
        if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } else {
            setFormatError(getMessage('copyFailed', 'Copy failed'));
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            {shouldShowBodyTools && (
                <div className="mb-2.5 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-xs">
                    {isLarge && (
                        <div className="mr-auto text-slate-500">
                            <span className="font-medium text-slate-700">{largeResponseText}</span>
                            <span className="ml-2">{showingPreviewText}</span>
                            <span className="ml-2 font-mono tabular-nums">{formatBytes(size)}</span>
                        </div>
                    )}

                    {isLarge && (
                        <button
                            type="button"
                            onClick={() => setViewMode('preview')}
                            className="rounded border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50"
                        >
                            {showPreviewText}
                        </button>
                    )}

                    {isLarge && (
                        <button
                            type="button"
                            onClick={() => setViewMode('raw')}
                            className="rounded border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50"
                        >
                            {showFullRawText}
                        </button>
                    )}

                    {canAttemptJsonFormat && (
                        <div className="inline-flex rounded border border-slate-200 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setViewMode('tree')}
                                className={`px-2.5 py-1 ${viewMode === 'tree' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                {treeViewText}
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode(canAutoFormat ? 'formatted' : (isLarge ? 'preview' : 'auto'))}
                                className={`px-2.5 py-1 border-l border-slate-200 ${viewMode !== 'tree' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                {rawViewText}
                            </button>
                        </div>
                    )}

                    {canAttemptJsonFormat && viewMode !== 'tree' && (
                        <button
                            type="button"
                            onClick={handleFormatJson}
                            disabled={isFormatting}
                            className="rounded border border-emerald-200 px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isFormatting ? formattingText : formatJsonText}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleCopyResponse}
                        className={`ml-auto rounded border px-2.5 py-1 transition-colors ${
                            copied
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 font-medium'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        {copied ? copiedText : copyResponseText}
                    </button>
                </div>
            )}

            {formatError && (
                <div className="mb-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                    {formatError}
                </div>
            )}

            {viewMode === 'tree' ? (
                <div className="min-h-0 flex-1 overflow-auto">
                    <JsonTree value={body} className="select-text" />
                </div>
            ) : (
                <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words text-xs font-mono text-slate-800 select-text">
                    {content}
                    {isPreviewing && body.length > previewContent.length ? '\n\n...' : ''}
                </pre>
            )}
        </div>
    );
};
