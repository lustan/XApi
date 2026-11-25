import React, { useState, useEffect, useRef } from 'react';
import { EnvironmentItem, ExtractRule, HttpRequest, KeyValue, LoggedRequest } from '../types';
import { InputTable } from './InputTable';
import { JsonTree } from './JsonTree';
import { paramsToQueryString, generateId } from '../utils';
import { createExtractRule } from '../envUtils';

interface RequestEditorProps {
  request: HttpRequest;
  onRequestChange: (req: HttpRequest) => void;
  history?: LoggedRequest[];
  activeEnvironment?: EnvironmentItem | null;
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

export const RequestEditor: React.FC<RequestEditorProps> = ({
  request,
  onRequestChange,
  history = [],
  activeEnvironment,
}) => {
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body' | 'auth' | 'extract'>('params');
  const [bodyType, setBodyType] = useState<HttpRequest['bodyType']>(request.bodyType || 'none');
  const [rawBodyView, setRawBodyView] = useState<'edit' | 'preview'>('edit');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [authStatusMsg, setAuthStatusMsg] = useState<string | null>(null);

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
  const extractText = chrome.i18n.getMessage("extractTab") || 'Extract';
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
  const grabFromCapturedText = chrome.i18n.getMessage("grabFromCaptured") || 'Grab Auth from Captured';
  const grabFromActiveTabText = chrome.i18n.getMessage("grabFromActiveTab") || 'Read Page Storage Token';
  const extractRulesHintText = chrome.i18n.getMessage("extractRulesHint") || 'Automatically save values from JSON body or headers into the active environment.';
  const addExtractRuleText = chrome.i18n.getMessage("addExtractRule") || 'Add Rule';
  const gqlQueryText = chrome.i18n.getMessage("graphqlQuery") || 'Query';
  const gqlVariablesText = chrome.i18n.getMessage("graphqlVariables") || 'Variables (JSON)';

  useEffect(() => {
    setBodyType(request.bodyType || 'none');
    setJsonError(null);
    setAuthStatusMsg(null);
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

  const upsertHeader = (key: string, value: string) => {
    const existingIdx = request.headers.findIndex(h => h.key.trim().toLowerCase() === key.toLowerCase());
    let nextHeaders = [...request.headers];
    if (existingIdx !== -1) {
      nextHeaders = nextHeaders.map((h, i) => i === existingIdx ? { ...h, key, value, enabled: true } : h);
    } else {
      const hasTrailingEmpty = nextHeaders.length > 0 && !nextHeaders[nextHeaders.length - 1].key && !nextHeaders[nextHeaders.length - 1].value;
      const newHeader: KeyValue = { id: generateId(), key, value, enabled: true };
      if (hasTrailingEmpty) {
        nextHeaders.splice(nextHeaders.length - 1, 0, newHeader);
      } else {
        nextHeaders.push(newHeader);
      }
    }
    onRequestChange({ ...request, headers: nextHeaders });
  };

  const applyAuthorizationHeader = (value: string | null) => {
    const existingIdx = request.headers.findIndex(h => h.key.trim().toLowerCase() === 'authorization');
    let nextHeaders = [...request.headers];
    if (value === null) {
      if (existingIdx !== -1) {
        nextHeaders = nextHeaders.filter((_, i) => i !== existingIdx);
        onRequestChange({ ...request, headers: nextHeaders });
      }
      return;
    }
    upsertHeader('Authorization', value);
  };

  const handleAuthModeChange = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthStatusMsg(null);
    if (mode === 'none') {
      applyAuthorizationHeader(null);
    } else if (mode === 'bearer') {
      applyAuthorizationHeader(bearerToken ? `Bearer ${bearerToken}` : 'Bearer ');
    } else if (mode === 'basic') {
      applyAuthorizationHeader(`Basic ${encodeBasic(basicUser, basicPass)}`);
    }
  };

  const handleGrabFromCaptured = () => {
    for (const log of history) {
      if (!log.requestHeaders) continue;
      const authEntry = Object.entries(log.requestHeaders).find(([k, v]) => k.toLowerCase() === 'authorization' && v);
      if (authEntry) {
        upsertHeader('Authorization', authEntry[1]);
        setAuthStatusMsg(`Applied Authorization header from ${log.method} ${log.url}`);
        return;
      }
    }
    for (const log of history) {
      if (!log.requestHeaders) continue;
      const cookieEntry = Object.entries(log.requestHeaders).find(([k, v]) => k.toLowerCase() === 'cookie' && v);
      if (cookieEntry) {
        upsertHeader('Cookie', cookieEntry[1]);
        setAuthStatusMsg(`Applied Cookie header from ${log.method} ${log.url}`);
        return;
      }
    }
    setAuthStatusMsg('No Authorization or Cookie header found in captured requests.');
  };

  const handleGrabFromActiveTab = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.scripting?.executeScript) {
      setAuthStatusMsg('Page storage reading is available when running inside Chrome Extension.');
      return;
    }
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs?.[0]?.id;
        if (!tabId) {
          setAuthStatusMsg('No active browser tab found.');
          return;
        }
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: () => {
              const findToken = (store: Storage) => {
                for (let i = 0; i < store.length; i++) {
                  const key = store.key(i) || '';
                  if (/(token|auth|jwt|access|bearer)/i.test(key)) {
                    const val = store.getItem(key);
                    if (val && val.length >= 8 && val.length <= 4096) {
                      return { key, val };
                    }
                  }
                }
                return null;
              };
              try {
                return findToken(window.localStorage) || findToken(window.sessionStorage);
              } catch {
                return null;
              }
            },
          },
          (results) => {
            const hit = results?.[0]?.result as { key: string; val: string } | null | undefined;
            if (!hit) {
              setAuthStatusMsg('No token key found in active tab localStorage/sessionStorage.');
              return;
            }
            const cleaned = hit.val.replace(/^"|"$/g, '').replace(/^bearer\s+/i, '');
            setAuthMode('bearer');
            setBearerToken(cleaned);
            upsertHeader('Authorization', `Bearer ${cleaned}`);
            setAuthStatusMsg(`Loaded Bearer token from storage key "${hit.key}".`);
          }
        );
      });
    } catch {
      setAuthStatusMsg('Unable to inspect active browser tab storage.');
    }
  };

  const extractRules = request.extractRules || [];
  const updateExtractRules = (next: ExtractRule[]) =>
    onRequestChange({ ...request, extractRules: next });

  const activeParamsCount = request.params.filter(p => p.enabled && p.key.trim()).length;
  const activeHeadersCount = request.headers.filter(h => h.enabled && h.key.trim()).length;
  const activeExtractCount = extractRules.filter(r => r.enabled && r.path.trim() && r.variableName.trim()).length;

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-2 mt-1 overflow-x-auto no-scrollbar">
        {[
          { id: 'params', text: paramsText, count: activeParamsCount },
          { id: 'headers', text: headersText, count: activeHeadersCount },
          { id: 'body', text: bodyText, active: request.bodyType !== 'none' },
          { id: 'auth', text: authText, active: authMode !== 'none' },
          { id: 'extract', text: extractText, count: activeExtractCount },
        ].map(({ id, text, count, active }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id as any)}
            className={`px-3.5 py-2 text-xs font-semibold tracking-wide border-b-2 transition-colors mb-[-1px] flex items-center gap-1 whitespace-nowrap ${
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
            <div className="max-w-lg space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
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
                </div>

                {/* Quick Auth Helpers */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleGrabFromCaptured}
                    className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 text-xs font-medium text-slate-700 transition-colors"
                  >
                    {grabFromCapturedText}
                  </button>
                  <button
                    type="button"
                    onClick={handleGrabFromActiveTab}
                    className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 text-xs font-medium text-slate-700 transition-colors"
                  >
                    {grabFromActiveTabText}
                  </button>
                </div>

                {authStatusMsg && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs text-emerald-800">
                    {authStatusMsg}
                  </div>
                )}

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

        {activeTab === 'extract' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">{extractRulesHintText}</p>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                activeEnvironment
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {activeEnvironment ? `Target: ${activeEnvironment.name}` : 'No Active Environment'}
              </span>
            </div>

            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="flex bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2.5 py-1.5 border-b border-slate-200">
                <div className="w-7" />
                <div className="w-24 pr-2">Source</div>
                <div className="flex-1 pr-2">Path / Header</div>
                <div className="flex-1 pr-2">Variable</div>
                <div className="w-7" />
              </div>
              {extractRules.map(rule => (
                <div key={rule.id} className="flex items-center px-2.5 py-1.5 border-b border-slate-100 last:border-b-0 group">
                  <div className="w-7 flex justify-center">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={e => updateExtractRules(extractRules.map(r => r.id === rule.id ? { ...r, enabled: e.target.checked } : r))}
                      className="accent-emerald-600"
                    />
                  </div>
                  <div className="w-24 pr-2">
                    <select
                      value={rule.source}
                      onChange={e => updateExtractRules(extractRules.map(r => r.id === rule.id ? { ...r, source: e.target.value as 'body' | 'header' } : r))}
                      className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="body">JSON Body</option>
                      <option value="header">Header</option>
                    </select>
                  </div>
                  <div className="flex-1 pr-2">
                    <input
                      type="text"
                      value={rule.path}
                      onChange={e => updateExtractRules(extractRules.map(r => r.id === rule.id ? { ...r, path: e.target.value } : r))}
                      placeholder={rule.source === 'header' ? 'x-auth-token' : 'data.accessToken'}
                      className="w-full text-xs font-mono border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-2 py-1 focus:outline-none"
                    />
                  </div>
                  <div className="flex-1 pr-2">
                    <input
                      type="text"
                      value={rule.variableName}
                      onChange={e => updateExtractRules(extractRules.map(r => r.id === rule.id ? { ...r, variableName: e.target.value } : r))}
                      placeholder="token"
                      className="w-full text-xs font-mono border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-2 py-1 focus:outline-none"
                    />
                  </div>
                  <div className="w-7 flex justify-center">
                    <button
                      type="button"
                      onClick={() => updateExtractRules(extractRules.filter(r => r.id !== rule.id))}
                      aria-label="Remove extract rule"
                      className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {extractRules.length === 0 && (
                <div className="text-xs text-slate-400 italic py-4 text-center">
                  No extract rules configured.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => updateExtractRules([...extractRules, createExtractRule()])}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center"
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              {addExtractRuleText}
            </button>
          </div>
        )}

        {activeTab === 'body' && (
          <div className="h-full flex flex-col">
             <div className="flex flex-wrap gap-4 mb-4 text-xs font-medium text-slate-600 border-b border-slate-100 pb-2.5">
                 {[
                    {id: 'none', label: noneText},
                    {id: 'form-data', label: formDataText},
                    {id: 'x-www-form-urlencoded', label: xWwwFormUrlencodedText},
                    {id: 'raw', label: rawText},
                    {id: 'graphql', label: 'GraphQL'},
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

                 {bodyType === 'graphql' && (
                   <div className="h-full flex flex-col gap-3">
                     <div className="flex-1 flex flex-col min-h-[150px]">
                       <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{gqlQueryText}</label>
                       <textarea
                         value={request.graphqlQuery || ''}
                         onChange={(e) => onRequestChange({ ...request, graphqlQuery: e.target.value })}
                         placeholder={'query GetUser($id: ID!) {\n  user(id: $id) {\n    id\n    name\n  }\n}'}
                         className="flex-1 w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-3 font-mono text-xs resize-none focus:outline-none focus:border-emerald-500 transition-colors"
                       />
                     </div>
                     <div className="h-36 flex flex-col">
                       <div className="flex items-center justify-between mb-1">
                         <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{gqlVariablesText}</label>
                         <button
                           type="button"
                           onClick={() => {
                             try {
                               const formatted = JSON.stringify(JSON.parse(request.graphqlVariables || '{}'), null, 2);
                               onRequestChange({ ...request, graphqlVariables: formatted });
                             } catch { /* ignore */ }
                           }}
                           className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                         >
                           {formatJSONText}
                         </button>
                       </div>
                       <textarea
                         value={request.graphqlVariables || ''}
                         onChange={(e) => onRequestChange({ ...request, graphqlVariables: e.target.value })}
                         placeholder={'{\n  "id": "123"\n}'}
                         className="flex-1 w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-2.5 font-mono text-xs resize-none focus:outline-none focus:border-emerald-500 transition-colors"
                       />
                     </div>
                   </div>
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
