import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const tempDir = resolve(root, '.tmp-tests');
const bundledFile = resolve(tempDir, 'InputTable.mjs');

await mkdir(tempDir, { recursive: true });

await build({
  entryPoints: [resolve(root, 'components', 'InputTable.tsx')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundledFile,
  external: ['react'],
  logLevel: 'silent',
});

const { getSelectAllState, applyToggleAll } = await import(pathToFileURL(bundledFile).href);

const defaultRows = [
  { id: 'default-empty-row', key: '', value: '', enabled: true, type: 'text' },
];

assert.equal(getSelectAllState(defaultRows).allEnabled, true, 'default empty row should make select-all checked when enabled');
assert.deepEqual(
  applyToggleAll(defaultRows).map(row => ({ id: row.id, enabled: row.enabled })),
  [
    { id: 'default-empty-row', enabled: false },
  ],
  'select-all should toggle the default empty row',
);

const rows = [
  { id: 'header-with-key', key: 'Authorization', value: 'token', enabled: true, type: 'text' },
  { id: 'header-without-key', key: '', value: 'Bearer token', enabled: false, type: 'text' },
];

assert.equal(getSelectAllState(rows).allEnabled, false, 'empty-key row should affect select-all checked state');
assert.deepEqual(
  applyToggleAll(rows).map(row => ({ id: row.id, enabled: row.enabled })),
  [
    { id: 'header-with-key', enabled: true },
    { id: 'header-without-key', enabled: true },
  ],
  'select-all should enable rows even when key is empty',
);

const allEnabledRows = rows.map(row => ({ ...row, enabled: true }));
assert.deepEqual(
  applyToggleAll(allEnabledRows).map(row => ({ id: row.id, enabled: row.enabled })),
  [
    { id: 'header-with-key', enabled: false },
    { id: 'header-without-key', enabled: false },
  ],
  'select-all should disable rows even when key is empty',
);

await rm(tempDir, { recursive: true, force: true });
console.log('InputTable select-all tests passed');
