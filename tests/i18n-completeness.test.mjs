import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const readText = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

const collectTopLevelKeys = (jsonText) => {
  const keys = [];
  const lines = jsonText.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s{2}"([^"]+)"\s*:\s*\{/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
};

const enRaw = readText('_locales/en/messages.json');
const zhRaw = readText('_locales/zh_CN/messages.json');
const enJson = JSON.parse(enRaw);
const zhJson = JSON.parse(zhRaw);

test('locale files have no duplicate top-level keys and match exact key sets', () => {
  const enTopKeys = collectTopLevelKeys(enRaw);
  const zhTopKeys = collectTopLevelKeys(zhRaw);

  assert.equal(new Set(enTopKeys).size, enTopKeys.length, 'en/messages.json has duplicate keys');
  assert.equal(new Set(zhTopKeys).size, zhTopKeys.length, 'zh_CN/messages.json has duplicate keys');

  const enSet = new Set(Object.keys(enJson));
  const zhSet = new Set(Object.keys(zhJson));

  const missingInZh = [...enSet].filter((k) => !zhSet.has(k));
  const missingInEn = [...zhSet].filter((k) => !enSet.has(k));

  assert.deepEqual(missingInZh, [], `Keys missing in zh_CN/messages.json: ${missingInZh.join(', ')}`);
  assert.deepEqual(missingInEn, [], `Keys missing in en/messages.json: ${missingInEn.join(', ')}`);
});

test('all parameterized locale messages define Chrome native placeholders', () => {
  for (const [localeName, catalog] of [
    ['en', enJson],
    ['zh_CN', zhJson],
  ]) {
    for (const [key, entry] of Object.entries(catalog)) {
      assert.equal(typeof entry.message, 'string', `${localeName}.${key} missing message string`);
      assert.equal(
        /\$\d+/.test(entry.message),
        false,
        `${localeName}.${key} uses positional $1 inside message instead of Chrome $NAME$ + placeholders`
      );
      const tokenMatches = [...entry.message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((m) =>
        m[1].toLowerCase()
      );
      if (tokenMatches.length > 0) {
        assert.ok(entry.placeholders, `${localeName}.${key} is missing placeholders map`);
        const defined = new Set(Object.keys(entry.placeholders).map((k) => k.toLowerCase()));
        for (const tok of tokenMatches) {
          assert.ok(
            defined.has(tok),
            `${localeName}.${key} references $${tok}$ not defined in placeholders`
          );
        }
      }
    }
  }
});

test('all UI chrome.i18n and t() keys exist in both en and zh_CN catalogs', () => {
  const uiFiles = [
    'App.tsx',
    'popup.tsx',
    ...fs
      .readdirSync(path.join(root, 'components'))
      .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
      .map((f) => path.join('components', f)),
  ];

  const referencedKeys = new Set();
  for (const rel of uiFiles) {
    const content = readText(rel);
    for (const m of content.matchAll(/getMessage\??\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g)) {
      referencedKeys.add(m[1]);
    }
    for (const m of content.matchAll(/(?:^|[^\w.])t\s*\(\s*['"]([A-Za-z0-9_]+)['"]/gm)) {
      referencedKeys.add(m[1]);
    }
  }

  const missingEn = [...referencedKeys].filter((k) => !enJson[k]);
  const missingZh = [...referencedKeys].filter((k) => !zhJson[k]);

  assert.deepEqual(missingEn, [], `Missing keys in en/messages.json: ${missingEn.join(', ')}`);
  assert.deepEqual(missingZh, [], `Missing keys in zh_CN/messages.json: ${missingZh.join(', ')}`);
});

test('popup header operation tooltip and remove tag are localized', () => {
  const popup = readText('popup.tsx');
  assert.match(popup, /title=\{isRemove \? removeHeaderOpTitle : setHeaderOpTitle\}/);
  assert.match(popup, /aria-label=\{isRemove \? removeHeaderOpTitle : setHeaderOpTitle\}/);
  assert.match(popup, /\{removeHeaderTag\}/);
  assert.equal(popup.includes("title={isRemove ? 'Remove matching header' : 'Set header value'}"), false);
  assert.equal(popup.includes('>(remove)<'), false);

  assert.equal(enJson.setHeaderOpTitle.message, 'Set header value');
  assert.equal(zhJson.setHeaderOpTitle.message, '设置请求头的值');
  assert.equal(zhJson.removeHeaderOpTitle.message, '移除匹配的请求头');
  assert.equal(zhJson.removeHeaderTag.message, '（移除）');
});
