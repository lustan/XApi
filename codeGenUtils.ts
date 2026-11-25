import { HttpRequest } from './types';

const buildBodySnippet = (req: HttpRequest): { hasBody: boolean; bodyExpr: string; extraContentType?: string } => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return { hasBody: false, bodyExpr: '' };
  }
  if (req.bodyType === 'graphql') {
    let vars: any = {};
    if (req.graphqlVariables?.trim()) {
      try {
        vars = JSON.parse(req.graphqlVariables);
      } catch {
        vars = req.graphqlVariables;
      }
    }
    const payload = JSON.stringify({ query: req.graphqlQuery || '', variables: vars }, null, 2);
    return { hasBody: true, bodyExpr: `JSON.stringify(${payload})`, extraContentType: 'application/json' };
  }
  if (req.bodyType === 'raw' && req.bodyRaw) {
    if ((req.bodyRawType || 'json') === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(req.bodyRaw), null, 2);
        return { hasBody: true, bodyExpr: `JSON.stringify(${formatted})`, extraContentType: 'application/json' };
      } catch {
        // Fallback to raw string literal
      }
    }
    return { hasBody: true, bodyExpr: JSON.stringify(req.bodyRaw) };
  }
  if (req.bodyType === 'x-www-form-urlencoded') {
    const rows = req.bodyForm.filter((f) => f.enabled && f.key);
    const obj: Record<string, string> = {};
    rows.forEach((f) => { obj[f.key] = f.value; });
    return {
      hasBody: true,
      bodyExpr: `new URLSearchParams(${JSON.stringify(obj, null, 2)})`,
      extraContentType: 'application/x-www-form-urlencoded',
    };
  }
  if (req.bodyType === 'form-data') {
    return {
      hasBody: true,
      bodyExpr: `formData /* populate FormData fields */`,
    };
  }
  return { hasBody: false, bodyExpr: '' };
};

export const generateFetchCode = (req: HttpRequest): string => {
  const headersObj: Record<string, string> = {};
  req.headers
    .filter((h) => h.enabled && h.key.trim())
    .forEach((h) => {
      headersObj[h.key.trim()] = h.value;
    });

  const { hasBody, bodyExpr, extraContentType } = buildBodySnippet(req);
  if (extraContentType && !Object.keys(headersObj).some((k) => k.toLowerCase() === 'content-type')) {
    headersObj['Content-Type'] = extraContentType;
  }

  const lines: string[] = [];
  if (req.bodyType === 'form-data' && hasBody) {
    lines.push('const formData = new FormData();');
    req.bodyForm
      .filter((f) => f.enabled && f.key)
      .forEach((f) => {
        lines.push(`formData.append(${JSON.stringify(f.key)}, ${JSON.stringify(f.value)});`);
      });
    lines.push('');
  }

  const opts: string[] = [`  method: ${JSON.stringify(req.method)}`];
  if (Object.keys(headersObj).length > 0) {
    opts.push(`  headers: ${JSON.stringify(headersObj, null, 4).replace(/\n/g, '\n  ')}`);
  }
  if (hasBody) {
    opts.push(`  body: ${bodyExpr.replace(/\n/g, '\n  ')}`);
  }

  lines.push(`const response = await fetch(${JSON.stringify(req.url || '')}, {`);
  lines.push(opts.join(',\n'));
  lines.push('});');
  lines.push('const data = await response.json();');
  lines.push('console.log(data);');
  return lines.join('\n');
};

export const generateAxiosCode = (req: HttpRequest): string => {
  const headersObj: Record<string, string> = {};
  req.headers
    .filter((h) => h.enabled && h.key.trim())
    .forEach((h) => {
      headersObj[h.key.trim()] = h.value;
    });

  let dataStr: string | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.bodyType === 'graphql') {
      let vars: any = {};
      if (req.graphqlVariables?.trim()) {
        try { vars = JSON.parse(req.graphqlVariables); } catch { vars = req.graphqlVariables; }
      }
      dataStr = JSON.stringify({ query: req.graphqlQuery || '', variables: vars }, null, 4);
    } else if (req.bodyType === 'raw' && req.bodyRaw) {
      try {
        dataStr = JSON.stringify(JSON.parse(req.bodyRaw), null, 4);
      } catch {
        dataStr = JSON.stringify(req.bodyRaw);
      }
    } else if (req.bodyType === 'x-www-form-urlencoded' || req.bodyType === 'form-data') {
      const obj: Record<string, string> = {};
      req.bodyForm.filter((f) => f.enabled && f.key).forEach((f) => { obj[f.key] = f.value; });
      dataStr = JSON.stringify(obj, null, 4);
    }
  }

  const configParts: string[] = [
    `  method: ${JSON.stringify(req.method.toLowerCase())}`,
    `  url: ${JSON.stringify(req.url || '')}`,
  ];
  if (Object.keys(headersObj).length > 0) {
    configParts.push(`  headers: ${JSON.stringify(headersObj, null, 4).replace(/\n/g, '\n  ')}`);
  }
  if (dataStr !== null) {
    configParts.push(`  data: ${dataStr.replace(/\n/g, '\n  ')}`);
  }

  return [
    `import axios from 'axios';`,
    ``,
    `const { data } = await axios({`,
    configParts.join(',\n'),
    `});`,
    `console.log(data);`,
  ].join('\n');
};

const toPascalCase = (name: string): string => {
  const cleaned = name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  if (!cleaned) return 'Item';
  return /^[0-9]/.test(cleaned) ? `T${cleaned}` : cleaned;
};

const formatPropKey = (key: string): string => {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
};

export const jsonToTypeScript = (jsonInput: string | any, rootName = 'ApiResponse'): string => {
  let parsed = jsonInput;
  if (typeof jsonInput === 'string') {
    parsed = JSON.parse(jsonInput);
  }

  const interfaces = new Map<string, string>();
  const usedNames = new Set<string>();

  const reserveName = (hint: string): string => {
    const base = toPascalCase(hint);
    if (!usedNames.has(base)) {
      usedNames.add(base);
      return base;
    }
    let idx = 2;
    while (usedNames.has(`${base}${idx}`)) idx++;
    const unique = `${base}${idx}`;
    usedNames.add(unique);
    return unique;
  };

  const inferType = (val: any, hint: string): string => {
    if (val === null) return 'null';
    if (val === undefined) return 'unknown';
    if (typeof val === 'string') return 'string';
    if (typeof val === 'number') return 'number';
    if (typeof val === 'boolean') return 'boolean';

    if (Array.isArray(val)) {
      if (val.length === 0) return 'unknown[]';
      const itemHint = hint.endsWith('s') && hint.length > 1 ? hint.slice(0, -1) : `${hint}Item`;
      const allObjects = val.every((item) => item && typeof item === 'object' && !Array.isArray(item));
      if (allObjects && val.length > 1) {
        // Merge keys across sample array elements and mark partially-present keys optional
        const keyMap = new Map<string, { values: any[]; count: number }>();
        for (const item of val) {
          for (const [k, v] of Object.entries(item)) {
            const entry = keyMap.get(k) || { values: [], count: 0 };
            entry.values.push(v);
            entry.count++;
            keyMap.set(k, entry);
          }
        }
        const ifaceName = reserveName(itemHint);
        const lines: string[] = [`export interface ${ifaceName} {`];
        keyMap.forEach((info, k) => {
          const opt = info.count < val.length ? '?' : '';
          const types = Array.from(new Set(info.values.map((v) => inferType(v, `${ifaceName}_${k}`))));
          lines.push(`  ${formatPropKey(k)}${opt}: ${types.join(' | ')};`);
        });
        lines.push('}');
        interfaces.set(ifaceName, lines.join('\n'));
        return `${ifaceName}[]`;
      }
      const elementTypes = Array.from(new Set(val.map((item) => inferType(item, itemHint))));
      const union = elementTypes.length > 1 ? `(${elementTypes.join(' | ')})` : elementTypes[0];
      return `${union}[]`;
    }

    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return 'Record<string, unknown>';
      const ifaceName = reserveName(hint);
      const lines: string[] = [`export interface ${ifaceName} {`];
      for (const k of keys) {
        const propType = inferType(val[k], k);
        lines.push(`  ${formatPropKey(k)}: ${propType};`);
      }
      lines.push('}');
      interfaces.set(ifaceName, lines.join('\n'));
      return ifaceName;
    }

    return 'unknown';
  };

  const rootType = inferType(parsed, rootName);
  const blocks = Array.from(interfaces.values());
  if (!interfaces.has(toPascalCase(rootName))) {
    blocks.unshift(`export type ${toPascalCase(rootName)} = ${rootType};`);
  }
  return blocks.join('\n\n');
};
