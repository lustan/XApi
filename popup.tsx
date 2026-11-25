import './chromePolyfill';
import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { applyLanguage, LANGUAGE_STORAGE_KEY } from './i18n';
import type { AppLanguage } from './i18n';
import { LoggedRequest, MockRule, GlobalHeader, HeaderProfile } from './types';
import { formatUrl, formatTime, getMethodBadgeColor, generateId } from './utils';
import {
  MOCK_RULES_KEY,
  MOCK_GLOBAL_ENABLED_KEY,
  GLOBAL_HEADERS_KEY,
  GLOBAL_HEADERS_ENABLED_KEY,
  GLOBAL_HEADERS_URL_FILTER_KEY,
  HEADER_PROFILES_KEY,
  ACTIVE_HEADER_PROFILE_ID_KEY,
  CORS_BYPASS_ENABLED_KEY,
  CORS_BYPASS_URL_FILTER_KEY,
} from './mockUtils';
import { APP_CONFIG } from './config';
import { Logo } from './components/Logo';

type PopupTab = 'capture' | 'mock' | 'header';

const POPUP_ACTIVE_TAB_KEY = 'popupActiveTab';

const getStatusClass = (status: number) => {
  if (!status || status <= 0) return 'text-amber-600';
  if (status >= 200 && status < 300) return 'text-emerald-600';
  if (status >= 300 && status < 400) return 'text-sky-600';
  return 'text-red-600';
};

const Switch: React.FC<{
  on: boolean;
  onClick: () => void;
  ariaLabel: string;
  title?: string;
  size?: 'sm' | 'md';
}> = ({ on, onClick, ariaLabel, title, size = 'md' }) => {
  const isSm = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      title={title || ariaLabel}
      onClick={onClick}
      className={`relative inline-flex flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${
        isSm ? 'h-4 w-7' : 'h-5 w-9'
      } ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}
    >
      <span
        className={`inline-block transform rounded-full bg-white shadow-sm transition-transform ${
          isSm
            ? `h-3 w-3 ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`
            : `h-4 w-4 ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`
        }`}
      />
    </button>
  );
};

const blankHeaderRow = (): GlobalHeader => ({
  id: generateId(),
  key: '',
  value: '',
  enabled: true,
  operation: 'set',
});

const Popup = () => {
  const [activeTab, setActiveTab] = useState<PopupTab>('capture');
  const [isRecording, setIsRecording] = useState(false);
  const [mockGlobalEnabled, setMockGlobalEnabled] = useState(false);
  const [logs, setLogs] = useState<LoggedRequest[]>([]);
  const [mockRules, setMockRules] = useState<MockRule[]>([]);
  const [globalHeaders, setGlobalHeaders] = useState<GlobalHeader[]>([]);
  const [globalHeadersEnabled, setGlobalHeadersEnabled] = useState(false);
  const [headersUrlFilter, setHeadersUrlFilter] = useState('');
  const [headerProfiles, setHeaderProfiles] = useState<HeaderProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [corsBypassEnabled, setCorsBypassEnabled] = useState(false);
  const [headersLoaded, setHeadersLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTabOnly, setCurrentTabOnly] = useState(false);
  const [currentBrowserTabId, setCurrentBrowserTabId] = useState<number | null>(null);
  const [languageVersion, setLanguageVersion] = useState(0);
  const [language, setLanguage] = useState<AppLanguage>('system');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const startRecordingText = chrome.i18n.getMessage("startRecording");
  const stopRecordingText = chrome.i18n.getMessage("stopRecording");
  const noRequestsFoundText = chrome.i18n.getMessage("noRequestsFound");
  const recordingText = chrome.i18n.getMessage("recording");
  const filterRequestsText = chrome.i18n.getMessage("filterRequests");
  const clearText = chrome.i18n.getMessage("clear");
  const openDashboardText = chrome.i18n.getMessage("openDashboard");
  const pendingText = chrome.i18n.getMessage("pending");
  const captureTabText = chrome.i18n.getMessage("captureTab") || 'Capture';
  const mockTabText = chrome.i18n.getMessage("mockTab") || 'Mock';
  const headerTabText = chrome.i18n.getMessage("headerTab") || 'Header';
  const settingsText = chrome.i18n.getMessage("settings") || 'Settings';
  const githubRepositoryText = chrome.i18n.getMessage("githubRepository") || 'GitHub Repository';
  const sendFeedbackText = chrome.i18n.getMessage("sendFeedback") || 'Send Feedback';
  const languageText = chrome.i18n.getMessage("language") || 'Language';
  const systemLanguageText = chrome.i18n.getMessage("systemLanguage") || 'System';
  const englishText = chrome.i18n.getMessage("english") || 'English';
  const chineseText = chrome.i18n.getMessage("chineseSimplified") || '简体中文';
  const activatingText = chrome.i18n.getMessage("mockGlobalActive") || 'Activating';
  const pausedText = chrome.i18n.getMessage("paused") || 'Paused';
  const resetWorkspaceText = chrome.i18n.getMessage("resetWorkspace") || 'Reset Workspace';
  const confirmResetText = chrome.i18n.getMessage("confirmResetAction") || 'Confirm reset?';
  const addHeaderText = chrome.i18n.getMessage("addHeader") || 'Add Header';
  const capturedEmptyHintText = chrome.i18n.getMessage("capturedEmptyHint") || 'Turn on Capture above and browse a page to record requests.';
  const currentTabOnlyText = chrome.i18n.getMessage("currentTabOnly") || 'Current Tab';
  const corsBypassText = chrome.i18n.getMessage("corsBypass") || 'CORS Bypass';
  const hostFilterPh = chrome.i18n.getMessage("hostFilterPlaceholder") || 'Filter URL (e.g. localhost)';
  const defaultProfileName = chrome.i18n.getMessage("headerProfileDefault") || 'Default';
  const newProfileText = chrome.i18n.getMessage("newProfile") || 'New Profile';
  const confirmText = chrome.i18n.getMessage("confirm") || 'Confirm';
  const headerProfileText = chrome.i18n.getMessage("headerProfile") || 'Header Profile';
  const setHeaderOpTitle = chrome.i18n.getMessage("setHeaderOpTitle") || 'Set header value';
  const removeHeaderOpTitle = chrome.i18n.getMessage("removeHeaderOpTitle") || 'Remove matching header';
  const removeHeaderTag = chrome.i18n.getMessage("removeHeaderTag") || '(remove)';
  const mockFallbackText = chrome.i18n.getMessage("mockFallback") || 'Mock';
  const toggleMockRuleText = chrome.i18n.getMessage("toggleMockRule") || 'Toggle mock rule';

  useEffect(() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.query === 'function') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          setCurrentBrowserTabId(tabs?.[0]?.id ?? null);
        });
      }
    } catch { /* ignore in preview */ }

    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        [
          'isRecording',
          'logs',
          MOCK_GLOBAL_ENABLED_KEY,
          MOCK_RULES_KEY,
          GLOBAL_HEADERS_KEY,
          GLOBAL_HEADERS_ENABLED_KEY,
          GLOBAL_HEADERS_URL_FILTER_KEY,
          HEADER_PROFILES_KEY,
          ACTIVE_HEADER_PROFILE_ID_KEY,
          CORS_BYPASS_ENABLED_KEY,
          POPUP_ACTIVE_TAB_KEY,
          LANGUAGE_STORAGE_KEY,
        ],
        (result) => {
          const storedLanguage = result[LANGUAGE_STORAGE_KEY];
          if (storedLanguage === 'en' || storedLanguage === 'zh_CN') {
            applyLanguage(storedLanguage);
            setLanguage(storedLanguage);
            setLanguageVersion(v => v + 1);
          }
          const savedTab = result[POPUP_ACTIVE_TAB_KEY];
          if (savedTab === 'capture' || savedTab === 'mock' || savedTab === 'header') {
            setActiveTab(savedTab);
          }
          setIsRecording(!!result.isRecording);
          setMockGlobalEnabled(result[MOCK_GLOBAL_ENABLED_KEY] === true);
          setLogs(result.logs || []);
          setMockRules(result[MOCK_RULES_KEY] || []);

          const initialHeaders: GlobalHeader[] = result[GLOBAL_HEADERS_KEY] || [];
          const initialUrlFilter = typeof result[GLOBAL_HEADERS_URL_FILTER_KEY] === 'string' ? result[GLOBAL_HEADERS_URL_FILTER_KEY] : '';
          let profiles: HeaderProfile[] = result[HEADER_PROFILES_KEY] || [];
          let activeProfId: string | null = result[ACTIVE_HEADER_PROFILE_ID_KEY] || null;
          if (profiles.length === 0) {
            const def: HeaderProfile = {
              id: 'default',
              name: chrome.i18n.getMessage("headerProfileDefault") || 'Default',
              headers: initialHeaders,
              urlFilter: initialUrlFilter,
            };
            profiles = [def];
            activeProfId = def.id;
            chrome.storage.local.set({ [HEADER_PROFILES_KEY]: profiles, [ACTIVE_HEADER_PROFILE_ID_KEY]: activeProfId });
          } else if (!activeProfId || !profiles.some(p => p.id === activeProfId)) {
            activeProfId = profiles[0].id;
          }

          setHeaderProfiles(profiles);
          setActiveProfileId(activeProfId);
          setGlobalHeaders(initialHeaders);
          setGlobalHeadersEnabled(result[GLOBAL_HEADERS_ENABLED_KEY] === true);
          setHeadersUrlFilter(initialUrlFilter);
          setCorsBypassEnabled(result[CORS_BYPASS_ENABLED_KEY] === true);
          setHeadersLoaded(true);
        });

      const listener = (changes: any) => {
        if (changes.logs) setLogs(changes.logs.newValue || []);
        if (changes.isRecording) setIsRecording(changes.isRecording.newValue);
        if (changes[MOCK_GLOBAL_ENABLED_KEY]) setMockGlobalEnabled(changes[MOCK_GLOBAL_ENABLED_KEY].newValue === true);
        if (changes[MOCK_RULES_KEY]) setMockRules(changes[MOCK_RULES_KEY].newValue || []);
        if (changes[GLOBAL_HEADERS_KEY]) setGlobalHeaders(changes[GLOBAL_HEADERS_KEY].newValue || []);
        if (changes[GLOBAL_HEADERS_ENABLED_KEY]) setGlobalHeadersEnabled(changes[GLOBAL_HEADERS_ENABLED_KEY].newValue === true);
        if (changes[GLOBAL_HEADERS_URL_FILTER_KEY]) setHeadersUrlFilter(changes[GLOBAL_HEADERS_URL_FILTER_KEY].newValue || '');
        if (changes[HEADER_PROFILES_KEY]) setHeaderProfiles(changes[HEADER_PROFILES_KEY].newValue || []);
        if (changes[ACTIVE_HEADER_PROFILE_ID_KEY]) setActiveProfileId(changes[ACTIVE_HEADER_PROFILE_ID_KEY].newValue || null);
        if (changes[CORS_BYPASS_ENABLED_KEY]) setCorsBypassEnabled(changes[CORS_BYPASS_ENABLED_KEY].newValue === true);
        if (changes[LANGUAGE_STORAGE_KEY]) {
          const nextLanguage = changes[LANGUAGE_STORAGE_KEY].newValue;
          const normalized = nextLanguage === 'en' || nextLanguage === 'zh_CN' ? nextLanguage : 'system';
          applyLanguage(normalized);
          setLanguage(normalized);
          setLanguageVersion(v => v + 1);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
        setConfirmingReset(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleRecording = () => {
    const newState = !isRecording;
    setIsRecording(newState);
    chrome.storage.local.set({ isRecording: newState });
  };

  const handleLanguageChange = (next: AppLanguage) => {
    applyLanguage(next);
    setLanguage(next);
    setLanguageVersion(v => v + 1);
    chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: next });
  };

  const handleResetAllData = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    chrome.storage.local.clear(() => {
      window.location.reload();
    });
  };

  const selectTab = (tab: PopupTab) => {
    setActiveTab(tab);
    chrome.storage.local.set({ [POPUP_ACTIVE_TAB_KEY]: tab });
  };

  const toggleMockGlobal = () => {
    const newState = !mockGlobalEnabled;
    setMockGlobalEnabled(newState);
    chrome.storage.local.set({ [MOCK_GLOBAL_ENABLED_KEY]: newState });
  };

  const clearLogs = () => {
    chrome.storage.local.set({ logs: [] });
  };

  const openDashboard = (logId?: string) => {
    const url = logId ? `panel.html?logId=${logId}` : 'panel.html';
    if (chrome.tabs) {
      chrome.tabs.create({ url });
    }
  };

  const openDashboardMock = (mockId: string) => {
    if (chrome.tabs) {
      chrome.tabs.create({ url: `panel.html?mockId=${mockId}` });
    }
  };

  const persistMockRules = (next: MockRule[]) => {
    setMockRules(next);
    chrome.storage.local.set({ [MOCK_RULES_KEY]: next });
  };

  const toggleMockRule = (id: string) => {
    persistMockRules(mockRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const persistHeaders = (next: GlobalHeader[], nextFilter: string = headersUrlFilter) => {
    setGlobalHeaders(next);
    const updatedProfiles = headerProfiles.map(p =>
      p.id === activeProfileId ? { ...p, headers: next, urlFilter: nextFilter } : p
    );
    setHeaderProfiles(updatedProfiles);
    chrome.storage.local.set({
      [GLOBAL_HEADERS_KEY]: next,
      [HEADER_PROFILES_KEY]: updatedProfiles,
    });
  };

  const handleUrlFilterChange = (nextFilter: string) => {
    setHeadersUrlFilter(nextFilter);
    const updatedProfiles = headerProfiles.map(p =>
      p.id === activeProfileId ? { ...p, headers: globalHeaders, urlFilter: nextFilter } : p
    );
    setHeaderProfiles(updatedProfiles);
    chrome.storage.local.set({
      [GLOBAL_HEADERS_URL_FILTER_KEY]: nextFilter,
      [CORS_BYPASS_URL_FILTER_KEY]: nextFilter,
      [HEADER_PROFILES_KEY]: updatedProfiles,
    });
  };

  const handleSelectProfile = (profileId: string) => {
    const found = headerProfiles.find(p => p.id === profileId);
    if (!found) return;
    const nextHeaders = found.headers.length > 0 ? found.headers : [blankHeaderRow()];
    const nextFilter = found.urlFilter || '';
    setActiveProfileId(profileId);
    setGlobalHeaders(nextHeaders);
    setHeadersUrlFilter(nextFilter);
    chrome.storage.local.set({
      [ACTIVE_HEADER_PROFILE_ID_KEY]: profileId,
      [GLOBAL_HEADERS_KEY]: nextHeaders,
      [GLOBAL_HEADERS_URL_FILTER_KEY]: nextFilter,
    });
  };

  const handleConfirmNewProfile = () => {
    const trimmed = newProfileName.trim() || chrome.i18n.getMessage("headerProfileDefaultPrefix", [String(headerProfiles.length + 1)]) || `Profile ${headerProfiles.length + 1}`;
    const created: HeaderProfile = {
      id: generateId(),
      name: trimmed,
      headers: [blankHeaderRow()],
      urlFilter: '',
    };
    const nextProfiles = [...headerProfiles, created];
    setHeaderProfiles(nextProfiles);
    setActiveProfileId(created.id);
    setGlobalHeaders(created.headers);
    setHeadersUrlFilter('');
    setNewProfileName('');
    setIsCreatingProfile(false);
    chrome.storage.local.set({
      [HEADER_PROFILES_KEY]: nextProfiles,
      [ACTIVE_HEADER_PROFILE_ID_KEY]: created.id,
      [GLOBAL_HEADERS_KEY]: created.headers,
      [GLOBAL_HEADERS_URL_FILTER_KEY]: '',
    });
  };

  const handleDeleteProfile = () => {
    if (headerProfiles.length <= 1 || !activeProfileId) return;
    const nextProfiles = headerProfiles.filter(p => p.id !== activeProfileId);
    const fallback = nextProfiles[0];
    const nextHeaders = fallback.headers.length > 0 ? fallback.headers : [blankHeaderRow()];
    const nextFilter = fallback.urlFilter || '';
    setHeaderProfiles(nextProfiles);
    setActiveProfileId(fallback.id);
    setGlobalHeaders(nextHeaders);
    setHeadersUrlFilter(nextFilter);
    chrome.storage.local.set({
      [HEADER_PROFILES_KEY]: nextProfiles,
      [ACTIVE_HEADER_PROFILE_ID_KEY]: fallback.id,
      [GLOBAL_HEADERS_KEY]: nextHeaders,
      [GLOBAL_HEADERS_URL_FILTER_KEY]: nextFilter,
    });
  };

  const toggleHeadersEnabled = () => {
    const newState = !globalHeadersEnabled;
    setGlobalHeadersEnabled(newState);
    chrome.storage.local.set({ [GLOBAL_HEADERS_ENABLED_KEY]: newState });
  };

  const toggleCorsBypass = () => {
    const newState = !corsBypassEnabled;
    setCorsBypassEnabled(newState);
    chrome.storage.local.set({
      [CORS_BYPASS_ENABLED_KEY]: newState,
      [CORS_BYPASS_URL_FILTER_KEY]: headersUrlFilter,
    });
  };

  const addHeader = () => {
    persistHeaders([...globalHeaders, blankHeaderRow()]);
  };

  const updateHeader = (id: string, patch: Partial<GlobalHeader>) => {
    persistHeaders(globalHeaders.map(h => h.id === id ? { ...h, ...patch } : h));
  };

  const removeHeader = (id: string) => {
    const next = globalHeaders.filter(h => h.id !== id);
    persistHeaders(next.length ? next : [blankHeaderRow()]);
  };

  // Wait for stored headers before creating an editable row in an empty list.
  useEffect(() => {
    if (headersLoaded && activeTab === 'header' && globalHeaders.length === 0) {
      persistHeaders([blankHeaderRow()]);
    }
  }, [headersLoaded, activeTab, globalHeaders.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const validLogs = logs.filter(log => {
    if (!log || !log.url || log.url.startsWith('chrome-extension')) return false;
    if (currentTabOnly && currentBrowserTabId !== null && log.tabId !== currentBrowserTabId) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.url.toLowerCase().includes(term) ||
      log.method.toLowerCase().includes(term) ||
      (log.graphqlOperationName || '').toLowerCase().includes(term)
    );
  });

  const enabledMockCount = mockRules.filter(r => r.enabled).length;
  const enabledHeadersCount = globalHeaders.filter(h => h.enabled && h.key.trim()).length;

  const tabButtonClass = (tab: PopupTab) =>
    `flex-1 text-xs font-semibold py-2.5 transition-colors border-b-2 whitespace-nowrap ${
      activeTab === tab
        ? 'border-emerald-600 text-emerald-700 bg-white'
        : 'border-transparent text-slate-500 hover:text-slate-800 bg-slate-50/80'
    }`;

  return (
    <div key={languageVersion} className="w-80 bg-white flex flex-col h-[500px] text-slate-800">
      {/* Header */}
      <header className="px-3.5 py-2.5 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800 flex-shrink-0">
        <Logo size={24} tone="dark" />
        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsSettingsOpen(!isSettingsOpen);
              setConfirmingReset(false);
            }}
            className={`p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              isSettingsOpen ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title={settingsText}
            aria-label={settingsText}
            aria-expanded={isSettingsOpen}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth={2} />
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth={2} />
            </svg>
          </button>
          {isSettingsOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 shadow-xl rounded-lg z-[110] py-1 animate-fadeIn overflow-hidden text-slate-700">
              <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/70">
                <span className="text-[11px] font-semibold text-slate-400">
                  {chrome.i18n.getMessage("versionLabel", [APP_CONFIG.VERSION]) || `Version ${APP_CONFIG.VERSION}`}
                </span>
              </div>
              <a
                href={APP_CONFIG.GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5 mr-2 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                {githubRepositoryText}
              </a>
              <a
                href={APP_CONFIG.FEEDBACK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5 mr-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" strokeWidth={2} />
                </svg>
                {sendFeedbackText}
              </a>
              <div className="px-3.5 py-2 border-t border-slate-100">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">{languageText}</label>
                <select
                  value={language}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
                  className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  <option value="system">{systemLanguageText}</option>
                  <option value="en">{englishText}</option>
                  <option value="zh_CN">{chineseText}</option>
                </select>
              </div>
              <div className="h-px bg-slate-100 my-1"></div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetAllData();
                }}
                className={`flex items-center w-full text-left px-3.5 py-2 text-xs transition-colors ${
                  confirmingReset ? 'bg-red-600 text-white font-semibold' : 'text-red-600 hover:bg-red-50'
                }`}
              >
                <svg className="w-3.5 h-3.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2} />
                </svg>
                {confirmingReset ? confirmResetText : resetWorkspaceText}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex border-b border-slate-200 flex-shrink-0 bg-slate-50/80" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'capture'}
          className={tabButtonClass('capture')}
          onClick={() => selectTab('capture')}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <span>{captureTabText}</span>
            {isRecording && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" title={recordingText} />}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mock'}
          className={tabButtonClass('mock')}
          onClick={() => selectTab('mock')}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <span>{mockTabText}</span>
            {mockGlobalEnabled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'header'}
          className={tabButtonClass('header')}
          onClick={() => selectTab('header')}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <span>{headerTabText}</span>
            {(globalHeadersEnabled || corsBypassEnabled) && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </span>
        </button>
      </nav>

      {/* ===================== CAPTURE TAB ===================== */}
      {activeTab === 'capture' && (
        <>
          <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}
                aria-hidden="true"
              />
              <span className={`text-xs font-medium ${isRecording ? 'text-slate-800' : 'text-slate-500'}`}>
                {isRecording ? recordingText : pausedText}
              </span>
              {logs.length > 0 && (
                <span className="text-[11px] text-slate-400 tabular-nums">({validLogs.length})</span>
              )}
            </div>
            <Switch
              on={isRecording}
              onClick={toggleRecording}
              ariaLabel={captureTabText}
              title={isRecording ? stopRecordingText : startRecordingText}
            />
          </div>

          <div className="px-2.5 py-2 bg-white border-b border-slate-200 flex items-center gap-1.5 flex-shrink-0">
            <div className="relative flex-1 min-w-0">
              <svg
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setSearchTerm(''); }}
                placeholder={filterRequestsText}
                className="w-full text-xs pl-8 pr-6 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 transition-all placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label={clearText}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCurrentTabOnly(v => !v)}
              title={currentTabOnlyText}
              className={`px-2 py-1.5 rounded-md text-[11px] font-medium border whitespace-nowrap transition-colors ${
                currentTabOnly
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {currentTabOnlyText}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50">
            {validLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 px-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3 text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-600">{noRequestsFoundText}</span>
                {!searchTerm && (
                  <span className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    {isRecording ? recordingText : capturedEmptyHintText}
                  </span>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 bg-white">
                {validLogs.map(log => {
                  const { origin, path } = formatUrl(log.url);
                  return (
                    <li
                      key={log.id}
                      onClick={() => openDashboard(log.id)}
                      className="px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-emerald-50/50 group flex items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getMethodBadgeColor(log.method)}`}>
                              {log.method}
                            </span>
                            {log.graphqlOperationName && (
                              <span className="text-[10px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded truncate max-w-[90px]" title={log.graphqlOperationName}>
                                {log.graphqlOperationName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 tabular-nums flex-shrink-0">
                            {typeof log.duration === 'number' && (
                              <span className="text-[10px] text-slate-400 font-mono">{log.duration}ms</span>
                            )}
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatTime(log.timestamp)}
                            </span>
                            <span className={`text-[10px] font-semibold font-mono ${getStatusClass(log.status)}`}>
                              {log.status > 0 ? log.status : pendingText}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-700 truncate" title={origin}>{origin}</span>
                          <span className="text-[11px] text-slate-500 truncate font-mono" title={path}>{path || '/'}</span>
                        </div>
                      </div>
                      <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="p-3 bg-white border-t border-slate-200 flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={clearLogs}
              disabled={logs.length === 0}
              className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-45 disabled:cursor-not-allowed text-slate-700 text-xs font-medium py-2 rounded-md border border-slate-200 transition-colors"
            >
              {clearText}
            </button>
            <button
              type="button"
              onClick={() => openDashboard()}
              className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-md transition-colors flex items-center justify-center shadow-sm"
            >
              {openDashboardText}
            </button>
          </div>
        </>
      )}

      {/* ===================== MOCK TAB ===================== */}
      {activeTab === 'mock' && (
        <>
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${mockGlobalEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
              <span className={`text-xs font-medium ${mockGlobalEnabled ? 'text-slate-800' : 'text-slate-500'}`}>
                {mockGlobalEnabled ? activatingText : pausedText}
              </span>
              {mockRules.length > 0 && (
                <span className="text-[11px] text-slate-400 tabular-nums">
                  ({enabledMockCount}/{mockRules.length})
                </span>
              )}
            </div>
            <Switch on={mockGlobalEnabled} onClick={toggleMockGlobal} ariaLabel={mockTabText} />
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50">
            {mockRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 px-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3 text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-600">{chrome.i18n.getMessage("mockListEmpty") || 'No mock rules yet'}</span>
                <span className="text-[11px] text-slate-400 mt-1 leading-relaxed">{chrome.i18n.getMessage("mockListEmptyHint") || ''}</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 bg-white">
                {mockRules.map(rule => (
                  <li key={rule.id} className="px-3.5 py-2.5 bg-white hover:bg-slate-50 flex items-center justify-between gap-2.5 transition-colors">
                    <div className="flex flex-col min-w-0 flex-1 cursor-pointer" onClick={() => openDashboardMock(rule.id)}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getMethodBadgeColor(rule.method === 'ANY' ? '' : rule.method)}`}>
                          {rule.method}
                        </span>
                        <span className="text-xs font-semibold text-slate-700 truncate">{rule.name || rule.urlPattern || mockFallbackText}</span>
                        {typeof rule.delayMs === 'number' && rule.delayMs > 0 && (
                          <span className="text-[9px] font-mono text-amber-700 bg-amber-50 px-1 rounded tabular-nums">{rule.delayMs}ms</span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 truncate font-mono" title={rule.urlPattern}>{rule.urlPattern || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {typeof rule.hitCount === 'number' && rule.hitCount > 0 && (
                        <span className="text-[10px] text-slate-400 tabular-nums font-mono" title={chrome.i18n.getMessage("mockHits") || 'Hits'}>
                          {rule.hitCount}
                        </span>
                      )}
                      <Switch
                        size="sm"
                        on={rule.enabled}
                        onClick={() => toggleMockRule(rule.id)}
                        ariaLabel={rule.name || rule.urlPattern || toggleMockRuleText}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-3 bg-white border-t border-slate-200 flex-shrink-0">
            <button
              type="button"
              onClick={() => openDashboard()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-md transition-colors shadow-sm"
            >
              {openDashboardText}
            </button>
          </div>
        </>
      )}

      {/* ===================== HEADER TAB ===================== */}
      {activeTab === 'header' && (
        <>
          <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${globalHeadersEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
              <span className={`text-xs font-medium ${globalHeadersEnabled ? 'text-slate-800' : 'text-slate-500'}`}>
                {globalHeadersEnabled ? activatingText : pausedText}
              </span>
              {globalHeaders.length > 0 && (
                <span className="text-[11px] text-slate-400 tabular-nums">({enabledHeadersCount})</span>
              )}
            </div>
            <Switch on={globalHeadersEnabled} onClick={toggleHeadersEnabled} ariaLabel={headerTabText} />
          </div>

          {/* Profiles, Host Filter & CORS Bypass */}
          <div className="px-2.5 py-2 bg-white border-b border-slate-200 space-y-1.5 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              {isCreatingProfile ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    autoFocus
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmNewProfile();
                      else if (e.key === 'Escape') { setIsCreatingProfile(false); setNewProfileName(''); }
                    }}
                    placeholder={newProfileText}
                    className="flex-1 min-w-0 text-xs px-2 py-1 border border-emerald-500 rounded focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleConfirmNewProfile}
                    className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 whitespace-nowrap"
                  >
                    {confirmText}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsCreatingProfile(false); setNewProfileName(''); }}
                    aria-label={chrome.i18n.getMessage("cancel") || 'Cancel'}
                    className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <select
                    aria-label={headerProfileText}
                    value={activeProfileId || 'default'}
                    onChange={(e) => handleSelectProfile(e.target.value)}
                    className="flex-1 min-w-0 text-xs border border-slate-200 rounded-md px-2 py-1 bg-slate-50 focus:bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
                  >
                    {headerProfiles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.id === 'default' && (!p.name || p.name === 'Default' || p.name === '默认方案')
                          ? defaultProfileName
                          : p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsCreatingProfile(true)}
                    title={newProfileText}
                    aria-label={newProfileText}
                    className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md"
                  >
                    +
                  </button>
                  {headerProfiles.length > 1 && (
                    <button
                      type="button"
                      onClick={handleDeleteProfile}
                      title={chrome.i18n.getMessage("delete") || 'Delete'}
                      aria-label={chrome.i18n.getMessage("delete") || 'Delete'}
                      className="p-1 text-slate-400 hover:text-red-500 rounded border border-slate-200 hover:border-red-200"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={headersUrlFilter}
                onChange={(e) => handleUrlFilterChange(e.target.value)}
                placeholder={hostFilterPh}
                aria-label={hostFilterPh}
                className="flex-1 min-w-0 text-[11px] font-mono px-2 py-1 bg-slate-50 focus:bg-white border border-slate-200 rounded focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                role="switch"
                aria-checked={corsBypassEnabled}
                onClick={toggleCorsBypass}
                title={corsBypassText}
                className={`px-2 py-1 text-[11px] font-semibold rounded border whitespace-nowrap transition-colors ${
                  corsBypassEnabled
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                CORS
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50">
            {globalHeaders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 px-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3 text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-600 mb-3">
                  {chrome.i18n.getMessage("headerListEmpty") || 'No headers yet'}
                </span>
                <button
                  type="button"
                  onClick={addHeader}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
                >
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {addHeaderText}
                </button>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 bg-white">
                  {globalHeaders.map(h => {
                    const isRemove = h.operation === 'remove';
                    return (
                      <li key={h.id} className="px-2 py-2 bg-white flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={h.enabled}
                          aria-label={h.key || addHeaderText}
                          onChange={(e) => updateHeader(h.id, { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 flex-shrink-0 appearance-none rounded border border-slate-300 bg-white checked:bg-emerald-600 checked:border-emerald-600 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22/%3E%3C/svg%3E')] bg-no-repeat bg-center cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => updateHeader(h.id, { operation: isRemove ? 'set' : 'remove' })}
                          title={isRemove ? removeHeaderOpTitle : setHeaderOpTitle}
                          aria-label={isRemove ? removeHeaderOpTitle : setHeaderOpTitle}
                          className={`px-1 py-1 rounded text-[9px] font-bold font-mono flex-shrink-0 border ${
                            isRemove
                              ? 'bg-red-50 text-red-600 border-red-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isRemove ? 'RM' : 'SET'}
                        </button>
                        <input
                          type="text"
                          value={h.key}
                          onChange={(e) => updateHeader(h.id, { key: e.target.value })}
                          placeholder={chrome.i18n.getMessage("headerKeyPlaceholder") || 'Header'}
                          className="w-[38%] text-[11px] px-1.5 py-1 bg-slate-50 focus:bg-white border border-slate-200 rounded focus:outline-none focus:border-emerald-500 font-mono"
                        />
                        {isRemove ? (
                          <span className="flex-1 min-w-0 text-[10px] text-red-500 italic px-1.5 truncate font-mono">
                            {removeHeaderTag}
                          </span>
                        ) : (
                          <input
                            type="text"
                            value={h.value}
                            onChange={(e) => updateHeader(h.id, { value: e.target.value })}
                            placeholder={chrome.i18n.getMessage("headerValuePlaceholder") || 'Value'}
                            className="flex-1 min-w-0 text-[11px] px-1.5 py-1 bg-slate-50 focus:bg-white border border-slate-200 rounded focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeHeader(h.id)}
                          title={chrome.i18n.getMessage("delete") || 'Delete'}
                          aria-label={chrome.i18n.getMessage("delete") || 'Delete'}
                          className="text-slate-400 hover:text-red-500 p-0.5 rounded hover:bg-red-50 flex-shrink-0 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={addHeader}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {addHeaderText}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="p-3 bg-white border-t border-slate-200 flex-shrink-0">
            <button
              type="button"
              onClick={() => openDashboard()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-md transition-colors flex items-center justify-center shadow-sm"
            >
              {openDashboardText}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<Popup />);
}
