import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { fixture } from '../fixture.js';
import { STORAGE_KEY } from '../../shared/model.js';
import { DEFINITIONS } from '../../shared/modules.js';

// Set this to an extracted gh-pages tree to audit the committed delivery files.
const runtimeRoot = path.resolve(process.env.OS_AUDIT_RUNTIME_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const prefix = '/codex-tool-lab/';
let server, otherServer, browser, origin, otherOrigin;
const listen = async server => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; };
before(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/other-project/') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Audit sibling</title>'); return; }
    const target = path.resolve(runtimeRoot, decodeURIComponent(pathname.slice(prefix.length)) || 'index.html');
    if (!pathname.startsWith(prefix) || !target.startsWith(runtimeRoot + path.sep)) { response.writeHead(403).end(); return; }
    try {
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(target)];
      response.writeHead(200, { 'Content-Type': mime || 'application/octet-stream' }).end(await readFile(target));
    } catch { response.writeHead(404).end(); }
  });
  otherServer = createServer((request, response) => response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Audit other origin</title>'));
  origin = await listen(server); otherOrigin = await listen(otherServer);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await Promise.all([server, otherServer].map(s => new Promise(resolve => s.close(resolve)))); });
function auditFixture() {
  const data = fixture();
  for (const [id, def] of Object.entries(DEFINITIONS)) if (def.defaults) data.project.modules[id] = { id, status: 'not-started', startDate: null, dueDate: null, progress: 0, alerts: [], data: def.defaults() };
  data.project.privateExtension = 'AUDIT_ONLY_PRIVATE_NOTE';
  return data;
}
async function setup(t, saved = auditFixture()) {
  const context = await browser.newContext({ acceptDownloads: true }); t.after(() => context.close());
  await context.addInitScript(({ prefix, key, saved }) => {
    if (!location.pathname.startsWith(prefix)) return;
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    if (get.call(localStorage, key) === null) set.call(localStorage, key, JSON.stringify(saved));
    set.call(localStorage, 'audit-foreign-card', 'AUDIT_ONLY_NOT_REAL_CARD');
    document.cookie = 'audit_cookie=AUDIT_ONLY_NOT_A_SECRET;path=/';
    window.audit = { reads: [], sensitive: [] };
    Storage.prototype.getItem = function(key) { window.audit.reads.push(String(key)); return get.call(this, key); };
    const block = name => function() { window.audit.sensitive.push(name); throw new Error('Audit blocked sensitive read'); };
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', { get: block('cookie'), set: cookie.set });
    for (const name of ['read', 'readText']) if (navigator.clipboard) Object.defineProperty(navigator.clipboard, name, { value: block(`clipboard.${name}`) });
    if (navigator.credentials) Object.defineProperty(navigator.credentials, 'get', { value: block('credentials.get') });
    window.PaymentRequest = block('PaymentRequest');
    window.showOpenFilePicker = block('showOpenFilePicker'); window.showDirectoryPicker = block('showDirectoryPicker');
    Object.defineProperty(indexedDB, 'open', { value: block('indexedDB.open') });
  }, { prefix, key: STORAGE_KEY, saved });
  return context.newPage();
}

test('audit: deployed entrances read only their own storage, never sensitive APIs or external resources', async t => {
  const saved = auditFixture(); saved.project.title = '<img src="https://example.invalid/leak" onerror="window.auditExecuted=true"><script>window.auditExecuted=true</script>';
  saved.project.modules.archive.data.items.push({ id: 'hostile-url', name: '文字URL', category: 'other', status: 'pending', dueDate: null, location: 'https://example.invalid/leak', keeper: '', recordedDate: null, notes: '' });
  const page = await setup(t, saved), requests = [], errors = []; let downloads = 0;
  page.on('request', r => requests.push({ url: r.url(), method: r.method() })); page.on('pageerror', e => errors.push(e.message)); page.on('download', () => downloads++);
  await page.context().route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + prefix);
  assert.deepEqual(await page.evaluate(() => {
    try { new PaymentRequest(); } catch { /* Positive control: construction is recorded and blocked. */ }
    try { void document.cookie; } catch { /* Positive control: reading is recorded and blocked. */ }
    return window.audit.sensitive;
  }), ['PaymentRequest', 'cookie']);
  for (const entrance of ['index.html', 'dashboard.html', 'calendar.html', ...Object.keys(DEFINITIONS).map(id => `modules/${id}/index.html`)]) {
    await page.goto(origin + prefix + entrance);
    const audit = await page.evaluate(() => ({ ...window.audit, executed: Boolean(window.auditExecuted) }));
    assert.ok(audit.reads.length > 0, entrance); assert.deepEqual([...new Set(audit.reads)], [STORAGE_KEY], entrance);
    assert.deepEqual(audit.sensitive, [], entrance); assert.equal(audit.executed, false, entrance);
    assert.equal(await page.locator('#main img, #main script, iframe, form, input[type=password], input[autocomplete^=cc-]').count(), 0, entrance);
  }
  assert.equal(downloads, 0); assert.deepEqual(errors, []);
  assert.equal(requests.some(r => new URL(r.url).origin !== origin || r.method !== 'GET'), false);
  // The sole fetch action is a fixed, local sample, never an input-supplied URL.
  page.on('dialog', d => d.dismiss()); const sample = page.waitForResponse(origin + prefix + 'samples/demo.json');
  await page.getByRole('button', { name: 'サンプル公演を試す', exact: true }).click(); await sample;
  assert.equal(requests.some(r => new URL(r.url).origin !== origin || r.method !== 'GET'), false);
});

test('audit boundary: sibling paths can read and alter OS storage; other origins cannot read it', async t => {
  const page = await setup(t); await page.goto(origin + prefix);
  await page.goto(origin + '/other-project/');
  const value = await page.evaluate(key => {
    const document = JSON.parse(localStorage.getItem(key));
    const observed = document.project.privateExtension;
    document.project.title = 'AUDIT_ONLY_SIBLING_MUTATION'; localStorage.setItem(key, JSON.stringify(document)); return observed;
  }, STORAGE_KEY);
  assert.equal(value, 'AUDIT_ONLY_PRIVATE_NOTE');
  await page.goto(origin + prefix); assert.equal(await page.getByLabel('公演タイトル（必須）', { exact: true }).inputValue(), 'AUDIT_ONLY_SIBLING_MUTATION');
  await page.goto(otherOrigin); assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null);
});

test('audit: deeply nested JSON is rejected without replacing existing data', async t => {
  const page = await setup(t); await page.goto(origin + prefix);
  const saved = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  const source = saved.slice(0, -1) + ',"deep":' + '{"a":'.repeat(12000) + 'null' + '}'.repeat(12000) + '}';
  await page.locator('input[data-import=project]').setInputFiles({ name: 'deep.json', mimeType: 'application/json', buffer: Buffer.from(source) });
  await page.getByRole('status').filter({ hasText: /深さ|call stack/i }).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), saved);
  assert.equal(await page.getByLabel('公演タイトル（必須）', { exact: true }).inputValue(), '架空公演');
});

test('audit boundary: module backups retain private common extensions as plaintext', async t => {
  const page = await setup(t); await page.goto(origin + prefix + 'modules/flyer/index.html');
  const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: 'このモジュールのJSONを書き出す', exact: true }).click();
  const packet = JSON.parse(await readFile(await (await waiting).path(), 'utf8'));
  assert.equal(packet.document.project.privateExtension, 'AUDIT_ONLY_PRIVATE_NOTE');
  assert.deepEqual(Object.keys(packet.document.project.modules), ['flyer']); assert.deepEqual(packet.document.project.documents, []);
});

test('audit: imported prototype keys stay data and CSV/ICS control strings are escaped', async t => {
  const page = await setup(t); await page.goto(origin + prefix);
  const observed = await page.evaluate(async ({ prefix, document }) => {
    const { parseDocument } = await import(prefix + 'shared/model.js');
    const { csv } = await import(prefix + 'shared/common.js');
    const { calendarICS } = await import(prefix + 'shared/calendar-outputs.js');
    const { parseModuleBackup } = await import(prefix + 'shared/module-backup.js');
    const source = JSON.stringify(document).slice(0, -1) + ',"__proto__":{"auditPolluted":true},"constructor":{"prototype":{"auditPolluted":true}}}';
    const parsed = parseDocument(source);
    let rejected = false;
    try { parseModuleBackup(JSON.stringify({ format: 'theater-production-os-module', formatVersion: 1, moduleId: '__proto__', document }), '__proto__'); } catch { rejected = true; }
    return {
      polluted: Boolean(Object.prototype.auditPolluted || ({}).auditPolluted), ownPrototypeKey: Object.hasOwn(parsed, '__proto__'), rejected,
      csv: csv([['=1+1', '+1+1', '-1+1', '@SUM(1)', '\t=1', '\r=1', '\n=1', '  =1', 'a"b']]),
      ics: calendarICS(document.project, [{ id: 'audit', moduleId: 'project', type: 'manual', title: 'name\r\nATTENDEE:https://example.invalid\r\nBEGIN:VEVENT', date: '2026-10-02', status: 'planned' }])
    };
  }, { prefix, document: auditFixture() });
  assert.equal(observed.polluted, false); assert.equal(observed.ownPrototypeKey, true); assert.equal(observed.rejected, true);
  assert.equal(observed.csv.match(/"'/g).length, 8); assert.ok(observed.csv.includes('"a""b"'));
  assert.equal(observed.ics.match(/(?:^|\r\n)BEGIN:VEVENT\r\n/g).length, 1);
  assert.equal(/(?:^|\r\n)(ATTENDEE|URL|ATTACH):/.test(observed.ics), false);
});
