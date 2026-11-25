export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  type?: 'text' | 'file'; // For form-data
  file?: File; // Store the actual file object
}

export interface ExtractRule {
  id: string;
  source: 'body' | 'header';
  path: string;        // JSON path e.g. "data.token" or header name e.g. "x-auth-token"
  variableName: string; // Target env variable key e.g. "token"
  enabled: boolean;
}

export interface HttpRequest {
  id: string;
  collectionId?: string;
  name: string;
  url: string;
  method: HttpMethod;
  headers: KeyValue[];
  params: KeyValue[];
  // Body configuration
  bodyType: 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'graphql';
  bodyRaw: string;
  bodyForm: KeyValue[]; // Used for both multipart and urlencoded
  bodyRawType?: 'json' | 'text' | 'html' | 'xml';
  graphqlQuery?: string;
  graphqlVariables?: string;
  extractRules?: ExtractRule[];
}

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface EnvironmentItem {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

// Global request headers injected into every network request via DNR.
export interface GlobalHeader {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  operation?: 'set' | 'remove';
}

export interface HeaderProfile {
  id: string;
  name: string;
  headers: GlobalHeader[];
  urlFilter?: string;
}

export interface SseEvent {
  id?: string;
  event?: string;
  data: string;
  timestamp: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  isError?: boolean;
  errorMessage?: string;
  isStreaming?: boolean;
  sseEvents?: SseEvent[];
}

export interface CollectionItem {
  id: string;
  name: string;
  collapsed?: boolean;
  requests: HttpRequest[];
  collections?: CollectionItem[];
}

export interface LoggedRequest {
  id: string;
  url: string;
  method: string;
  status: number;
  timestamp: number;
  duration?: number;
  tabId?: number;
  type: string;
  graphqlOperationName?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string | Record<string, any>; // Parsed body or raw string
  responseHeaders?: Record<string, string>;
  // Captured by mock-injector for JSON responses only (best-effort).
  responseBody?: string;
  responseTruncated?: boolean;
}

export type SidebarTab = 'collections' | 'history' | 'mock';

// ============== Mock Rules (Modify Response) ==============
export type RuleMatchMode = 'startsWith' | 'exact' | 'wildcard' | 'regex';
export type MockMode = 'replace' | 'patch-json';

export interface JsonPatch {
  id: string;
  path: string;        // e.g. "data.user.name" or "data.list[0].id"
  value: string;       // literal string; prefix with "::raw::" to inject as raw JSON
  enabled: boolean;
}

export interface MockResponseHeader {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface MockScenario {
  id: string;
  name: string;
  mode: MockMode;
  replaceStatus?: number;
  replaceContentType?: string;
  replaceBody?: string;
  replaceHeaders?: MockResponseHeader[];
  jsonPatches?: JsonPatch[];
  delayMs?: number;
  simulateNetworkError?: boolean;
}

export interface MockRule {
  id: string;
  name: string;
  enabled: boolean;
  // matching
  urlPattern: string;
  matchMode: RuleMatchMode;
  method: HttpMethod | 'ANY';
  queryMatch?: string;
  bodyMatch?: string;
  // modification
  mode: MockMode;
  // simulation
  delayMs?: number;
  simulateNetworkError?: boolean;
  // mode = 'replace'
  replaceStatus?: number;
  replaceContentType?: string;
  replaceBody?: string;
  replaceHeaders?: MockResponseHeader[];
  // mode = 'patch-json'
  jsonPatches?: JsonPatch[];
  // multi-scenario presets
  scenarios?: MockScenario[];
  activeScenarioId?: string;
  // metadata
  createdAt: number;
  hitCount?: number;
  lastHitAt?: number;
}

export interface TabItem {
  id: string; // usually requestId, mockRuleId, diff id, or 'welcome'
  type: 'request' | 'welcome' | 'mock' | 'diff';
  title: string;
  method?: HttpMethod;
  isDirty?: boolean;
  data?: HttpRequest; // The actual request object if it's a request tab
  mockData?: MockRule; // For mock-rule editor tabs
  diffData?: { left: LoggedRequest; right: LoggedRequest };
  // Persist response state per tab
  response?: HttpResponse | null;
  error?: string | null;
  isLoading?: boolean;
}
