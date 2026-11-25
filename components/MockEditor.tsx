import React, { useMemo, useRef, useEffect, useState } from 'react';
import { HttpMethod, JsonPatch, LoggedRequest, MockResponseHeader, MockRule, RuleMatchMode } from '../types';
import {
  applyScenarioToRule,
  collectJsonPaths,
  createJsonPatch,
  createScenarioFromRule,
  matchUrl,
} from '../mockUtils';
import { generateId } from '../utils';
import { JsonTree } from './JsonTree';

interface MockEditorProps {
  rule: MockRule;
  history: LoggedRequest[];
  onRuleChange: (rule: MockRule) => void;
  globalEnabled?: boolean;
  onToggleGlobal?: () => void;
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
    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{children}</div>
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
    // Keep string fallback
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
  const initial = useMemo(() => inferValueType(storedValue), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [type, setType] = useState<ValueType>(initial.type);
  const [display, setDisplay] = useState<string>(initial.display);

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
    'flex-1 min-w-0 text-xs font-mono border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:bg-white rounded px-2 py-1 focus:outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400';

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
        className="text-[10px] font-semibold text-slate-500 border border-slate-200 hover:border-slate-300 focus:border-emerald-500 rounded px-1 py-1 bg-white focus:outline-none transition-colors"
      >
        {TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
};

export const MockEditor: React.FC<MockEditorProps> = ({
  rule,
  history,
  onRuleChange,
  globalEnabled = true,
  onToggleGlobal,
}) => {
  const update = (partial: Partial<MockRule>) => onRuleChange({ ...rule, ...partial });
  const [bodyView, setBodyView] = useState<'edit' | 'preview'>('edit');
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(rule.queryMatch || rule.bodyMatch || (rule.delayMs && rule.delayMs > 0) || rule.simulateNetworkError)
  );
  const [isAddingScenario, setIsAddingScenario] = useState(false);
  const [scenarioInput, setScenarioInput] = useState('');

  const sampleData = useMemo(() => {
    if (!rule.urlPattern) return null;
    const matches = history.filter(h => matchUrl(h.url, rule.urlPattern, rule.matchMode || 'startsWith'));
    return matches.find(h => !!h.responseBody) || matches[0] || null;
  }, [history, rule.urlPattern, rule.matchMode]);

  const jsonHint = useMemo(() => tryFormatJson(rule.replaceBody || ''), [rule.replaceBody]);

  const pathOptions = useMemo(() => {
    if (!sampleData) return [];
    let body: any = sampleData.responseBody ?? sampleData.requestBody;
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

  const replaceHeaders = rule.replaceHeaders || [];
  const updateRespHeaders = (next: MockResponseHeader[]) => update({ replaceHeaders: next });
  const addRespHeader = () =>
    updateRespHeaders([...replaceHeaders, { id: generateId(), key: '', value: '', enabled: true }]);
  const updateRespHeader = (id: string, partial: Partial<MockResponseHeader>) =>
    updateRespHeaders(replaceHeaders.map(h => h.id === id ? { ...h, ...partial } : h));
  const removeRespHeader = (id: string) =>
    updateRespHeaders(replaceHeaders.filter(h => h.id !== id));

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

  const handleSaveScenario = () => {
    const scenario = createScenarioFromRule(rule, scenarioInput);
    const nextScenarios = [...(rule.scenarios || []), scenario];
    update({ scenarios: nextScenarios, activeScenarioId: scenario.id });
    setScenarioInput('');
    setIsAddingScenario(false);
  };

  const handleDeleteScenario = (id: string) => {
    const nextScenarios = (rule.scenarios || []).filter(s => s.id !== id);
    update({
      scenarios: nextScenarios,
      activeScenarioId: rule.activeScenarioId === id ? undefined : rule.activeScenarioId,
    });
  };

  const matchTitle = t('mockMatchSection', 'Match');
  const modifyTitle = t('mockModifySection', 'Modify');
  const urlPatternLabel = t('mockUrlPattern', 'URL Pattern');
  const urlPatternPh = t('mockUrlPatternPlaceholder', 'e.g. https://api.example.com/user');
  const methodLabel = t('mockMethod', 'Method');
  const matchModeLabel = t('matchModeLabel', 'Match Mode');
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
  const selectAllTitle = allEnabled ? t('mockDeselectAll', 'Deselect all') : t('mockSelectAll', 'Select all');
  const ruleNamePh = t('mockRuleNamePlaceholder', 'Rule name');
  const enabledLabel = t('mockRuleEnabled', 'Enabled');
  const pausedLabel = t('paused', 'Paused');
  const hitsLabel = t('mockHits', 'Hits');
  const globalPausedBanner = t('mockGlobalPausedBanner', 'Global Mock is paused. Enable it to apply this rule.');
  const enableNowText = t('enableNow', 'Enable now');
  const ruleDisabledHint = t('mockDisabledHint', 'This rule is disabled and will not affect any request.');
  const advancedLabel = t('advancedConditions', 'Conditions & Simulation');
  const scenariosLabel = t('mockScenarios', 'Scenarios');
  const saveScenarioLabel = t('saveScenario', 'Save Scenario');
  const scenarioPh = t('scenarioNamePlaceholder', 'Scenario name (e.g. 500 Error)');

  const fillFromHistory = () => {
    if (!sampleData) return;
    let body: any = sampleData.responseBody ?? sampleData.requestBody;
    if (typeof body === 'object' && body) body = JSON.stringify(body, null, 2);
    update({ replaceBody: typeof body === 'string' ? body : (rule.replaceBody || '') });
  };

  const scenarios = rule.scenarios || [];

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Top rule status & metadata bar */}
      <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={rule.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder={ruleNamePh}
          aria-label={ruleNamePh}
          className="flex-1 min-w-[200px] text-sm font-semibold text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded-md px-2 py-1 focus:outline-none transition-colors"
        />
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {hitsLabel}: <strong className="text-slate-700">{rule.hitCount || 0}</strong>
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${rule.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
              {rule.enabled ? enabledLabel : pausedLabel}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={rule.enabled}
              aria-label={enabledLabel}
              onClick={() => update({ enabled: !rule.enabled })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                rule.enabled ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  rule.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Multi-scenario presets strip */}
      <div className="border-b border-slate-200 bg-white px-5 py-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{scenariosLabel}:</span>
        {scenarios.map(s => {
          const active = rule.activeScenarioId === s.id;
          return (
            <div
              key={s.id}
              className={`inline-flex items-center rounded-md border text-xs transition-colors ${
                active
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <button
                type="button"
                onClick={() => onRuleChange(applyScenarioToRule(rule, s))}
                className="px-2.5 py-1 whitespace-nowrap"
              >
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteScenario(s.id)}
                aria-label={`Delete scenario ${s.name}`}
                className="pr-1.5 pl-0.5 py-1 text-slate-400 hover:text-red-500"
              >
                ×
              </button>
            </div>
          );
        })}
        {isAddingScenario ? (
          <div className="inline-flex items-center gap-1">
            <input
              autoFocus
              type="text"
              value={scenarioInput}
              onChange={(e) => setScenarioInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveScenario();
                else if (e.key === 'Escape') { setIsAddingScenario(false); setScenarioInput(''); }
              }}
              placeholder={scenarioPh}
              className="text-xs px-2 py-1 border border-emerald-500 rounded focus:outline-none w-44"
            />
            <button
              type="button"
              onClick={handleSaveScenario}
              className="px-2 py-1 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              {t('save', 'Save')}
            </button>
            <button
              type="button"
              onClick={() => { setIsAddingScenario(false); setScenarioInput(''); }}
              className="px-1.5 py-1 text-xs text-slate-500 hover:text-slate-700"
            >
              {t('cancel', 'Cancel')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingScenario(true)}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded border border-dashed border-emerald-300 hover:bg-emerald-50 whitespace-nowrap transition-colors"
          >
            + {saveScenarioLabel}
          </button>
        )}
      </div>

      {/* Warning banners */}
      {!globalEnabled && (
        <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 flex items-center justify-between gap-3 text-xs text-amber-800">
          <span>{globalPausedBanner}</span>
          {onToggleGlobal && (
            <button
              type="button"
              onClick={onToggleGlobal}
              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold whitespace-nowrap transition-colors"
            >
              {enableNowText}
            </button>
          )}
        </div>
      )}
      {globalEnabled && !rule.enabled && (
        <div className="mx-5 mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-600">
          {ruleDisabledHint}
        </div>
      )}

      <div className="max-w-3xl mx-auto p-5 space-y-6">
        {/* MATCH */}
        <section>
          <SectionTitle
            right={
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                <span>{advancedLabel}</span>
                <svg className={`w-3 h-3 transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            }
          >
            {matchTitle}
          </SectionTitle>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="w-28 flex-shrink-0">
                <div className="text-[11px] text-slate-500 mb-1">{methodLabel}</div>
                <select
                  value={rule.method}
                  onChange={e => update({ method: e.target.value as any })}
                  className="w-full text-xs border border-slate-200 hover:border-slate-300 focus:border-emerald-500 rounded-md px-2 py-1.5 focus:outline-none bg-white transition-colors"
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="w-32 flex-shrink-0">
                <div className="text-[11px] text-slate-500 mb-1">{matchModeLabel}</div>
                <select
                  aria-label={matchModeLabel}
                  value={rule.matchMode || 'startsWith'}
                  onChange={e => update({ matchMode: e.target.value as RuleMatchMode })}
                  className="w-full text-xs border border-slate-200 hover:border-slate-300 focus:border-emerald-500 rounded-md px-2 py-1.5 focus:outline-none bg-white transition-colors"
                >
                  <option value="startsWith">{t('matchStartsWith', 'Prefix')}</option>
                  <option value="exact">{t('matchExact', 'Exact')}</option>
                  <option value="wildcard">{t('matchWildcard', 'Wildcard (*)')}</option>
                  <option value="regex">{t('matchRegex', 'Regex')}</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="text-[11px] text-slate-500 mb-1">{urlPatternLabel}</div>
                <input
                  type="text"
                  value={rule.urlPattern}
                  placeholder={urlPatternPh}
                  onChange={e => update({ urlPattern: e.target.value })}
                  className="w-full text-xs font-mono border border-slate-200 hover:border-slate-300 focus:border-emerald-500 rounded-md px-2.5 py-1.5 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {showAdvanced && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">{t('queryMatchLabel', 'Query contains')}</label>
                  <input
                    type="text"
                    value={rule.queryMatch || ''}
                    onChange={(e) => update({ queryMatch: e.target.value })}
                    placeholder="e.g. role=admin"
                    className="w-full text-xs font-mono bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">{t('bodyMatchLabel', 'Body contains')}</label>
                  <input
                    type="text"
                    value={rule.bodyMatch || ''}
                    onChange={(e) => update({ bodyMatch: e.target.value })}
                    placeholder="e.g. GetUserProfile"
                    className="w-full text-xs font-mono bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-500 whitespace-nowrap">{t('delayMsLabel', 'Delay (ms)')}</label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={rule.delayMs || 0}
                      onChange={(e) => update({ delayMs: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
                      className="w-24 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={!!rule.simulateNetworkError}
                      onChange={(e) => update({ simulateNetworkError: e.target.checked })}
                      className="accent-red-600 rounded"
                    />
                    <span className={rule.simulateNetworkError ? 'text-red-600 font-semibold' : ''}>
                      {t('simulateNetworkErrorLabel', 'Simulate Network Error')}
                    </span>
                  </label>
                </div>
              </div>
            )}
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
            <div className="space-y-3">
              <div className="flex space-x-3">
                <div className="w-32">
                  <div className="text-[11px] text-slate-500 mb-1">{statusLabel}</div>
                  <input
                    type="number"
                    value={rule.replaceStatus ?? 200}
                    onChange={e => update({ replaceStatus: parseInt(e.target.value || '200', 10) })}
                    className="w-full text-xs font-mono border border-slate-200 hover:border-slate-300 focus:border-emerald-500 rounded-md px-2.5 py-1.5 focus:outline-none transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] text-slate-500 mb-1">{ctLabel}</div>
                  <input
                    type="text"
                    value={rule.replaceContentType ?? 'application/json'}
                    onChange={e => update({ replaceContentType: e.target.value })}
                    className="w-full text-xs font-mono border border-slate-200 hover:border-slate-300 focus:border-emerald-500 rounded-md px-2.5 py-1.5 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Custom Response Headers */}
              <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500">{t('mockResponseHeaders', 'Response Headers')}</span>
                  <button
                    type="button"
                    onClick={addRespHeader}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    + {t('addHeader', 'Add Header')}
                  </button>
                </div>
                {replaceHeaders.map(h => (
                  <div key={h.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      onChange={e => updateRespHeader(h.id, { enabled: e.target.checked })}
                      className="accent-emerald-600"
                    />
                    <input
                      type="text"
                      value={h.key}
                      onChange={e => updateRespHeader(h.id, { key: e.target.value })}
                      placeholder={t('headerKeyPlaceholder', 'Header')}
                      className="w-[40%] text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      value={h.value}
                      onChange={e => updateRespHeader(h.id, { value: e.target.value })}
                      placeholder={t('headerValuePlaceholder', 'Value')}
                      className="flex-1 text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeRespHeader(h.id)}
                      className="text-slate-400 hover:text-red-500 px-1"
                      aria-label={t('remove', 'Remove')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] text-slate-500">{bodyLabel}</div>
                  <div className="space-x-2 flex items-center">
                    {sampleData && (
                      <button
                        type="button"
                        onClick={fillFromHistory}
                        className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold"
                      >
                        {fillFromHistoryBtn}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const r = tryFormatJson(rule.replaceBody || '');
                        if (r.ok && r.pretty != null) update({ replaceBody: r.pretty });
                      }}
                      className="text-xs text-slate-600 hover:text-emerald-700 font-semibold"
                    >
                      {formatBtn}
                    </button>
                    <div className="inline-flex rounded border border-slate-200 overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setBodyView('edit')}
                        className={`px-2 py-0.5 ${bodyView === 'edit' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        {t('jsonEditView', 'Edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBodyView('preview')}
                        disabled={!jsonHint.ok}
                        className={`px-2 py-0.5 border-l border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed ${bodyView === 'preview' && jsonHint.ok ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        {t('jsonTreeView', 'Tree')}
                      </button>
                    </div>
                  </div>
                </div>
                {bodyView === 'preview' && jsonHint.ok ? (
                  <div className="w-full min-h-[180px] border border-slate-200 rounded-md p-2.5 bg-slate-50 overflow-auto">
                    <JsonTree value={rule.replaceBody || ''} />
                  </div>
                ) : (
                  <textarea
                    value={rule.replaceBody ?? ''}
                    onChange={e => update({ replaceBody: e.target.value })}
                    rows={11}
                    className={`w-full font-mono text-xs border rounded-md p-2.5 focus:outline-none transition-colors ${jsonHint.ok ? 'border-slate-200 focus:border-emerald-500' : 'border-red-300 focus:border-red-500'}`}
                    placeholder={'{ "code": 0, "id": "{{uuid}}", "ts": {{timestamp}} }'}
                  />
                )}
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {t('templateVarsHint', 'Template vars: {{uuid}}, {{timestamp}}, {{isoDate}}, {{query.key}}, {{body.field}}')}
                </div>
                {!jsonHint.ok && (rule.replaceContentType || '').includes('json') && (
                  <div className="text-xs text-red-600 mt-1">⚠ {jsonHint.error}</div>
                )}
              </div>
            </div>
          )}

          {rule.mode === 'patch-json' && (
            <div className="space-y-2.5">
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <div className="flex bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1.5 border-b border-slate-200">
                  <div className="w-7 flex justify-center">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      title={selectAllTitle}
                      disabled={patches.length === 0}
                      checked={allEnabled}
                      onChange={e => toggleAllPatches(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
                    />
                  </div>
                  <div className="flex-1 pr-2">{pathLabel}</div>
                  <div className="flex-1 pr-2">{newValueLabel}</div>
                  <div className="w-7"></div>
                </div>
                {(rule.jsonPatches || []).map(p => (
                  <div key={p.id} className="flex items-center px-2 py-1 border-b border-slate-100 last:border-b-0 group">
                    <div className="w-7 flex justify-center">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={e => updatePatch(p.id, { enabled: e.target.checked })}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="flex-1 pr-2 relative">
                      <input
                        type="text"
                        value={p.path}
                        onChange={e => updatePatch(p.id, { path: e.target.value })}
                        list={`paths-${p.id}`}
                        placeholder="data.user.name"
                        className="w-full text-xs font-mono border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:bg-white rounded px-2 py-1 focus:outline-none transition-all"
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
                        type="button"
                        onClick={() => removePatch(p.id)}
                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove field"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
                {(rule.jsonPatches || []).length === 0 && (
                  <div className="text-xs text-slate-400 italic px-3 py-3 text-center">
                    {t('mockNoPatches', 'No fields configured. Click "Add field" below to start.')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={addPatch}
                className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center"
              >
                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                {addFieldLabel}
              </button>
              {pathOptions.length === 0 && rule.urlPattern && (
                <div className="text-[11px] text-slate-400 italic">{noRequestSampleHint}</div>
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
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`flex-1 px-3 py-2 text-xs rounded-md border transition-all flex items-center justify-center ${
      active
        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`}
  >
    <span aria-hidden="true" className={`inline-block w-3 h-3 rounded-full border mr-2 flex items-center justify-center ${active ? 'border-emerald-600' : 'border-slate-300'}`}>
      {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
    </span>
    <span>{children}</span>
  </button>
);
