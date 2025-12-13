
import { KeyValue, HttpRequest } from './types';

export const generateId = (): string => Math.random().toString(36).substr(2, 9);

export const parseCurl = (curlCommand: string): Partial<HttpRequest> | null => {
  if (!curlCommand || !curlCommand.trim().toLowerCase().startsWith('curl')) return null;

  // 1. Preprocess: Remove backslashes followed by newlines to make it a single line
  // This fixes issues with multi-line cURL commands copied from Chrome DevTools
  const cleanCommand = curlCommand
    .replace(/\\\r?\n/g, ' ') // Remove backslash + newline
    .replace(/[\r\n]+/g, ' ') // Remove remaining newlines
    .trim();

  const request: Partial<HttpRequest> = {
    headers: [],
    method: 'GET',
    bodyType: 'raw',
    bodyRaw: ''
  };

  // 2. Extract URL
  // Priority 1: Quoted URL
  const urlMatch = cleanCommand.match(/curl\s+(?:-[a-zA-Z-]+\s+)*['"]([^'"]+)['"]/);
  // Priority 2: Unquoted URL (simple)
  const simpleUrlMatch = cleanCommand.match(/curl\s+(?:-[a-zA-Z-]+\s+)*([^\s"'-]+)/);

  if (urlMatch) {
    request.url = urlMatch[1];
  } else if (simpleUrlMatch) {
    request.url = simpleUrlMatch[1];
  }

  // 3. Extract Method (-X POST)
  const methodMatch = cleanCommand.match(/-X\s+([A-Z]+)/);
  if (methodMatch) {
      request.method = methodMatch[1] as any;
  }

  // 4. Extract Headers (-H "Key: Value")
  // Regex to match -H followed by quoted string (single or double)
  const headerRegex = /-H\s+(['"])(.*?)\1/g;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(cleanCommand)) !== null) {
    // headerMatch[2] contains the content inside quotes
    const headerContent = headerMatch[2];
    const separatorIndex = headerContent.indexOf(':');
    if (separatorIndex > 0) {
        const key = headerContent.substring(0, separatorIndex).trim();
        const value = headerContent.substring(separatorIndex + 1).trim();
        request.headers?.push({ id: generateId(), key, value, enabled: true });
    }
  }

  // 5. Extract Data (--data-raw, --data, -d)
  // We look for the flag, then capture the content inside the *next* pair of quotes
  // This regex handles: --data-raw '{"json":...}' or --data "param=value"
  const dataRegex = /(?:--data-raw|--data|-d)\s+(['"])([\s\S]*?)\1/;
  const dataMatch = cleanCommand.match(dataRegex);
  
  if (dataMatch) {
    // dataMatch[2] is the content inside the quotes
    request.bodyRaw = dataMatch[2];
    request.bodyType = 'raw';
    
    // Check if it looks like JSON
    try {
        JSON.parse(request.bodyRaw);
        // It's JSON, maybe set a content-type header if missing? 
        // For now, just leave as raw string.
    } catch(e) {
        // Not JSON
    }

    // Default to POST if data is present and method not specified
    if (!methodMatch) {
        request.method = 'POST';
    }
  }

  // 6. Compressed header flag handling (--compressed)
  // Chrome copies as cURL with --compressed, we can ignore it or add Accept-Encoding
  // Usually fetch handles decompression automatically.

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
