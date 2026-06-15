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
 * shadows page globals. Rollup minifies our local consts to single-letter
 * names (`$`, `f`, `y`, ...), which would shadow jQuery's `$` and break
 * every legacy site that does `$.extend(...)`. Wrapping the runtime in
 * an IIFE keeps every binding scoped to this function. Do NOT remove.
 */

type RuleMatchMode = 'startsWith';
type MockMode = 'replace' | 'patch-json';

interface JsonPatch {
  id: string;
  path: string;
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
  mode: MockMode;
  replaceStatus?: number;
  replaceContentType?: string;
  replaceBody?: string;
  jsonPatches?: JsonPatch[];
}

interface State {
  enabled: boolean;
  rules: MockRule[];
}

(() => {

const TAG = '[XApi-Mock]';
const MSG_TAG = 'xapi-mock';
const state: State = { enabled: true, rules: [] };

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

// Forward a captured JSON response body to the bridge → background, so the
// recorded log entry can be augmented. Best-effort and bounded; failures here
// must never affect the underlying request.
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

// ----- match ------
const matchUrl = (url: string, pattern: string, _mode: RuleMatchMode): boolean => {
  if (!pattern) return false;
  return url.startsWith(pattern);
};

const matchRule = (url: string, method: string): MockRule | undefined => {
  if (!state.enabled) return undefined;
  const m = (method || 'GET').toUpperCase();
  for (const r of state.rules) {
    if (!r.enabled) continue;
    if (r.method && r.method !== 'ANY' && r.method !== m) continue;
    if (matchUrl(url, r.urlPattern, r.matchMode)) return r;
  }
  return undefined;
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
const buildReplaceResponse = (rule: MockRule): Response => {
  const body = rule.replaceBody ?? '';
  const status = rule.replaceStatus && rule.replaceStatus > 0 ? rule.replaceStatus : 200;
  const ct = rule.replaceContentType || 'application/json';
  return new Response(body, {
    status,
    statusText: 'OK',
    headers: { 'content-type': ct, 'x-xapi-mock': rule.id }
  });
};

// ----- fetch patch -----
const _fetch = window.fetch;
window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let url = '';
  let method = (init?.method || 'GET').toUpperCase();
  try {
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.href;
    else if (input && typeof (input as Request).url === 'string') {
      url = (input as Request).url;
      if (!init?.method && (input as Request).method) method = (input as Request).method.toUpperCase();
    }
  } catch { /* noop */ }

  const rule = url ? matchRule(url, method) : undefined;
  if (!rule) {
    // No mock — let the request through, but try to capture JSON response
    // for the recorded log. Cloning is cheap and safe; failures swallowed.
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

  if (rule.mode === 'replace') {
    reportHit(rule.id);
    console.debug(`${TAG} replace`, method, url, '→', rule.name);
    return buildReplaceResponse(rule);
  }

  // patch-json: pass through, then rewrite body if JSON
  const res = await _fetch.call(window, input as any, init);
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('json')) return res;
  let data: any;
  try { data = await res.clone().json(); } catch { return res; }
  if (data == null || typeof data !== 'object') return res;
  // Report the ORIGINAL response body before applying patches.
  try { reportResponse(url, method, res.status, ct, JSON.stringify(data)); } catch { /* noop */ }
  const n = applyJsonPatches(data, rule.jsonPatches);
  if (n === 0) return res;
  reportHit(rule.id);
  console.debug(`${TAG} patch-json`, method, url, '→', rule.name, `(${n} fields)`);
  const newHeaders = new Headers(res.headers);
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
    url: u,
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

const fakeXhrResponse = (xhr: XMLHttpRequest, rule: MockRule, body: string, status: number, contentType: string) => {
  // Override read-only properties
  const def = (key: string, val: any) => {
    try { Object.defineProperty(xhr, key, { configurable: true, get: () => val }); } catch { /* noop */ }
  };
  def('readyState', 4);
  def('status', status);
  def('statusText', 'OK');
  def('responseText', body);
  def('response', body);
  def('responseURL', META.get(xhr)?.url || '');
  def('responseType', xhr.responseType || '');
  def('getAllResponseHeaders', () => `content-type: ${contentType}\r\nx-xapi-mock: ${rule.id}\r\n`);
  def('getResponseHeader', (name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'content-type') return contentType;
    if (lower === 'x-xapi-mock') return rule.id;
    return null;
  });

  // Fire events asynchronously to mimic real network
  const fire = (type: string) => {
    try {
      const ev = new ProgressEvent(type, { lengthComputable: false, loaded: body.length, total: body.length });
      xhr.dispatchEvent(ev);
    } catch { /* noop */ }
  };
  setTimeout(() => {
    try { xhr.onreadystatechange && xhr.onreadystatechange(new Event('readystatechange') as any); } catch { /* noop */ }
    fire('readystatechange');
    fire('load');
    fire('loadend');
  }, 0);
};

XHR.prototype.send = function (this: XMLHttpRequest, body?: any) {
  const meta = META.get(this);
  const rule = meta ? matchRule(meta.url, meta.method) : undefined;
  if (!rule) {
    // No mock — attach a capture-only listener so we can ship the JSON
    // response body to the recorded log. addEventListener composes with
    // whatever the caller later sets on .onreadystatechange / .onload.
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

  if (rule.mode === 'replace') {
    reportHit(rule.id);
    console.debug(`${TAG} replace(xhr)`, meta!.method, meta!.url, '→', rule.name);
    fakeXhrResponse(
      this,
      rule,
      rule.replaceBody ?? '',
      rule.replaceStatus && rule.replaceStatus > 0 ? rule.replaceStatus : 200,
      rule.replaceContentType || 'application/json'
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
    let raw: string | null = null;
    try { raw = typeof xhr.responseText === 'string' ? xhr.responseText : null; } catch { raw = null; }
    if (raw == null) return;
    // Forward the ORIGINAL (pre-patch) body for the recorded log.
    try { reportResponse(meta!.url, meta!.method, xhr.status, ct, raw); } catch { /* noop */ }
    let data: any;
    try { data = JSON.parse(raw); } catch { return; }
    if (data == null || typeof data !== 'object') return;
    const n = applyJsonPatches(data, rule.jsonPatches);
    if (n === 0) return;
    const newBody = JSON.stringify(data);
    try {
      Object.defineProperty(xhr, 'responseText', { configurable: true, get: () => newBody });
      Object.defineProperty(xhr, 'response', { configurable: true, get: () => newBody });
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

  return origSend.call(this, body);
};

console.debug(`${TAG} injector ready`);

})();
