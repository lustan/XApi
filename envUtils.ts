import { EnvironmentItem, EnvironmentVariable, ExtractRule, HttpRequest } from './types';
import { generateId } from './utils';

export const ENVIRONMENTS_KEY = 'environments';
export const ACTIVE_ENV_ID_KEY = 'activeEnvironmentId';

const makeUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const createEnvironment = (name = 'New Environment'): EnvironmentItem => ({
  id: generateId(),
  name,
  variables: [{ id: generateId(), key: 'baseUrl', value: '', enabled: true }],
});

export const createExtractRule = (): ExtractRule => ({
  id: generateId(),
  source: 'body',
  path: '',
  variableName: '',
  enabled: true,
});

export const getActiveEnvironment = (
  environments: EnvironmentItem[],
  activeEnvironmentId: string | null
): EnvironmentItem | null => {
  if (!activeEnvironmentId) return null;
  return environments.find((env) => env.id === activeEnvironmentId) || null;
};

export const buildVariableMap = (variables: EnvironmentVariable[]): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const v of variables) {
    if (v.enabled && v.key.trim()) {
      map[v.key.trim()] = v.value ?? '';
    }
  }
  return map;
};

export const interpolateTemplate = (
  input: string,
  vars: Record<string, string>
): string => {
  if (!input || typeof input !== 'string' || !input.includes('{{')) return input;
  return input.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (key === '$timestamp' || key === 'timestamp' || key === 'now') {
      return String(Date.now());
    }
    if (key === '$isoTimestamp' || key === 'isoDate') {
      return new Date().toISOString();
    }
    if (key === '$uuid' || key === 'uuid') {
      return makeUuid();
    }
    if (key === '$randomInt') {
      return String(Math.floor(Math.random() * 10000));
    }
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    return match;
  });
};

export const interpolateRequest = (
  request: HttpRequest,
  variables: EnvironmentVariable[]
): HttpRequest => {
  const vars = buildVariableMap(variables);
  return {
    ...request,
    url: interpolateTemplate(request.url, vars),
    params: request.params.map((p) => ({
      ...p,
      key: interpolateTemplate(p.key, vars),
      value: interpolateTemplate(p.value, vars),
    })),
    headers: request.headers.map((h) => ({
      ...h,
      key: interpolateTemplate(h.key, vars),
      value: interpolateTemplate(h.value, vars),
    })),
    bodyRaw: interpolateTemplate(request.bodyRaw, vars),
    bodyForm: request.bodyForm.map((f) => ({
      ...f,
      key: interpolateTemplate(f.key, vars),
      value: f.type === 'file' ? f.value : interpolateTemplate(f.value, vars),
    })),
    graphqlQuery: request.graphqlQuery ? interpolateTemplate(request.graphqlQuery, vars) : request.graphqlQuery,
    graphqlVariables: request.graphqlVariables ? interpolateTemplate(request.graphqlVariables, vars) : request.graphqlVariables,
  };
};

interface PathSeg {
  type: 'key' | 'index';
  value: string | number;
}

const parsePath = (path: string): PathSeg[] => {
  const segs: PathSeg[] = [];
  const parts = path.split('.').filter((p) => p !== '');
  for (const part of parts) {
    const m = part.match(/^([^\[\]]*)((?:\[\d+\])*)$/);
    if (!m) {
      segs.push({ type: 'key', value: part });
      continue;
    }
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

export const extractValueByPath = (data: any, path: string): unknown => {
  if (!path || data == null) return undefined;
  const segs = parsePath(path.trim());
  let cur = data;
  for (const seg of segs) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (seg.type === 'index' && Array.isArray(cur)) {
      cur = cur[seg.value as number];
    } else if (seg.type === 'key' && !Array.isArray(cur)) {
      cur = cur[seg.value as string];
    } else {
      return undefined;
    }
  }
  return cur;
};

const stringifyExtracted = (val: unknown): string => {
  if (val === undefined) return '';
  if (val === null) return 'null';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
};

export const applyExtractRules = (
  responseBody: string,
  responseHeaders: Record<string, string>,
  rules: ExtractRule[] | undefined,
  existingVariables: EnvironmentVariable[]
): { variables: EnvironmentVariable[]; extractedCount: number } => {
  if (!rules || rules.length === 0) {
    return { variables: existingVariables, extractedCount: 0 };
  }

  let parsedBody: any = null;
  let bodyParsed = false;
  const getParsedBody = () => {
    if (bodyParsed) return parsedBody;
    bodyParsed = true;
    try {
      parsedBody = JSON.parse(responseBody);
    } catch {
      parsedBody = null;
    }
    return parsedBody;
  };

  const lowerHeaders: Record<string, string> = {};
  Object.entries(responseHeaders || {}).forEach(([k, v]) => {
    lowerHeaders[k.toLowerCase()] = v;
  });

  const nextVars = [...existingVariables];
  let extractedCount = 0;

  for (const rule of rules) {
    if (!rule.enabled || !rule.path.trim() || !rule.variableName.trim()) continue;
    let rawVal: unknown;
    if (rule.source === 'header') {
      rawVal = lowerHeaders[rule.path.trim().toLowerCase()];
    } else {
      const json = getParsedBody();
      if (json !== null) {
        rawVal = extractValueByPath(json, rule.path);
      }
    }
    if (rawVal === undefined) continue;

    const strVal = stringifyExtracted(rawVal);
    const varName = rule.variableName.trim();
    const existingIdx = nextVars.findIndex((v) => v.key.trim() === varName);
    if (existingIdx !== -1) {
      nextVars[existingIdx] = { ...nextVars[existingIdx], value: strVal, enabled: true };
    } else {
      nextVars.push({ id: generateId(), key: varName, value: strVal, enabled: true });
    }
    extractedCount++;
  }

  return { variables: nextVars, extractedCount };
};
