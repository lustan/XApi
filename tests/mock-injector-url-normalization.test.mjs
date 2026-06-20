import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../mock-injector.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'iife' });

const messageListeners = [];
const postedMessages = [];

const window = {
  location: { href: 'https://example.com/app/page.html' },
  addEventListener(type, listener) {
    if (type === 'message') messageListeners.push(listener);
  },
  postMessage(message) {
    postedMessages.push(message);
    for (const listener of messageListeners) {
      listener({ source: window, data: message });
    }
  },
  fetch: async () => new Response(JSON.stringify({ name: 'old' }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
};

class FakeXMLHttpRequest {}
FakeXMLHttpRequest.prototype.open = function () {};
FakeXMLHttpRequest.prototype.send = function () {};
FakeXMLHttpRequest.prototype.setRequestHeader = function () {};

const context = vm.createContext({
  window,
  XMLHttpRequest: FakeXMLHttpRequest,
  Response,
  Headers,
  URL,
  ProgressEvent: class ProgressEvent {},
  Event: class Event {},
  setTimeout,
  Date,
  console
});
vm.runInContext(code, context);

window.postMessage({
  source: 'xapi-mock',
  type: 'rules',
  enabled: true,
  rules: [{
    id: 'rule-1',
    name: 'absolute url rule',
    enabled: true,
    urlPattern: 'https://example.com/api/user',
    matchMode: 'startsWith',
    method: 'GET',
    mode: 'patch-json',
    jsonPatches: [{ id: 'patch-1', path: 'name', value: 'new', enabled: true }]
  }]
}, '*');

const response = await window.fetch('/api/user');
assert.equal(await response.text(), JSON.stringify({ name: 'new' }));

const responseMessage = postedMessages.find(message => message.type === 'response');
assert.equal(responseMessage?.url, 'https://example.com/api/user');
