import { JsonPatch, MockRule, MockScenario, RuleMatchMode } from './types';
import { generateId } from './utils';

// ============== Rule matching ==============

export const wildcardToRegex = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
};

export const matchUrl = (url: string, pattern: string, mode: RuleMatchMode = 'startsWith'): boolean => {
  if (!pattern || !url) return false;
  switch (mode) {
    case 'exact':
      return url === pattern;
    case 'wildcard':
      try {
        return wildcardToRegex(pattern).test(url);
      } catch {
        return false;
      }
    case 'regex':
      try {
        return new RegExp(pattern).test(url);
      } catch {
        return false;
      }
    case 'startsWith':
    default:
      return url.startsWith(pattern);
  }
};

const bodyToString = (body: any): string => {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
};

export const matchRule = (
  url: string,
  method: string,
  rules: MockRule[],
  requestBody?: any
): MockRule | undefined => {
  const m = (method || 'GET').toUpperCase();
  const bodyStr = bodyToString(requestBody);
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.method && r.method !== 'ANY' && r.method !== m) continue;
    if (!matchUrl(url, r.urlPattern, r.matchMode)) continue;
    if (r.queryMatch && r.queryMatch.trim()) {
      const qIdx = url.indexOf('?');
      const qs = qIdx >= 0 ? url.slice(qIdx + 1) : '';
      if (!qs.includes(r.queryMatch.trim())) continue;
    }
    if (r.bodyMatch && r.bodyMatch.trim()) {
      if (!bodyStr.includes(r.bodyMatch.trim())) continue;
    }
    return r;
  }
  return undefined;
};

// ============== Template Interpolation for Mock Replace Body ==============

const readDotPath = (obj: any, path: string): unknown => {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  let cur: any = obj;
  for (const seg of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
};

export const applyMockTemplate = (
  body: string,
  ctx: { url?: string; method?: string; requestBody?: any }
): string => {
  if (!body || !body.includes('{{')) return body;

  let queryParams: URLSearchParams | null = null;
  const getQuery = () => {
    if (queryParams) return queryParams;
    try {
      queryParams = new URL(ctx.url || '').searchParams;
    } catch {
      queryParams = new URLSearchParams();
    }
    return queryParams;
  };

  let parsedReqBody: any = null;
  let parsedTried = false;
  const getReqBody = () => {
    if (parsedTried) return parsedReqBody;
    parsedTried = true;
    if (ctx.requestBody && typeof ctx.requestBody === 'object') {
      parsedReqBody = ctx.requestBody;
    } else if (typeof ctx.requestBody === 'string') {
      try {
        parsedReqBody = JSON.parse(ctx.requestBody);
      } catch {
        parsedReqBody = null;
      }
    }
    return parsedReqBody;
  };

  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (key === 'timestamp' || key === 'now' || key === '$timestamp') return String(Date.now());
    if (key === 'isoDate' || key === '$isoTimestamp') return new Date().toISOString();
    if (key === 'uuid' || key === '$uuid') {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    if (key === 'method') return (ctx.method || 'GET').toUpperCase();
    if (key === 'url') return ctx.url || '';
    if (key.startsWith('query.')) {
      const val = getQuery().get(key.slice(6));
      return val !== null ? val : match;
    }
    if (key.startsWith('body.')) {
      const val = readDotPath(getReqBody(), key.slice(5));
      if (val === undefined) return match;
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    }
    return match;
  });
};

// ============== JSON path ==============

const RAW_PREFIX = '::raw::';

interface PathSeg {
  type: 'key' | 'index';
  value: string | number;
}

const parsePath = (path: string): PathSeg[] => {
  const segs: PathSeg[] = [];
  const parts = path.split('.').filter(p => p !== '');
  for (const part of parts) {
    const m = part.match(/^([^\[\]]*)((?:\[\d+\])*)$/);
    if (!m) {
      segs.push({ type: 'key', value: part });
      continue;
    }
    const head = m[1];
    const tail = m[2];
    if (head) segs.push({ type: 'key', value: head });
    if (tail) {
      const idxRegex = /\[(\d+)\]/g;
      let mm: RegExpExecArray | null;
      while ((mm = idxRegex.exec(tail)) !== null) {
        segs.push({ type: 'index', value: parseInt(mm[1], 10) });
      }
    }
  }
  return segs;
};

const interpretValue = (v: string): any => {
  if (v.startsWith(RAW_PREFIX)) {
    const raw = v.slice(RAW_PREFIX.length);
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return v;
};

export const applyJsonPatch = (data: any, patch: JsonPatch): boolean => {
  if (!patch.enabled || !patch.path) return false;
  const segs = parsePath(patch.path);
  if (segs.length === 0) return false;

  let cur = data;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (cur == null || typeof cur !== 'object') return false;
    if (s.type === 'index' && Array.isArray(cur)) {
      cur = cur[s.value as number];
    } else if (s.type === 'key' && !Array.isArray(cur)) {
      cur = cur[s.value as string];
    } else {
      return false;
    }
  }
  if (cur == null || typeof cur !== 'object') return false;

  const last = segs[segs.length - 1];
  const value = interpretValue(patch.value);
  if (last.type === 'index' && Array.isArray(cur)) {
    cur[last.value as number] = value;
    return true;
  }
  if (last.type === 'key' && !Array.isArray(cur)) {
    (cur as any)[last.value as string] = value;
    return true;
  }
  return false;
};

export const applyJsonPatches = (data: any, patches?: JsonPatch[]): number => {
  if (!patches || patches.length === 0) return 0;
  let n = 0;
  for (const p of patches) {
    if (applyJsonPatch(data, p)) n++;
  }
  return n;
};

export const collectJsonPaths = (data: any): string[] => {
  const out: string[] = [];
  const MAX = 200;
  const MAX_DEPTH = 6;
  const walk = (v: any, prefix: string, depth: number) => {
    if (out.length >= MAX || depth > MAX_DEPTH) return;
    if (v == null || typeof v !== 'object') {
      if (prefix) out.push(prefix);
      return;
    }
    if (Array.isArray(v)) {
      if (v.length > 0) walk(v[0], `${prefix}[0]`, depth + 1);
      else if (prefix) out.push(prefix);
      return;
    }
    const keys = Object.keys(v);
    if (keys.length === 0 && prefix) {
      out.push(prefix);
      return;
    }
    for (const k of keys) {
      if (out.length >= MAX) break;
      const next = prefix ? `${prefix}.${k}` : k;
      walk(v[k], next, depth + 1);
    }
  };
  walk(data, '', 0);
  return out;
};

const stringifyLeafValue = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v === null || typeof v === 'number' || typeof v === 'boolean') {
    return `::raw::${JSON.stringify(v)}`;
  }
  try { return `::raw::${JSON.stringify(v)}`; } catch { return ''; }
};

export const buildPatchesFromJson = (data: any): JsonPatch[] => {
  const out: JsonPatch[] = [];
  const MAX = 200;
  const MAX_DEPTH = 6;
  const push = (path: string, value: any) => {
    if (!path) return;
    out.push({ id: generateId(), path, value: stringifyLeafValue(value), enabled: true });
  };
  const walk = (v: any, prefix: string, depth: number) => {
    if (out.length >= MAX || depth > MAX_DEPTH) return;
    if (v == null || typeof v !== 'object') { push(prefix, v); return; }
    if (Array.isArray(v)) {
      if (v.length > 0) walk(v[0], `${prefix}[0]`, depth + 1);
      return;
    }
    const keys = Object.keys(v);
    if (keys.length === 0) return;
    for (const k of keys) {
      if (out.length >= MAX) break;
      const next = prefix ? `${prefix}.${k}` : k;
      walk(v[k], next, depth + 1);
    }
  };
  walk(data, '', 0);
  return out;
};

// ============== Factories ==============

export const createMockRule = (partial?: Partial<MockRule>): MockRule => ({
  id: generateId(),
  name: 'New Mock Rule',
  enabled: true,
  urlPattern: '',
  matchMode: 'startsWith',
  method: 'ANY',
  mode: 'replace',
  delayMs: 0,
  simulateNetworkError: false,
  replaceStatus: 200,
  replaceContentType: 'application/json',
  replaceBody: '',
  replaceHeaders: [],
  jsonPatches: [],
  scenarios: [],
  createdAt: Date.now(),
  hitCount: 0,
  ...(partial || {})
});

export const createJsonPatch = (partial?: Partial<JsonPatch>): JsonPatch => ({
  id: generateId(),
  path: '',
  value: '',
  enabled: true,
  ...(partial || {})
});

export const createScenarioFromRule = (rule: MockRule, name: string): MockScenario => ({
  id: generateId(),
  name: name.trim() || `Scenario ${(rule.scenarios?.length || 0) + 1}`,
  mode: rule.mode,
  replaceStatus: rule.replaceStatus,
  replaceContentType: rule.replaceContentType,
  replaceBody: rule.replaceBody,
  replaceHeaders: rule.replaceHeaders ? rule.replaceHeaders.map(h => ({ ...h })) : [],
  jsonPatches: rule.jsonPatches ? rule.jsonPatches.map(p => ({ ...p })) : [],
  delayMs: rule.delayMs || 0,
  simulateNetworkError: !!rule.simulateNetworkError,
});

export const applyScenarioToRule = (rule: MockRule, scenario: MockScenario): MockRule => ({
  ...rule,
  activeScenarioId: scenario.id,
  mode: scenario.mode,
  replaceStatus: scenario.replaceStatus ?? rule.replaceStatus,
  replaceContentType: scenario.replaceContentType ?? rule.replaceContentType,
  replaceBody: scenario.replaceBody ?? rule.replaceBody,
  replaceHeaders: scenario.replaceHeaders ? scenario.replaceHeaders.map(h => ({ ...h })) : [],
  jsonPatches: scenario.jsonPatches ? scenario.jsonPatches.map(p => ({ ...p })) : [],
  delayMs: scenario.delayMs ?? 0,
  simulateNetworkError: !!scenario.simulateNetworkError,
});

// ============== Storage helpers ==============

export const MOCK_RULES_KEY = 'mockRules';
export const MOCK_GLOBAL_ENABLED_KEY = 'mockGlobalEnabled';

// Global request headers (Header tab in popup).
export const GLOBAL_HEADERS_KEY = 'globalHeaders';
export const GLOBAL_HEADERS_ENABLED_KEY = 'globalHeadersEnabled';
export const GLOBAL_HEADERS_URL_FILTER_KEY = 'globalHeadersUrlFilter';
export const HEADER_PROFILES_KEY = 'headerProfiles';
export const ACTIVE_HEADER_PROFILE_ID_KEY = 'activeHeaderProfileId';
export const CORS_BYPASS_ENABLED_KEY = 'corsBypassEnabled';
export const CORS_BYPASS_URL_FILTER_KEY = 'corsBypassUrlFilter';
