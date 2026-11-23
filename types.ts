

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  type?: 'text' | 'file'; // For form-data
  file?: File; // Store the actual file object
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
  bodyType: 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded';
  bodyRaw: string;
  bodyForm: KeyValue[]; // Used for both multipart and urlencoded
  bodyRawType?: 'json' | 'text' | 'html' | 'xml';
}

// Global request headers injected into every network request via DNR.
export interface GlobalHeader {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
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
}

export interface CollectionItem {
  id: string;
  name: string;
  collapsed?: boolean;
  requests: HttpRequest[];
}

export interface LoggedRequest {
  id: string;
  url: string;
  method: string;
  status: number;
  timestamp: number;
  type: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string | Record<string, any>; // Parsed body or raw string
  responseHeaders?: Record<string, string>;
  // Captured by mock-injector for JSON responses only (best-effort).
  responseBody?: string;
  responseTruncated?: boolean;
}

export type SidebarTab = 'collections' | 'history' | 'mock';

// ============== Mock Rules (Modify Response) ==============
export type RuleMatchMode = 'startsWith';
export type MockMode = 'replace' | 'patch-json';

export interface JsonPatch {
  id: string;
  path: string;        // e.g. "data.user.name" or "data.list[0].id"
  value: string;       // literal string; prefix with "::raw::" to inject as raw JSON
  enabled: boolean;
}

export interface MockRule {
  id: string;
  name: string;
  enabled: boolean;
  // matching
  urlPattern: string;
  matchMode: RuleMatchMode;
  method: HttpMethod | 'ANY';
  // modification
  mode: MockMode;
  // mode = 'replace'
  replaceStatus?: number;
  replaceContentType?: string;
  replaceBody?: string;
  // mode = 'patch-json'
  jsonPatches?: JsonPatch[];
  // metadata
  createdAt: number;
  hitCount?: number;
  lastHitAt?: number;
}

// New: Tab Interface
export interface TabItem {
    id: string; // usually requestId, mockRuleId, or 'welcome'
    type: 'request' | 'welcome' | 'mock';
    title: string;
    method?: HttpMethod;
    isDirty?: boolean; // Has unsaved changes (optional for future)
    data?: HttpRequest; // The actual request object if it's a request tab
    mockData?: MockRule; // For mock-rule editor tabs
    // Persist response state per tab
    response?: HttpResponse | null;
    error?: string | null;
    isLoading?: boolean;
}
