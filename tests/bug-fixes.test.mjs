import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build, transformSync } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

test('queryStringToParams handles = in values and malformed % encoding without throwing', async () => {
  const tempDir = resolve(root, '.tmp-tests-bugfix');
  const bundledFile = resolve(tempDir, 'utils.mjs');
  await mkdir(tempDir, { recursive: true });
  try {
    await build({
      entryPoints: [resolve(root, 'utils.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: bundledFile,
      logLevel: 'silent',
    });
    const { queryStringToParams } = await import(pathToFileURL(bundledFile).href);

    const withEquals = queryStringToParams('token=abc=def==&redirect=https://a.com?x=1');
    assert.equal(withEquals.length, 2);
    assert.equal(withEquals[0].key, 'token');
    assert.equal(withEquals[0].value, 'abc=def==');
    assert.equal(withEquals[1].key, 'redirect');
    assert.equal(withEquals[1].value, 'https://a.com?x=1');

    const malformed = queryStringToParams('q=100%&bad=%E0%A4%A');
    assert.equal(malformed.length, 2);
    assert.equal(malformed[0].value, '100%');
    assert.equal(malformed[1].value, '%E0%A4%A');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('mock-injector XHR replace fires readystatechange once and parses json responseType', async () => {
  const source = readFileSync(resolve(root, 'mock-injector.ts'), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'iife' });

  const messageListeners = [];
  const window = {
    location: { href: 'https://example.com/' },
    addEventListener(type, listener) {
      if (type === 'message') messageListeners.push(listener);
    },
    postMessage(message) {
      for (const listener of messageListeners) {
        listener({ source: window, data: message });
      }
    },
    fetch: async () => new Response('{}'),
  };

  class FakeXHR {
    constructor() {
      this.responseType = '';
      this.readyState = 0;
      this.listeners = {};
      this.onreadystatechange = null;
      this.onload = null;
    }
    open() {}
    setRequestHeader() {}
    send() {}
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    }
    dispatchEvent(ev) {
      const type = ev.type;
      if (type === 'readystatechange' && typeof this.onreadystatechange === 'function') {
        this.onreadystatechange(ev);
      }
      if (type === 'load' && typeof this.onload === 'function') {
        this.onload(ev);
      }
      for (const fn of this.listeners[type] || []) fn(ev);
      return true;
    }
  }

  class FakeEvent {
    constructor(type) { this.type = type; }
  }

  const context = vm.createContext({
    window,
    XMLHttpRequest: FakeXHR,
    Response,
    Headers,
    URL,
    ProgressEvent: FakeEvent,
    Event: FakeEvent,
    setTimeout,
    Date,
    console,
  });
  vm.runInContext(code, context);

  window.postMessage({
    source: 'xapi-mock',
    type: 'rules',
    enabled: true,
    rules: [{
      id: 'xhr-1',
      name: 'xhr json replace',
      enabled: true,
      urlPattern: 'https://example.com/api/item',
      matchMode: 'startsWith',
      method: 'GET',
      mode: 'replace',
      replaceStatus: 200,
      replaceContentType: 'application/json',
      replaceBody: '{"ok":true,"count":42}',
    }],
  }, '*');

  await new Promise((resolveDone, rejectDone) => {
    const xhr = new context.XMLHttpRequest();
    xhr.responseType = 'json';
    let readyStateCount = 0;
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) readyStateCount += 1;
    };
    xhr.onload = () => {
      try {
        assert.equal(readyStateCount, 1, 'onreadystatechange should fire exactly once');
        assert.deepEqual(JSON.parse(JSON.stringify(xhr.response)), { ok: true, count: 42 });
        resolveDone();
      } catch (err) {
        rejectDone(err);
      }
    };
    xhr.open('GET', '/api/item');
    xhr.send();
  });
});
