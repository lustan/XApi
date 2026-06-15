import React, { useMemo, useRef, useEffect, useState } from 'react';
import { HttpMethod, JsonPatch, LoggedRequest, MockMode, MockRule } from '../types';
import { collectJsonPaths, createJsonPatch } from '../mockUtils';
import { JsonTree } from './JsonTree';

interface MockEditorProps {
  rule: MockRule;
  history: LoggedRequest[];
  onRuleChange: (rule: MockRule) => void;
}

const METHODS: (HttpMethod | 'ANY')[] = ['ANY', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const t = (key: string, fallback: string) => {
  try {
    const m = chrome.i18n.getMessage(key);
    return m || fallback;
  } catch {
    return fallback;
  }
};

const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between mb-2">
    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{children}</div>
    {right}
  </div>
);

const tryFormatJson = (s: string): { ok: boolean; pretty?: string; error?: string } => {
  if (!s.trim()) return { ok: true, pretty: s };
  try {
    return { ok: true, pretty: JSON.stringify(JSON.parse(s), null, 2) };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Invalid JSON' };
  }
};

// ============== JsonPatch value cell ==============
// The storage layer still uses the legacy "::raw::" prefix to distinguish
// raw-JSON values from plain strings (see mock-injector.ts/interpretValue).
// In the UI we hide that prefix entirely behind a type chip so users never
// have to type it. Inference on mount keeps existing rules backwards-compatible.

type ValueType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';

const RAW_PREFIX = '::raw::';

const inferValueType = (storage: string): { type: ValueType; display: string } => {
  if (!storage.startsWith(RAW_PREFIX)) return { type: 'string', display: storage };
  const raw = storage.slice(RAW_PREFIX.length);
  try {
    const v = JSON.parse(raw);
    if (v === null) return { type: 'null', display: 'null' };
    if (typeof v === 'number') return { type: 'number', display: raw };
    if (typeof v === 'boolean') return { type: 'boolean', display: raw };
    if (Array.isArray(v)) return { type: 'array', display: raw };
    if (typeof v === 'object') return { type: 'object', display: raw };
  } catch {
    // Unparseable raw segment — fall back to string flavour so the user can
    // keep editing without losing characters.
  }
  return { type: 'string', display: raw };
};

const serializeValue = (type: ValueType, display: string): string => {
  if (type === 'string') return display;
  if (type === 'null') return `${RAW_PREFIX}null`;
  return `${RAW_PREFIX}${display}`;
};

const TYPE_OPTIONS: { value: ValueType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
  { value: 'null', label: 'Null' },
];

const PLACEHOLDERS: Record<ValueType, string> = {
  string: 'admin',
  number: '18',
  boolean: 'true',
  array: '[1, 2, 3]',
  object: '{"role": "vip"}',
  null: 'null',
};

interface ValueCellProps {
  storedValue: string;
  onChange: (next: string) => void;
}

const ValueCell: React.FC<ValueCellProps> = ({ storedValue, onChange }) => {
  // Seed type+display from the stored value once. Subsequent re-renders are
  // driven by local state so a half-typed JSON object (e.g. "{") doesn't get
  // re-classified as a string mid-edit and yank the chip out from under us.
  const initial = useMemo(() => inferValueType(storedValue), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [type, setType] = useState<ValueType>(initial.type);
  const [display, setDisplay] = useState<string>(initial.display);

  // If the stored value changes from outside (rule reset, history-fill, etc.)
  // and no longer matches what we'd have produced, resync from storage.
  useEffect(() => {
    if (serializeValue(type, display) !== storedValue) {
      const next = inferValueType(storedValue);
      setType(next.type);
      setDisplay(next.display);
    }
  }, [storedValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushDisplay = (next: string) => {
    setDisplay(next);
    onChange(serializeValue(type, next));
  };

  const changeType = (next: ValueType) => {
    // Normalize display so the new type round-trips cleanly. We don't try to
    // be too clever — just give the user a valid starting point.
    let d = display;
    if (next === 'null') d = 'null';
    else if (next === 'boolean' && d !== 'true' && d !== 'false') d = 'true';
    else if (next === 'number' && !/^-?\d+(\.\d+)?$/.test(d.trim())) d = '0';
    else if (next === 'array' && !d.trim().startsWith('[')) d = '[]';
    else if (next === 'object' && !d.trim().startsWith('{')) d = '{}';
    setType(next);
    setDisplay(d);
    onChange(serializeValue(next, d));
  };

  const inputCls =
    'flex-1 min-w-0 text-xs font-mono border border-transparent hover:border-gray-200 focus:border-green-500 focus:bg-white rounded px-2 py-1 focus:outline-none transition-all disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div className="flex-1 pr-2 flex items-center space-x-1">
      {type === 'null' ? (
        <input type="text" disabled value="null" className={inputCls} />
      ) : type === 'boolean' ? (
        <select
          value={display}
          onChange={e => pushDisplay(e.target.value)}
          className={inputCls}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type={type === 'number' ? 'number' : 'text'}
          value={display}
          onChange={e => pushDisplay(e.target.value)}
          placeholder={PLACEHOLDERS[type]}
          className={inputCls}
        />
      )}
      <select
        value={type}
        onChange={e => changeType(e.target.value as ValueType)}
        title="Value type"
        className="text-[10px] font-semibold text-gray-500 border border-gray-200 hover:border-gray-300 focus:border-green-500 rounded px-1 py-1 bg-white focus:outline-none transition-colors"
      >
        {TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
};

export const MockEditor: React.FC<MockEditorProps> = ({ rule, history, onRuleChange }) => {
  const update = (partial: Partial<MockRule>) => onRuleChange({ ...rule, ...partial });
  const [bodyView, setBodyView] = useState<'edit' | 'preview'>('edit');

  // Find sample real responses for this URL pattern (best-effort).
  const sampleData = useMemo(() => {
    if (!rule.urlPattern) return null;
    const matched = history.find(h => h.url.startsWith(rule.urlPattern));
    return matched || null;
  }, [history, rule.urlPattern, rule.matchMode]);

  const jsonHint = useMemo(() => tryFormatJson(rule.replaceBody || ''), [rule.replaceBody]);

  // Get JSON path autocomplete options from a sample request body if available.
  // (We don't have response bodies stored in history, but we render hints from body if it's JSON.)
  const pathOptions = useMemo(() => {
    if (!sampleData) return [];
    let body: any = sampleData.requestBody;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    if (!body || typeof body !== 'object') return [];
    return collectJsonPaths(body);
  }, [sampleData]);

  const updatePatches = (next: JsonPatch[]) => update({ jsonPatches: next });
  const addPatch = () => updatePatches([...(rule.jsonPatches || []), createJsonPatch()]);
  const updatePatch = (id: string, partial: Partial<JsonPatch>) =>
    updatePatches((rule.jsonPatches || []).map(p => p.id === id ? { ...p, ...partial } : p));
  const removePatch = (id: string) =>
    updatePatches((rule.jsonPatches || []).filter(p => p.id !== id));

  // Header "select all" state for the patch table — supports indeterminate.
  const patches = rule.jsonPatches || [];
  const enabledCount = patches.reduce((n, p) => n + (p.enabled ? 1 : 0), 0);
  const allEnabled = patches.length > 0 && enabledCount === patches.length;
  const someEnabled = enabledCount > 0 && enabledCount < patches.length;
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someEnabled;
  }, [someEnabled, allEnabled]);
  const toggleAllPatches = (enabled: boolean) => {
    if (patches.length === 0) return;
    updatePatches(patches.map(p => ({ ...p, enabled })));
  };

  const matchTitle = t('mockMatchSection', 'Match');
  const modifyTitle = t('mockModifySection', 'Modify');
  const urlPatternLabel = t('mockUrlPattern', 'URL Pattern');
  const urlPatternPh = t('mockUrlPatternPlaceholder', 'e.g. https://api.example.com/user');
  const methodLabel = t('mockMethod', 'Method');
  const modeReplace = t('mockModeReplace', 'Replace whole response');
  const modePatch = t('mockModePatchJson', 'Modify JSON fields');
  const statusLabel = t('mockStatus', 'Status');
  const ctLabel = t('mockContentType', 'Content-Type');
  const bodyLabel = t('mockReplaceBody', 'Response Body');
  const formatBtn = t('formatJSON', 'Format JSON');
  const fillFromHistoryBtn = t('mockFillFromHistory', 'Fill from history');
  const pathLabel = t('mockJsonPathHeader', 'Field path');
  const newValueLabel = t('mockJsonValueHeader', 'New value');
  const addFieldLabel = t('mockAddField', 'Add field');
  const noRequestSampleHint = t('mockNoSample', 'No matching capture in history yet — type the path manually.');
  const selectAllTitle = allEnabled
    ? t('mockDeselectAll', 'Deselect all')
    : t('mockSelectAll', 'Select all');

  const fillFromHistory = () => {
    if (!sampleData) return;
    let body: any = sampleData.requestBody;
    if (typeof body === 'object' && body) body = JSON.stringify(body, null, 2);
    update({ replaceBody: typeof body === 'string' ? body : (rule.replaceBody || '') });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-3xl mx-auto p-5 space-y-6">
        {/* MATCH */}
        <section>
          <SectionTitle>{matchTitle}</SectionTitle>
          <div className="space-y-2">
            <div className="flex space-x-2">
              <div className="w-32 flex-shrink-0">
                <div className="text-[11px] text-gray-500 mb-1">{methodLabel}</div>
                <select
                  value={rule.method}
                  onChange={e => update({ method: e.target.value as any })}
                  className="w-full text-xs border border-gray-200 hover:border-gray-300 focus:border-green-500 rounded px-2 py-1.5 focus:outline-none bg-white transition-colors"
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-500 mb-1">{urlPatternLabel}</div>
                <input
                  type="text"
                  value={rule.urlPattern}
                  placeholder={urlPatternPh}
                  onChange={e => update({ urlPattern: e.target.value })}
                  className="w-full text-xs font-mono border border-gray-200 hover:border-gray-300 focus:border-green-500 rounded px-2 py-1.5 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>
        </section>

        {/* MODIFY */}
        <section>
          <SectionTitle>{modifyTitle}</SectionTitle>
          <div className="flex space-x-2 mb-3">
            <ModeRadio active={rule.mode === 'replace'} onClick={() => update({ mode: 'replace' })}>
              {modeReplace}
            </ModeRadio>
            <ModeRadio active={rule.mode === 'patch-json'} onClick={() => update({ mode: 'patch-json' })}>
              {modePatch}
            </ModeRadio>
          </div>

          {rule.mode === 'replace' && (
            <div className="space-y-2">
              <div className="flex space-x-3">
                <div className="w-32">
                  <div className="text-[11px] text-gray-500 mb-1">{statusLabel}</div>
                  <input
                    type="number"
                    value={rule.replaceStatus ?? 200}
                    onChange={e => update({ replaceStatus: parseInt(e.target.value || '200', 10) })}
                    className="w-full text-xs border border-gray-200 hover:border-gray-300 focus:border-green-500 rounded px-2 py-1.5 focus:outline-none transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] text-gray-500 mb-1">{ctLabel}</div>
                  <input
                    type="text"
                    value={rule.replaceContentType ?? 'application/json'}
                    onChange={e => update({ replaceContentType: e.target.value })}
                    className="w-full text-xs border border-gray-200 hover:border-gray-300 focus:border-green-500 rounded px-2 py-1.5 focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] text-gray-500">{bodyLabel}</div>
                  <div className="space-x-2 flex items-center">
                    {sampleData && (
                      <button
                        onClick={fillFromHistory}
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 font-semibold"
                      >
                        {fillFromHistoryBtn}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const r = tryFormatJson(rule.replaceBody || '');
                        if (r.ok && r.pretty != null) update({ replaceBody: r.pretty });
                      }}
                      className="text-[10px] text-gray-500 hover:text-green-600 font-semibold"
                    >
                      {formatBtn}
                    </button>
                    <div className="inline-flex rounded border border-gray-200 overflow-hidden text-[10px]">
                      <button
                        type="button"
                        onClick={() => setBodyView('edit')}
                        className={`px-2 py-0.5 ${bodyView === 'edit' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                        {t('jsonEditView', 'Edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBodyView('preview')}
                        disabled={!jsonHint.ok}
                        className={`px-2 py-0.5 border-l border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed ${bodyView === 'preview' && jsonHint.ok ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                        {t('jsonTreeView', 'Tree')}
                      </button>
                    </div>
                  </div>
                </div>
                {bodyView === 'preview' && jsonHint.ok ? (
                  <div className="w-full min-h-[180px] border border-gray-200 rounded p-2 bg-gray-50 overflow-auto">
                    <JsonTree value={rule.replaceBody || ''} />
                  </div>
                ) : (
                  <textarea
                    value={rule.replaceBody ?? ''}
                    onChange={e => update({ replaceBody: e.target.value })}
                    rows={12}
                    className={`w-full font-mono text-xs border rounded p-2 focus:outline-none transition-colors ${jsonHint.ok ? 'border-gray-200 focus:border-green-500' : 'border-red-300 focus:border-red-500'}`}
                    placeholder={'{ "code": 0, "data": {} }'}
                  />
                )}
                {!jsonHint.ok && (rule.replaceContentType || '').includes('json') && (
                  <div className="text-[10px] text-red-600 mt-1">⚠ {jsonHint.error}</div>
                )}
              </div>
            </div>
          )}

          {rule.mode === 'patch-json' && (
            <div className="space-y-2">
              <div className="border border-gray-200 rounded overflow-hidden">
                <div className="flex bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 py-1.5 border-b border-gray-200">
                  <div className="w-7 flex justify-center">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      title={selectAllTitle}
                      disabled={patches.length === 0}
                      checked={allEnabled}
                      onChange={e => toggleAllPatches(e.target.checked)}
                      className="rounded text-green-600 focus:ring-green-500 disabled:opacity-40"
                    />
                  </div>
                  <div className="flex-1 pr-2">{pathLabel}</div>
                  <div className="flex-1 pr-2">{newValueLabel}</div>
                  <div className="w-7"></div>
                </div>
                {(rule.jsonPatches || []).map(p => (
                  <div key={p.id} className="flex items-center px-2 py-1 border-b border-gray-100 last:border-b-0 group">
                    <div className="w-7 flex justify-center">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={e => updatePatch(p.id, { enabled: e.target.checked })}
                        className="rounded text-green-600 focus:ring-green-500"
                      />
                    </div>
                    <div className="flex-1 pr-2 relative">
                      <input
                        type="text"
                        value={p.path}
                        onChange={e => updatePatch(p.id, { path: e.target.value })}
                        list={`paths-${p.id}`}
                        placeholder="data.user.name"
                        className="w-full text-xs font-mono border border-transparent hover:border-gray-200 focus:border-green-500 focus:bg-white rounded px-2 py-1 focus:outline-none transition-all"
                      />
                      {pathOptions.length > 0 && (
                        <datalist id={`paths-${p.id}`}>
                          {pathOptions.map(opt => <option key={opt} value={opt} />)}
                        </datalist>
                      )}
                    </div>
                    <ValueCell
                      storedValue={p.value}
                      onChange={next => updatePatch(p.id, { value: next })}
                    />
                    <div className="w-7 flex justify-center">
                      <button
                        onClick={() => removePatch(p.id)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
                {(rule.jsonPatches || []).length === 0 && (
                  <div className="text-[11px] text-gray-400 italic px-3 py-3 text-center">
                    {t('mockNoPatches', 'No fields configured. Click "Add field" below to start.')}
                  </div>
                )}
              </div>
              <button
                onClick={addPatch}
                className="text-xs text-gray-600 hover:text-green-600 font-semibold flex items-center"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                {addFieldLabel}
              </button>
              {pathOptions.length === 0 && rule.urlPattern && (
                <div className="text-[10px] text-gray-400 italic">{noRequestSampleHint}</div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const ModeRadio: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`flex-1 px-3 py-2 text-xs rounded border transition-all ${active ? 'border-green-500 bg-green-50 text-green-700 font-semibold' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
  >
    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${active ? 'bg-green-500' : 'bg-gray-300'}`} />
    {children}
  </button>
);
