import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const configSource = readFileSync(new URL('../config.ts', import.meta.url), 'utf8');
const backgroundSource = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');
const requestEditorSource = readFileSync(new URL('../components/RequestEditor.tsx', import.meta.url), 'utf8');

test('manifest permissions are strictly scoped to actively used Chrome APIs', () => {
  assert.deepEqual(
    manifest.permissions,
    ['storage', 'webRequest', 'declarativeNetRequest'],
    'manifest.json must only request permissions actively used by the extension'
  );

  assert.equal(manifest.permissions.includes('scripting'), false);
  assert.equal(manifest.permissions.includes('contextMenus'), false);
  assert.equal(manifest.permissions.includes('declarativeNetRequestFeedback'), false);

  assert.match(backgroundSource, /chrome\.storage\./);
  assert.match(backgroundSource, /chrome\.webRequest\./);
  assert.match(backgroundSource, /chrome\.declarativeNetRequest\./);
  assert.equal(requestEditorSource.includes('chrome.scripting'), false);
});

test('extension version is upgraded above 3.1.9 and synced across manifest and config', () => {
  assert.equal(manifest.version, '3.2.0');
  assert.match(configSource, /VERSION:\s*"3\.2\.0"/);
});
