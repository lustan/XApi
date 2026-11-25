/**
 * XApi mock-injector — runs in the page MAIN world to monkey-patch
 * window.fetch and XMLHttpRequest, applying user-defined mock rules.
 *
 * It receives rules via window.postMessage from mock-bridge.ts (the
 * content script). It cannot use chrome.* APIs.
 *
 * IMPORTANT — IIFE wrapping is mandatory:
 * Chrome injects this file as a CLASSIC script in the page's MAIN world,
 * so any top-level `const`/`let` becomes a global lexical binding that
 * shadows page globals. Wrapping the runtime in an IIFE keeps every binding
 * scoped to this function. Do NOT remove.
 */

type RuleMatchMode = 'startsWith' | 'exact' | 'wildcard' | 'regex';
type MockMode = 'replace' | 'patch-json';

interface JsonPatch {
  id: string;
  path: string;
  value: string;
  enabled: boolean;
}

interface MockResponseHeader {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface MockRule {
  id: string;
  name: string;
  enabled: boolean;
  urlPattern: string;
  matchMode: RuleMatchMode;
  method: string;
  queryMatch?: string;
  bodyMatch?: string;
  delayMs?: number;
  simulateNetworkError?: boolean;
  mode: MockMode;
  replaceStatus?: number;
  replaceContentType?: string;
  replaceBody?: string;
  replaceHeaders?: MockResponseHeader[];
  jsonPatches?: JsonPatch[];
}

interface State {
  enabled: boolean;
  rules: MockRule[];
}

(() => {

const TAG = '[XApi-Mock]';
const MSG_TAG = 'xapi-mock';
const state: State = { enabled: false, rules: [] };

// ----- bridge ------
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const data = e.data;
  if (!data || data.source !== MSG_TAG) return;
  if (data.type === 'rules') {
    state.enabled = !!data.enabled;
    state.rules = Array.isArray(data.rules) ? data.rules : [];
  }
});

const reportHit = (ruleId: string) => {
  window.postMessage({ source: MSG_TAG, type: 'hit', ruleId }, '*');
};

const RESP_BODY_LIMIT = 200 * 1024; // 200KB
const reportResponse = (
  url: string,
  method: string,
  status: number,
  contentType: string,
  body: string
) => {
  try {
    let truncated = false;
    let payload = body;
    if (payload.length > RESP_BODY_LIMIT) {
      payload = payload.slice(0, RESP_BODY_LIMIT);
      truncated = true;
    }
    window.postMessage({
      source: MSG_TAG,
      type: 'response',
      url,
      method: (method || 'GET').toUpperCase(),
      status,
      contentType,
      body: payload,
      truncated,
      ts: Date.now()
    }, '*');
  } catch { /* noop */ }
};

const isJsonContentType = (ct: string) => !!ct && ct.toLowerCase().includes('json');

const normalizeUrl = (url: string): string => {
  if (!url) return '';
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ----- match ------
const wildcardToRegex = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
};

const matchUrl = (url: string, pattern: string, mode: RuleMatchMode = 'startsWith'): boolean => {
  if (!pattern || !url) return false;
  switch (mode) {
    case 'exact':
      return url === pattern;
    case 'wildcard':
      try { return wildcardToRegex(pattern).test(url); } catch { return false; }
    case 'regex':
      try { return new RegExp(pattern).test(url); } catch { return false; }
    case 'startsWith':
    default:
      return url.startsWith(pattern);
  }
};

const bodyToString = (body: any): string => {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  try { return JSON.stringify(body); } catch { return ''; }
};

const matchRule = (url: string, method: string, reqBody?: any): MockRule | undefined => {
  if (!state.enabled) return undefined;
  const m = (method || 'GET').toUpperCase();
  const bodyStr = bodyToString(reqBody);
  for (const r of state.rules) {
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

// ----- template variables -----
const readDotPath = (obj: any, path: string): unknown => {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  let cur: any = obj;
  const parts = path.split('.');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
};

const applyTemplate = (body: string, url: string, method: string, reqBody?: any): string => {
  if (!body || !body.includes('{{')) return body;
  let qs: URLSearchParams | null = null;
  const getQs = () => {
    if (qs) return qs;
    try { qs = new URL(url).searchParams; } catch { qs = new URLSearchParams(); }
    return qs;
  };
  let parsedBody: any = null;
  let triedBody = false;
  const getParsedBody = () => {
    if (triedBody) return parsedBody;
    triedBody = true;
    if (reqBody && typeof reqBody === 'object') parsedBody = reqBody;
    else if (typeof reqBody === 'string') {
      try { parsedBody = JSON.parse(reqBody); } catch { parsedBody = null; }
    }
    return parsedBody;
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
    if (key === 'method') return (method || 'GET').toUpperCase();
    if (key === 'url') return url;
    if (key.startsWith('query.')) {
      const val = getQs().get(key.slice(6));
      return val !== null ? val : match;
    }
    if (key.startsWith('body.')) {
      const val = readDotPath(getParsedBody(), key.slice(5));
      if (val === undefined) return match;
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    }
    return match;
  });
};

// ----- json patch -----
const RAW_PREFIX = '::raw::';

const parsePath = (path: string) => {
  const segs: { type: 'key' | 'index'; value: string | number }[] = [];
  const parts = path.split('.').filter(p => p !== '');
  for (const part of parts) {
    const m = part.match(/^([^\[\]]*)((?:\[\d+\])*)$/);
    if (!m) { segs.push({ type: 'key', value: part }); continue; }
    if (m[1]) segs.push({ type: 'key', value: m[1] });
    if (m[2]) {
      const idxRe = /\[(\d+)\]/g;
      let mm: RegExpExecArray | null;
      while ((mm = idxRe.exec(m[2])) !== null) {
        segs.push({ type: 'index', value: parseInt(mm[1], 10) });
      }
    }
  }
  return segs;
};

const interpretValue = (v: string): any => {
  if (v.startsWith(RAW_PREFIX)) {
    const raw = v.slice(RAW_PREFIX.length);
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return v;
};

const applyJsonPatches = (data: any, patches?: JsonPatch[]): number => {
  if (!patches || patches.length === 0) return 0;
  let n = 0;
  for (const p of patches) {
    if (!p.enabled || !p.path) continue;
    const segs = parsePath(p.path);
    if (segs.length === 0) continue;
    let cur: any = data;
    let ok = true;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (cur == null || typeof cur !== 'object') { ok = false; break; }
      if (s.type === 'index' && Array.isArray(cur)) cur = cur[s.value as number];
      else if (s.type === 'key' && !Array.isArray(cur)) cur = cur[s.value as string];
      else { ok = false; break; }
    }
    if (!ok || cur == null || typeof cur !== 'object') continue;
    const last = segs[segs.length - 1];
    const value = interpretValue(p.value);
    if (last.type === 'index' && Array.isArray(cur)) { cur[last.value as number] = value; n++; }
    else if (last.type === 'key' && !Array.isArray(cur)) { cur[last.value as string] = value; n++; }
  }
  return n;
};

// ----- response builders -----
const buildHeadersRecord = (rule: MockRule, ct: string): Record<string, string> => {
  const headers: Record<string, string> = { 'content-type': ct, 'x-xapi-mock': rule.id };
  if (Array.isArray(rule.replaceHeaders)) {
    for (const h of rule.replaceHeaders) {
      if (h && h.enabled && h.key && h.key.trim()) {
        headers[h.key.trim().toLowerCase()] = h.value ?? '';
      }
    }
  }
  return headers;
};

const buildReplaceResponse = (rule: MockRule, url: string, method: string, reqBody?: any): Response => {
  const body = applyTemplate(rule.replaceBody ?? '', url, method, reqBody);
  const status = rule.replaceStatus && rule.replaceStatus > 0 ? rule.replaceStatus : 200;
  const ct = rule.replaceContentType || 'application/json';
  return new Response(body, {
    status,
    statusText: 'OK',
    headers: buildHeadersRecord(rule, ct)
  });
};

// ----- fetch patch -----
const _fetch = window.fetch;
window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let url = '';
  let method = (init?.method || 'GET').toUpperCase();
  const reqBody = init?.body;
  try {
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.href;
    else if (input && typeof (input as Request).url === 'string') {
      url = (input as Request).url;
      if (!init?.method && (input as Request).method) method = (input as Request).method.toUpperCase();
    }
  } catch { /* noop */ }

  url = normalizeUrl(url);
  const rule = url ? matchRule(url, method, reqBody) : undefined;
  if (!rule) {
    const res = await _fetch.call(window, input as any, init);
    try {
      const ct = res.headers.get('content-type') || '';
      if (isJsonContentType(ct)) {
        res.clone().text().then(body => {
          reportResponse(url, method, res.status, ct, body);
        }).catch(() => { /* noop */ });
      }
    } catch { /* noop */ }
    return res;
  }

  if (rule.delayMs && rule.delayMs > 0) {
    await sleep(rule.delayMs);
  }

  if (rule.simulateNetworkError) {
    reportHit(rule.id);
    console.debug(`${TAG} network-error`, method, url, '→', rule.name);
    throw new TypeError('Failed to fetch (simulated by XApi Mock)');
  }

  if (rule.mode === 'replace') {
    reportHit(rule.id);
    console.debug(`${TAG} replace`, method, url, '→', rule.name);
    return buildReplaceResponse(rule, url, method, reqBody);
  }

  // patch-json: pass through, then rewrite body if JSON
  const res = await _fetch.call(window, input as any, init);
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('json')) return res;
  let data: any;
  try { data = await res.clone().json(); } catch { return res; }
  if (data == null || typeof data !== 'object') return res;
  try { reportResponse(url, method, res.status, ct, JSON.stringify(data)); } catch { /* noop */ }
  const n = applyJsonPatches(data, rule.jsonPatches);
  if (n === 0) return res;
  reportHit(rule.id);
  console.debug(`${TAG} patch-json`, method, url, '→', rule.name, `(${n} fields)`);
  const newHeaders = new Headers(res.headers);
  newHeaders.delete('content-length');
  newHeaders.delete('content-encoding');
  newHeaders.set('x-xapi-mock', rule.id);
  return new Response(JSON.stringify(data), {
    status: res.status,
    statusText: res.statusText,
    headers: newHeaders
  });
};

// ----- XHR patch -----
const XHR = XMLHttpRequest;
const origOpen = XHR.prototype.open;
const origSend = XHR.prototype.send;
const origSetRequestHeader = XHR.prototype.setRequestHeader;

interface XhrMeta {
  url: string;
  method: string;
  async: boolean;
  reqHeaders: [string, string][];
}
const META = new WeakMap<XMLHttpRequest, XhrMeta>();

XHR.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  async: boolean = true,
  user?: string | null,
  pass?: string | null
) {
  const u = typeof url === 'string' ? url : url.href;
  META.set(this, {
    method: (method || 'GET').toUpperCase(),
    url: normalizeUrl(u),
    async: async !== false,
    reqHeaders: []
  });
  return origOpen.call(this, method, u, async !== false, user, pass);
};

XHR.prototype.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
  const m = META.get(this);
  if (m) m.reqHeaders.push([name, value]);
  return origSetRequestHeader.call(this, name, value);
};

const fakeXhrError = (xhr: XMLHttpRequest, delay: number) => {
  const def = (key: string, val: any) => {
    try { Object.defineProperty(xhr, key, { configurable: true, get: () => val }); } catch { /* noop */ }
  };
  def('readyState', 4);
  def('status', 0);
  def('statusText', '');
  def('responseText', '');
  def('response', '');
  def('responseURL', META.get(xhr)?.url || '');
  const fire = (type: string) => {
    try {
      const ev = type === 'readystatechange'
        ? new Event('readystatechange')
        : new ProgressEvent(type, { lengthComputable: false, loaded: 0, total: 0 });
      if (typeof xhr.dispatchEvent === 'function') xhr.dispatchEvent(ev);
      else if (type === 'readystatechange' && xhr.onreadystatechange) xhr.onreadystatechange(ev as any);
      else if (type === 'error' && xhr.onerror) xhr.onerror(ev as any);
    } catch { /* noop */ }
  };
  setTimeout(() => {
    fire('readystatechange');
    fire('error');
    fire('loadend');
  }, delay);
};

const fakeXhrResponse = (
  xhr: XMLHttpRequest,
  rule: MockRule,
  body: string,
  status: number,
  contentType: string,
  delay: number
) => {
  const respType = xhr.responseType || '';
  let parsedResponse: any = body;
  if (respType === 'json') {
    try { parsedResponse = JSON.parse(body); } catch { parsedResponse = null; }
  }
  const headersMap = buildHeadersRecord(rule, contentType);
  const rawHeadersStr = Object.entries(headersMap).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n';

  const def = (key: string, val: any) => {
    try { Object.defineProperty(xhr, key, { configurable: true, get: () => val }); } catch { /* noop */ }
  };
  def('readyState', 4);
  def('status', status);
  def('statusText', 'OK');
  def('responseText', body);
  def('response', parsedResponse);
  def('responseURL', META.get(xhr)?.url || '');
  def('responseType', respType);
  def('getAllResponseHeaders', () => rawHeadersStr);
  def('getResponseHeader', (name: string) => {
    const lower = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(headersMap, lower) ? headersMap[lower] : null;
  });

  const fire = (type: string) => {
    try {
      const ev = type === 'readystatechange'
        ? new Event('readystatechange')
        : new ProgressEvent(type, { lengthComputable: false, loaded: body.length, total: body.length });
      if (typeof xhr.dispatchEvent === 'function') {
        xhr.dispatchEvent(ev);
      } else if (type === 'readystatechange' && xhr.onreadystatechange) {
        xhr.onreadystatechange(ev as any);
      }
    } catch { /* noop */ }
  };
  setTimeout(() => {
    fire('readystatechange');
    fire('load');
    fire('loadend');
  }, delay);
};

XHR.prototype.send = function (this: XMLHttpRequest, body?: any) {
  const meta = META.get(this);
  const rule = meta ? matchRule(meta.url, meta.method, body) : undefined;
  if (!rule) {
    if (meta) {
      const xhr = this;
      let captured = false;
      const captureOnce = () => {
        if (captured) return;
        if (xhr.readyState !== 4) return;
        captured = true;
        try {
          const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
          if (!ct.includes('json')) return;
          const raw = typeof xhr.responseText === 'string' ? xhr.responseText : '';
          if (!raw) return;
          reportResponse(meta.url, meta.method, xhr.status, ct, raw);
        } catch { /* noop */ }
      };
      try {
        xhr.addEventListener('readystatechange', captureOnce);
        xhr.addEventListener('load', captureOnce);
      } catch { /* noop */ }
    }
    return origSend.call(this, body);
  }

  const delay = rule.delayMs && rule.delayMs > 0 ? rule.delayMs : 0;

  if (rule.simulateNetworkError) {
    reportHit(rule.id);
    console.debug(`${TAG} network-error(xhr)`, meta!.method, meta!.url, '→', rule.name);
    fakeXhrError(this, delay);
    return;
  }

  if (rule.mode === 'replace') {
    reportHit(rule.id);
    console.debug(`${TAG} replace(xhr)`, meta!.method, meta!.url, '→', rule.name);
    const renderedBody = applyTemplate(rule.replaceBody ?? '', meta!.url, meta!.method, body);
    fakeXhrResponse(
      this,
      rule,
      renderedBody,
      rule.replaceStatus && rule.replaceStatus > 0 ? rule.replaceStatus : 200,
      rule.replaceContentType || 'application/json',
      delay
    );
    return;
  }

  // patch-json: let the request go, then mutate response on load
  const xhr = this;
  const origOnReadyStateChange = xhr.onreadystatechange;
  const origOnLoad = xhr.onload;
  let patched = false;

  const tryPatch = () => {
    if (patched) return;
    if (xhr.readyState !== 4) return;
    patched = true;
    const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
    if (!ct.includes('json')) return;
    const isJsonRespType = xhr.responseType === 'json';
    let raw: string | null = null;
    let data: any = null;
    if (isJsonRespType) {
      try {
        const origObj = xhr.response;
        if (origObj == null || typeof origObj !== 'object') return;
        raw = JSON.stringify(origObj);
        data = JSON.parse(raw);
      } catch { return; }
    } else {
      try { raw = typeof xhr.responseText === 'string' ? xhr.responseText : null; } catch { raw = null; }
      if (raw == null) return;
      try { data = JSON.parse(raw); } catch { return; }
    }
    if (raw == null || data == null || typeof data !== 'object') return;
    try { reportResponse(meta!.url, meta!.method, xhr.status, ct, raw); } catch { /* noop */ }
    const n = applyJsonPatches(data, rule.jsonPatches);
    if (n === 0) return;
    const newBody = JSON.stringify(data);
    try {
      if (!isJsonRespType) {
        Object.defineProperty(xhr, 'responseText', { configurable: true, get: () => newBody });
      }
      Object.defineProperty(xhr, 'response', { configurable: true, get: () => (isJsonRespType ? data : newBody) });
    } catch { /* noop */ }
    reportHit(rule.id);
    console.debug(`${TAG} patch-json(xhr)`, meta!.method, meta!.url, '→', rule.name, `(${n} fields)`);
  };

  xhr.onreadystatechange = function (this: XMLHttpRequest, ev: Event) {
    if (xhr.readyState === 4) tryPatch();
    if (origOnReadyStateChange) return origOnReadyStateChange.call(this, ev);
  };
  xhr.onload = function (this: XMLHttpRequest, ev: ProgressEvent) {
    tryPatch();
    if (origOnLoad) return origOnLoad.call(this, ev);
  };
  try {
    xhr.addEventListener('readystatechange', () => { if (xhr.readyState === 4) tryPatch(); });
    xhr.addEventListener('load', tryPatch);
  } catch { /* noop */ }

  if (delay > 0) {
    setTimeout(() => origSend.call(xhr, body), delay);
    return;
  }
  return origSend.call(this, body);
};

window.postMessage({ source: MSG_TAG, type: 'request-rules' }, '*');
console.debug(`${TAG} injector ready`);

})();
