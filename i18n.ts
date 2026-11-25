import enMessages from './_locales/en/messages.json';
import zhCNMessages from './_locales/zh_CN/messages.json';

export type AppLanguage = 'system' | 'en' | 'zh_CN';

export const LANGUAGE_STORAGE_KEY = 'appLanguage';

type MessageEntry = {
  message: string;
  placeholders?: Record<string, { content: string }>;
};

const MESSAGE_MAP: Record<Exclude<AppLanguage, 'system'>, Record<string, MessageEntry>> = {
  en: enMessages,
  zh_CN: zhCNMessages,
};

const formatMessage = (entryOrMsg: MessageEntry | string, substitutions?: string | string[]) => {
  const raw = typeof entryOrMsg === 'string' ? entryOrMsg : entryOrMsg.message;
  const placeholders = typeof entryOrMsg === 'string' ? undefined : entryOrMsg.placeholders;
  const values =
    substitutions === undefined
      ? []
      : Array.isArray(substitutions)
        ? substitutions
        : [substitutions];

  let out = raw;
  if (placeholders) {
    const lowerMap: Record<string, string> = {};
    Object.entries(placeholders).forEach(([k, v]) => {
      if (v && typeof v.content === 'string') {
        lowerMap[k.toLowerCase()] = v.content.replace(/\$(\d+)/g, (_, index) => values[Number(index) - 1] ?? '');
      }
    });
    out = out.replace(/\$([A-Za-z0-9_@]+)\$/g, (full, name) => {
      const key = name.toLowerCase();
      return key in lowerMap ? lowerMap[key] : full;
    });
  }
  if (values.length > 0) {
    out = out.replace(/\$(\d+)/g, (_, index) => values[Number(index) - 1] ?? '');
  }
  return out;
};

const fallbackGetMessage = (key: string, substitutions?: string | string[]) => {
  const browserLang =
    typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')
      ? 'zh_CN'
      : 'en';
  const entry = MESSAGE_MAP[browserLang]?.[key] ?? MESSAGE_MAP.en?.[key];
  return entry?.message ? formatMessage(entry, substitutions) : '';
};

const originalGetMessage =
  typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function'
    ? chrome.i18n.getMessage.bind(chrome.i18n)
    : fallbackGetMessage;
let activeLanguage: AppLanguage = 'system';

export const applyLanguage = (language: AppLanguage) => {
  activeLanguage = language;
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    chrome.i18n.getMessage = ((key: string, substitutions?: string | string[]) => {
      if (activeLanguage !== 'system') {
        const entry = MESSAGE_MAP[activeLanguage]?.[key];
        if (entry?.message) return formatMessage(entry, substitutions);
      }
      return originalGetMessage(key, substitutions as any);
    }) as typeof chrome.i18n.getMessage;
  }
};

applyLanguage('system');
