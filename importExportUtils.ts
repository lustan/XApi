import {
  CollectionItem,
  EnvironmentItem,
  HeaderProfile,
  HttpMethod,
  HttpRequest,
  KeyValue,
  MockRule,
} from './types';
import { createMockRule } from './mockUtils';
import { generateId, queryStringToParams } from './utils';

export interface XApiWorkspacePayload {
  xapiVersion: string;
  exportedAt: number;
  kind: 'workspace' | 'collections' | 'mock-rules';
  collections?: CollectionItem[];
  rootRequests?: HttpRequest[];
  mockRules?: MockRule[];
  environments?: EnvironmentItem[];
  headerProfiles?: HeaderProfile[];
}

export const buildWorkspaceExport = (data: {
  collections: CollectionItem[];
  rootRequests: HttpRequest[];
  mockRules: MockRule[];
  environments: EnvironmentItem[];
  headerProfiles?: HeaderProfile[];
}): XApiWorkspacePayload => ({
  xapiVersion: '3.1.8',
  exportedAt: Date.now(),
  kind: 'workspace',
  ...data,
});

export const buildMockRulesExport = (mockRules: MockRule[]): XApiWorkspacePayload => ({
  xapiVersion: '3.1.8',
  exportedAt: Date.now(),
  kind: 'mock-rules',
  mockRules,
});

export const extractGraphqlOperationName = (body: any): string | undefined => {
  if (!body) return undefined;
  let obj = body;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed.startsWith('{')) return undefined;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object') return undefined;
  if (typeof obj.operationName === 'string' && obj.operationName.trim()) {
    return obj.operationName.trim();
  }
  if (typeof obj.query === 'string') {
    const m = obj.query.match(/\b(?:query|mutation|subscription)\s+([A-Za-z0-9_]+)/);
    if (m && m[1]) return m[1];
  }
  return undefined;
};

// ============== Postman Collection v2.x Parser ==============

const VALID_METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

const normalizeMethod = (m?: string): HttpMethod => {
  const upper = (m || 'GET').toUpperCase() as HttpMethod;
  return VALID_METHODS.has(upper) ? upper : 'GET';
};

const convertPostmanUrl = (rawUrl: any): { url: string; params: KeyValue[] } => {
  if (typeof rawUrl === 'string') {
    return { url: rawUrl, params: queryStringToParams(rawUrl.split('?')[1] || '') };
  }
  if (rawUrl && typeof rawUrl === 'object') {
    if (typeof rawUrl.raw === 'string' && rawUrl.raw) {
      const qs = rawUrl.raw.split('?')[1] || '';
      const params: KeyValue[] = Array.isArray(rawUrl.query)
        ? rawUrl.query.map((q: any) => ({
            id: generateId(),
            key: String(q.key || ''),
            value: String(q.value || ''),
            enabled: q.disabled !== true,
          }))
        : queryStringToParams(qs);
      return { url: rawUrl.raw, params };
    }
    const host = Array.isArray(rawUrl.host) ? rawUrl.host.join('.') : String(rawUrl.host || '');
    const path = Array.isArray(rawUrl.path) ? `/${rawUrl.path.join('/')}` : String(rawUrl.path || '');
    const proto = rawUrl.protocol ? `${rawUrl.protocol}://` : (host ? 'https://' : '');
    const params: KeyValue[] = Array.isArray(rawUrl.query)
      ? rawUrl.query.map((q: any) => ({
          id: generateId(),
          key: String(q.key || ''),
          value: String(q.value || ''),
          enabled: q.disabled !== true,
        }))
      : [];
    return { url: `${proto}${host}${path}`, params };
  }
  return { url: '', params: [] };
};

const convertPostmanItemToRequest = (item: any, collectionId: string): HttpRequest => {
  const reqObj = item.request || {};
  const { url, params } = convertPostmanUrl(reqObj.url);
  const headers: KeyValue[] = Array.isArray(reqObj.header)
    ? reqObj.header.map((h: any) => ({
        id: generateId(),
        key: String(h.key || ''),
        value: String(h.value || ''),
        enabled: h.disabled !== true,
      }))
    : [];

  let bodyType: HttpRequest['bodyType'] = 'none';
  let bodyRaw = '';
  let bodyForm: KeyValue[] = [];
  let graphqlQuery = '';
  let graphqlVariables = '';

  const body = reqObj.body;
  if (body && typeof body === 'object') {
    if (body.mode === 'raw') {
      bodyType = 'raw';
      bodyRaw = String(body.raw || '');
    } else if (body.mode === 'urlencoded' && Array.isArray(body.urlencoded)) {
      bodyType = 'x-www-form-urlencoded';
      bodyForm = body.urlencoded.map((f: any) => ({
        id: generateId(),
        key: String(f.key || ''),
        value: String(f.value || ''),
        enabled: f.disabled !== true,
      }));
    } else if (body.mode === 'formdata' && Array.isArray(body.formdata)) {
      bodyType = 'form-data';
      bodyForm = body.formdata.map((f: any) => ({
        id: generateId(),
        key: String(f.key || ''),
        value: String(f.value || ''),
        enabled: f.disabled !== true,
        type: f.type === 'file' ? 'file' : 'text',
      }));
    } else if (body.mode === 'graphql' && body.graphql) {
      bodyType = 'graphql';
      graphqlQuery = String(body.graphql.query || '');
      graphqlVariables = String(body.graphql.variables || '');
    }
  }

  return {
    id: generateId(),
    collectionId,
    name: String(item.name || url || 'Request'),
    url,
    method: normalizeMethod(reqObj.method),
    headers,
    params,
    bodyType,
    bodyRaw,
    bodyForm,
    bodyRawType: 'json',
    graphqlQuery,
    graphqlVariables,
  };
};

const walkPostmanFolder = (name: string, items: any[]): CollectionItem => {
  const colId = generateId();
  const requests: HttpRequest[] = [];
  const collections: CollectionItem[] = [];
  for (const child of items) {
    if (Array.isArray(child?.item)) {
      collections.push(walkPostmanFolder(String(child.name || 'Folder'), child.item));
    } else if (child?.request) {
      requests.push(convertPostmanItemToRequest(child, colId));
    }
  }
  return {
    id: colId,
    name,
    collapsed: false,
    requests,
    ...(collections.length > 0 ? { collections } : {}),
  };
};

export const parsePostmanCollection = (raw: any): CollectionItem | null => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.item)) return null;
  const colName = String(raw.info?.name || raw.name || 'Imported Postman Collection');
  return walkPostmanFolder(colName, raw.item);
};

// ============== OpenAPI 3.x / Swagger 2.0 Parser ==============

const sampleFromSchema = (schema: any, rootSpec: any, depth = 0): any => {
  if (!schema || depth > 4) return null;
  if (schema.$ref && typeof schema.$ref === 'string') {
    const refPath = schema.$ref.replace(/^#\//, '').split('/');
    let resolved = rootSpec;
    for (const seg of refPath) {
      resolved = resolved?.[seg];
    }
    return sampleFromSchema(resolved, rootSpec, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === 'object' || schema.properties) {
    const obj: Record<string, any> = {};
    Object.entries(schema.properties || {}).forEach(([k, v]: [string, any]) => {
      obj[k] = sampleFromSchema(v, rootSpec, depth + 1);
    });
    return obj;
  }
  if (schema.type === 'array') {
    return [sampleFromSchema(schema.items, rootSpec, depth + 1)];
  }
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'boolean') return true;
  return '';
};

export const parseOpenApiSpec = (spec: any): CollectionItem | null => {
  if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') return null;
  if (!spec.openapi && !spec.swagger) return null;

  let baseUrl = '';
  if (Array.isArray(spec.servers) && spec.servers[0]?.url) {
    baseUrl = String(spec.servers[0].url).replace(/\/$/, '');
  } else if (spec.host) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes[0] ? spec.schemes[0] : 'https';
    const bp = spec.basePath ? String(spec.basePath).replace(/\/$/, '') : '';
    baseUrl = `${scheme}://${spec.host}${bp}`;
  }

  const rootId = generateId();
  const requests: HttpRequest[] = [];
  const tagMap = new Map<string, CollectionItem>();

  const ensureTagCol = (tag: string): CollectionItem => {
    const existing = tagMap.get(tag);
    if (existing) return existing;
    const created: CollectionItem = { id: generateId(), name: tag, collapsed: false, requests: [] };
    tagMap.set(tag, created);
    return created;
  };

  Object.entries(spec.paths).forEach(([pathStr, pathItem]: [string, any]) => {
    if (!pathItem || typeof pathItem !== 'object') return;
    const sharedParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

    Object.entries(pathItem).forEach(([methodKey, op]: [string, any]) => {
      const upper = methodKey.toUpperCase() as HttpMethod;
      if (!VALID_METHODS.has(upper) || !op || typeof op !== 'object') return;

      const allParams = [...sharedParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
      const queryParams: KeyValue[] = [];
      const headers: KeyValue[] = [];
      let bodyType: HttpRequest['bodyType'] = 'none';
      let bodyRaw = '';

      for (const p of allParams) {
        if (p?.in === 'query') {
          queryParams.push({ id: generateId(), key: String(p.name || ''), value: '', enabled: !!p.required });
        } else if (p?.in === 'header') {
          headers.push({ id: generateId(), key: String(p.name || ''), value: '', enabled: !!p.required });
        } else if (p?.in === 'body' && p.schema) {
          bodyType = 'raw';
          bodyRaw = JSON.stringify(sampleFromSchema(p.schema, spec) ?? {}, null, 2);
        }
      }

      const jsonBodySchema = op.requestBody?.content?.['application/json']?.schema;
      if (jsonBodySchema) {
        bodyType = 'raw';
        bodyRaw = JSON.stringify(sampleFromSchema(jsonBodySchema, spec) ?? {}, null, 2);
        if (!headers.some((h) => h.key.toLowerCase() === 'content-type')) {
          headers.push({ id: generateId(), key: 'Content-Type', value: 'application/json', enabled: true });
        }
      }

      const fullUrl = `${baseUrl}${pathStr}`;
      const tag = Array.isArray(op.tags) && op.tags[0] ? String(op.tags[0]) : null;
      const targetCol = tag ? ensureTagCol(tag) : null;

      const req: HttpRequest = {
        id: generateId(),
        collectionId: targetCol ? targetCol.id : rootId,
        name: String(op.summary || op.operationId || `${upper} ${pathStr}`),
        url: fullUrl,
        method: upper,
        headers,
        params: queryParams,
        bodyType,
        bodyRaw,
        bodyForm: [],
        bodyRawType: 'json',
      };

      if (targetCol) targetCol.requests.push(req);
      else requests.push(req);
    });
  });

  const subCols = Array.from(tagMap.values());
  return {
    id: rootId,
    name: String(spec.info?.title || 'Imported API Spec'),
    collapsed: false,
    requests,
    ...(subCols.length > 0 ? { collections: subCols } : {}),
  };
};

// ============== Universal Import Detector ==============

export type ImportParseResult =
  | { kind: 'workspace'; payload: XApiWorkspacePayload }
  | { kind: 'mock-rules'; rules: MockRule[] }
  | { kind: 'collection'; collection: CollectionItem }
  | { kind: 'error'; message: string };

export const parseUniversalImportJson = (rawText: string): ImportParseResult => {
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch (e: any) {
    return { kind: 'error', message: e?.message || 'Invalid JSON' };
  }

  if (parsed && typeof parsed === 'object') {
    if (parsed.kind === 'workspace' || parsed.xapiVersion) {
      if (Array.isArray(parsed.mockRules) && !parsed.collections && !parsed.rootRequests && parsed.kind === 'mock-rules') {
        const rules = parsed.mockRules.map((r: any) => createMockRule({ ...r, id: generateId() }));
        return { kind: 'mock-rules', rules };
      }
      return { kind: 'workspace', payload: parsed as XApiWorkspacePayload };
    }
    if (Array.isArray(parsed)) {
      const looksLikeMock = parsed.every((item) => item && typeof item === 'object' && 'urlPattern' in item);
      if (looksLikeMock) {
        return { kind: 'mock-rules', rules: parsed.map((r) => createMockRule({ ...r, id: generateId() })) };
      }
    }
    const postmanCol = parsePostmanCollection(parsed);
    if (postmanCol) return { kind: 'collection', collection: postmanCol };

    const openApiCol = parseOpenApiSpec(parsed);
    if (openApiCol) return { kind: 'collection', collection: openApiCol };
  }

  return {
    kind: 'error',
    message: 'Unrecognized JSON format. Supports XApi backup, Postman v2.1, and OpenAPI 3.0 / Swagger 2.0.',
  };
};

// ============== Line Diff Helper for Captured Diff Viewer ==============

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
  leftLine?: number;
  rightLine?: number;
}

export const prettyJsonOrRaw = (val: any): string => {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') {
    try {
      return JSON.stringify(JSON.parse(val), null, 2);
    } catch {
      return val;
    }
  }
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
};

export const computeLineDiff = (leftStr: string, rightStr: string): DiffLine[] => {
  const a = leftStr.split('\n');
  const b = rightStr.split('\n');
  // Guard huge inputs against O(N*M) blowup
  if (a.length * b.length > 250000) {
    return [
      ...a.map((text, idx) => ({ type: 'removed' as const, text, leftLine: idx + 1 })),
      ...b.map((text, idx) => ({ type: 'added' as const, text, rightLine: idx + 1 })),
    ];
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i], leftLine: i + 1, rightLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'removed', text: a[i], leftLine: i + 1 });
      i++;
    } else {
      out.push({ type: 'added', text: b[j], rightLine: j + 1 });
      j++;
    }
  }
  while (i < m) {
    out.push({ type: 'removed', text: a[i], leftLine: i + 1 });
    i++;
  }
  while (j < n) {
    out.push({ type: 'added', text: b[j], rightLine: j + 1 });
    j++;
  }
  return out;
};
