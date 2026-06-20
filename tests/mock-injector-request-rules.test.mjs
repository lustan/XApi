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
  fetch: async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
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

assert.ok(
  postedMessages.some(message => message.source === 'xapi-mock' && message.type === 'request-rules'),
  'injector should request rules after its message listener is ready'
);
