import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVariableMap,
  interpolateTemplate,
  interpolateRequest,
  extractValueByPath,
  applyExtractRules,
} from '../envUtils';
import {
  generateFetchCode,
  generateAxiosCode,
  jsonToTypeScript,
} from '../codeGenUtils';
import {
  extractGraphqlOperationName,
  parsePostmanCollection,
  parseOpenApiSpec,
  parseUniversalImportJson,
  computeLineDiff,
} from '../importExportUtils';
import {
  collectAllRequestIds,
  collectAllCollectionRequests,
  addSubfolderToCollections,
  renameCollectionInTree,
  toggleCollectionCollapseInTree,
  deleteCollectionFromTree,
  flattenCollectionsForPicker,
  filterCollectionsTree,
} from '../collectionUtils';
import {
  matchUrl,
  matchRule,
  applyMockTemplate,
  createMockRule,
  createScenarioFromRule,
  applyScenarioToRule,
} from '../mockUtils';
import { CollectionItem, HttpRequest } from '../types';

test('envUtils interpolates variables, built-in tokens, and extracts chaining values', () => {
  const vars = buildVariableMap([
    { id: '1', key: 'baseUrl', value: 'https://api.example.com', enabled: true },
    { id: '2', key: 'token', value: 'old-token', enabled: true },
    { id: '3', key: 'disabledVar', value: 'ignored', enabled: false },
  ]);

  assert.equal(interpolateTemplate('{{baseUrl}}/users/{{disabledVar}}', vars), 'https://api.example.com/users/{{disabledVar}}');
  const uuid = interpolateTemplate('{{$uuid}}', vars);
  assert.match(uuid, /^[0-9a-f-]{36}$/i);

  const req: HttpRequest = {
    id: 'r1',
    name: 'Login',
    url: '{{baseUrl}}/login',
    method: 'POST',
    headers: [{ id: 'h1', key: 'Authorization', value: 'Bearer {{token}}', enabled: true }],
    params: [{ id: 'p1', key: 'ts', value: '{{$timestamp}}', enabled: true }],
    bodyType: 'raw',
    bodyRaw: '{"host":"{{baseUrl}}"}',
    bodyForm: [],
  };

  const resolved = interpolateRequest(req, [
    { id: '1', key: 'baseUrl', value: 'https://api.example.com', enabled: true },
    { id: '2', key: 'token', value: 'abc123', enabled: true },
  ]);
  assert.equal(resolved.url, 'https://api.example.com/login');
  assert.equal(resolved.headers[0].value, 'Bearer abc123');
  assert.match(resolved.params[0].value, /^\d+$/);
  assert.equal(resolved.bodyRaw, '{"host":"https://api.example.com"}');

  assert.equal(extractValueByPath({ data: { items: [{ id: 42 }] } }, 'data.items[0].id'), 42);

  const extracted = applyExtractRules(
    JSON.stringify({ data: { accessToken: 'new-jwt' } }),
    { 'x-request-id': 'req-99' },
    [
      { id: 'e1', source: 'body', path: 'data.accessToken', variableName: 'token', enabled: true },
      { id: 'e2', source: 'header', path: 'X-Request-Id', variableName: 'lastReqId', enabled: true },
    ],
    [{ id: '2', key: 'token', value: 'old-token', enabled: true }]
  );
  assert.equal(extracted.extractedCount, 2);
  assert.equal(extracted.variables.find((v) => v.key === 'token')?.value, 'new-jwt');
  assert.equal(extracted.variables.find((v) => v.key === 'lastReqId')?.value, 'req-99');
});

test('codeGenUtils generates Fetch, Axios, and TypeScript interfaces cleanly', () => {
  const req: HttpRequest = {
    id: 'g1',
    name: 'GraphQL',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    headers: [{ id: 'h1', key: 'Authorization', value: 'Bearer xyz', enabled: true }],
    params: [],
    bodyType: 'graphql',
    bodyRaw: '',
    bodyForm: [],
    graphqlQuery: 'query GetUser($id: ID!) { user(id: $id) { name } }',
    graphqlVariables: '{"id":"1"}',
  };

  const fetchCode = generateFetchCode(req);
  assert.match(fetchCode, /await fetch\("https:\/\/api\.example\.com\/graphql"/);
  assert.match(fetchCode, /"Content-Type": "application\/json"/);
  assert.match(fetchCode, /GetUser/);

  const axiosCode = generateAxiosCode(req);
  assert.match(axiosCode, /import axios from 'axios'/);
  assert.match(axiosCode, /method: "post"/);

  const tsCode = jsonToTypeScript(
    {
      code: 0,
      user: { id: 1, name: 'Ada' },
      tags: [{ id: 1, label: 'admin' }, { id: 2 }],
    },
    'UserPayload'
  );
  assert.match(tsCode, /export interface UserPayload/);
  assert.match(tsCode, /export interface User/);
  assert.match(tsCode, /label\?: string;/);
});

test('importExportUtils parses Postman v2.1 folders, OpenAPI specs, GraphQL ops, and diffs', () => {
  assert.equal(
    extractGraphqlOperationName({ query: 'mutation UpdateProfile($in: Input!) { updateProfile(in: $in) { ok } }' }),
    'UpdateProfile'
  );

  const postman = parsePostmanCollection({
    info: { name: 'My API' },
    item: [
      {
        name: 'Auth Folder',
        item: [
          {
            name: 'Get Token',
            request: {
              method: 'POST',
              url: 'https://auth.example.com/token?scope=read',
              header: [{ key: 'X-App', value: 'xapi' }],
              body: { mode: 'raw', raw: '{"grant":"client"}' },
            },
          },
        ],
      },
    ],
  });
  assert.ok(postman);
  assert.equal(postman.name, 'My API');
  assert.equal(postman.collections?.[0].name, 'Auth Folder');
  assert.equal(postman.collections?.[0].requests[0].method, 'POST');

  const openapi = parseOpenApiSpec({
    openapi: '3.0.0',
    info: { title: 'Pet API' },
    servers: [{ url: 'https://pets.example.com' }],
    paths: {
      '/pets': {
        get: {
          tags: ['Pets'],
          summary: 'List Pets',
          parameters: [{ name: 'limit', in: 'query', required: true }],
        },
      },
    },
  });
  assert.ok(openapi);
  assert.equal(openapi.name, 'Pet API');
  assert.equal(openapi.collections?.[0].requests[0].url, 'https://pets.example.com/pets');

  const universal = parseUniversalImportJson(JSON.stringify([{ urlPattern: 'https://a.com', method: 'GET' }]));
  assert.equal(universal.kind, 'mock-rules');

  const diff = computeLineDiff('a\nb\nc', 'a\nx\nc\nd');
  assert.equal(diff.some((l) => l.type === 'removed' && l.text === 'b'), true);
  assert.equal(diff.some((l) => l.type === 'added' && l.text === 'x'), true);
  assert.equal(diff.some((l) => l.type === 'added' && l.text === 'd'), true);
});

test('collectionUtils supports nested subfolders, renaming, filtering, and flattening', () => {
  const req1: HttpRequest = {
    id: 'req-1',
    collectionId: 'root-col',
    name: 'List Users',
    url: 'https://api.example.com/users',
    method: 'GET',
    headers: [],
    params: [],
    bodyType: 'none',
    bodyRaw: '',
    bodyForm: [],
  };
  const tree: CollectionItem[] = [{ id: 'root-col', name: 'Core', collapsed: false, requests: [req1] }];

  const withSub = addSubfolderToCollections(tree, 'root-col', 'Admin');
  const subId = withSub[0].collections?.[0].id!;
  assert.ok(subId);

  const flattened = flattenCollectionsForPicker(withSub);
  assert.deepEqual(
    flattened.map((x) => x.label),
    ['Core', 'Core / Admin']
  );

  const renamed = renameCollectionInTree(withSub, subId, 'V2 Admin');
  assert.equal(renamed[0].collections?.[0].name, 'V2 Admin');

  const collapsed = toggleCollectionCollapseInTree(renamed, subId);
  assert.equal(collapsed[0].collections?.[0].collapsed, true);

  assert.deepEqual(collectAllRequestIds(collapsed), ['req-1']);
  assert.equal(collectAllCollectionRequests(collapsed).length, 1);

  const filtered = filterCollectionsTree(collapsed, 'users');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].requests.length, 1);

  const afterDel = deleteCollectionFromTree(collapsed, subId);
  assert.equal(afterDel[0].collections?.length, 0);
});

test('mockUtils supports match modes, conditions, templates, and scenarios', () => {
  assert.equal(matchUrl('https://api.example.com/v1/users/42', 'https://api.example.com/*/users/*', 'wildcard'), true);
  assert.equal(matchUrl('https://api.example.com/v1/users/42', 'https://api.example.com/v1/users/42', 'exact'), true);
  assert.equal(matchUrl('https://api.example.com/v1/users/42', '/users/\\d+$', 'regex'), true);

  const rule = createMockRule({
    name: 'User Profile',
    urlPattern: 'https://api.example.com/users*',
    matchMode: 'wildcard',
    method: 'POST',
    queryMatch: 'role=admin',
    bodyMatch: '"active":true',
    replaceBody: '{"ok":true,"role":"{{query.role}}","user":"{{body.name}}","method":"{{method}}"}',
  });

  assert.equal(
    matchRule('https://api.example.com/users?role=user', 'POST', [rule], '{"active":true}'),
    undefined
  );
  assert.ok(
    matchRule('https://api.example.com/users?role=admin', 'POST', [rule], '{"active":true,"name":"Ada"}')
  );

  const rendered = applyMockTemplate(rule.replaceBody || '', {
    url: 'https://api.example.com/users?role=admin',
    method: 'POST',
    requestBody: { name: 'Ada' },
  });
  assert.equal(rendered, '{"ok":true,"role":"admin","user":"Ada","method":"POST"}');

  const errScenario = createScenarioFromRule({ ...rule, replaceStatus: 500, replaceBody: '{"err":1}' }, 'Server Error');
  const updatedRule = applyScenarioToRule({ ...rule, scenarios: [errScenario] }, errScenario);
  assert.equal(updatedRule.replaceStatus, 500);
  assert.equal(updatedRule.replaceBody, '{"err":1}');
  assert.equal(updatedRule.activeScenarioId, errScenario.id);
});
