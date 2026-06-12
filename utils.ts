
import { KeyValue, HttpRequest, LoggedRequest } from './types';

export const generateId = (): string => Math.random().toString(36).substr(2, 9);

export const getMethodColor = (method?: string): string => {
  const m = method?.toUpperCase() || '';
  switch (m) {
    case 'GET': return 'text-green-600';
    case 'POST': return 'text-yellow-600';
    case 'PUT': return 'text-blue-600';
    case 'DELETE': return 'text-red-600';
    case 'PATCH': return 'text-purple-600';
    case 'OPTIONS': return 'text-indigo-600';
    case 'HEAD': return 'text-teal-600';
    default: return 'text-gray-600';
  }
};

export const getMethodBadgeColor = (method?: string): string => {
    const m = method?.toUpperCase() || '';
    switch (m) {
        case 'GET': return 'bg-green-100 text-green-700';
        case 'POST': return 'bg-yellow-100 text-yellow-700';
        case 'PUT': return 'bg-blue-100 text-blue-700';
        case 'DELETE': return 'bg-red-100 text-red-700';
        case 'PATCH': return 'bg-purple-100 text-purple-700';
        case 'OPTIONS': return 'bg-indigo-100 text-indigo-700';
        case 'HEAD': return 'bg-teal-100 text-teal-700';
        default: return 'bg-gray-100 text-gray-700';
    }
};

const sanitizeForCurl = (str: string): string => {
  if (!str) return '';
  // Only remove null bytes which break shell commands, preserve other chars
  return str.replace(/\x00/g, '');
};

const escapeShellArg = (arg: string): string => {
  return `'${String(arg).replace(/'/g, "'\\''")}'`;
};

const isFormUrlEncodedHeader = (value: string): boolean => {
  return value.split(';', 1)[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';
};

const hasFormUrlEncodedContentType = (headers?: KeyValue[]): boolean => {
  return !!headers?.some(header =>
    header.enabled &&
    header.key.trim().toLowerCase() === 'content-type' &&
    isFormUrlEncodedHeader(header.value)
  );
};

const decodeFormComponent = (value: string): string => {
  return decodeURIComponent(value.replace(/\+/g, ' '));
};

const parseFormUrlEncodedBody = (body: string): KeyValue[] | null => {
  if (!body) return [];

  try {
    return body.split('&').map(pair => {
      const separatorIndex = pair.indexOf('=');
      const rawKey = separatorIndex >= 0 ? pair.slice(0, separatorIndex) : pair;
      const rawValue = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : '';

      return {
        id: generateId(),
        key: decodeFormComponent(rawKey),
        value: decodeFormComponent(rawValue),
        enabled: true
      };
    });
  } catch (e) {
    return null;
  }
};

export const generateCurl = (log: LoggedRequest): string => {
  let curl = `curl -X ${log.method} ${escapeShellArg(sanitizeForCurl(log.url))}`;
  
  if (log.requestHeaders) {
    Object.entries(log.requestHeaders).forEach(([key, value]) => {
      curl += ` \\\n  -H ${escapeShellArg(`${key}: ${value}`)}`;
    });
  }
  
  if (log.requestBody) {
    let body = log.requestBody;
    if (typeof body === 'object') {
      Object.entries(body).forEach(([key, value]) => {
        const val = Array.isArray(value) ? value[0] : value;
        curl += ` \\\n  --form ${escapeShellArg(`${key}=${val}`)}`;
      });
    } else {
      curl += ` \\\n  --data-raw ${escapeShellArg(sanitizeForCurl(String(body)))}`;
    }
  }
  
  return curl;
};

export const generateCurlFromRequest = (req: HttpRequest): string => {
    let curl = `curl -X ${req.method} ${escapeShellArg(sanitizeForCurl(req.url))}`;
    
    req.headers.filter(h => h.enabled && h.key).forEach(h => {
        curl += ` \\\n  -H ${escapeShellArg(`${h.key}: ${h.value}`)}`;
    });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.bodyType === 'raw' && req.bodyRaw) {
            curl += ` \\\n  --data-raw ${escapeShellArg(sanitizeForCurl(req.bodyRaw))}`;
        } else if (req.bodyType === 'x-www-form-urlencoded') {
            req.bodyForm.filter(f => f.enabled && f.key).forEach(f => {
                curl += ` \\\n  --data ${escapeShellArg(`${f.key}=${f.value}`)}`;
            });
        } else if (req.bodyType === 'form-data') {
            req.bodyForm.filter(f => f.enabled && f.key).forEach(f => {
                const prefix = f.type === 'file' ? '@' : '';
                curl += ` \\\n  --form ${escapeShellArg(`${f.key}=${prefix}${f.value}`)}`;
            });
        }
    }
    
    return curl;
};

export const parseCurl = (curlCommand: string): Partial<HttpRequest> | null => {
  if (!curlCommand || !curlCommand.trim().toLowerCase().startsWith('curl')) return null;

  const cleanCommand = curlCommand
    .replace(/\\\r?\n/g, ' ') 
    .replace(/[\r\n]+/g, ' ') 
    .trim();

  const request: Partial<HttpRequest> = {
    headers: [],
    params: [],
    method: 'GET',
    bodyType: 'raw',
    bodyRaw: ''
  };

  const methodMatch = cleanCommand.match(/(?:-X|--request)\s+([A-Z]+)/i);
  if (methodMatch) {
      request.method = methodMatch[1].toUpperCase() as any;
  }

  const urlRegex = /(?:https?:\/\/[^\s'"]+)/i;
  const urlMatch = cleanCommand.match(urlRegex);
  if (urlMatch) {
      let urlStr = urlMatch[0];
      if ((urlStr.startsWith("'") && urlStr.endsWith("'")) || (urlStr.startsWith('"') && urlStr.endsWith('"'))) {
          urlStr = urlStr.slice(1, -1);
      }
      request.url = urlStr;

      try {
          const urlObj = new URL(urlStr);
          const params: KeyValue[] = [];
          urlObj.searchParams.forEach((value, key) => {
              params.push({ id: generateId(), key, value, enabled: true });
          });
          if (params.length > 0) request.params = params;
      } catch (e) {}
  }

  const headerRegex = /(?:-H|--header)\s+(['"])(.*?)\1/g;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(cleanCommand)) !== null) {
    const headerContent = headerMatch[2];
    const separatorIndex = headerContent.indexOf(':');
    if (separatorIndex > 0) {
        const key = headerContent.substring(0, separatorIndex).trim();
        const value = headerContent.substring(separatorIndex + 1).trim();
        request.headers?.push({ id: generateId(), key, value, enabled: true });
    }
  }

  const dataRegex = /(--data-raw|--data-binary|--data-urlencode|--data|-d|--form|-F)\s+(['"])([\s\S]*?)\2/;
  const dataMatch = cleanCommand.match(dataRegex);
  
  if (dataMatch) {
    const dataFlag = dataMatch[1];
    if (dataFlag === '--form' || dataFlag === '-F') {
        request.bodyType = 'form-data';
        const pair = dataMatch[3].split('=');
        if (pair.length >= 2) {
            request.bodyForm = [{ id: generateId(), key: pair[0], value: pair.slice(1).join('='), enabled: true, type: 'text' }];
        }
    } else {
        const body = dataMatch[3];
        const parsedForm = hasFormUrlEncodedContentType(request.headers)
          ? parseFormUrlEncodedBody(body)
          : null;

        if (parsedForm) {
            request.bodyType = 'x-www-form-urlencoded';
            request.bodyForm = parsedForm;
            request.bodyRaw = '';
        } else {
            request.bodyRaw = body;
            request.bodyType = 'raw';
        }
    }
    if (!methodMatch) request.method = 'POST';
  }

  return request;
};

export const paramsToQueryString = (params: KeyValue[]): string => {
  return params
    .filter(p => p.enabled && p.key)
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
};

export const queryStringToParams = (query: string): KeyValue[] => {
  if (!query) return [];
  return query.split('&').map(pair => {
    const [key, value] = pair.split('=');
    return {
      id: generateId(),
      key: decodeURIComponent(key || ''),
      value: decodeURIComponent(value || ''),
      enabled: true
    };
  });
};

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const formatUrl = (urlString: string) => {
    try {
        const url = new URL(urlString);
        return {
            origin: url.origin,
            path: url.pathname + url.search
        };
    } catch (e) {
        return { origin: urlString, path: '' };
    }
};

export const formatTime = (timestamp: number): string => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
