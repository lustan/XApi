import React, { useState, useRef, useEffect, useMemo } from 'react';
import { HttpRequest, HttpMethod, KeyValue, EnvironmentVariable } from '../types';
import { getMethodColor, queryStringToParams, generateCurlFromRequest } from '../utils';
import { buildVariableMap, interpolateTemplate } from '../envUtils';

interface RequestHeaderProps {
    request: HttpRequest;
    onRequestChange: (req: HttpRequest) => void;
    onSend: () => void;
    isSending: boolean;
    activeEnvVariables?: EnvironmentVariable[];
    onOpenCodeGen?: () => void;
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

export const RequestHeader: React.FC<RequestHeaderProps> = ({
    request,
    onRequestChange,
    onSend,
    isSending,
    activeEnvVariables = [],
    onOpenCodeGen,
}) => {
    const [isMethodOpen, setIsMethodOpen] = useState(false);
    const [copiedCurl, setCopiedCurl] = useState(false);
    const methodRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (methodRef.current && !methodRef.current.contains(event.target as Node)) {
                setIsMethodOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMethodSelect = (m: HttpMethod) => {
        onRequestChange({ ...request, method: m });
        setIsMethodOpen(false);
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUrl = e.target.value;
        const queryIndex = newUrl.indexOf('?');
        const disabledParams = request.params.filter(p => !p.enabled);
        let parsedParams: KeyValue[] = [];

        if (queryIndex !== -1) {
            const queryString = newUrl.substring(queryIndex + 1);
            parsedParams = queryStringToParams(queryString);
        }

        onRequestChange({
            ...request,
            url: newUrl,
            params: [...parsedParams, ...disabledParams]
        });
    };

    const resolvedUrlPreview = useMemo(() => {
        if (!request.url || !request.url.includes('{{')) return null;
        return interpolateTemplate(request.url, buildVariableMap(activeEnvVariables));
    }, [request.url, activeEnvVariables]);

    const handleCopyCurl = async () => {
        const curl = generateCurlFromRequest(request);
        try {
            await navigator.clipboard.writeText(curl);
            setCopiedCurl(true);
            window.setTimeout(() => setCopiedCurl(false), 1500);
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = curl;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                setCopiedCurl(true);
                window.setTimeout(() => setCopiedCurl(false), 1500);
            } catch { /* ignore */ }
        }
    };

    const enterRequestUrlText = chrome.i18n.getMessage("enterRequestUrl");
    const sendText = chrome.i18n.getMessage("send");
    const sendingText = chrome.i18n.getMessage("sending");
    const copiedText = chrome.i18n.getMessage("copied") || 'Copied';
    const copyCurlText = chrome.i18n.getMessage("copyCurlTooltip") || 'Copy as cURL';
    const codeSnippetText = chrome.i18n.getMessage("codeSnippet") || 'Code';
    const resolvedUrlLabelText = chrome.i18n.getMessage("resolvedUrlLabel") || 'Resolved';
    const httpMethodLabelText = chrome.i18n.getMessage("httpMethodLabel") || 'HTTP Method';

    return (
        <div className="border-b border-slate-200 bg-white px-3 py-2.5">
            <div className="flex items-stretch gap-2 w-full">
                <div className="flex flex-1 min-w-0 rounded-md shadow-sm">
                    {/* Custom Method Selector */}
                    <div className="relative" ref={methodRef}>
                        <button
                            type="button"
                            onClick={() => setIsMethodOpen(!isMethodOpen)}
                            aria-label={httpMethodLabelText}
                            aria-expanded={isMethodOpen}
                            className="rounded-l-md border border-r-0 border-slate-300 px-3 py-2 text-xs font-bold bg-slate-50 hover:bg-slate-100 focus:z-10 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-24 text-slate-700 flex items-center justify-between h-full transition-colors"
                        >
                            <span className={getMethodColor(request.method)}>{request.method}</span>
                            <svg className="w-3.5 h-3.5 text-slate-400 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        
                        {isMethodOpen && (
                            <div className="absolute top-full left-0 w-28 bg-white border border-slate-200 shadow-lg rounded-md z-50 py-1 mt-1 animate-fadeIn">
                                {METHODS.map(m => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => handleMethodSelect(m)}
                                        className="w-full px-3 py-2 text-xs font-bold cursor-pointer hover:bg-slate-50 flex items-center justify-between transition-colors"
                                    >
                                        <span className={getMethodColor(m)}>{m}</span>
                                        {request.method === m && (
                                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* URL Input */}
                    <input
                        type="text"
                        value={request.url}
                        onChange={handleUrlChange}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isSending) {
                                e.preventDefault();
                                onSend();
                            }
                        }}
                        placeholder={enterRequestUrlText}
                        aria-label={enterRequestUrlText}
                        className="flex-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 z-0 focus:z-10 font-mono text-slate-800 min-w-0 transition-colors placeholder:text-slate-400"
                    />

                    {/* Send Button */}
                    <button 
                        type="button"
                        onClick={onSend} 
                        disabled={isSending}
                        className={`rounded-r-md px-5 py-2 text-xs font-bold text-white transition-colors flex items-center gap-1.5 flex-shrink-0 border border-transparent whitespace-nowrap ${
                            isSending ? 'bg-emerald-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                        }`}
                    >
                        {isSending && (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                        )}
                        <span>{isSending ? sendingText : sendText}</span>
                    </button>
                </div>

                {/* Quick Copy cURL Button */}
                <button
                    type="button"
                    onClick={handleCopyCurl}
                    title={copyCurlText}
                    aria-label={copyCurlText}
                    className={`px-3 py-2 rounded-md border text-xs font-medium flex items-center gap-1.5 flex-shrink-0 transition-colors whitespace-nowrap ${
                        copiedCurl
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                >
                    {copiedCurl ? (
                        <>
                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>{copiedText}</span>
                        </>
                    ) : (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="hidden xl:inline">cURL</span>
                        </>
                    )}
                </button>

                {/* Code Snippet / Types Button */}
                {onOpenCodeGen && (
                    <button
                        type="button"
                        onClick={onOpenCodeGen}
                        title={codeSnippetText}
                        aria-label={codeSnippetText}
                        className="px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 text-xs font-medium flex items-center gap-1.5 flex-shrink-0 transition-colors whitespace-nowrap"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        <span>{codeSnippetText}</span>
                    </button>
                )}
            </div>

            {resolvedUrlPreview && (
                <div className="mt-1.5 px-1 flex items-center gap-1.5 text-[11px] font-mono text-slate-500 truncate" title={resolvedUrlPreview}>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded flex-shrink-0">
                        {resolvedUrlLabelText}
                    </span>
                    <span className="truncate">{resolvedUrlPreview}</span>
                </div>
            )}
        </div>
    );
};
