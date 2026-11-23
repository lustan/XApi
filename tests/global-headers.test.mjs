import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'iife' });

function loadBackground(state) {
  const updates = [];
  const listeners = {};
  const event = name => ({ addListener: fn => { listeners[name] = fn; } });
  const chrome = {
    runtime: {
      id: 'test-extension',
      onInstalled: event('installed'),
      onStartup: event('startup'),
      onMessage: event('message'),
    },
    storage: {
      local: { get: (_keys, callback) => callback(state) },
      onChanged: event('changed'),
    },
    declarativeNetRequest: {
      ResourceType: { MAIN_FRAME: 'main_frame', SUB_FRAME: 'sub_frame', XMLHTTPREQUEST: 'xmlhttprequest', IMAGE: 'image', SCRIPT: 'script', STYLESHEET: 'stylesheet', FONT: 'font', MEDIA: 'media', WEBSOCKET: 'websocket', OTHER: 'other' },
      HeaderOperation: { SET: 'set' },
      RuleActionType: { MODIFY_HEADERS: 'modifyHeaders' },
      updateSessionRules: async update => { updates.push(update); },
    },
    webRequest: Object.fromEntries(['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived', 'onCompleted', 'onErrorOccurred'].map(name => [name, event(name)])),
  };
  vm.runInNewContext(code, { chrome, console });
  return { updates, listeners };
}

test('global headers include navigation and static assets while replay stays scoped', () => {
  const { updates, listeners } = loadBackground({
    globalHeadersEnabled: true,
    globalHeaders: [
      { key: 'X-Test', value: 'enabled', enabled: true },
      { key: 'X-Disabled', value: 'ignored', enabled: false },
      { key: '', value: 'ignored', enabled: true },
    ],
  });
  listeners.startup();
  const rule = JSON.parse(JSON.stringify(updates.at(-1).addRules[0]));
  assert.equal(rule.id, 2);
  assert.equal(rule.priority, 1);
  for (const type of ['main_frame', 'sub_frame', 'xmlhttprequest', 'image', 'script', 'stylesheet', 'font']) {
    assert.ok(rule.condition.resourceTypes.includes(type), type);
  }
  assert.deepEqual(rule.action.requestHeaders, [{ header: 'X-Test', operation: 'set', value: 'enabled' }]);
  listeners.message({ type: 'SET_REQUEST_HEADERS', url: 'https://example.com/api', headers: [{ key: 'X-Test', value: 'replay' }] }, {}, () => {});
  const replay = JSON.parse(JSON.stringify(updates.at(-1).addRules[0]));
  assert.equal(replay.id, 1);
  assert.ok(replay.priority > rule.priority);
  assert.deepEqual(replay.condition.resourceTypes, ['xmlhttprequest']);
});

test('disabling or clearing global headers removes only the global rule', () => {
  for (const state of [
    { globalHeadersEnabled: false, globalHeaders: [{ key: 'X-Test', enabled: true }] },
    { globalHeadersEnabled: true, globalHeaders: [] },
  ]) {
    const { updates, listeners } = loadBackground(state);
    listeners.changed({ globalHeaders: { newValue: state.globalHeaders } });
    assert.deepEqual(JSON.parse(JSON.stringify(updates.at(-1))), { removeRuleIds: [2] });
  }
});
