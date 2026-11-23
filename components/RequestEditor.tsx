import React, { useState, useEffect, useRef } from 'react';
import { HttpRequest, KeyValue } from '../types';
import { InputTable } from './InputTable';
import { JsonTree } from './JsonTree';
import { paramsToQueryString, generateId } from '../utils';

interface RequestEditorProps {
  request: HttpRequest;
  onRequestChange: (req: HttpRequest) => void;
}

const BodySyntaxSelect = ({
    value,
    onChange
}: {
    value: string,
    onChange: (val: any) => void
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const jsonText = chrome.i18n.getMessage("json");
    const textText = chrome.i18n.getMessage("text");
    const htmlText = chrome.i18n.getMessage("html");
    const xmlText = chrome.i18n.getMessage("xml");

    const options: { value: 'json' | 'text' | 'html' | 'xml'; label: string }[] = [
        { value: 'json', label: jsonText },
        { value: 'text', label: textText },
        { value: 'html', label: htmlText },
        { value: 'xml', label: xmlText },
    ];
    const normalizedValue = (value || 'json').toLowerCase();
    const activeOption = options.find(opt => opt.value === normalizedValue) || options[0];

    return (
        <div className="relative" ref={ref}>
            <button 
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="bg-white border border-slate-200 rounded px-3 py-1 text-xs text-slate-600 focus:outline-none focus:border-emerald-500 flex items-center hover:bg-slate-50 transition-colors w-24 justify-between"
            >
                <span>{activeOption.label}</span>
                <svg className={`fill-current h-2 w-2 text-slate-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </button>
            {isOpen && (
                <div className="absolute right-0 top-full mt-1 w-24 bg-white border border-slate-200 shadow-lg rounded-md z-50 py-1 flex flex-col">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => { onChange(opt.value); setIsOpen(false); }}
                            className={`text-left px-3 py-1.5 text-xs hover:bg-emerald-50 hover:text-emerald-700 ${normalizedValue === opt.value ? 'text-emerald-600 font-bold' : 'text-slate-700'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

type AuthMode = 'none' | 'bearer' | 'basic';

const encodeBasic = (user: string, pass: string) => {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

const decodeBasic = (token: string): { user: string; pass: string } => {
  try {
    const binary = atob(token);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const idx = decoded.indexOf(':');
    if (idx === -1) return { user: decoded, pass: '' };
    return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
  } catch {
    return { user: '', pass: '' };
  }
};

export const RequestEditor: React.FC<RequestEditorProps> = ({ request, onRequestChange }) => {
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params');
  const [bodyType, setBodyType] = useState<HttpRequest['bodyType']>(request.bodyType || 'none');
  const [rawBodyView, setRawBodyView] = useState<'edit' | 'preview'>('edit');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sync auth helper state from current Authorization header
  const authHeader = request.headers.find(h => h.enabled && h.key.trim().toLowerCase() === 'authorization');
  const detectedAuth = React.useMemo((): { mode: AuthMode; bearer: string; user: string; pass: string } => {
    const val = authHeader?.value?.trim() || '';
    if (!val) return { mode: 'none', bearer: '', user: '', pass: '' };
    if (/^bearer\s+/i.test(val)) {
      return { mode: 'bearer', bearer: val.replace(/^bearer\s+/i, ''), user: '', pass: '' };
    }
    if (/^basic\s+/i.test(val)) {
      const { user, pass } = decodeBasic(val.replace(/^basic\s+/i, ''));
      return { mode: 'basic', bearer: '', user, pass };
    }
    return { mode: 'none', bearer: '', user: '', pass: '' };
  }, [authHeader?.value]);

  const [authMode, setAuthMode] = useState<AuthMode>(detectedAuth.mode);
  const [bearerToken, setBearerToken] = useState(detectedAuth.bearer);
  const [basicUser, setBasicUser] = useState(detectedAuth.user);
  const [basicPass, setBasicPass] = useState(detectedAuth.pass);

  useEffect(() => {
    setAuthMode(detectedAuth.mode);
    setBearerToken(detectedAuth.bearer);
    setBasicUser(detectedAuth.user);
    setBasicPass(detectedAuth.pass);
  }, [request.id, detectedAuth.mode, detectedAuth.bearer, detectedAuth.user, detectedAuth.pass]);

  const paramsText = chrome.i18n.getMessage("params");
  const headersText = chrome.i18n.getMessage("headers");
  const bodyText = chrome.i18n.getMessage("body");
  const authText = chrome.i18n.getMessage("auth");
  const thisRequestDoesNotHaveABodyText = chrome.i18n.getMessage("thisRequestDoesNotHaveABody");
  const formatJSONText = chrome.i18n.getMessage("formatJSON");
  const invalidJSONText = chrome.i18n.getMessage("invalidJSON");
  const enterRequestBodyText = chrome.i18n.getMessage("enterRequestBody");
  const noneText = chrome.i18n.getMessage("none");
  const formDataText = chrome.i18n.getMessage("formData");
  const xWwwFormUrlencodedText = chrome.i18n.getMessage("xWwwFormUrlencoded");
  const rawText = chrome.i18n.getMessage("raw");
  const authTypeText = chrome.i18n.getMessage("authType") || 'Auth Type';
  const authNoneText = chrome.i18n.getMessage("authNone") || 'No Auth';
  const authBearerText = chrome.i18n.getMessage("authBearer") || 'Bearer Token';
  const authBasicText = chrome.i18n.getMessage("authBasic") || 'Basic Auth';
  const authBearerPh = chrome.i18n.getMessage("authBearerPlaceholder") || 'Paste token here...';
  const authUserText = chrome.i18n.getMessage("authUsername") || 'Username';
  const authPassText = chrome.i18n.getMessage("authPassword") || 'Password';
  const authSyncHint = chrome.i18n.getMessage("authSyncHint") || 'Automatically syncs to the Authorization request header.';

  useEffect(() => {
    setBodyType(request.bodyType || 'none');
    setJsonError(null);
  }, [request.id, request.bodyType]);

  const handleParamsChange = (newParams: KeyValue[]) => {
    const queryString = paramsToQueryString(newParams);
    const baseUrl = request.url.split('?')[0];
    const newUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;
    onRequestChange({ ...request, params: newParams, url: newUrl });
  };

  const handleBodyTypeChange = (type: HttpRequest['bodyType']) => {
      setBodyType(type);
      setJsonError(null);
      onRequestChange({ ...request, bodyType: type });
  };

  const handleFormatJSON = () => {
      try {
          const parsed = JSON.parse(request.bodyRaw);
          const formatted = JSON.stringify(parsed, null, 2);
          setJsonError(null);
          onRequestChange({ ...request, bodyRaw: formatted });
      } catch (e: any) {
          setJsonError(e?.message ? `${invalidJSONText}: ${e.message}` : invalidJSONText);
      }
  };

  const applyAuthorizationHeader = (value: string | null) => {
    const existingIdx = request.headers.findIndex(h => h.key.trim().toLowerCase() === 'authorization');
    let nextHeaders = [...request.headers];
    if (value === null) {
      if (existingIdx !== -1) {
        nextHeaders = nextHeaders.filter((_, i) => i !== existingIdx);
      }
    } else if (existingIdx !== -1) {
      nextHeaders = nextHeaders.map((h, i) => i === existingIdx ? { ...h, key: 'Authorization', value, enabled: true } : h);
    } else {
      const hasTrailingEmpty = nextHeaders.length > 0 && !nextHeaders[nextHeaders.length - 1].key && !nextHeaders[nextHeaders.length - 1].value;
      const newHeader: KeyValue = { id: generateId(), key: 'Authorization', value, enabled: true };
      if (hasTrailingEmpty) {
        nextHeaders.splice(nextHeaders.length - 1, 0, newHeader);
      } else {
        nextHeaders.push(newHeader);
      }
    }
    onRequestChange({ ...request, headers: nextHeaders });
  };

  const handleAuthModeChange = (mode: AuthMode) => {
    setAuthMode(mode);
    if (mode === 'none') {
      applyAuthorizationHeader(null);
    } else if (mode === 'bearer') {
      applyAuthorizationHeader(bearerToken ? `Bearer ${bearerToken}` : 'Bearer ');
    } else if (mode === 'basic') {
      applyAuthorizationHeader(`Basic ${encodeBasic(basicUser, basicPass)}`);
    }
  };

  const activeParamsCount = request.params.filter(p => p.enabled && p.key.trim()).length;
  const activeHeadersCount = request.headers.filter(h => h.enabled && h.key.trim()).length;

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-2 mt-1">
        {[
          { id: 'params', text: paramsText, count: activeParamsCount },
          { id: 'headers', text: headersText, count: activeHeadersCount },
          { id: 'body', text: bodyText, active: request.bodyType !== 'none' },
          { id: 'auth', text: authText, active: authMode !== 'none' },
        ].map(({ id, text, count, active }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id as any)}
            className={`px-4 py-2 text-xs font-semibold tracking-wide border-b-2 transition-colors mb-[-1px] flex items-center gap-1 whitespace-nowrap ${
              activeTab === id 
                ? 'border-emerald-600 text-emerald-700' 
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>{text}</span>
            {typeof count === 'number' && count > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-emerald-600">({count})</span>
            )}
            {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-white relative">
        {activeTab === 'params' && (
           <div>
               <InputTable items={request.params} onChange={handleParamsChange} hideTitle withTypeSelector={false} />
           </div>
        )}

        {activeTab === 'headers' && (
           <div>
              <InputTable items={request.headers} onChange={(headers) => onRequestChange({ ...request, headers })} hideTitle withTypeSelector={false} />
           </div>
        )}

        {activeTab === 'auth' && (
            <div className="max-w-md space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{authTypeText}</label>
                  <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                    {[
                      { id: 'none' as AuthMode, label: authNoneText },
                      { id: 'bearer' as AuthMode, label: authBearerText },
                      { id: 'basic' as AuthMode, label: authBasicText },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleAuthModeChange(opt.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          authMode === opt.id
                            ? 'bg-white text-emerald-700 shadow-sm font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {authMode === 'bearer' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-600">Token</label>
                    <input
                      type="text"
                      value={bearerToken}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBearerToken(val);
                        applyAuthorizationHeader(`Bearer ${val}`);
                      }}
                      placeholder={authBearerPh}
                      className="w-full text-xs font-mono px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400">{authSyncHint}</p>
                  </div>
                )}

                {authMode === 'basic' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{authUserText}</label>
                      <input
                        type="text"
                        value={basicUser}
                        onChange={(e) => {
                          const u = e.target.value;
                          setBasicUser(u);
                          applyAuthorizationHeader(`Basic ${encodeBasic(u, basicPass)}`);
                        }}
                        className="w-full text-xs font-mono px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{authPassText}</label>
                      <input
                        type="password"
                        value={basicPass}
                        onChange={(e) => {
                          const p = e.target.value;
                          setBasicPass(p);
                          applyAuthorizationHeader(`Basic ${encodeBasic(basicUser, p)}`);
                        }}
                        className="w-full text-xs font-mono px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">{authSyncHint}</p>
                  </div>
                )}

                {authMode === 'none' && (
                  <p className="text-xs text-slate-400">{authSyncHint}</p>
                )}
            </div>
        )}

        {activeTab === 'body' && (
          <div className="h-full flex flex-col">
             <div className="flex flex-wrap gap-4 mb-4 text-xs font-medium text-slate-600 border-b border-slate-100 pb-2.5">
                 {[
                    {id: 'none', label: noneText},
                    {id: 'form-data', label: formDataText},
                    {id: 'x-www-form-urlencoded', label: xWwwFormUrlencodedText},
                    {id: 'raw', label: rawText}
                ].map(t => (
                    <label key={t.id} className={`flex items-center cursor-pointer hover:text-slate-900 ${bodyType === t.id ? 'text-emerald-700 font-semibold' : ''}`}>
                    <input 
                        type="radio" 
                        checked={bodyType === t.id} 
                        onChange={() => handleBodyTypeChange(t.id as any)}
                        className="mr-1.5 accent-emerald-600"
                    />
                    {t.label}
                    </label>
                ))}
             </div>

             <div className="flex-1 overflow-y-auto">
                 {bodyType === 'none' && (
                    <div className="flex h-full items-center justify-center text-slate-400 text-sm">
                        {thisRequestDoesNotHaveABodyText}
                    </div>
                 )}

                 {(bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded') && (
                     <InputTable 
                        items={request.bodyForm} 
                        onChange={(items) => onRequestChange({...request, bodyForm: items})}
                        hideTitle
                        withTypeSelector={bodyType === 'form-data'}
                     />
                 )}

                 {bodyType === 'raw' && (
                   <div className="h-full flex flex-col">
                       <div className="flex justify-between mb-2 items-center">
                           <div className="flex space-x-2 items-center">
                                <button
                                    type="button"
                                    onClick={handleFormatJSON}
                                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded border border-slate-200 transition-colors"
                                >
                                    {formatJSONText}
                                </button>
                                {((request.bodyRawType || 'json').toLowerCase() === 'json') && (
                                    <div className="inline-flex rounded border border-slate-200 overflow-hidden text-xs">
                                        <button
                                            type="button"
                                            onClick={() => setRawBodyView('edit')}
                                            className={`px-2.5 py-1 ${rawBodyView === 'edit' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            {chrome.i18n.getMessage('jsonEditView') || 'Edit'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRawBodyView('preview')}
                                            className={`px-2.5 py-1 border-l border-slate-200 ${rawBodyView === 'preview' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            {chrome.i18n.getMessage('jsonTreeView') || 'Tree'}
                                        </button>
                                    </div>
                                )}
                           </div>

                           <BodySyntaxSelect
                                value={request.bodyRawType || 'json'}
                                onChange={(val) => {
                                    setJsonError(null);
                                    onRequestChange({ ...request, bodyRawType: val });
                                }}
                           />
                       </div>
                       {jsonError && (
                           <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                               {jsonError}
                           </div>
                       )}
                       {rawBodyView === 'preview' && (request.bodyRawType || 'json').toLowerCase() === 'json' ? (
                           <div className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-md p-2.5 overflow-auto">
                               <JsonTree value={request.bodyRaw || ''} />
                           </div>
                       ) : (
                           <textarea
                             value={request.bodyRaw}
                             onChange={(e) => {
                                 if (jsonError) setJsonError(null);
                                 onRequestChange({ ...request, bodyRaw: e.target.value });
                             }}
                             className="flex-1 w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-3 font-mono text-xs resize-none focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-400"
                             placeholder={enterRequestBodyText}
                           />
                       )}
                   </div>
                 )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
