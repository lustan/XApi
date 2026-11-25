import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { RequestHeader } from './components/RequestHeader';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Modal } from './components/Modal';
import { TabBar } from './components/TabBar';
import { MockEditor } from './components/MockEditor';
import { ImportModal } from './components/ImportModal';
import { EnvManagerModal } from './components/EnvManagerModal';
import { CodeGenModal } from './components/CodeGenModal';
import { DiffViewer } from './components/DiffViewer';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import {
  HttpRequest,
  HttpResponse,
  LoggedRequest,
  SidebarTab,
  CollectionItem,
  KeyValue,
  TabItem,
  MockRule,
  EnvironmentItem,
  HeaderProfile,
  SseEvent,
} from './types';
import { generateId, queryStringToParams, parseCurl, paramsToQueryString } from './utils';
import {
  createMockRule,
  MOCK_RULES_KEY,
  MOCK_GLOBAL_ENABLED_KEY,
  HEADER_PROFILES_KEY,
  buildPatchesFromJson,
} from './mockUtils';
import {
  ENVIRONMENTS_KEY,
  ACTIVE_ENV_ID_KEY,
  getActiveEnvironment,
  interpolateRequest,
  applyExtractRules,
} from './envUtils';
import {
  collectAllRequestIds,
  collectAllCollectionRequests,
  findCollectionById,
  updateCollectionRequest,
  renameRequestInCollections,
  removeRequestFromCollections,
  insertRequestIntoCollection,
  addSubfolderToCollections,
  renameCollectionInTree,
  toggleCollectionCollapseInTree,
  deleteCollectionFromTree,
} from './collectionUtils';
import {
  buildWorkspaceExport,
  buildMockRulesExport,
  ImportParseResult,
} from './importExportUtils';
import { applyLanguage, LANGUAGE_STORAGE_KEY } from './i18n';
import type { AppLanguage } from './i18n';

// 浏览器禁止通过 fetch 接口设置的请求头列表
const FORBIDDEN_HEADERS = [
  'cookie', 'cookie2', 'origin', 'referer', 'host', 'connection', 'content-length',
  'date', 'expect', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via',
];

const isContentTypeHeader = (key: string) => key.toLowerCase() === 'content-type';

const hasHeader = (headers: Record<string, string>, name: string) =>
  Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());

const downloadJsonFile = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const parseSseBlock = (rawBlock: string): SseEvent | null => {
  const lines = rawBlock.split(/\r?\n/);
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const colonIdx = line.indexOf(':');
    const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
    const val = colonIdx === -1 ? '' : line.slice(colonIdx + 1).replace(/^ /, '');
    if (field === 'id') id = val;
    else if (field === 'event') event = val;
    else if (field === 'data') dataLines.push(val);
  }

  if (dataLines.length === 0 && !event && !id) return null;
  return {
    id,
    event,
    data: dataLines.join('\n'),
    timestamp: Date.now(),
  };
};

const createNewRequest = (collectionId?: string): HttpRequest => ({
  id: generateId(),
  collectionId,
  name: chrome.i18n.getMessage('newRequestDefault'),
  url: '',
  method: 'GET',
  headers: [],
  params: [],
  bodyType: 'none',
  bodyRaw: '',
  bodyForm: [],
});

const convertLogToRequest = (log: LoggedRequest): HttpRequest => {
  const headers: KeyValue[] = [];
  if (log.requestHeaders) {
    Object.entries(log.requestHeaders).forEach(([k, v]) => {
      headers.push({ id: generateId(), key: k, value: v, enabled: true });
    });
  }
  let bodyType: HttpRequest['bodyType'] = 'none';
  let bodyRaw = '';
  let bodyForm: KeyValue[] = [];
  if (log.requestBody) {
    if (typeof log.requestBody === 'string') {
      bodyType = 'raw';
      bodyRaw = log.requestBody;
    } else if (typeof log.requestBody === 'object') {
      bodyType = 'form-data';
      Object.entries(log.requestBody).forEach(([k, v]) => {
        const val = Array.isArray(v) ? v[0] : v;
        bodyForm.push({ id: generateId(), key: k, value: val, enabled: true, type: 'text' });
      });
    }
  }
  let smartName = log.url;
  try {
    const urlObj = new URL(log.url);
    smartName = urlObj.pathname === '/' ? urlObj.origin : urlObj.pathname;
  } catch (e) {}
  return {
    ...createNewRequest(),
    id: log.id,
    url: log.url,
    method: log.method as any,
    name: smartName,
    params: queryStringToParams(log.url.split('?')[1] || ''),
    headers,
    bodyType,
    bodyRaw,
    bodyForm,
  };
};

const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabItem[]>([
    { id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage('welcomeTabTitle') },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('welcome');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('history');
  const [history, setHistory] = useState<LoggedRequest[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [rootRequests, setRootRequests] = useState<HttpRequest[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [excludeDomains, setExcludeDomains] = useState<string[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [codeGenState, setCodeGenState] = useState<{ open: boolean; tab: 'curl' | 'fetch' | 'axios' | 'ts' }>({
    open: false,
    tab: 'fetch',
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    confirmVariant?: 'primary' | 'danger';
    onConfirm: () => void;
  } | null>(null);
  const [mockRules, setMockRules] = useState<MockRule[]>([]);
  const [mockGlobalEnabled, setMockGlobalEnabled] = useState(false);
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>(null);
  const [headerProfiles, setHeaderProfiles] = useState<HeaderProfile[]>([]);
  const [language, setLanguage] = useState<AppLanguage>('system');
  const [languageVersion, setLanguageVersion] = useState(0);
  const initializedRef = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeRequest = activeTab?.data || null;
  const activeMockRule = activeTab?.mockData || null;
  const activeResponse = activeTab?.response || null;
  const activeError = activeTab?.error || null;
  const activeIsLoading = activeTab?.isLoading || false;

  const activeEnvironment = useMemo(
    () => getActiveEnvironment(environments, activeEnvironmentId),
    [environments, activeEnvironmentId]
  );

  const allCollectionRequests = useMemo(
    () => collectAllCollectionRequests(collections),
    [collections]
  );

  const allSavedRequests = useMemo(
    () => [...rootRequests, ...allCollectionRequests],
    [rootRequests, allCollectionRequests]
  );

  const refreshLanguage = (next: AppLanguage) => {
    applyLanguage(next);
    setLanguage(next);
    setLanguageVersion((v) => v + 1);
    setTabs((prev) =>
      prev.map((t) =>
        t.type === 'welcome' ? { ...t, title: chrome.i18n.getMessage('welcomeTabTitle') } : t
      )
    );
  };

  useEffect(() => {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        [
          'collections',
          'logs',
          'savedTabs',
          'savedActiveTabId',
          'isRecording',
          'captureExcludeDomains',
          'rootRequests',
          MOCK_RULES_KEY,
          MOCK_GLOBAL_ENABLED_KEY,
          ENVIRONMENTS_KEY,
          ACTIVE_ENV_ID_KEY,
          HEADER_PROFILES_KEY,
          LANGUAGE_STORAGE_KEY,
        ],
        (result) => {
          if (result.collections) setCollections(result.collections);
          if (result.rootRequests) setRootRequests(result.rootRequests);
          setIsRecording(!!result.isRecording);
          if (Array.isArray(result.captureExcludeDomains)) {
            setExcludeDomains(result.captureExcludeDomains);
          }
          if (result[MOCK_RULES_KEY]) setMockRules(result[MOCK_RULES_KEY]);
          setMockGlobalEnabled(result[MOCK_GLOBAL_ENABLED_KEY] === true);
          if (Array.isArray(result[ENVIRONMENTS_KEY])) {
            setEnvironments(result[ENVIRONMENTS_KEY]);
          }
          if (result[ACTIVE_ENV_ID_KEY] !== undefined) {
            setActiveEnvironmentId(result[ACTIVE_ENV_ID_KEY] || null);
          }
          if (Array.isArray(result[HEADER_PROFILES_KEY])) {
            setHeaderProfiles(result[HEADER_PROFILES_KEY]);
          }
          const storedLanguage = result[LANGUAGE_STORAGE_KEY];
          if (storedLanguage === 'en' || storedLanguage === 'zh_CN') {
            refreshLanguage(storedLanguage);
          }

          const logs = result.logs || [];
          setHistory(logs);

          if (result.savedTabs && result.savedTabs.length > 0) {
            setTabs(
              result.savedTabs.map((t: TabItem) =>
                t.type === 'welcome'
                  ? { ...t, title: chrome.i18n.getMessage('welcomeTabTitle') }
                  : { ...t, isLoading: false }
              )
            );
            if (result.savedActiveTabId) setActiveTabId(result.savedActiveTabId);
          }

          const params = new URLSearchParams(window.location.search);
          const logId = params.get('logId');
          if (logId) {
            const found = logs.find((l: LoggedRequest) => l.id === logId);
            if (found) {
              handleImportLoggedRequest(found);
              setSidebarTab('history');
            }
          }
          const mockId = params.get('mockId');
          if (mockId) {
            const foundRule = (result[MOCK_RULES_KEY] || []).find((r: MockRule) => r.id === mockId);
            if (foundRule) {
              openMockRuleInTab(foundRule);
              setSidebarTab('mock');
            }
          }
          initializedRef.current = true;
        }
      );

      const listener = (changes: any) => {
        if (changes.logs) setHistory(changes.logs.newValue || []);
        if (changes.collections) setCollections(changes.collections.newValue || []);
        if (changes.rootRequests) setRootRequests(changes.rootRequests.newValue || []);
        if (changes.isRecording) setIsRecording(changes.isRecording.newValue);
        if (changes.captureExcludeDomains) setExcludeDomains(changes.captureExcludeDomains.newValue || []);
        if (changes[MOCK_RULES_KEY]) setMockRules(changes[MOCK_RULES_KEY].newValue || []);
        if (changes[MOCK_GLOBAL_ENABLED_KEY]) setMockGlobalEnabled(changes[MOCK_GLOBAL_ENABLED_KEY].newValue === true);
        if (changes[ENVIRONMENTS_KEY]) setEnvironments(changes[ENVIRONMENTS_KEY].newValue || []);
        if (changes[ACTIVE_ENV_ID_KEY]) setActiveEnvironmentId(changes[ACTIVE_ENV_ID_KEY].newValue || null);
        if (changes[HEADER_PROFILES_KEY]) setHeaderProfiles(changes[HEADER_PROFILES_KEY].newValue || []);
        if (changes[LANGUAGE_STORAGE_KEY]) {
          const nextLanguage = changes[LANGUAGE_STORAGE_KEY].newValue;
          const normalized = nextLanguage === 'en' || nextLanguage === 'zh_CN' ? nextLanguage : 'system';
          refreshLanguage(normalized);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        savedTabs: tabs,
        savedActiveTabId: activeTabId,
      });
    }
  }, [tabs, activeTabId]);

  const openRequestInTab = (req: HttpRequest) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === req.id)) return prev;
      const newTab: TabItem = {
        id: req.id,
        type: 'request',
        title: req.name,
        method: req.method,
        data: req,
        isLoading: false,
        response: null,
        error: null,
      };
      return prev[0]?.type === 'welcome' ? [newTab] : [...prev, newTab];
    });
    setActiveTabId(req.id);
  };

  const openMockRuleInTab = (rule: MockRule) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === rule.id)) return prev;
      const newTab: TabItem = { id: rule.id, type: 'mock', title: rule.name || chrome.i18n.getMessage('mockFallback') || 'Mock', mockData: rule };
      return prev[0]?.type === 'welcome' ? [newTab] : [...prev, newTab];
    });
    setActiveTabId(rule.id);
  };

  const handleCompareLogs = (left: LoggedRequest, right: LoggedRequest) => {
    const diffId = `diff:${left.id}:${right.id}`;
    const diffPrefix = chrome.i18n.getMessage('diffTabPrefix') || 'Diff';
    setTabs((prev) => {
      if (prev.some((t) => t.id === diffId)) return prev;
      const diffTab: TabItem = {
        id: diffId,
        type: 'diff',
        title: `${diffPrefix}: ${left.method} vs ${right.method}`,
        diffData: { left, right },
      };
      return prev[0]?.type === 'welcome' ? [diffTab] : [...prev, diffTab];
    });
    setActiveTabId(diffId);
  };

  const persistMockRules = (next: MockRule[]) => {
    setMockRules(next);
    chrome.storage.local.set({ [MOCK_RULES_KEY]: next });
  };

  const handleSaveEnvironments = (nextEnvs: EnvironmentItem[], nextActiveId: string | null) => {
    setEnvironments(nextEnvs);
    setActiveEnvironmentId(nextActiveId);
    chrome.storage.local.set({
      [ENVIRONMENTS_KEY]: nextEnvs,
      [ACTIVE_ENV_ID_KEY]: nextActiveId,
    });
  };

  const handleSwitchActiveEnv = (envId: string | null) => {
    setActiveEnvironmentId(envId);
    chrome.storage.local.set({ [ACTIVE_ENV_ID_KEY]: envId });
  };

  const handleChangeExcludeDomains = (next: string[]) => {
    setExcludeDomains(next);
    chrome.storage.local.set({ captureExcludeDomains: next });
  };

  const handleCreateMockRule = () => {
    const r = createMockRule();
    const next = [r, ...mockRules];
    persistMockRules(next);
    openMockRuleInTab(r);
    setSidebarTab('mock');
  };

  const handleUpdateMockRule = (updated: MockRule) => {
    const next = mockRules.map((r) => (r.id === updated.id ? updated : r));
    persistMockRules(next);
    setTabs((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, title: updated.name || chrome.i18n.getMessage('mockFallback') || 'Mock', mockData: updated } : t))
    );
  };

  const handleRenameMockRule = (id: string, newName: string) => {
    const found = mockRules.find((r) => r.id === id);
    if (!found) return;
    handleUpdateMockRule({ ...found, name: newName });
  };

  const handleDeleteMockRule = (id: string) => {
    const next = mockRules.filter((r) => r.id !== id);
    persistMockRules(next);
    handleTabClose(id);
  };

  const handleClearMockRules = () => {
    setConfirmDialog({
      title: chrome.i18n.getMessage('clear') || 'Clear',
      message: chrome.i18n.getMessage('clearMockRulesConfirm') || 'Clear all mock rules?',
      confirmVariant: 'danger',
      onConfirm: () => {
        persistMockRules([]);
        const nextTabs = tabs.filter((t) => t.type !== 'mock');
        if (nextTabs.length === 0) {
          setTabs([{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage('welcomeTabTitle') }]);
          setActiveTabId('welcome');
        } else {
          setTabs(nextTabs);
          if (activeTab?.type === 'mock') setActiveTabId(nextTabs[nextTabs.length - 1].id);
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleDuplicateMockRule = (id: string) => {
    const found = mockRules.find((r) => r.id === id);
    if (!found) return;
    const copySuffix = chrome.i18n.getMessage('copySuffix') || 'Copy';
    const copy: MockRule = {
      ...found,
      id: generateId(),
      name: `${found.name} ${copySuffix}`,
      hitCount: 0,
      createdAt: Date.now(),
    };
    persistMockRules([copy, ...mockRules]);
  };

  const handleToggleMockRule = (id: string) => {
    const next = mockRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    persistMockRules(next);
  };

  const handleToggleMockGlobal = () => {
    const next = !mockGlobalEnabled;
    setMockGlobalEnabled(next);
    chrome.storage.local.set({ [MOCK_GLOBAL_ENABLED_KEY]: next });
  };

  const handleLanguageChange = (next: AppLanguage) => {
    refreshLanguage(next);
    chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: next });
  };

  const handleMockFromLog = (log: LoggedRequest) => {
    const latestLog = history.find((item) => item.id === log.id) || log;
    let urlPattern = latestLog.url;
    try {
      const u = new URL(latestLog.url);
      urlPattern = `${u.protocol}//${u.host}${u.pathname}` || latestLog.url;
    } catch {
      /* noop */
    }

    let mode: 'replace' | 'patch-json' = 'replace';
    let jsonPatches: ReturnType<typeof buildPatchesFromJson> = [];
    let replaceBody = '{\n  "code": 0,\n  "data": {}\n}';
    const tabResponseBody = tabs.find((t) => t.id === latestLog.id)?.response?.body;
    const responseBody = latestLog.responseBody || tabResponseBody;
    if (responseBody) {
      try {
        const parsed = JSON.parse(responseBody);
        if (parsed != null && typeof parsed === 'object') {
          mode = 'patch-json';
          jsonPatches = buildPatchesFromJson(parsed);
          replaceBody = JSON.stringify(parsed, null, 2);
        }
      } catch {
        /* not JSON — keep defaults */
      }
    }

    const r = createMockRule({
      name: urlPattern,
      urlPattern,
      matchMode: 'startsWith',
      method: (latestLog.method?.toUpperCase() as any) || 'ANY',
      mode,
      replaceBody,
      jsonPatches,
    });
    persistMockRules([r, ...mockRules]);
    openMockRuleInTab(r);
    setSidebarTab('mock');
  };

  const handleTabClose = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newTabs = tabs.filter((t) => t.id !== id);
    if (newTabs.length === 0) {
      setTabs([{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage('welcomeTabTitle') }]);
      setActiveTabId('welcome');
    } else {
      setTabs(newTabs);
      if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const handleTabClick = (id: string) => setActiveTabId(id);

  const updateActiveRequest = (updatedReq: HttpRequest) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === updatedReq.id ? { ...t, data: updatedReq, title: updatedReq.name, method: updatedReq.method } : t
      )
    );
    const nextRoots = rootRequests.map((r) => (r.id === updatedReq.id ? updatedReq : r));
    const nextCols = updateCollectionRequest(collections, updatedReq);
    setRootRequests(nextRoots);
    setCollections(nextCols);
    chrome.storage.local.set({ rootRequests: nextRoots, collections: nextCols });
  };

  const handleSaveToCollection = (reqId: string, colId: string | null) => {
    let reqToMove: HttpRequest | undefined =
      rootRequests.find((r) => r.id === reqId) || allCollectionRequests.find((r) => r.id === reqId);

    if (!reqToMove) {
      const tabReq = tabs.find((t) => t.id === reqId)?.data;
      if (tabReq) reqToMove = tabReq;
    }
    if (!reqToMove) {
      const log = history.find((h) => h.id === reqId);
      if (log) reqToMove = convertLogToRequest(log);
    }
    if (!reqToMove) return;

    const updatedReq = { ...reqToMove, collectionId: colId || undefined };
    const nextRoots = rootRequests.filter((r) => r.id !== reqId);
    let nextCols = removeRequestFromCollections(collections, reqId);

    if (colId) {
      nextCols = insertRequestIntoCollection(nextCols, colId, updatedReq);
    } else {
      nextRoots.push(updatedReq);
    }

    setRootRequests(nextRoots);
    setCollections(nextCols);
    setTabs((prev) => prev.map((t) => (t.id === reqId ? { ...t, data: updatedReq } : t)));
    chrome.storage.local.set({ rootRequests: nextRoots, collections: nextCols });
  };

  const handleSaveLogsAsCollection = (selectedLogs: LoggedRequest[]) => {
    if (selectedLogs.length === 0) return;
    const colId = generateId();
    const requests: HttpRequest[] = selectedLogs.map((log) => ({
      ...convertLogToRequest(log),
      id: generateId(),
      collectionId: colId,
    }));
    const newCol: CollectionItem = {
      id: colId,
      name: chrome.i18n.getMessage('capturedCollectionName', [String(requests.length)]) || `Captured (${requests.length})`,
      collapsed: false,
      requests,
    };
    const next = [...collections, newCol];
    setCollections(next);
    chrome.storage.local.set({ collections: next });
    setSidebarTab('collections');
  };

  const handleImportLoggedRequest = (log: LoggedRequest) => {
    const req = convertLogToRequest(log);
    openRequestInTab(req);
  };

  const handleCreateRequest = () => {
    const newReq = createNewRequest();
    const nextRoots = [...rootRequests, newReq];
    setRootRequests(nextRoots);
    chrome.storage.local.set({ rootRequests: nextRoots });
    openRequestInTab(newReq);
  };

  const handleRenameRequest = (reqId: string, newName: string) => {
    const nextRoots = rootRequests.map((r) => (r.id === reqId ? { ...r, name: newName } : r));
    const nextCols = renameRequestInCollections(collections, reqId, newName);
    setRootRequests(nextRoots);
    setCollections(nextCols);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === reqId ? { ...t, title: newName, data: t.data ? { ...t.data, name: newName } : undefined } : t
      )
    );
    chrome.storage.local.set({ rootRequests: nextRoots, collections: nextCols });
  };

  const handleCreateCollection = () => {
    const newCol: CollectionItem = {
      id: generateId(),
      name: chrome.i18n.getMessage('newCollection'),
      requests: [],
      collapsed: false,
    };
    const next = [...collections, newCol];
    setCollections(next);
    chrome.storage.local.set({ collections: next });
    setSidebarTab('collections');
  };

  const handleCreateSubfolder = (parentId: string) => {
    const name = chrome.i18n.getMessage('newFolder') || 'New Folder';
    const next = addSubfolderToCollections(collections, parentId, name);
    setCollections(next);
    chrome.storage.local.set({ collections: next });
    setSidebarTab('collections');
  };

  const handleTabRename = (id: string, newName: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab?.type === 'mock') {
      handleRenameMockRule(id, newName);
      return;
    }
    handleRenameRequest(id, newName);
  };

  const handleSendRequest = useCallback(async () => {
    if (!activeRequest) return;

    const envVars = activeEnvironment?.variables || [];
    const resolvedReq = interpolateRequest(activeRequest, envVars);
    let targetUrl = resolvedReq.url.trim();

    if (!targetUrl) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeRequest.id
            ? {
                ...t,
                isLoading: false,
                response: null,
                error: chrome.i18n.getMessage('enterRequestUrl') || 'Enter Request URL',
              }
            : t
        )
      );
      return;
    }

    if (!targetUrl.includes('?') && resolvedReq.params.some((p) => p.enabled && p.key)) {
      const qs = paramsToQueryString(resolvedReq.params);
      if (qs) targetUrl = `${targetUrl}?${qs}`;
    }

    setTabs((prev) =>
      prev.map((t) => (t.id === activeRequest.id ? { ...t, isLoading: true, error: null, response: null } : t))
    );
    const startTime = Date.now();
    try {
      const enabledHeaders = resolvedReq.headers.filter((h) => h.enabled && h.key);
      const isFormDataRequest =
        resolvedReq.method !== 'GET' && resolvedReq.method !== 'HEAD' && resolvedReq.bodyType === 'form-data';
      const requestHeaders = isFormDataRequest
        ? enabledHeaders.filter((h) => !isContentTypeHeader(h.key))
        : enabledHeaders;

      const safeHeaderObj: Record<string, string> = {};
      requestHeaders.forEach((h) => {
        const lowerKey = h.key.toLowerCase();
        if (!FORBIDDEN_HEADERS.includes(lowerKey) && !lowerKey.startsWith('sec-') && !lowerKey.startsWith('proxy-')) {
          safeHeaderObj[h.key] = h.value;
        }
      });

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: 'SET_REQUEST_HEADERS',
              url: targetUrl,
              headers: requestHeaders.map((h) => ({ key: h.key, value: h.value })),
            },
            resolve
          );
        });
      }

      let body: any = undefined;
      if (resolvedReq.method !== 'GET' && resolvedReq.method !== 'HEAD') {
        if (resolvedReq.bodyType === 'raw') {
          body = resolvedReq.bodyRaw;
        } else if (resolvedReq.bodyType === 'graphql') {
          let variables: any = {};
          if (resolvedReq.graphqlVariables?.trim()) {
            try {
              variables = JSON.parse(resolvedReq.graphqlVariables);
            } catch {
              variables = resolvedReq.graphqlVariables;
            }
          }
          body = JSON.stringify({ query: resolvedReq.graphqlQuery || '', variables });
          if (!hasHeader(safeHeaderObj, 'Content-Type')) safeHeaderObj['Content-Type'] = 'application/json';
        } else if (resolvedReq.bodyType === 'x-www-form-urlencoded') {
          const params = new URLSearchParams();
          resolvedReq.bodyForm
            .filter((f) => f.enabled && f.key)
            .forEach((f) => {
              params.append(f.key, f.value);
            });
          body = params.toString();
          if (!hasHeader(safeHeaderObj, 'Content-Type')) safeHeaderObj['Content-Type'] = 'application/x-www-form-urlencoded';
        } else if (resolvedReq.bodyType === 'form-data') {
          const formData = new FormData();
          resolvedReq.bodyForm
            .filter((f) => f.enabled && f.key)
            .forEach((f) => {
              if (f.type === 'file' && f.file) {
                formData.append(f.key, f.file);
              } else {
                formData.append(f.key, f.value);
              }
            });
          body = formData;
        }
      }

      const response = await fetch(targetUrl, {
        method: resolvedReq.method,
        headers: safeHeaderObj,
        body,
        credentials: 'include',
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      let responseBody = '';
      let sseEvents: SseEvent[] | undefined;

      if (contentType.includes('text/event-stream') && response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const collectedEvents: SseEvent[] = [];

        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeRequest.id
              ? {
                  ...t,
                  isLoading: false,
                  response: {
                    status: response.status,
                    statusText: response.statusText,
                    headers: responseHeaders,
                    body: '',
                    time: Date.now() - startTime,
                    size: 0,
                    isStreaming: true,
                    sseEvents: [],
                  },
                }
              : t
          )
        );

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          responseBody += chunk;
          buffer += chunk;

          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const ev = parseSseBlock(part);
            if (ev) collectedEvents.push(ev);
          }

          setTabs((prev) =>
            prev.map((t) =>
              t.id === activeRequest.id
                ? {
                    ...t,
                    response: {
                      status: response.status,
                      statusText: response.statusText,
                      headers: responseHeaders,
                      body: responseBody,
                      time: Date.now() - startTime,
                      size: new Blob([responseBody]).size,
                      isStreaming: true,
                      sseEvents: [...collectedEvents],
                    },
                  }
                : t
            )
          );
        }

        if (buffer.trim()) {
          const tailEv = parseSseBlock(buffer);
          if (tailEv) collectedEvents.push(tailEv);
        }
        sseEvents = collectedEvents;
      } else {
        responseBody = await response.text();
      }

      const endTime = Date.now();
      const httpResponse: HttpResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        time: endTime - startTime,
        size: new Blob([responseBody]).size,
        ...(sseEvents ? { isStreaming: false, sseEvents } : {}),
      };

      setTabs((prev) =>
        prev.map((t) => (t.id === activeRequest.id ? { ...t, isLoading: false, response: httpResponse } : t))
      );

      if (activeEnvironment && activeRequest.extractRules && activeRequest.extractRules.length > 0) {
        const { variables: updatedVars, extractedCount } = applyExtractRules(
          responseBody,
          responseHeaders,
          activeRequest.extractRules,
          activeEnvironment.variables
        );
        if (extractedCount > 0) {
          const nextEnvs = environments.map((env) =>
            env.id === activeEnvironment.id ? { ...env, variables: updatedVars } : env
          );
          handleSaveEnvironments(nextEnvs, activeEnvironment.id);
        }
      }

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'CLEAR_REQUEST_HEADERS' });
      }
    } catch (err: any) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeRequest.id
            ? { ...t, isLoading: false, error: err.message || 'An error occurred' }
            : t
        )
      );
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'CLEAR_REQUEST_HEADERS' });
      }
    }
  }, [activeRequest, activeEnvironment, environments]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (activeTab?.type === 'request' && !activeIsLoading) {
          e.preventDefault();
          handleSendRequest();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTab?.type, activeIsLoading, handleSendRequest]);

  const handleImportCurlText = (rawCurl: string): boolean => {
    const parsed = parseCurl(rawCurl);
    if (!parsed) return false;
    let smartName = chrome.i18n.getMessage('importedRequest');
    if (parsed.url) {
      try {
        const urlObj = new URL(parsed.url);
        smartName = urlObj.pathname === '/' ? urlObj.origin : urlObj.pathname;
      } catch (e) {}
    }
    const newReq: HttpRequest = { ...createNewRequest(), ...parsed, id: generateId(), name: smartName };
    const nextRoots = [...rootRequests, newReq];
    setRootRequests(nextRoots);
    chrome.storage.local.set({ rootRequests: nextRoots });
    openRequestInTab(newReq);
    return true;
  };

  const handleImportStructured = (result: Exclude<ImportParseResult, { kind: 'error' }>) => {
    if (result.kind === 'collection') {
      const next = [...collections, result.collection];
      setCollections(next);
      chrome.storage.local.set({ collections: next });
      setSidebarTab('collections');
      return;
    }
    if (result.kind === 'mock-rules') {
      const next = [...result.rules, ...mockRules];
      persistMockRules(next);
      setSidebarTab('mock');
      return;
    }
    if (result.kind === 'workspace') {
      const p = result.payload;
      const nextCols = p.collections ? [...collections, ...p.collections] : collections;
      const nextRoots = p.rootRequests ? [...rootRequests, ...p.rootRequests] : rootRequests;
      const nextRules = p.mockRules ? [...p.mockRules, ...mockRules] : mockRules;
      const nextEnvs = p.environments ? [...environments, ...p.environments] : environments;
      setCollections(nextCols);
      setRootRequests(nextRoots);
      setMockRules(nextRules);
      setEnvironments(nextEnvs);
      chrome.storage.local.set({
        collections: nextCols,
        rootRequests: nextRoots,
        [MOCK_RULES_KEY]: nextRules,
        [ENVIRONMENTS_KEY]: nextEnvs,
      });
      setSidebarTab('collections');
    }
  };

  const handleExportWorkspace = () => {
    const payload = buildWorkspaceExport({
      collections,
      rootRequests,
      mockRules,
      environments,
      headerProfiles,
    });
    downloadJsonFile(`xapi-workspace-${new Date().toISOString().slice(0, 10)}.json`, payload);
  };

  const handleExportMocks = () => {
    const payload = buildMockRulesExport(mockRules);
    downloadJsonFile(`xapi-mocks-${new Date().toISOString().slice(0, 10)}.json`, payload);
  };

  const handleClearAllData = () => {
    setConfirmDialog({
      title: chrome.i18n.getMessage('resetWorkspace') || 'Reset Workspace',
      message: chrome.i18n.getMessage('clearAllDataConfirm') || 'Reset all data?',
      confirmVariant: 'danger',
      onConfirm: () => {
        initializedRef.current = false;
        setConfirmDialog(null);
        chrome.storage.local.clear(() => {
          setCollections([]);
          setHistory([]);
          setRootRequests([]);
          setMockRules([]);
          setEnvironments([]);
          setActiveEnvironmentId(null);
          setTabs([{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage('welcomeTabTitle') }]);
          setActiveTabId('welcome');
          window.location.reload();
        });
      },
    });
  };

  return (
    <div className="flex h-screen w-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {!isSidebarCollapsed && (
        <Sidebar
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          history={history}
          onImportLoggedRequest={handleImportLoggedRequest}
          collections={collections}
          rootRequests={rootRequests}
          tabs={tabs}
          activeRequestId={activeTab?.type === 'request' ? activeTabId : undefined}
          activeCapturedId={activeTab?.type === 'request' ? activeTabId : undefined}
          activeMockRuleId={activeTab?.type === 'mock' ? activeTabId : undefined}
          onSelectRequest={openRequestInTab}
          onCreateCollection={handleCreateCollection}
          onCreateSubfolder={handleCreateSubfolder}
          onCreateRequest={handleCreateRequest}
          onImportCurl={() => setIsImportModalOpen(true)}
          onExportWorkspace={handleExportWorkspace}
          onExportMocks={handleExportMocks}
          onClearHistory={() => {
            const savedIds = new Set([
              ...rootRequests.map((r) => r.id),
              ...collectAllRequestIds(collections),
            ]);
            const capturedIds = new Set(history.map((h) => h.id).filter((id) => !savedIds.has(id)));
            setHistory([]);
            chrome.storage.local.set({ logs: [] });
            const nextTabs = tabs.filter((t) => t.type !== 'request' || !capturedIds.has(t.id));
            if (nextTabs.length === 0) {
              setTabs([{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage('welcomeTabTitle') }]);
              setActiveTabId('welcome');
            } else {
              setTabs(nextTabs);
              if (!nextTabs.find((t) => t.id === activeTabId)) setActiveTabId(nextTabs[nextTabs.length - 1].id);
            }
          }}
          onDeleteLog={(id) => {
            const next = history.filter((h) => h.id !== id);
            setHistory(next);
            chrome.storage.local.set({ logs: next });
            const savedIds = new Set([...rootRequests.map((r) => r.id), ...collectAllRequestIds(collections)]);
            if (!savedIds.has(id)) handleTabClose(id);
          }}
          onRenameCollection={(id, name) => {
            const next = renameCollectionInTree(collections, id, name);
            setCollections(next);
            chrome.storage.local.set({ collections: next });
          }}
          onRenameRequest={handleRenameRequest}
          onDeleteCollection={(id) => {
            setConfirmDialog({
              title: chrome.i18n.getMessage('delete') || 'Delete',
              message: chrome.i18n.getMessage('deleteCollectionConfirm') || 'Delete this collection?',
              confirmVariant: 'danger',
              onConfirm: () => {
                const target = findCollectionById(collections, id);
                const deletedIds = new Set(target ? collectAllRequestIds([target]) : []);
                const next = deleteCollectionFromTree(collections, id);
                setCollections(next);
                chrome.storage.local.set({ collections: next });
                if (deletedIds.size > 0) {
                  const nextTabs = tabs.filter((t) => t.type !== 'request' || !deletedIds.has(t.id));
                  if (nextTabs.length === 0) {
                    setTabs([{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage('welcomeTabTitle') }]);
                    setActiveTabId('welcome');
                  } else {
                    setTabs(nextTabs);
                    if (!nextTabs.find((t) => t.id === activeTabId)) setActiveTabId(nextTabs[nextTabs.length - 1].id);
                  }
                }
                setConfirmDialog(null);
              },
            });
          }}
          onDeleteRequest={(req) => {
            const nextRoots = rootRequests.filter((r) => r.id !== req.id);
            const nextCols = removeRequestFromCollections(collections, req.id);
            setRootRequests(nextRoots);
            setCollections(nextCols);
            chrome.storage.local.set({ rootRequests: nextRoots, collections: nextCols });
            handleTabClose(req.id);
          }}
          onDuplicateRequest={(reqId) => {
            const found = allSavedRequests.find((r) => r.id === reqId);
            if (found) {
              const copySuffix = chrome.i18n.getMessage('copySuffix') || 'Copy';
              const newReq = { ...found, id: generateId(), name: `${found.name} ${copySuffix}` };
              if (newReq.collectionId) {
                const nextCols = insertRequestIntoCollection(collections, newReq.collectionId, newReq);
                setCollections(nextCols);
                chrome.storage.local.set({ collections: nextCols });
              } else {
                const nextRoots = [...rootRequests, newReq];
                setRootRequests(nextRoots);
                chrome.storage.local.set({ rootRequests: nextRoots });
              }
            }
          }}
          onToggleCollapse={(id) => {
            const next = toggleCollectionCollapseInTree(collections, id);
            setCollections(next);
            chrome.storage.local.set({ collections: next });
          }}
          onMoveRequest={handleSaveToCollection}
          isRecording={isRecording}
          onToggleRecording={() => {
            setIsRecording(!isRecording);
            chrome.storage.local.set({ isRecording: !isRecording });
          }}
          onCollapseSidebar={() => setIsSidebarCollapsed(true)}
          onResetAllData={handleClearAllData}
          language={language}
          onLanguageChange={handleLanguageChange}
          mockRules={mockRules}
          mockGlobalEnabled={mockGlobalEnabled}
          onSelectMockRule={openMockRuleInTab}
          onCreateMockRule={handleCreateMockRule}
          onToggleMockGlobal={handleToggleMockGlobal}
          onToggleMockRule={handleToggleMockRule}
          onDeleteMockRule={handleDeleteMockRule}
          onDuplicateMockRule={handleDuplicateMockRule}
          onClearMockRules={handleClearMockRules}
          onRenameMockRule={handleRenameMockRule}
          onMockFromLog={handleMockFromLog}
          excludeDomains={excludeDomains}
          onChangeExcludeDomains={handleChangeExcludeDomains}
          onCompareLogs={handleCompareLogs}
          onSaveLogsAsCollection={handleSaveLogsAsCollection}
        />
      )}
      <div key={languageVersion} className="flex-1 flex flex-col min-w-0 bg-white relative">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={handleTabClick}
          onTabClose={handleTabClose}
          onTabReorder={(f, t) => {
            const next = [...tabs];
            const [m] = next.splice(f, 1);
            next.splice(t, 0, m);
            setTabs(next);
          }}
          onTabRename={handleTabRename}
          onTabAction={(a, tid) => {
            const idx = tabs.findIndex((t) => t.id === tid);
            let next: TabItem[] = [];
            switch (a) {
              case 'close-others':
                next = tabs.filter((t) => t.id === tid);
                break;
              case 'close-right':
                next = tabs.filter((_, i) => i <= idx);
                break;
              case 'close-left':
                next = tabs.filter((_, i) => i >= idx);
                break;
              case 'close-all':
                next = [];
                break;
            }
            setTabs(
              next.length === 0
                ? [{ id: 'welcome', type: 'welcome', title: chrome.i18n.getMessage('welcomeTabTitle') }]
                : next
            );
            if (!next.find((t) => t.id === activeTabId)) setActiveTabId(next[next.length - 1]?.id || 'welcome');
          }}
          collections={collections}
          onSaveToCollection={handleSaveToCollection}
          leftSlot={
            isSidebarCollapsed ? (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-1.5 rounded bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                title={chrome.i18n.getMessage('expandSidebar')}
                aria-label={chrome.i18n.getMessage('expandSidebar')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 5l7 7-7 7M5 5l7 7-7 7" strokeWidth={2} />
                </svg>
              </button>
            ) : undefined
          }
          rightSlot={
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsCommandPaletteOpen(true)}
                title={chrome.i18n.getMessage('openCommandPalette') || 'Open Command Palette (Cmd/Ctrl + K)'}
                aria-label={chrome.i18n.getMessage('commandPaletteTitle') || 'Open Command Palette'}
                className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-slate-500 bg-white border border-slate-200 rounded-md hover:text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="hidden lg:inline text-[10px] font-mono text-slate-400">⌘K</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                title={chrome.i18n.getMessage('import') || 'Import'}
                aria-label={chrome.i18n.getMessage('import') || 'Import'}
                className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:text-emerald-700 hover:border-emerald-300 transition-colors"
              >
                {chrome.i18n.getMessage('import') || 'Import'}
              </button>

              <div className="flex items-center border border-slate-200 rounded-md bg-white overflow-hidden">
                <select
                  aria-label={chrome.i18n.getMessage('activeEnvironment') || 'Environment'}
                  value={activeEnvironmentId || ''}
                  onChange={(e) => handleSwitchActiveEnv(e.target.value || null)}
                  className="text-[11px] font-medium text-slate-700 bg-transparent pl-2 pr-1.5 py-1 focus:outline-none max-w-[130px] cursor-pointer"
                >
                  <option value="">{chrome.i18n.getMessage('noEnvSelected') || 'No Environment'}</option>
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsEnvModalOpen(true)}
                  title={chrome.i18n.getMessage('manageEnvironments') || 'Manage Environments'}
                  aria-label={chrome.i18n.getMessage('manageEnvironments') || 'Manage Environments'}
                  className="px-1.5 py-1 border-l border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>
          }
        />
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {activeTab?.type === 'mock' && activeMockRule ? (
            <MockEditor
              rule={activeMockRule}
              history={history}
              onRuleChange={handleUpdateMockRule}
              globalEnabled={mockGlobalEnabled}
              onToggleGlobal={handleToggleMockGlobal}
            />
          ) : activeTab?.type === 'diff' && activeTab.diffData ? (
            <DiffViewer left={activeTab.diffData.left} right={activeTab.diffData.right} />
          ) : !activeRequest || activeTabId === 'welcome' ? (
            <WelcomeScreen
              onCreateRequest={handleCreateRequest}
              onCreateCollection={handleCreateCollection}
              onImportCurl={() => setIsImportModalOpen(true)}
            />
          ) : (
            <>
              <RequestHeader
                request={activeRequest}
                onRequestChange={updateActiveRequest}
                onSend={handleSendRequest}
                isSending={activeIsLoading}
                activeEnvVariables={activeEnvironment?.variables}
                onOpenCodeGen={() => setCodeGenState({ open: true, tab: 'fetch' })}
              />
              <div className="flex-1 flex h-full overflow-hidden">
                <div className="w-1/2 min-w-[400px] h-full overflow-hidden border-r border-slate-200">
                  <RequestEditor
                    request={activeRequest}
                    onRequestChange={updateActiveRequest}
                    history={history}
                    activeEnvironment={activeEnvironment}
                  />
                </div>
                <div className="w-1/2 min-w-[400px] h-full overflow-hidden">
                  <ResponseViewer
                    response={activeResponse}
                    error={activeError}
                    isLoading={activeIsLoading}
                    onOpenTsTypes={() => setCodeGenState({ open: true, tab: 'ts' })}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportCurl={handleImportCurlText}
        onImportStructured={handleImportStructured}
      />

      <EnvManagerModal
        isOpen={isEnvModalOpen}
        onClose={() => setIsEnvModalOpen(false)}
        environments={environments}
        activeEnvironmentId={activeEnvironmentId}
        onSaveEnvironments={handleSaveEnvironments}
      />

      {activeRequest && (
        <CodeGenModal
          isOpen={codeGenState.open}
          onClose={() => setCodeGenState((prev) => ({ ...prev, open: false }))}
          request={activeRequest}
          response={activeResponse}
          initialTab={codeGenState.tab}
        />
      )}

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        requests={allSavedRequests}
        history={history}
        mockRules={mockRules}
        environments={environments}
        onSelectRequest={openRequestInTab}
        onSelectLog={handleImportLoggedRequest}
        onSelectMockRule={openMockRuleInTab}
        onSwitchEnv={handleSwitchActiveEnv}
        onCreateRequest={handleCreateRequest}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenEnvs={() => setIsEnvModalOpen(true)}
      />

      <Modal
        isOpen={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        title={confirmDialog?.title || ''}
        onConfirm={confirmDialog?.onConfirm}
        confirmText={confirmDialog?.confirmText || chrome.i18n.getMessage('confirm')}
        confirmVariant={confirmDialog?.confirmVariant || 'primary'}
      >
        <p className="text-sm text-slate-600 leading-relaxed">{confirmDialog?.message}</p>
      </Modal>
    </div>
  );
};

export default App;
