import React, { useEffect, useMemo, useState } from 'react';
import { HttpRequest, HttpResponse } from '../types';
import { generateCurlFromRequest } from '../utils';
import { generateFetchCode, generateAxiosCode, jsonToTypeScript } from '../codeGenUtils';

interface CodeGenModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: HttpRequest;
  response?: HttpResponse | null;
  initialTab?: 'curl' | 'fetch' | 'axios' | 'ts';
}

type CodeTab = 'curl' | 'fetch' | 'axios' | 'ts';

export const CodeGenModal: React.FC<CodeGenModalProps> = ({
  isOpen,
  onClose,
  request,
  response,
  initialTab = 'fetch',
}) => {
  const [tab, setTab] = useState<CodeTab>(initialTab);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setCopied(false);
    }
  }, [isOpen, initialTab]);

  const code = useMemo(() => {
    if (tab === 'curl') return generateCurlFromRequest(request);
    if (tab === 'fetch') return generateFetchCode(request);
    if (tab === 'axios') return generateAxiosCode(request);
    const sections: string[] = [];
    if (request.bodyType === 'raw' && request.bodyRaw?.trim()) {
      try {
        sections.push(`// Request Payload\n${jsonToTypeScript(request.bodyRaw, 'RequestPayload')}`);
      } catch {
        // Not valid JSON
      }
    }
    if (response?.body?.trim()) {
      try {
        sections.push(`// Response Body\n${jsonToTypeScript(response.body, 'ApiResponse')}`);
      } catch {
        sections.push(chrome.i18n.getMessage('codeGenInvalidJson') || '// Response body is not valid JSON.');
      }
    }
    if (sections.length === 0) {
      return (
        chrome.i18n.getMessage('codeGenTsHint') ||
        '// Send a request with a JSON body/response (or add raw JSON body) to infer TypeScript types.'
      );
    }
    return sections.join('\n\n');
  }, [isOpen, tab, request, response]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] animate-fadeIn p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={chrome.i18n.getMessage('codeGenTitle') || 'Generate Code & Types'}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            {chrome.i18n.getMessage('codeGenTitle') || 'Generate Code & Types'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={chrome.i18n.getMessage('close') || 'Close'}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex gap-1">
            {[
              { id: 'fetch' as CodeTab, label: 'Fetch API' },
              { id: 'axios' as CodeTab, label: 'Axios' },
              { id: 'curl' as CodeTab, label: 'cURL' },
              { id: 'ts' as CodeTab, label: 'TypeScript' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setTab(item.id); setCopied(false); }}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-md'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className={`mb-1.5 px-3 py-1 rounded-md text-xs font-semibold border transition-colors ${
              copied
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {copied ? (chrome.i18n.getMessage('copied') || 'Copied') : (chrome.i18n.getMessage('copyCode') || 'Copy Code')}
          </button>
        </div>

        <div className="p-4 bg-slate-900 text-slate-100 max-h-[380px] overflow-auto">
          <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words select-all">
            {code}
          </pre>
        </div>
      </div>
    </div>
  );
};
