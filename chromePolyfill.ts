import enMessages from './_locales/en/messages.json';
import zhCNMessages from './_locales/zh_CN/messages.json';

type MessageCatalog = Record<string, { message: string }>;

const STORAGE_PREFIX = 'xapi_chrome_storage:';
const memoryFallback = new Map<string, string>();
const changeListeners = new Set<(changes: Record<string, { oldValue?: any; newValue?: any }>, areaName: string) => void>();

const formatMessage = (message: string, substitutions?: string | string[]) => {
  if (substitutions === undefined) return message;
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return message.replace(/\$(\d+)/g, (_, index) => values[Number(index) - 1] ?? '');
};

const getSystemCatalog = (): MessageCatalog => {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')) {
    return zhCNMessages;
  }
  return enMessages;
};

const readRaw = (key: string): string | null => {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_PREFIX + key);
    }
  } catch {
    // Fall back to in-memory store if localStorage is blocked
  }
  return memoryFallback.get(key) ?? null;
};

const writeRaw = (key: string, value: string) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_PREFIX + key, value);
      return;
    }
  } catch {
    // Fall back to in-memory store
  }
  memoryFallback.set(key, value);
};

const removeRaw = (key: string) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_PREFIX + key);
    }
  } catch {
    // Ignore
  }
  memoryFallback.delete(key);
};

const getAllKeys = (): string[] => {
  const keys = new Set<string>(memoryFallback.keys());
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(STORAGE_PREFIX)) {
          keys.add(fullKey.slice(STORAGE_PREFIX.length));
        }
      }
    }
  } catch {
    // Ignore
  }
  return Array.from(keys);
};

const parseStoredValue = (raw: string | null): any => {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const notifyChanges = (changes: Record<string, { oldValue?: any; newValue?: any }>) => {
  if (Object.keys(changes).length === 0) return;
  changeListeners.forEach((listener) => {
    try {
      listener(changes, 'local');
    } catch (err) {
      console.error('Storage change listener error:', err);
    }
  });
};

const installChromePolyfill = () => {
  const g = globalThis as any;
  if (!g.chrome) {
    g.chrome = {};
  }

  if (!g.chrome.i18n || typeof g.chrome.i18n.getMessage !== 'function') {
    g.chrome.i18n = {
      getMessage: (key: string, substitutions?: string | string[]) => {
        const primary = getSystemCatalog();
        const entry = primary[key] || (enMessages as MessageCatalog)[key];
        if (!entry?.message) return '';
        return formatMessage(entry.message, substitutions);
      },
      getUILanguage: () => (typeof navigator !== 'undefined' ? navigator.language : 'en'),
    };
  }

  if (!g.chrome.runtime) {
    g.chrome.runtime = {};
  }
  if (!g.chrome.runtime.id) {
    g.chrome.runtime.id = 'xapi-web-preview';
  }
  if (typeof g.chrome.runtime.sendMessage !== 'function') {
    g.chrome.runtime.sendMessage = (_message: any, callback?: (response?: any) => void) => {
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(undefined));
      }
      return Promise.resolve(undefined);
    };
  }

  if (!g.chrome.storage || !g.chrome.storage.local) {
    const local = {
      get: (keys?: string | string[] | Record<string, any> | null, callback?: (items: Record<string, any>) => void) => {
        const result: Record<string, any> = {};
        if (keys === null || keys === undefined) {
          getAllKeys().forEach((k) => {
            const val = parseStoredValue(readRaw(k));
            if (val !== undefined) result[k] = val;
          });
        } else if (typeof keys === 'string') {
          const val = parseStoredValue(readRaw(keys));
          if (val !== undefined) result[keys] = val;
        } else if (Array.isArray(keys)) {
          keys.forEach((k) => {
            const val = parseStoredValue(readRaw(k));
            if (val !== undefined) result[k] = val;
          });
        } else if (typeof keys === 'object') {
          Object.entries(keys).forEach(([k, defaultVal]) => {
            const val = parseStoredValue(readRaw(k));
            result[k] = val !== undefined ? val : defaultVal;
          });
        }

        if (typeof callback === 'function') {
          queueMicrotask(() => callback(result));
        }
        return Promise.resolve(result);
      },
      set: (items: Record<string, any>, callback?: () => void) => {
        const changes: Record<string, { oldValue?: any; newValue?: any }> = {};
        Object.entries(items || {}).forEach(([k, v]) => {
          const oldValue = parseStoredValue(readRaw(k));
          const serialized = JSON.stringify(v);
          if (serialized !== undefined) {
            writeRaw(k, serialized);
            const newValue = parseStoredValue(serialized);
            changes[k] = { oldValue, newValue };
          }
        });
        notifyChanges(changes);
        if (typeof callback === 'function') {
          queueMicrotask(() => callback());
        }
        return Promise.resolve();
      },
      remove: (keys: string | string[], callback?: () => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const changes: Record<string, { oldValue?: any; newValue?: any }> = {};
        keyList.forEach((k) => {
          const oldValue = parseStoredValue(readRaw(k));
          if (oldValue !== undefined) {
            removeRaw(k);
            changes[k] = { oldValue, newValue: undefined };
          }
        });
        notifyChanges(changes);
        if (typeof callback === 'function') {
          queueMicrotask(() => callback());
        }
        return Promise.resolve();
      },
      clear: (callback?: () => void) => {
        const changes: Record<string, { oldValue?: any; newValue?: any }> = {};
        getAllKeys().forEach((k) => {
          const oldValue = parseStoredValue(readRaw(k));
          removeRaw(k);
          if (oldValue !== undefined) {
            changes[k] = { oldValue, newValue: undefined };
          }
        });
        notifyChanges(changes);
        if (typeof callback === 'function') {
          queueMicrotask(() => callback());
        }
        return Promise.resolve();
      },
    };

    const onChanged = {
      addListener: (fn: (changes: Record<string, { oldValue?: any; newValue?: any }>, areaName: string) => void) => {
        changeListeners.add(fn);
      },
      removeListener: (fn: (changes: Record<string, { oldValue?: any; newValue?: any }>, areaName: string) => void) => {
        changeListeners.delete(fn);
      },
      hasListener: (fn: (changes: Record<string, { oldValue?: any; newValue?: any }>, areaName: string) => void) => {
        return changeListeners.has(fn);
      },
    };

    g.chrome.storage = {
      ...(g.chrome.storage || {}),
      local,
      onChanged: g.chrome.storage?.onChanged || onChanged,
    };
  }

  if (!g.chrome.tabs) {
    g.chrome.tabs = {};
  }
  if (typeof g.chrome.tabs.create !== 'function') {
    g.chrome.tabs.create = (createProperties: { url?: string }) => {
      if (createProperties?.url && typeof window !== 'undefined') {
        window.location.assign(createProperties.url);
      }
      return Promise.resolve({});
    };
  }
};

installChromePolyfill();
