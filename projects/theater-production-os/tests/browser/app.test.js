import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { fixture } from '../fixture.js';
import { STORAGE_KEY } from '../../shared/model.js';
import { DEFINITIONS } from '../../shared/modules.js';
import { moduleBackup } from '../../shared/module-backup.js';
import { generateTemplate, tokyoToday, addDays } from '../../shared/schedule.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
let server, browser, origin;
const prefix = '/theater-production-os/';
const master = `${prefix}index.html`, budget = `${prefix}modules/budget/index.html`;

before(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
    const relative = decodeURIComponent(pathname.slice(prefix.length));
    const target = path.resolve(projectRoot, relative || 'index.html');
    if (!target.startsWith(projectRoot)) { response.writeHead(403).end(); return; }
    try {
      const content = await readFile(target);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(target)] ?? 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }).end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function setup(t, { saved, width = 1200, failure } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  t.after(() => context.close());
  if (saved !== undefined) await context.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem('fixture-seeded')) return;
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    localStorage.setItem('another-tool', 'keep'); sessionStorage.setItem('fixture-seeded', 'yes');
  }, { key: STORAGE_KEY, value: saved });
  if (failure) await context.addInitScript(mode => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('codex-tool-lab:')) throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    if (mode === 'unavailable') Storage.prototype.getItem = function() { throw new DOMException('denied', 'SecurityError'); };
  }, failure);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no JavaScript runtime errors'));
  return page;
}
async function stored(page) { return page.evaluate(key => localStorage.getItem(key), STORAGE_KEY); }
async function downloadJSON(page, trigger) {
  const waiting = page.waitForEvent('download'); await trigger(); const download = await waiting;
  return readFile(await download.path(), 'utf8');
}
async function upload(page, value) {
  await page.locator('input[data-import=project]').setInputFiles({ name: 'sample.json', mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
}
async function text(page) { return page.locator('[aria-label="試算結果"]').innerText(); }
const waitForText = async (locator, expected) => {
  await locator.filter({ hasText: expected }).waitFor();
};

test('AC-01/02/03/12: create a two-stage project, edit budget, reload and navigate both entrances', async t => {
  const page = await setup(t);
  await page.goto(origin + master);
  assert.equal(await stored(page), null);
  await page.getByLabel('公演タイトル（必須）', { exact: true }).fill('架空公演');
  await page.getByLabel('劇団名', { exact: true }).fill('サンプル劇団');
  await page.getByLabel('劇場名', { exact: true }).fill('サンプル劇場');
  await page.getByLabel('ステージ1の日時', { exact: true }).fill('2026-11-30T14:00');
  await page.getByLabel('ステージ1の販売可能席数', { exact: true }).fill('100');
  await page.getByLabel('料金区分1の料金（円）', { exact: true }).fill('3000');
  await page.getByRole('button', { name: 'ステージを追加', exact: true }).click();
  await page.getByLabel('ステージ2の日時', { exact: true }).fill('2026-11-30T18:00');
  await page.getByLabel('ステージ2の販売可能席数', { exact: true }).fill('100');
  const projectId = JSON.parse(await stored(page)).project.id;
  await page.getByRole('link', { name: '予算モジュールを開く' }).click();
  await page.waitForURL(`**/modules/budget/index.html?projectId=${projectId}`);
  await page.getByRole('button', { name: '固定費を追加', exact: true }).click();
  await page.getByLabel('固定費1の名称', { exact: true }).fill('会場費');
  await page.getByLabel('固定費1の金額（円）', { exact: true }).fill('100000');
  await page.getByLabel('来場者1人当たりの変動費（円）', { exact: true }).fill('500');
  await page.getByLabel('ステージ1・一般の想定販売枚数', { exact: true }).fill('80');
  await page.getByLabel('ステージ2・一般の想定販売枚数', { exact: true }).fill('80');
  await page.getByLabel('予算モジュールの状態', { exact: true }).selectOption('completed');
  for (const expected of ['160人', '480,000円', '180,000円', '300,000円', '80.0%', '40人']) assert.ok((await text(page)).includes(expected));
  await page.reload();
  assert.equal(await page.getByLabel('ステージ1・一般の想定販売枚数', { exact: true }).inputValue(), '80');
  assert.equal(await page.getByLabel('予算モジュールの状態', { exact: true }).inputValue(), 'completed');
  await page.getByRole('link', { name: '公演情報へ戻る' }).click(); await page.waitForURL('**/index.html?projectId=*');
  assert.equal(await page.getByLabel('公演タイトル（必須）', { exact: true }).inputValue(), '架空公演');
  await page.goto(origin + budget);
  assert.ok((await text(page)).includes('480,000円'));
});

test('AC-02: budget entrance with no data creates a project through its master editor', async t => {
  const page = await setup(t); await page.goto(origin + budget);
  await page.getByLabel('公演タイトル（必須）', { exact: true }).fill('単体起動');
  await page.getByLabel('ステージ1の日時', { exact: true }).fill('2026-11-30T14:00');
  assert.equal(JSON.parse(await stored(page)).project.title, '単体起動');
  await page.reload(); assert.ok((await text(page)).includes('0円'));
});

test('AC-05/10: invalid master and sales edits preserve the saved project and quantities', async t => {
  const page = await setup(t, { saved: fixture() }); await page.goto(origin + budget);
  const saved = await stored(page);
  await page.getByLabel('ステージ1・一般の想定販売枚数', { exact: true }).fill('101');
  assert.equal(await stored(page), saved);
  assert.ok((await page.getByTestId('validation-errors').innerText()).includes('席数を超え'));
  assert.equal(await page.getByRole('button', { name: 'JSONを書き出す', exact: true }).isDisabled(), true);
  await page.getByLabel('ステージ1・一般の想定販売枚数', { exact: true }).fill('80');
  await page.getByText('公演情報を作成・編集する', { exact: true }).click();
  await page.getByLabel('料金区分1の料金（円）', { exact: true }).fill('4000');
  assert.ok((await text(page)).includes('640,000円'));
  const savedAfterPrice = await stored(page);
  await page.getByLabel('ステージ1の販売可能席数', { exact: true }).fill('50');
  assert.equal(await stored(page), savedAfterPrice);
  assert.equal(await page.getByLabel('ステージ1・一般の想定販売枚数', { exact: true }).inputValue(), '80');
  await page.getByLabel('ステージ1の販売可能席数', { exact: true }).fill('100');
  await page.getByLabel('料金区分1の料金（円）', { exact: true }).fill('0.5');
  assert.equal(await page.getByLabel('料金区分1の料金（円）', { exact: true }).getAttribute('aria-invalid'), 'true');
  await page.getByLabel('料金区分1の料金（円）', { exact: true }).fill('4000');
  await page.getByRole('button', { name: 'ステージ1を削除', exact: true }).click();
  assert.ok((await page.getByTestId('validation-errors').innerText()).includes('参照先のステージ'));
  assert.equal(JSON.parse(await stored(page)).project.performanceDates.length, 2);
  await page.getByRole('button', { name: '参照先のない販売行を削除', exact: true }).click();
  assert.equal(JSON.parse(await stored(page)).project.performanceDates.length, 1);
});

test('AC-04: zero capacity, impossible break-even, zero fixed cost and excessive break-even render clearly', async t => {
  const d = fixture(); d.project.performanceDates.forEach(s => s.capacity = 0); d.project.modules.budget.data.plannedSales = [];
  const page = await setup(t, { saved: d }); await page.goto(origin + budget);
  assert.ok((await text(page)).includes('—')); assert.ok((await text(page)).includes('収容可能人数を超える'));
  await page.getByText('公演情報を作成・編集する', { exact: true }).click();
  await page.getByLabel('料金区分1の料金（円）', { exact: true }).fill('0');
  assert.ok((await text(page)).includes('この基準料金では黒字化できない'));
  await page.getByLabel('来場者1人当たりの変動費（円）', { exact: true }).fill('0');
  await page.getByLabel('固定費1の金額（円）', { exact: true }).fill('0');
  assert.ok((await text(page)).includes('0人'));
  assert.doesNotMatch(await text(page), /NaN|Infinity/);
});

test('AC-06/07: export/import preserve extensions; invalid and cancelled imports leave data untouched', async t => {
  const d = fixture(); d.project.modules.flyer = { id: 'flyer', status: 'on-hold', startDate: null,
    dueDate: null, progress: 12, alerts: [], data: { draft: '架空原稿' } }; d.project.cast = [{ note: '架空データ' }];
  const page = await setup(t, { saved: d }); await page.goto(origin + master);
  const exported = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click()));
  assert.deepEqual(exported.project.modules.flyer, d.project.modules.flyer); assert.deepEqual(exported.project.cast, d.project.cast);
  const original = await stored(page);
  await upload(page, '{bad'); await waitForText(page.getByRole('status'), '取込みできませんでした');
  assert.equal(await stored(page), original);
  const unknown = fixture(); unknown.schemaVersion = 2;
  await upload(page, unknown); await waitForText(page.getByRole('status'), '対応していない'); assert.equal(await stored(page), original);
  const duplicate = fixture(); duplicate.project.performanceDates[1].id = 'stage-1';
  await upload(page, duplicate); await waitForText(page.getByRole('status'), '重複'); assert.equal(await stored(page), original);
  const dangling = fixture(); dangling.project.modules.budget.data.plannedSales[0].stageId = 'missing';
  await upload(page, dangling); await waitForText(page.getByRole('status'), '参照先'); assert.equal(await stored(page), original);
  page.once('dialog', dialog => dialog.dismiss()); await upload(page, exported);
  await page.getByLabel('公演タイトル（必須）', { exact: true }).waitFor(); assert.equal(await stored(page), original);
  page.once('dialog', dialog => dialog.accept()); await upload(page, exported);
  await waitForText(page.getByRole('status'), 'JSONを取り込み');
  const imported = JSON.parse(await stored(page));
  assert.equal(imported.project.id, exported.project.id); assert.deepEqual(imported.project.modules.flyer, d.project.modules.flyer);
  await page.reload(); assert.equal(await page.getByLabel('公演タイトル（必須）', { exact: true }).inputValue(), '架空公演');
});

test('AC-08: clear confirmation cancellation and OS-only deletion', async t => {
  const page = await setup(t, { saved: fixture() }); await page.goto(origin + master);
  const original = await stored(page);
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: '全データを消去', exact: true }).click();
  assert.equal(await stored(page), original);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '全データを消去', exact: true }).click();
  assert.equal(await stored(page), null); assert.equal(await page.evaluate(() => localStorage.getItem('another-tool')), 'keep');
  assert.equal(await page.getByLabel('公演タイトル（必須）', { exact: true }).inputValue(), '');
});

test('AC-09: corrupt data is protected and can be exported before confirmed recovery', async t => {
  const page = await setup(t, { saved: '{broken' }); await page.goto(origin + master);
  assert.ok((await page.locator('#main').innerText()).includes('保存データを読み込めません'));
  assert.equal(await page.locator('input[type=text]').count(), 0); assert.equal(await stored(page), '{broken');
  assert.equal(await downloadJSON(page, () => page.getByRole('button', { name: '破損データをそのまま書き出す', exact: true }).click()), '{broken');
  page.once('dialog', dialog => dialog.accept()); await upload(page, fixture());
  await waitForText(page.getByRole('status'), 'JSONを取り込み'); assert.equal(JSON.parse(await stored(page)).project.title, '架空公演');
});

test('AC-09: quota failure retains edits and permits valid JSON export', async t => {
  const page = await setup(t, { saved: fixture(), failure: 'quota' }); await page.goto(origin + budget);
  const original = await stored(page);
  await page.getByLabel('来場者1人当たりの変動費（円）', { exact: true }).fill('600');
  await waitForText(page.getByRole('status'), '保存できませんでした'); assert.equal(await stored(page), original);
  const exported = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click()));
  assert.equal(exported.project.modules.budget.data.variableCostPerAttendee, 600);
  await page.getByRole('link', { name: '公演情報へ戻る' }).click();
  assert.ok(page.url().includes('/modules/budget/')); assert.equal(await page.getByLabel('来場者1人当たりの変動費（円）', { exact: true }).inputValue(), '600');
});

test('AC-09: unavailable storage supports editing and JSON export', async t => {
  const page = await setup(t, { failure: 'unavailable' }); await page.goto(origin + master);
  assert.ok((await page.getByRole('status').innerText()).includes('読み取れません'));
  await page.getByLabel('公演タイトル（必須）', { exact: true }).fill('画面内の公演');
  await page.getByLabel('ステージ1の日時', { exact: true }).fill('2026-11-30T14:00');
  const exported = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click()));
  assert.equal(exported.project.title, '画面内の公演');
});

test('AC-11: mobile controls, text safety, future modules and valid links under a subdirectory', async t => {
  const d = fixture(); d.project.title = '<img src=x onerror=alert(1)>';
  const page = await setup(t, { saved: d, width: 375 }); await page.goto(origin + master);
  assert.equal(await page.locator('img').count(), 0);
  assert.ok((await page.locator('#main').innerText()).includes('将来予定'));
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.equal(fits, true, 'no horizontal overflow at 375px');
  await page.getByLabel('劇団名', { exact: true }).fill('モバイル編集');
  await page.getByRole('link', { name: '予算モジュールを開く' }).click(); await page.waitForURL('**/modules/budget/index.html?projectId=*');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const response = await page.request.get(page.url()); assert.equal(response.status(), 200);
  const broken = await page.locator('a').evaluateAll(nodes => nodes.some(a => a.href.includes('undefined'))); assert.equal(broken, false);
});

test('unknown projectId never edits another project', async t => {
  const page = await setup(t, { saved: fixture() });
  await page.goto(origin + budget + '?projectId=missing'); const original = await stored(page);
  assert.ok((await page.locator('#main').innerText()).includes('公演が見つかりません'));
  assert.equal(await page.locator('input').count(), 0); assert.equal(await stored(page), original);
  await page.getByRole('link', { name: '公演の作成・編集へ戻る' }).click();
  await page.waitForURL('**/index.html'); assert.equal(await page.getByLabel('公演タイトル（必須）', { exact: true }).inputValue(), '架空公演');
});

function fullFixture() {
  const d = fixture();
  for (const id of Object.keys(DEFINITIONS).filter(id => id !== 'budget')) d.project.modules[id] = {
    id, status: 'not-started', startDate: null, dueDate: null, progress: 0, alerts: [], data: DEFINITIONS[id].defaults() };
  return d;
}
test('SHARE-01/04/05: mobile share defaults minimize content, opt-in updates exact output and reopening resets choices', async t => {
  const d = fullFixture(); d.project.privateExtension = 'PRIVATE_EXTENSION_CANARY'; d.project.modules.flyer.data.introduction = '<img src="https://example.invalid/leak" onerror="window.shareExecuted=true">PRIVATE_TEXT_CANARY';
  const page = await setup(t, { saved: d, width: 375 }); const external = []; let downloads = 0;
  page.on('request', r => { if (new URL(r.url()).origin !== origin) external.push(r.url()); }); page.on('download', () => downloads++);
  await page.context().route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + prefix + 'modules/flyer/index.html'); const saved = await stored(page);
  const trigger = page.getByRole('button', { name: '共有用資料を作成', exact: true }); await trigger.click();
  const preview = page.getByLabel('共有するJSONの内容', { exact: true });
  const initial = JSON.parse(await preview.innerText()); assert.deepEqual(initial.project, { title: '架空公演' }); assert.equal(initial.module.data, undefined);
  assert.equal(downloads, 0); assert.equal(await page.locator('#main').isVisible(), false);
  await page.screenshot({ path: '/tmp/os-share-default-mobile.png', fullPage: true });
  await page.getByRole('checkbox', { name: '公演名', exact: true }).uncheck(); await page.getByRole('checkbox', { name: '劇団名', exact: true }).check();
  await page.getByRole('checkbox', { name: '作業データ（原稿・メモ・金額など）', exact: true }).check();
  const expected = await preview.innerText(); assert.ok(expected.includes('PRIVATE_TEXT_CANARY')); assert.equal(expected.includes('PRIVATE_EXTENSION_CANARY'), false);
  assert.deepEqual(JSON.parse(expected).project, { companyName: 'サンプル劇団' });
  assert.equal(await page.locator('.share-panel img, .share-panel script, .share-panel iframe').count(), 0); assert.equal(await page.evaluate(() => Boolean(window.shareExecuted)), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const file = await downloadJSON(page, () => page.getByRole('button', { name: '共有用JSON資料を書き出す', exact: true }).click());
  assert.equal(file, expected); assert.equal(downloads, 1); assert.equal(await stored(page), saved); assert.deepEqual(external, []);
  await page.screenshot({ path: '/tmp/os-share-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '編集画面へ戻る', exact: true }).click(); assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  await trigger.click(); assert.equal(await page.getByRole('checkbox', { name: '公演名', exact: true }).isChecked(), true); assert.equal(await page.getByRole('checkbox', { name: '作業データ（原稿・メモ・金額など）', exact: true }).isChecked(), false);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.share-panel').count(), 0); assert.equal(await stored(page), saved);
});
test('SHARE-03: shared reference files cannot replace full or module backups', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + prefix + 'modules/flyer/index.html'); const saved = await stored(page);
  await page.getByRole('button', { name: '共有用資料を作成', exact: true }).click();
  const source = await page.getByLabel('共有するJSONの内容', { exact: true }).innerText(); await page.keyboard.press('Escape');
  let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });
  for (const scope of ['project', 'module']) {
    await page.locator(`input[data-import=${scope}]`).setInputFiles({ name: 'share.json', mimeType: 'application/json', buffer: Buffer.from(source) });
    await page.getByRole('status').filter({ hasText: '共有用資料は復元できません' }).waitFor(); assert.equal(await stored(page), saved);
  }
  assert.equal(dialogs, 0);
});
test('SHARE-03/04: missing or invalid modules refuse sharing and legacy data stays private', async t => {
  const d = fullFixture(); delete d.project.modules.flyer;
  const page = await setup(t, { saved: d }); await page.goto(origin + prefix + 'modules/flyer/index.html');
  await page.getByRole('button', { name: '共有用資料を作成', exact: true }).click(); assert.ok((await page.getByRole('status').innerText()).includes('未入力')); assert.equal(await page.locator('.share-panel').count(), 0);
  await page.getByLabel('公演紹介文', { exact: true }).fill('原稿'); await page.getByText('公演情報を作成・編集する', { exact: true }).click(); await page.getByLabel('公演タイトル（必須）', { exact: true }).fill('');
  await page.getByRole('button', { name: '共有用資料を作成', exact: true }).click(); assert.ok((await page.getByRole('status').innerText()).includes('入力エラー'));
  const legacy = fullFixture(); legacy.project.modules.flyer.data = { privateLegacy: 'PRIVATE_LEGACY_CANARY' };
  const other = await setup(t, { saved: legacy }); await other.goto(origin + prefix + 'modules/flyer/index.html');
  await other.getByRole('button', { name: '共有用資料を作成', exact: true }).click(); assert.equal(await other.getByRole('checkbox', { name: '作業データ（原稿・メモ・金額など）', exact: true }).isDisabled(), true);
  assert.equal((await other.getByLabel('共有するJSONの内容', { exact: true }).innerText()).includes('PRIVATE_LEGACY_CANARY'), false);
});
test('SHARE-04: unsaved valid quota/conflict inputs share without clearing navigation protection', async t => {
  const page = await setup(t, { saved: fullFixture(), failure: 'quota' }); await page.goto(origin + prefix + 'modules/flyer/index.html'); const saved = await stored(page);
  await page.getByLabel('公演紹介文', { exact: true }).fill('未保存の共有原稿'); await page.getByRole('button', { name: '共有用資料を作成', exact: true }).click();
  await page.getByRole('checkbox', { name: '作業データ（原稿・メモ・金額など）', exact: true }).check(); assert.ok((await page.getByLabel('共有するJSONの内容', { exact: true }).innerText()).includes('未保存の共有原稿'));
  await page.keyboard.press('Escape'); assert.equal(await stored(page), saved); assert.equal(await page.getByLabel('公演紹介文', { exact: true }).inputValue(), '未保存の共有原稿');
  await page.getByRole('link', { name: '公演情報へ戻る', exact: true }).click(); assert.ok((await page.getByRole('status').innerText()).includes('保存できていない'));
  const conflict = await setup(t, { saved: fullFixture() }); await conflict.goto(origin + prefix + 'modules/flyer/index.html');
  await conflict.evaluate(key => { const d = JSON.parse(localStorage.getItem(key)); d.project.title = '別タブ更新'; localStorage.setItem(key, JSON.stringify(d)); }, STORAGE_KEY);
  await conflict.getByLabel('公演紹介文', { exact: true }).fill('競合時の共有原稿');
  await conflict.getByRole('button', { name: '共有用資料を作成', exact: true }).click(); await conflict.getByRole('checkbox', { name: '作業データ（原稿・メモ・金額など）', exact: true }).check();
  assert.ok((await conflict.getByLabel('共有するJSONの内容', { exact: true }).innerText()).includes('競合時の共有原稿'));
  await conflict.keyboard.press('Escape'); assert.equal(JSON.parse(await stored(conflict)).project.title, '別タブ更新');
});
test('SHARE-02/05: all module entrances explicitly export shared references with only the selected module', async t => {
  const page = await setup(t, { saved: fullFixture() });
  for (const id of Object.keys(DEFINITIONS)) {
    await page.goto(origin + prefix + `modules/${id}/index.html`); const saved = await stored(page);
    await page.getByRole('button', { name: '共有用資料を作成', exact: true }).click(); await page.getByRole('checkbox', { name: '作業データ（原稿・メモ・金額など）', exact: true }).check();
    const output = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: '共有用JSON資料を書き出す', exact: true }).click()));
    assert.equal(output.format, 'theater-production-os-share'); assert.equal(output.module.id, id); assert.ok(output.module.data); assert.equal(output.document, undefined);
    assert.equal(await stored(page), saved); await page.keyboard.press('Escape');
  }
});
function printFixture() {
  const d = fullFixture();
  const front = d.project.modules['front-desk'].data;
  front.changeFund = 12000; front.guidance = '開場は開演30分前です。\n受付で料金をご確認ください。';
  front.items = [{ id: 'desk', name: '受付配置', category: 'staff', assignee: '受付リーダー', date: '2026-11-29', needed: 3, ready: 2, status: 'preparing', notes: '交代要員を確認' }];
  d.project.modules['stage-operations'].data.items = [
    { id: 'later', name: '場当たり', date: '2026-11-30', startTime: '10:00', endTime: '11:00', department: '舞台', place: 'ステージ', people: 3, assignee: '舞台監督', notes: '動線を確認', status: 'planned' },
    { id: 'early', name: '搬入', date: '2026-11-30', startTime: '09:00', endTime: '10:30', department: '舞台', place: 'ステージ', people: 4, assignee: '舞台班', notes: '完了後に通路を確保', status: 'completed' },
    { id: 'cancelled', name: '取消作業', date: '2026-11-29', startTime: '09:00', endTime: '10:00', department: '照明', place: '', people: 0, assignee: '', notes: '', status: 'cancelled' }
  ];
  return d;
}
test('PRINT-01/02: front-desk preview contains master and preparation details, prints only on demand and restores focus', async t => {
  const page = await setup(t, { saved: printFixture() }); await page.goto(origin + prefix + 'modules/front-desk/index.html');
  const saved = await stored(page); await page.evaluate(() => { window.auditPrintCalls = 0; window.print = () => window.auditPrintCalls++; });
  const trigger = page.getByRole('button', { name: '受付資料の印刷用プレビュー', exact: true }); await trigger.click();
  const preview = page.getByRole('region', { name: '印刷用プレビュー' });
  for (const value of ['架空公演', 'サンプル劇場', '2026-11-30 14:00', '2026-11-30 18:00', '3,000円', '12,000円', '受付配置', '受付リーダー', '2 / 3', '準備中', '交代要員を確認']) assert.ok((await preview.innerText()).includes(value));
  assert.equal(await page.evaluate(() => window.auditPrintCalls), 0); assert.equal(await page.locator('#main').isVisible(), false);
  await page.getByRole('button', { name: '印刷・PDF保存', exact: true }).click(); assert.equal(await page.evaluate(() => window.auditPrintCalls), 1);
  assert.equal(await stored(page), saved); await page.getByRole('button', { name: '編集画面へ戻る', exact: true }).click();
  assert.equal(await page.locator('#main').isVisible(), true); assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  assert.equal(await stored(page), saved); assert.equal(await page.getByLabel('当日案内文', { exact: true }).inputValue(), printFixture().project.modules['front-desk'].data.guidance);
});
test('PRINT-01/03: stage preview sorts work, retains cancellations and warns overlaps, both previews generate A4 PDFs', async t => {
  const page = await setup(t, { saved: printFixture() });
  for (const [id, label, heading] of [['front-desk', '受付資料の印刷用プレビュー', '受付用資料'], ['stage-operations', '舞台進行表の印刷用プレビュー', '舞台進行表']]) {
    await page.goto(origin + prefix + `modules/${id}/index.html`); const saved = await stored(page);
    await page.getByRole('button', { name: label, exact: true }).click();
    const preview = page.getByRole('region', { name: '印刷用プレビュー' }); assert.ok((await preview.innerText()).includes(heading));
    if (id === 'stage-operations') {
      const rows = await preview.locator('tbody tr').allTextContents(); assert.ok(rows[0].includes('取消作業')); assert.ok(rows[1].includes('搬入')); assert.ok(rows[2].includes('場当たり'));
      assert.ok((await preview.innerText()).includes('時間重複')); assert.ok(rows[0].includes('取消')); assert.ok(rows[1].includes('完了'));
    }
    await page.emulateMedia({ media: 'print' }); assert.equal(await preview.locator('.print-controls').isVisible(), false);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: false }); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    await writeFile(`/tmp/os-${id}-print.pdf`, pdf); await page.emulateMedia({ media: 'screen' });
    assert.equal(await stored(page), saved); await page.keyboard.press('Escape'); assert.equal(await preview.count(), 0);
  }
});
test('PRINT-02: invalid inputs refuse preview while storage failure permits valid unsaved printing', async t => {
  const page = await setup(t, { saved: printFixture(), failure: 'quota' }); await page.goto(origin + prefix + 'modules/front-desk/index.html');
  const saved = await stored(page); await page.getByLabel('釣銭元手（円）', { exact: true }).fill('-1');
  await page.getByRole('button', { name: '受付資料の印刷用プレビュー', exact: true }).click(); assert.equal(await page.locator('.print-panel').count(), 0);
  await page.getByLabel('釣銭元手（円）', { exact: true }).fill('20000');
  await page.getByRole('button', { name: '受付資料の印刷用プレビュー', exact: true }).click(); assert.ok((await page.locator('.print-document').innerText()).includes('20,000円'));
  assert.equal(await stored(page), saved); await page.keyboard.press('Escape'); assert.equal(await page.getByLabel('釣銭元手（円）', { exact: true }).inputValue(), '20000');
  await page.getByRole('link', { name: '公演情報へ戻る', exact: true }).click(); assert.ok((await page.getByRole('status').innerText()).includes('保存できていない'));
});
test('PRINT-03: hostile long text stays inert and mobile preview contains overflow and print failure feedback', async t => {
  const d = printFixture(), hostile = '<img src="https://example.invalid/leak" onerror="window.auditPrintExecuted=true"><script>window.auditPrintExecuted=true</script>';
  d.project.modules['front-desk'].data.guidance = hostile + '\n' + '長い案内'.repeat(200);
  const page = await setup(t, { saved: d, width: 375 }), external = []; let downloads = 0;
  page.on('request', r => { if (new URL(r.url()).origin !== origin) external.push(r.url()); }); page.on('download', () => downloads++);
  await page.context().route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + prefix + 'modules/front-desk/index.html'); await page.getByRole('button', { name: '受付資料の印刷用プレビュー', exact: true }).click();
  assert.ok((await page.locator('.print-document').innerText()).includes(hostile)); assert.equal(await page.locator('.print-panel img, .print-panel script, .print-panel iframe').count(), 0);
  assert.equal(await page.evaluate(() => Boolean(window.auditPrintExecuted)), false); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => { window.print = () => { throw new Error('unavailable'); }; }); await page.getByRole('button', { name: '印刷・PDF保存', exact: true }).click();
  assert.ok((await page.getByRole('status').innerText()).includes('印刷を開始できません')); assert.deepEqual(external, []); assert.equal(downloads, 0);
  await page.screenshot({ path: '/tmp/os-front-desk-print-mobile.png', fullPage: true });
});
test('LIMIT-02: both JSON file inputs reject oversize before confirmation and keep saved data', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + prefix + 'modules/flyer/index.html');
  const saved = await stored(page); let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });
  for (const scope of ['project', 'module']) {
    await page.locator(`input[data-import=${scope}]`).setInputFiles({ name: 'too-big.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, ' ') });
    await page.getByRole('status').filter({ hasText: /2MiB/ }).waitFor(); assert.equal(await stored(page), saved);
  }
  assert.equal(dialogs, 0);
});
test('MVP-01/02/10: flyer editing, master-linked preview, text export and saved approval', async t => {
  const page = await setup(t, { saved: fullFixture(), width: 375 });
  await page.goto(origin + prefix + 'modules/flyer/index.html');
  await page.getByLabel('公演紹介文', { exact: true }).fill('<script>架空紹介</script>');
  await page.getByRole('button', { name: '原稿項目を追加', exact: true }).click();
  await page.getByLabel('原稿1の項目名', { exact: true }).fill('ご案内');
  await page.getByLabel('原稿1の本文', { exact: true }).fill('架空の本文');
  await page.getByLabel('原稿1の校正状態', { exact: true }).selectOption('approved');
  await page.getByLabel('入稿予定日', { exact: true }).fill('2026-10-15');
  await page.getByLabel('チラシの状態', { exact: true }).selectOption('in-progress');
  const out = await downloadJSON(page, () => page.getByRole('button', { name: '掲載情報を書き出す', exact: true }).click());
  assert.ok(out.includes('架空公演')); assert.ok(out.includes('3,000円')); assert.ok(out.includes('架空の本文'));
  assert.equal(await page.locator('script:not([src])').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.reload(); assert.equal(await page.getByLabel('原稿1の校正状態', { exact: true }).inputValue(), 'approved');
  assert.equal(await page.getByLabel('チラシの状態', { exact: true }).inputValue(), 'in-progress');
});
test('MVP-03: distribution quantities, validation protection and CSV export', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + prefix + 'modules/distribution/index.html');
  await page.getByLabel('印刷総部数', { exact: true }).fill('500');
  await page.getByRole('button', { name: '配布先を追加', exact: true }).click();
  await page.getByLabel('配布先1の名称', { exact: true }).fill('架空劇場');
  await page.getByLabel('配布先1の予定部数', { exact: true }).fill('100');
  await page.getByLabel('配布先1の配布済み部数', { exact: true }).fill('20');
  assert.ok((await text(page)).includes('480部')); assert.ok((await text(page)).includes('400部'));
  const saved = await stored(page);
  await page.getByLabel('配布先1の配布済み部数', { exact: true }).fill('101');
  assert.equal(await stored(page), saved); assert.equal(await page.getByLabel('配布先1の配布済み部数', { exact: true }).getAttribute('aria-invalid'), 'true');
  await page.getByLabel('配布先1の配布済み部数', { exact: true }).fill('20');
  const csv = await downloadJSON(page, () => page.getByRole('button', { name: '配布CSVを書き出す', exact: true }).click());
  assert.ok(csv.includes('架空劇場')); assert.ok(csv.includes('"100","20"'));
});
test('MVP-04/08: publicity row creates a calendar event with a deep link', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + prefix + 'modules/publicity/index.html');
  await page.getByRole('button', { name: '投稿を追加', exact: true }).click();
  await page.getByLabel('投稿1の題名', { exact: true }).fill('公開予定');
  await page.getByLabel('投稿1の予定日', { exact: true }).fill(tokyoToday());
  await page.getByLabel('投稿1の原稿', { exact: true }).fill('投稿本文');
  const out = await downloadJSON(page, () => page.getByRole('button', { name: 'この原稿を書き出す', exact: true }).click()); assert.equal(out, '投稿本文');
  await page.getByRole('link', { name: 'カレンダー', exact: true }).click(); await page.waitForURL('**/calendar.html?projectId=*');
  await page.getByLabel('予定の表示範囲', { exact: true }).selectOption('today');
  const link = page.getByRole('link', { name: /投稿：公開予定/ }); await link.click(); await page.waitForURL('**/modules/publicity/index.html?projectId=*#item-*');
  assert.equal(await page.getByLabel('投稿1の原稿', { exact: true }).inputValue(), '投稿本文');
  await page.getByLabel('投稿1の公開状態', { exact: true }).selectOption('published');
  await page.reload(); assert.equal(await page.getByLabel('投稿1の公開状態', { exact: true }).inputValue(), 'published');
});
test('MVP-05: tickets show remaining seats, preserve budget and reject overselling', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + prefix + 'modules/tickets/index.html');
  await page.getByLabel('ステージ1・一般の実績販売枚数', { exact: true }).fill('25');
  assert.ok((await text(page)).includes('175席')); assert.ok((await text(page)).includes('75,000円')); assert.ok((await text(page)).includes('12.5%'));
  const saved = await stored(page); assert.equal(JSON.parse(saved).project.modules.budget.data.plannedSales[0].quantity, 80);
  await page.getByLabel('ステージ1・一般の実績販売枚数', { exact: true }).fill('101'); assert.equal(await stored(page), saved);
  await page.getByLabel('ステージ1・一般の実績販売枚数', { exact: true }).fill('25');
  const savedAfterFix = await stored(page);
  await page.getByText('公演情報を作成・編集する', { exact: true }).click();
  await page.getByLabel('ステージ1の販売可能席数', { exact: true }).fill('20'); assert.equal(await stored(page), savedAfterFix);
  assert.ok((await page.getByTestId('validation-errors').innerText()).includes('実績販売枚数'));
});
test('MVP-06/07/09/10: calendar manual editing, generation cancellation, stable IDs and mobile month', async t => {
  const page = await setup(t, { saved: fullFixture(), width: 375 }); await page.goto(origin + prefix + 'calendar.html');
  await page.getByRole('button', { name: '予定を追加', exact: true }).click();
  const title = page.getByLabel('予定1の名称', { exact: true });
  await title.pressSequentially('手動予定'); assert.equal(await title.inputValue(), '手動予定');
  await page.getByLabel('予定1のモジュール', { exact: true }).selectOption('flyer');
  await page.getByRole('button', { name: '逆算予定を生成・更新', exact: true }).click();
  let saved = JSON.parse(await stored(page)); assert.equal(saved.project.calendarEvents.length, 7);
  const ids = saved.project.calendarEvents.map(e => e.id);
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: '逆算予定を生成・更新', exact: true }).click();
  assert.deepEqual(JSON.parse(await stored(page)).project.calendarEvents.map(e => e.id), ids);
  await page.getByLabel('チラシ入稿：本番何日前', { exact: true }).fill('30');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '逆算予定を生成・更新', exact: true }).click();
  saved = JSON.parse(await stored(page)); assert.deepEqual(saved.project.calendarEvents.map(e => e.id), ids);
  assert.equal(saved.project.calendarEvents.find(e => e.templateId === 'flyer-print').date, '2026-10-31');
  assert.equal(saved.project.calendarEvents[0].title, '手動予定');
  await page.getByLabel('表示する月', { exact: true }).fill('2026-10');
  assert.equal(await page.locator('.calendar-day').count(), 31);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByLabel('予定のモジュールフィルタ', { exact: true }).selectOption('flyer');
  await page.getByLabel('予定の表示範囲', { exact: true }).selectOption('week');
  await page.reload(); assert.equal(JSON.parse(await stored(page)).project.calendarEvents.length, 7);
});
test('MVP-06: dashboard shows today, overdue, starting soon and saved module states', async t => {
  const d = fullFixture(), today = tokyoToday();
  d.project.modules.flyer.startDate = addDays(today, 2); d.project.modules.flyer.dueDate = addDays(today, -1);
  d.project.modules.publicity.status = 'in-progress'; d.project.modules.publicity.data.items.push({ id: 'today-post', title: '今日の告知', channel: 'SNS', date: today, text: '', materials: '', status: 'draft' });
  const page = await setup(t, { saved: d, width: 375 }); await page.goto(origin + prefix + 'dashboard.html');
  const content = await page.getByTestId('schedule').innerText();
  assert.ok(content.includes('今日の告知')); assert.ok(content.includes('期限超過')); assert.ok(content.includes('そろそろ開始')); assert.ok(content.includes('進行中'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('link', { name: 'チラシを開く', exact: true }).click(); await page.waitForURL('**/modules/flyer/index.html?projectId=*');
});
test('MVP-09: incompatible old module data is retained unless replacement is confirmed', async t => {
  const d = fixture(); d.project.modules.flyer = { id: 'flyer', status: 'on-hold', startDate: null, dueDate: null, progress: 0, alerts: [], data: { text: '旧形式' } };
  const page = await setup(t, { saved: d }); await page.goto(origin + prefix + 'modules/flyer/index.html');
  const before = await stored(page); assert.ok((await page.locator('#main').innerText()).includes('編集形式と異なります'));
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'このモジュールの編集形式に切り替える', exact: true }).click(); assert.equal(await stored(page), before);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'このモジュールの編集形式に切り替える', exact: true }).click();
  assert.equal(JSON.parse(await stored(page)).project.modules.flyer.data.version, 1);
  assert.equal(JSON.parse(await stored(page)).project.modules.flyer.status, 'on-hold');
});

test('MVP-01/09: iPhone sample button loads all registered modules after confirmation', async t => {
  const page = await setup(t, { width: 375 }); await page.goto(origin + master);
  assert.equal(await stored(page), null);
  const cancel = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'サンプル公演を試す', exact: true }).click();
  await (await cancel).dismiss();
  await page.getByLabel('公演タイトル（必須）', { exact: true }).waitFor(); assert.equal(await stored(page), null);
  const accept = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'サンプル公演を試す', exact: true }).click();
  await (await accept).accept();
  await waitForText(page.getByRole('status'), 'JSONを取り込み');
  const d = JSON.parse(await stored(page)); assert.equal(Object.keys(d.project.modules).length, Object.keys(DEFINITIONS).length);
  await page.getByRole('link', { name: 'ダッシュボード', exact: true }).click(); await page.waitForURL('**/dashboard.html?projectId=*');
  assert.ok((await page.getByTestId('schedule').innerText()).includes('55枚'));
});

test('MVP-08/09: missing linked work can be repaired without leaving the module page', async t => {
  const d = fullFixture();
  d.project.modules.publicity.data.items.push({ id: 'linked-post', title: '関連投稿', channel: 'SNS', date: null, text: '', materials: '', status: 'draft' });
  d.project.calendarEvents.push({ dataVersion: 1, id: 'linked-event', projectId: d.project.id, moduleId: 'publicity', title: '関連予定', date: tokyoToday(), type: 'manual', status: 'planned', relatedItemId: 'linked-post' });
  const page = await setup(t, { saved: d }); await page.goto(origin + prefix + 'modules/publicity/index.html'); const saved = await stored(page);
  await page.getByRole('button', { name: '投稿1を削除', exact: true }).click(); assert.equal(await stored(page), saved);
  assert.ok((await page.getByTestId('validation-errors').innerText()).includes('関連する作業'));
  await page.getByRole('button', { name: '予定1を削除', exact: true }).click();
  const next = JSON.parse(await stored(page)); assert.equal(next.project.calendarEvents.length, 0); assert.equal(next.project.modules.publicity.data.items.length, 0);
});
test('MVP-08: legacy unknown modules produce no false links and malformed hashes do not crash', async t => {
  const d = fullFixture(); d.project.calendarEvents.push({ id: 'old', projectId: d.project.id, moduleId: '__proto__', title: '未対応予定', date: tokyoToday(), type: 'future', status: 'planned', relatedItemId: null });
  const page = await setup(t, { saved: d }); await page.goto(origin + prefix + 'calendar.html#item-%');
  assert.ok((await page.locator('#main').innerText()).includes('未対応モジュール'));
  assert.equal(await page.locator('a[href*="__proto__"]').count(), 0);
});

test('local security checks: all entrances keep hostile text inert, make no external requests and only export data on request', async t => {
  const d = fullFixture();
  const payload = '<img src="https://example.invalid/leak" onerror="window.auditExecuted=true"><script>window.auditExecuted=true</script>';
  d.project.title = payload;
  d.project.companyName = payload;
  d.project.modules.flyer.data.introduction = payload;
  d.project.modules.publicity.data.items.push({ id: 'audit-post', title: payload, channel: 'SNS', date: tokyoToday(), text: payload, materials: '', status: 'draft' });
  d.project.modules.distribution.data.printed = 1;
  d.project.modules.distribution.data.items.push({ id: 'audit-distribution', name: payload, assignee: '', method: 'hand', date: null, planned: 1, shipped: 0, status: 'uncontacted' });
  d.project.modules.rehearsal.data.items.push({ id: 'audit-rehearsal', name: payload, date: tokyoToday(), startTime: '13:00', endTime: '17:00', venue: payload, participants: '', attendance: '', staff: '', notes: '', message: payload, status: 'planned', history: [] });
  d.project.modules.submissions.data.items.push({ id: 'audit-submission', name: payload, recipient: payload, category: 'theater', assignee: '', dueDate: tokyoToday(), status: 'pending', submittedDate: null, notes: payload });
  const page = await setup(t, { saved: d });
  const externalRequests = [], outgoingRequests = [];
  let downloadCount = 0;
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
    if (request.method() !== 'GET') outgoingRequests.push(request.method());
  });
  // Block attempted external access as well as recording it; never send test data.
  await page.context().route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page.on('download', () => downloadCount++);
  const entrances = ['index.html', 'dashboard.html', 'calendar.html', ...Object.keys(DEFINITIONS).map(id => `modules/${id}/index.html`)];
  for (const entrance of entrances) {
    await page.goto(origin + prefix + entrance);
    assert.equal(await page.evaluate(() => Boolean(window.auditExecuted)), false, entrance);
    assert.equal(await page.locator('#main img, #main script, #main iframe, form, input[type=password]').count(), 0, entrance);
    assert.equal(await page.locator('a').evaluateAll(nodes => nodes.some(a => new URL(a.href).protocol !== 'http:' || new URL(a.href).origin !== location.origin)), false, entrance);
  }
  assert.equal(downloadCount, 0, 'visiting pages does not initiate downloads');
  for (const [id, label, filename] of [
    ['budget', '予算CSVを書き出す', 'budget.csv'],
    ['flyer', '掲載情報を書き出す', 'flyer.txt'],
    ['distribution', '配布CSVを書き出す', 'distribution.csv'],
    ['publicity', '投稿計画CSVを書き出す', 'publicity.csv'],
    ['tickets', '販売CSVを書き出す', 'tickets.csv'],
    ['rehearsal', '全体連絡文を書き出す', 'rehearsal.txt'],
    ['submissions', '提出物CSVを書き出す', 'submissions.csv'],
    ['front-desk', '受付CSVを書き出す', 'front-desk.csv'],
    ['settlement', '決算CSVを書き出す', 'settlement.csv'],
    ['settlement', '収支・実績レポートを書き出す', 'production-report.txt'],
    ['settlement', '収支・実績レポートCSVを書き出す', 'production-report.csv'],
    ['program', 'パンフ掲載文を書き出す', 'program.txt'],
    ['stage-operations', '舞台進行表を書き出す', 'stage-operations.txt'],
    ['venue', '会場CSVを書き出す', 'venue.csv'],
    ['rights', '作品概要を書き出す', 'rights.txt'],
    ['show-day', '当日記録を書き出す', 'show-day.txt'],
    ['funding', '助成・協賛・広告CSVを書き出す', 'funding.csv'],
    ['contracts', '契約CSVを書き出す', 'contracts.csv'],
    ['archive', '資料一覧CSVを書き出す', 'archive.csv']
  ]) {
    await page.goto(origin + prefix + `modules/${id}/index.html`);
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal((await waiting).suggestedFilename(), filename);
  }
  const exported = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click()));
  assert.equal(exported.project.title, payload);
  await page.goto(origin + prefix + 'calendar.html');
  await page.getByLabel('予定の表示範囲', { exact: true }).selectOption('today');
  for (const [format, filename] of [['ICS', 'production-calendar.ics'], ['CSV', 'production-calendar.csv']]) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: `表示中の予定を${format}で書き出す`, exact: true }).click();
    const file = await waiting; assert.equal(file.suggestedFilename(), filename);
    const output = await readFile(await file.path(), 'utf8'); assert.ok(output.includes('<img'));
  }
  for (const id of Object.keys(DEFINITIONS)) {
    await page.goto(origin + prefix + `modules/${id}/index.html`);
    const packet = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'このモジュールのJSONを書き出す', exact: true }).click()));
    assert.deepEqual(Object.keys(packet.document.project.modules), [id]); assert.equal(packet.document.project.documents.length, 0);
  }
  assert.equal(downloadCount, 39, 'only explicit export actions download files');
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(outgoingRequests, []);
});

test('NEXT-01/02/03/05/06: rehearsal mobile editing, snapshot history, output and calendar row link', async t => {
  const page = await setup(t, { saved: fullFixture(), width: 375 });
  await page.goto(origin + prefix + 'modules/rehearsal/index.html');
  await page.getByRole('button', { name: '稽古を追加', exact: true }).click();
  await page.getByLabel('稽古1の名称', { exact: true }).fill('読み合わせ');
  await page.getByLabel('稽古1の日付', { exact: true }).fill(tokyoToday());
  await page.getByLabel('稽古1の稽古場', { exact: true }).fill('稽古室');
  await page.getByLabel('稽古1の連絡事項', { exact: true }).fill('台本持参');
  const saved = await stored(page);
  await page.getByLabel('稽古1の終了時刻', { exact: true }).fill('12:00');
  assert.equal(await stored(page), saved);
  assert.equal(await page.getByLabel('稽古1の終了時刻', { exact: true }).getAttribute('aria-invalid'), 'true');
  await page.getByRole('button', { name: '稽古1の予定変更を記録', exact: true }).click();
  assert.ok((await page.getByRole('status').innerText()).includes('修正'));
  await page.getByLabel('稽古1の終了時刻', { exact: true }).fill('17:00');
  await page.getByRole('button', { name: '稽古1の予定変更を記録', exact: true }).click();
  await page.getByRole('button', { name: '稽古1の予定変更を記録', exact: true }).click();
  assert.equal(JSON.parse(await stored(page)).project.modules.rehearsal.data.items[0].history.length, 1);
  await page.getByLabel('稽古1の稽古場', { exact: true }).fill('別室');
  await page.getByRole('button', { name: '稽古1の予定変更を記録', exact: true }).click();
  const out = await downloadJSON(page, () => page.getByRole('button', { name: '全体連絡文を書き出す', exact: true }).click());
  assert.ok(out.includes('架空公演')); assert.ok(out.includes('13:00〜17:00')); assert.ok(out.includes('別室')); assert.ok(out.includes('台本持参'));
  await page.reload(); assert.equal(await page.getByLabel('稽古1の変更履歴', { exact: true }).locator('li').count(), 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('link', { name: 'カレンダー', exact: true }).click(); await page.waitForURL('**/calendar.html?projectId=*');
  await page.getByLabel('予定の表示範囲', { exact: true }).selectOption('today');
  await page.getByRole('link', { name: /13:00 · 稽古：読み合わせ/ }).click(); await page.waitForURL('**/modules/rehearsal/index.html?projectId=*#item-*');
  assert.equal(await page.getByLabel('稽古1の稽古場', { exact: true }).inputValue(), '別室');
});

test('NEXT-01/04/05/06: submission date protection, returned work, calendar link and saved resubmission', async t => {
  const page = await setup(t, { saved: fullFixture(), width: 375 });
  await page.goto(origin + prefix + 'modules/submissions/index.html');
  await page.getByRole('button', { name: '提出物を追加', exact: true }).click();
  await page.getByLabel('提出物1の名称', { exact: true }).fill('舞台図面');
  await page.getByLabel('提出物1の期限', { exact: true }).fill(tokyoToday());
  await page.getByLabel('提出物1の提出先', { exact: true }).fill('架空劇場');
  const saved = await stored(page);
  await page.getByLabel('提出物1の状態', { exact: true }).selectOption('submitted');
  assert.equal(await stored(page), saved);
  assert.equal(await page.getByLabel('提出物1の提出日', { exact: true }).getAttribute('aria-invalid'), 'true');
  await page.getByLabel('提出物1の提出日', { exact: true }).fill(tokyoToday());
  assert.ok((await text(page)).includes('0件'));
  await page.getByLabel('提出物1の状態', { exact: true }).selectOption('returned');
  await page.getByRole('link', { name: 'カレンダー', exact: true }).click(); await page.waitForURL('**/calendar.html?projectId=*');
  await page.getByLabel('予定の表示範囲', { exact: true }).selectOption('today');
  await page.getByRole('link', { name: /提出：舞台図面 · 予定/ }).click(); await page.waitForURL('**/modules/submissions/index.html?projectId=*#item-*');
  assert.equal(await page.getByLabel('提出物1の状態', { exact: true }).inputValue(), 'returned');
  await page.getByLabel('提出物1の状態', { exact: true }).selectOption('submitted');
  const out = await downloadJSON(page, () => page.getByRole('button', { name: '提出物CSVを書き出す', exact: true }).click());
  assert.ok(out.includes('舞台図面')); assert.ok(out.includes('submitted'));
  await page.reload(); assert.equal(await page.getByLabel('提出物1の状態', { exact: true }).inputValue(), 'submitted');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const d=JSON.parse(await stored(page)); assert.equal(d.project.modules.budget.data.plannedSales[0].quantity,80);
});

test('EXT-01/02/06: front-desk quantities protect saves, finish tasks and export mobile guidance',async t=>{
 const page=await setup(t,{saved:fullFixture(),width:375});await page.goto(origin+prefix+'modules/front-desk/index.html');
 await page.getByLabel('釣銭元手（円）',{exact:true}).fill('10000');await page.getByLabel('当日案内文',{exact:true}).fill('順番にご案内します。');
 await page.getByRole('button',{name:'受付作業を追加',exact:true}).click();await page.getByLabel('受付作業1の名称',{exact:true}).fill('掲示');await page.getByLabel('受付作業1の期限',{exact:true}).fill(tokyoToday());await page.getByLabel('受付作業1の必要数',{exact:true}).fill('2');
 const saved=await stored(page);await page.getByLabel('受付作業1の状態',{exact:true}).selectOption('completed');assert.equal(await stored(page),saved);await page.getByLabel('受付作業1の準備済み数',{exact:true}).fill('2');
 const out=await downloadJSON(page,()=>page.getByRole('button',{name:'当日案内文を書き出す',exact:true}).click());assert.ok(out.includes('10,000円'));assert.ok(out.includes('順番にご案内'));
 await page.reload();assert.equal(await page.getByLabel('受付作業1の状態',{exact:true}).inputValue(),'completed');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
test('EXT-01/03/06: settlement unpaid totals, overpayment protection and CSV',async t=>{
 const page=await setup(t,{saved:fullFixture(),width:375});await page.goto(origin+prefix+'modules/settlement/index.html');
 await page.getByRole('button',{name:'決算明細を追加',exact:true}).click();await page.getByLabel('決算明細1の名称',{exact:true}).fill('会場費');await page.getByLabel('決算明細1の金額（円）',{exact:true}).fill('100000');await page.getByLabel('決算明細1の入出金済み額（円）',{exact:true}).fill('50000');
 assert.ok((await text(page)).includes('-100,000円'));assert.ok((await text(page)).includes('50,000円'));const saved=await stored(page);await page.getByLabel('決算明細1の入出金済み額（円）',{exact:true}).fill('100001');assert.equal(await stored(page),saved);await page.getByLabel('決算明細1の入出金済み額（円）',{exact:true}).fill('100000');
 const out=await downloadJSON(page,()=>page.getByRole('button',{name:'決算CSVを書き出す',exact:true}).click());assert.ok(out.includes('会場費'));await page.reload();assert.equal(await page.getByLabel('決算明細1の金額（円）',{exact:true}).inputValue(),'100000');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
test('EXT-01/04: program collection, text and deadline deep link',async t=>{
 const page=await setup(t,{saved:fullFixture()});await page.goto(origin+prefix+'modules/program/index.html');await page.getByRole('button',{name:'パンフ原稿を追加',exact:true}).click();await page.getByLabel('パンフ原稿1の名称',{exact:true}).fill('ごあいさつ');await page.getByLabel('パンフ原稿1の原稿期限',{exact:true}).fill(tokyoToday());await page.getByLabel('パンフ原稿1の本文',{exact:true}).fill('架空原稿');
 const out=await downloadJSON(page,()=>page.getByRole('button',{name:'パンフ掲載文を書き出す',exact:true}).click());assert.ok(out.includes('架空公演'));assert.ok(out.includes('架空原稿'));await page.getByRole('link',{name:'カレンダー',exact:true}).click();await page.getByLabel('予定の表示範囲',{exact:true}).selectOption('today');await page.getByRole('link',{name:/パンフ原稿：ごあいさつ/}).click();await page.waitForURL('**/modules/program/index.html?projectId=*#item-*');await page.getByLabel('パンフ原稿1の状態',{exact:true}).selectOption('approved');await page.reload();assert.equal(await page.getByLabel('パンフ原稿1の状態',{exact:true}).inputValue(),'approved');
});
test('EXT-01/05/06: stage timeline invalid times, ordering and calendar mobile link',async t=>{
 const page=await setup(t,{saved:fullFixture(),width:375});await page.goto(origin+prefix+'modules/stage-operations/index.html');await page.getByRole('button',{name:'舞台作業を追加',exact:true}).click();await page.getByLabel('舞台作業1の名称',{exact:true}).fill('搬入');await page.getByLabel('舞台作業1の日付',{exact:true}).fill(tokyoToday());const saved=await stored(page);await page.getByLabel('舞台作業1の終了時刻',{exact:true}).fill('08:00');assert.equal(await stored(page),saved);await page.getByLabel('舞台作業1の終了時刻',{exact:true}).fill('10:00');const out=await downloadJSON(page,()=>page.getByRole('button',{name:'舞台進行表を書き出す',exact:true}).click());assert.ok(out.includes('09:00〜10:00'));await page.getByRole('link',{name:'カレンダー',exact:true}).click();await page.getByLabel('予定の表示範囲',{exact:true}).selectOption('today');await page.getByRole('link',{name:/09:00 · 舞台：搬入/}).click();await page.waitForURL('**/modules/stage-operations/index.html?projectId=*#item-*');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('FINAL-01/02/05: venue choice updates only the master name and reservation errors preserve saves',async t=>{
 const page=await setup(t,{saved:fullFixture(),width:375});await page.goto(origin+prefix+'modules/venue/index.html');await page.getByRole('button',{name:'会場候補を追加',exact:true}).click();await page.getByLabel('会場候補1の名称',{exact:true}).fill('新しい架空会場');const before=JSON.parse(await stored(page));await page.getByRole('button',{name:'会場候補1の名称を公演情報へ反映',exact:true}).click();const after=JSON.parse(await stored(page));assert.equal(after.project.venue.name,'新しい架空会場');assert.deepEqual(after.project.performanceDates,before.project.performanceDates);assert.deepEqual(after.project.modules.budget,before.project.modules.budget);
 const saved=await stored(page);await page.getByLabel('会場候補1の予約状態',{exact:true}).selectOption('booked');assert.equal(await stored(page),saved);await page.getByLabel('会場候補1の候補日',{exact:true}).fill(tokyoToday());await page.getByRole('link',{name:'カレンダー',exact:true}).click();await page.getByLabel('予定の表示範囲',{exact:true}).selectOption('today');await page.getByRole('link',{name:/会場：新しい架空会場/}).click();await page.waitForURL('**/modules/venue/index.html?projectId=*#item-*');await page.reload();assert.equal(await page.getByLabel('会場候補1の予約状態',{exact:true}).inputValue(),'booked');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
test('FINAL-01/03/05: rights evidence/date validation, outline export and saved confirmation',async t=>{
 const page=await setup(t,{saved:fullFixture(),width:375});await page.goto(origin+prefix+'modules/rights/index.html');await page.getByLabel('作品名',{exact:true}).fill('架空作品');await page.getByLabel('上演時間（分）',{exact:true}).fill('90');await page.getByRole('button',{name:'権利確認を追加',exact:true}).click();await page.getByLabel('権利確認1の名称',{exact:true}).fill('上演条件');const saved=await stored(page);await page.getByLabel('権利確認1の状態',{exact:true}).selectOption('confirmed');assert.equal(await stored(page),saved);await page.getByLabel('権利確認1の確認日',{exact:true}).fill(tokyoToday());assert.equal(await stored(page),saved);await page.getByLabel('権利確認1の根拠メモ',{exact:true}).fill('担当による架空の確認記録');const out=await downloadJSON(page,()=>page.getByRole('button',{name:'作品概要を書き出す',exact:true}).click());assert.ok(out.includes('90分'));assert.ok(out.includes('架空作品'));await page.reload();assert.equal(await page.getByLabel('権利確認1の状態',{exact:true}).inputValue(),'confirmed');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
test('FINAL-01/04/05: show-day goods revenue, errors and chronological mobile reports',async t=>{
 const page=await setup(t,{saved:fullFixture(),width:375});await page.goto(origin+prefix+'modules/show-day/index.html');await page.getByRole('button',{name:'当日記録を追加',exact:true}).click();await page.getByLabel('当日記録1の内容',{exact:true}).fill('パンフ販売');await page.getByLabel('当日記録1の日付',{exact:true}).fill(tokyoToday());await page.getByLabel('当日記録1の区分',{exact:true}).selectOption('goods');await page.getByLabel('当日記録1の物販数量',{exact:true}).fill('10');await page.getByLabel('当日記録1の物販単価（円）',{exact:true}).fill('500');assert.ok((await text(page)).includes('5,000円'));const saved=await stored(page);await page.getByLabel('当日記録1の物販単価（円）',{exact:true}).fill('0.5');assert.equal(await stored(page),saved);await page.getByLabel('当日記録1の物販単価（円）',{exact:true}).fill('500');const out=await downloadJSON(page,()=>page.getByRole('button',{name:'当日記録を書き出す',exact:true}).click());assert.ok(out.includes('10個 × 500円'));assert.deepEqual(JSON.parse(await stored(page)).project.modules.settlement.data.items,[]);await page.getByRole('link',{name:'カレンダー',exact:true}).click();await page.getByLabel('予定の表示範囲',{exact:true}).selectOption('today');await page.getByRole('link',{name:/当日：パンフ販売/}).click();await page.waitForURL('**/modules/show-day/index.html?projectId=*#item-*');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('UX-01: module picker keeps project ID and blocks invalid edits and unsaved storage',async t=>{
 const page=await setup(t,{saved:fullFixture(),width:375});await page.goto(origin+budget);const id=JSON.parse(await stored(page)).project.id;
 await page.getByLabel('作業モジュール',{exact:true}).selectOption('settlement');await page.waitForURL(`**/modules/settlement/index.html?projectId=${id}`);
 await page.getByRole('button',{name:'決算明細を追加',exact:true}).click();await page.getByLabel('作業モジュール',{exact:true}).selectOption('venue');assert.ok(page.url().includes('/settlement/'));assert.equal(await page.getByLabel('作業モジュール',{exact:true}).inputValue(),'settlement');
 await page.getByLabel('決算明細1の名称',{exact:true}).fill('会場費');await page.getByLabel('作業モジュール',{exact:true}).selectOption('venue');await page.waitForURL(`**/modules/venue/index.html?projectId=${id}`);
 const failed=await setup(t,{saved:fullFixture(),failure:'quota'});await failed.goto(origin+budget);await failed.getByLabel('来場者1人当たりの変動費（円）',{exact:true}).fill('600');await failed.getByLabel('作業モジュール',{exact:true}).selectOption('rights');assert.ok(failed.url().includes('/budget/'));assert.equal(await failed.getByLabel('作業モジュール',{exact:true}).inputValue(),'budget');
});
test('UX-02: other editors are created only for errors and remain usable while repairing',async t=>{
 const d=fullFixture();d.project.modules.tickets.data.sales.push({stageId:'stage-1',priceCategoryId:'general',quantity:25});
 const page=await setup(t,{saved:d});await page.goto(origin+budget);assert.equal(await page.getByTestId('module-repairs').locator('input').count(),0);const saved=await stored(page);
 await page.getByText('公演情報を作成・編集する',{exact:true}).click();await page.getByLabel('ステージ1の販売可能席数',{exact:true}).fill('20');assert.equal(await stored(page),saved);
 assert.equal(await page.locator('[data-repair-module=tickets]').count(),1);await page.getByLabel('ステージ1・一般の想定販売枚数',{exact:true}).fill('20');await page.getByLabel('ステージ1・一般の実績販売枚数',{exact:true}).fill('20');assert.equal(JSON.parse(await stored(page)).project.performanceDates[0].capacity,20);
 assert.equal(await page.locator('[data-repair-module=tickets]').count(),1);await page.reload();assert.equal(await page.getByTestId('module-repairs').locator('input').count(),0);
});
test('UX-03: mobile month day selection, module filtering and resetting month/scope',async t=>{
 const d=fullFixture();d.project.modules.publicity.data.items.push({id:'day1',title:'前日の投稿',channel:'SNS',date:'2026-10-10',text:'',materials:'',status:'draft'},{id:'day2',title:'選んだ日の投稿',channel:'SNS',date:'2026-10-11',text:'',materials:'',status:'draft'});
 const page=await setup(t,{saved:d,width:375});await page.goto(origin+prefix+'calendar.html');await page.getByLabel('表示する月',{exact:true}).fill('2026-10');await page.getByRole('button',{name:'2026-10-11の予定を表示',exact:true}).click();const agenda=page.locator('.agenda-list');assert.ok((await agenda.innerText()).includes('選んだ日の投稿'));assert.equal((await agenda.innerText()).includes('前日の投稿'),false);
 await page.getByLabel('予定のモジュールフィルタ',{exact:true}).selectOption('flyer');assert.ok((await page.getByLabel('制作カレンダー',{exact:true}).innerText()).includes('予定はありません'));await page.getByLabel('予定のモジュールフィルタ',{exact:true}).selectOption('publicity');await page.getByRole('button',{name:'月全体の予定に戻す',exact:true}).click();assert.ok((await agenda.innerText()).includes('前日の投稿'));
 await page.getByRole('button',{name:'2026-10-11の予定を表示',exact:true}).click();await page.getByLabel('表示する月',{exact:true}).fill('2026-11');assert.equal(await page.getByRole('button',{name:'月全体の予定に戻す',exact:true}).count(),0);await page.getByLabel('予定の表示範囲',{exact:true}).selectOption('week');assert.equal(await page.getByRole('button',{name:'月全体の予定に戻す',exact:true}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
test('UX-04: live preview updates hostile text as text without downloading',async t=>{
 const page=await setup(t,{saved:fullFixture()});await page.goto(origin+prefix+'modules/front-desk/index.html');let downloads=0;page.on('download',()=>downloads++);const payload='<img src=x onerror="window.bad=true">';await page.getByLabel('当日案内文',{exact:true}).fill(payload);assert.ok((await page.locator('.text-preview').innerText()).includes(payload));assert.equal(await page.locator('#main img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.bad)),false);assert.equal(downloads,0);
});

test('UX-04: explicit copy writes preview text and denied clipboard falls back to selection',async t=>{
 const page=await setup(t,{saved:fullFixture()});await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});await page.goto(origin+prefix+'modules/front-desk/index.html');await page.getByLabel('当日案内文',{exact:true}).fill('コピー確認用の架空案内');await page.getByRole('button',{name:'原稿をコピー',exact:true}).click();await waitForText(page.getByRole('status'),'原稿をコピーしました');assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes('コピー確認用の架空案内'));
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}}));await page.getByRole('button',{name:'原稿をコピー',exact:true}).click();await waitForText(page.getByRole('status'),'自動コピーを利用できません');assert.ok((await page.evaluate(()=>window.getSelection().toString())).includes('コピー確認用の架空案内'));
});

test('UX-05: dashboard puts schedules first and filters modules without changing saved data',async t=>{
 const d=fullFixture();d.project.title='x'.repeat(500);d.project.modules.publicity.status='completed';d.project.modules.flyer.status='not-needed';
 const page=await setup(t,{saved:d,width:375});await page.goto(origin+prefix+'dashboard.html');const saved=await stored(page);const cards=page.locator('.module-card');assert.equal(await cards.count(),Object.keys(DEFINITIONS).length-2);
 const headings=await page.getByTestId('schedule').locator('h2').allTextContents();assert.ok(headings.indexOf('今日の予定')<headings.indexOf('制作モジュール'));
 const search=page.getByLabel('モジュールを検索',{exact:true});await search.pressSequentially('決算');assert.equal(await search.inputValue(),'決算');assert.equal(await search.evaluate(el=>el===document.activeElement),true);assert.equal(await cards.count(),1);assert.equal(await cards.locator('h3').innerText(),'決算');
 await search.fill('');await page.getByLabel('モジュールの表示状態',{exact:true}).selectOption('completed');assert.equal(await cards.count(),1);assert.equal(await cards.locator('h3').innerText(),'SNS・広報');await search.fill('該当なし');assert.equal(await cards.count(),0);assert.ok((await page.getByLabel('制作モジュールの一覧',{exact:true}).innerText()).includes('条件に合う'));
 assert.equal(await stored(page),saved);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('UX-06: budget preview, text and CSV exports reject invalid input and follow prices',async t=>{
 const page=await setup(t,{saved:fullFixture()});await page.goto(origin+budget);const csv=await downloadJSON(page,()=>page.getByRole('button',{name:'予算CSVを書き出す',exact:true}).click());assert.ok(csv.includes('480000'));const out=await downloadJSON(page,()=>page.getByRole('button',{name:'予算テキストを書き出す',exact:true}).click());assert.ok(out.includes('300,000円'));assert.ok((await page.locator('.text-preview').innerText()).includes('実績販売・実収入ではありません'));
 let downloads=0;page.on('download',()=>downloads++);const saved=await stored(page);await page.getByLabel('ステージ1・一般の想定販売枚数',{exact:true}).fill('101');await page.getByRole('button',{name:'予算CSVを書き出す',exact:true}).click();assert.equal(downloads,0);assert.equal(await stored(page),saved);await page.getByLabel('ステージ1・一般の想定販売枚数',{exact:true}).fill('80');
});

test('UX-06: a valid imported project without budget prompts for input instead of crashing on export',async t=>{
 const d=fullFixture();delete d.project.modules.budget;const page=await setup(t,{saved:d});await page.goto(origin+budget);const saved=await stored(page);await page.getByRole('button',{name:'予算CSVを書き出す',exact:true}).click();assert.ok((await page.getByRole('status').innerText()).includes('予算の入力を開始'));assert.equal(await stored(page),saved);
});

test('CAL-04/05: calendar exports current month, selected day and module without changing project data', async t => {
  const d = fullFixture();
  d.project.modules.rehearsal.data.items.push({ id: 'calendar-rehearsal', name: '書き出し稽古', date: '2026-11-30', startTime: '13:00', endTime: '17:00', venue: '稽古室', participants: '', attendance: '', staff: '', notes: '', message: '', status: 'planned', history: [] });
  d.project.modules.publicity.data.items.push({ id: 'calendar-post', title: '前日の投稿', channel: 'SNS', date: '2026-11-29', text: '', materials: '', status: 'draft' });
  const page = await setup(t, { saved: d, width: 375 });
  await page.goto(origin + prefix + 'calendar.html');
  await page.getByLabel('表示する月', { exact: true }).fill('2026-11');
  const saved = await stored(page);
  const exportICS = () => downloadJSON(page, () => page.getByRole('button', { name: '表示中の予定をICSで書き出す', exact: true }).click());
  const month = (await exportICS()).replace(/\r\n[ \t]/g, ''); assert.ok(month.includes('前日の投稿')); assert.ok(month.includes('書き出し稽古'));
  await page.getByRole('button', { name: '2026-11-30の予定を表示', exact: true }).click();
  const day = (await exportICS()).replace(/\r\n[ \t]/g, ''); assert.equal(day.includes('前日の投稿'), false); assert.ok(day.includes('DTEND:20261130T080000Z'));
  await page.getByLabel('予定のモジュールフィルタ', { exact: true }).selectOption('rehearsal');
  const only = (await exportICS()).replace(/\r\n[ \t]/g, ''); assert.equal((only.match(/^BEGIN:VEVENT$/gm) ?? []).length, 1); assert.equal(only.includes('本番：'), false);
  const csv = await downloadJSON(page, () => page.getByRole('button', { name: '表示中の予定をCSVで書き出す', exact: true }).click()); assert.ok(csv.includes('"13:00","17:00"')); assert.ok(csv.includes('稽古室'));
  assert.equal(await stored(page), saved); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('CAL-04/05: week and today filters, empty results and malformed legacy times preserve saved data', async t => {
  const d = fullFixture(), today = tokyoToday();
  d.project.calendarEvents.push({ dataVersion: 1, id: 'calendar-today', projectId: d.project.id, moduleId: 'project', title: '今日の作業', date: today, status: 'planned', type: 'manual', relatedItemId: null });
  d.project.calendarEvents.push({ dataVersion: 1, id: 'calendar-later', projectId: d.project.id, moduleId: 'project', title: '来週以降', date: addDays(today, 8), status: 'planned', type: 'manual', relatedItemId: null });
  const page = await setup(t, { saved: d }); await page.goto(origin + prefix + 'calendar.html'); const saved = await stored(page);
  const exportICS = () => downloadJSON(page, () => page.getByRole('button', { name: '表示中の予定をICSで書き出す', exact: true }).click());
  for (const scope of ['today', 'week']) { await page.getByLabel('予定の表示範囲', { exact: true }).selectOption(scope); const output = (await exportICS()).replace(/\r\n[ \t]/g, ''); assert.ok(output.includes('今日の作業')); assert.equal(output.includes('来週以降'), false); }
  let downloads = 0; page.on('download', () => downloads++);
  await page.getByLabel('予定のモジュールフィルタ', { exact: true }).selectOption('rights'); await page.getByRole('button', { name: '表示中の予定をICSで書き出す', exact: true }).click(); assert.ok((await page.getByRole('status').innerText()).includes('予定がありません')); assert.equal(downloads, 0); assert.equal(await stored(page), saved);
  const bad = structuredClone(d); bad.project.calendarEvents.push({ id: 'legacy-time', projectId: d.project.id, moduleId: 'project', title: '旧予定', date: today, time: '99:99' });
  page.once('dialog', dialog => dialog.accept()); await upload(page, bad); await waitForText(page.getByRole('status'), 'JSONを取り込み、保存しました'); const legacySaved = await stored(page);
  await page.getByLabel('予定の表示範囲', { exact: true }).selectOption('today'); await page.getByLabel('予定のモジュールフィルタ', { exact: true }).selectOption('project'); await page.getByRole('button', { name: '表示中の予定をICSで書き出す', exact: true }).click(); assert.ok((await page.getByRole('status').innerText()).includes('書き出せませんでした')); assert.equal(downloads, 0); assert.equal(await stored(page), legacySaved);
  await page.getByLabel('予定1の名称', { exact: true }).fill(''); assert.equal(await page.getByRole('button', { name: '表示中の予定をICSで書き出す', exact: true }).count(), 0); assert.equal(await stored(page), legacySaved);
});

test('REPORT-01/02/04: settlement preview, copy and report downloads follow edits and separate actual from reference sales', async t => {
  const d = JSON.parse(await readFile(path.join(projectRoot, 'samples/demo.json'), 'utf8'));
  const page = await setup(t, { saved: d, width: 375 }); await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.goto(origin + prefix + 'modules/settlement/index.html');
  const preview = page.locator('.text-preview'); assert.ok((await preview.innerText()).includes('決算 · 実収入：150,000円')); assert.ok((await preview.innerText()).includes('販売実績 · 実績販売枚数：55枚'));
  const saved = await stored(page);
  const output = await downloadJSON(page, () => page.getByRole('button', { name: '収支・実績レポートを書き出す', exact: true }).click()); assert.ok(output.includes('予算との差 · 実収入−想定売上：-330,000円'));
  const csv = await downloadJSON(page, () => page.getByRole('button', { name: '収支・実績レポートCSVを書き出す', exact: true }).click()); assert.ok(csv.includes('"-330000"')); assert.equal(await stored(page), saved);
  await page.getByRole('button', { name: '原稿をコピー', exact: true }).click(); await waitForText(page.getByRole('status'), '原稿をコピーしました'); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), output);
  await page.getByLabel('決算明細1の金額（円）', { exact: true }).fill('200000'); assert.ok((await preview.innerText()).includes('決算 · 実収入：200,000円'));
  await page.getByText('公演情報を作成・編集する', { exact: true }).click(); await page.getByLabel('料金区分1の料金（円）', { exact: true }).fill('4000');
  assert.ok((await preview.innerText()).includes('決算 · 実収入：200,000円')); assert.ok((await preview.innerText()).includes('現行料金によるチケット参考売上：220,000円')); assert.ok((await preview.innerText()).includes('想定売上：640,000円'));
  assert.equal(JSON.parse(await stored(page)).project.modules['show-day'].data.items[0].quantity, 10); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const valid = await stored(page); let downloads = 0; page.on('download', () => downloads++);
  await page.getByLabel('決算明細1の入出金済み額（円）', { exact: true }).fill('200001'); await page.getByRole('button', { name: '収支・実績レポートを書き出す', exact: true }).click(); assert.equal(downloads, 0); assert.equal(await stored(page), valid); assert.equal(await preview.count(), 0);
});

test('REPORT-03/04/05: empty settlement and legacy references remain explicit and hostile report text stays inert', async t => {
  const d = fullFixture(); delete d.project.modules.budget; delete d.project.modules['show-day']; d.project.modules.tickets.data = { legacySales: 'retain' };
  d.project.title = '<script>window.reportExecuted=true</script>';
  const page = await setup(t, { saved: d, width: 375 }); await page.goto(origin + prefix + 'modules/settlement/index.html'); const saved = await stored(page);
  const out = await downloadJSON(page, () => page.getByRole('button', { name: '収支・実績レポートを書き出す', exact: true }).click()); assert.ok(out.includes('入力済み決算明細：0件')); assert.ok(out.includes('旧形式のため集計対象外')); assert.ok(out.includes('予算 · 比較：未入力')); assert.ok(out.includes('当日記録 · 集計：未入力'));
  assert.ok((await page.locator('.text-preview').innerText()).includes('<script>')); assert.equal(await page.evaluate(() => Boolean(window.reportExecuted)), false); assert.equal(await page.locator('#main script').count(), 0); assert.equal(await stored(page), saved);
});

test('ARCH-01/02/04: archive mobile inputs, completed asset requirements, calendar row links and data retention', async t => {
  const d = fullFixture(); d.project.documents = [{ id: 'old-document', extra: { keep: true } }];
  const page = await setup(t, { saved: d, width: 375 }); await page.goto(origin + prefix + 'modules/archive/index.html');
  const attendance = page.getByLabel('実来場者数（未入力は空欄）', { exact: true }); assert.equal(await attendance.inputValue(), ''); await attendance.fill('0'); assert.ok((await text(page)).includes('0人')); await attendance.fill(''); assert.equal(JSON.parse(await stored(page)).project.modules.archive.data.attendance, null); await attendance.fill('500');
  await page.getByLabel('公演の反省点', { exact: true }).fill('転換時間を長めに確保'); await page.getByLabel('次回への引継ぎ', { exact: true }).fill('資料は保管担当へ'); await page.getByRole('button', { name: '資料を追加', exact: true }).click();
  await page.getByLabel('資料1の名称', { exact: true }).fill('完成パンフ'); await page.getByLabel('資料1の収集期限', { exact: true }).fill(tokyoToday()); const before = await stored(page);
  await page.getByLabel('資料1の状態', { exact: true }).selectOption('collected'); assert.equal(await stored(page), before); assert.equal(await page.getByLabel('資料1の保存場所', { exact: true }).getAttribute('aria-invalid'), 'true');
  const location = 'https://example.invalid/<img src=x onerror="window.archiveBad=true">'; await page.getByLabel('資料1の保存場所', { exact: true }).fill(location); assert.equal(await stored(page), before); await page.getByLabel('資料1の所在記録日', { exact: true }).fill(tokyoToday());
  const valid = await stored(page); await attendance.fill('-1'); assert.equal(await stored(page), valid); await attendance.fill('500'); assert.ok((await page.locator('.text-preview').innerText()).includes(location)); assert.equal(await page.locator('#main img').count(), 0); assert.equal(await page.evaluate(() => Boolean(window.archiveBad)), false);
  const csv = await downloadJSON(page, () => page.getByRole('button', { name: '資料一覧CSVを書き出す', exact: true }).click()); assert.ok(csv.includes('完成パンフ')); const out = await downloadJSON(page, () => page.getByRole('button', { name: 'アーカイブ原稿を書き出す', exact: true }).click()); assert.ok(out.includes('実来場者数：500人'));
  assert.deepEqual(JSON.parse(await stored(page)).project.documents, d.project.documents); assert.equal(JSON.parse(await stored(page)).project.modules.budget.data.plannedSales[0].quantity, 80);
  await page.getByRole('link', { name: 'カレンダー', exact: true }).click(); await page.getByLabel('予定の表示範囲', { exact: true }).selectOption('today'); await page.getByRole('link', { name: /資料収集：完成パンフ · 完了/ }).click(); await page.waitForURL('**/modules/archive/index.html?projectId=*#item-*'); assert.equal(await page.getByLabel('資料1の保存場所', { exact: true }).inputValue(), location); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('ARCH-03: explicit financial snapshot stays frozen, duplicate capture is inert, replacement and removal require confirmation', async t => {
  const d = JSON.parse(await readFile(path.join(projectRoot, 'samples/demo.json'), 'utf8'));
  const page = await setup(t, { saved: d }); await page.goto(origin + prefix + 'modules/archive/index.html');
  const capture = () => page.getByRole('button', { name: '現在の収支原稿をアーカイブに保存', exact: true }).click(); await capture();
  const saved = await stored(page), snapshot = JSON.parse(saved).project.modules.archive.data.snapshot; assert.ok(snapshot.report.includes('実収入：150,000円')); assert.ok(snapshot.capturedAt.endsWith('Z'));
  await capture(); assert.equal(await stored(page), saved); assert.ok((await page.getByRole('status').innerText()).includes('同じ収支原稿は保存済み'));
  await page.getByText('公演情報を作成・編集する', { exact: true }).click(); await page.getByLabel('料金区分1の料金（円）', { exact: true }).fill('4000'); assert.deepEqual(JSON.parse(await stored(page)).project.modules.archive.data.snapshot, snapshot);
  page.once('dialog', dialog => dialog.dismiss()); await capture(); assert.deepEqual(JSON.parse(await stored(page)).project.modules.archive.data.snapshot, snapshot);
  page.once('dialog', dialog => dialog.accept()); await capture(); const replaced = JSON.parse(await stored(page)).project.modules.archive.data.snapshot; assert.ok(replaced.report.includes('想定売上：640,000円')); assert.notEqual(replaced.report, snapshot.report);
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: '保存した収支原稿を削除', exact: true }).click(); assert.deepEqual(JSON.parse(await stored(page)).project.modules.archive.data.snapshot, replaced);
  const exported = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click())); assert.deepEqual(exported.project.modules.archive.data.snapshot, replaced);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '保存した収支原稿を削除', exact: true }).click(); assert.equal(JSON.parse(await stored(page)).project.modules.archive.data.snapshot, null); assert.deepEqual(JSON.parse(await stored(page)).project.modules.settlement.data, d.project.modules.settlement.data);
});

test('ARCH-03: snapshot capture refuses absent settlement and invalid edits without losing data', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + prefix + 'modules/archive/index.html'); const saved = await stored(page);
  await page.getByRole('button', { name: '現在の収支原稿をアーカイブに保存', exact: true }).click(); assert.ok((await page.getByRole('status').innerText()).includes('先に決算')); assert.equal(await stored(page), saved);
  await page.getByLabel('実来場者数（未入力は空欄）', { exact: true }).fill('1.5'); await page.getByRole('button', { name: '現在の収支原稿をアーカイブに保存', exact: true }).click(); assert.ok((await page.getByRole('status').innerText()).includes('入力エラーを修正')); assert.equal(await stored(page), saved);
});

test('SAVE-02/03: another tab triggers conflict, preserves unsaved work, blocks navigation after copy and reloads only after confirmation', async t => {
  const first = await setup(t, { saved: fullFixture() }); await first.goto(origin + master);
  const other = await first.context().newPage(); const errors = []; other.on('pageerror', e => errors.push(e.message)); t.after(() => assert.deepEqual(errors, [])); await other.goto(origin + prefix + 'modules/front-desk/index.html');
  await first.evaluate(() => localStorage.setItem('another-tool', 'changed')); assert.equal(await other.getByLabel('保存データの競合', { exact: true }).isVisible(), false);
  await first.getByLabel('劇団名', { exact: true }).fill('別タブの最新劇団'); const latest = await stored(first);
  await other.getByLabel('保存データの競合', { exact: true }).waitFor({ state: 'visible' }); await other.getByLabel('当日案内文', { exact: true }).fill('このタブの未保存案内'); assert.equal(await stored(other), latest);
  await other.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin }); await other.getByRole('button', { name: '原稿をコピー', exact: true }).click(); await waitForText(other.getByRole('status'), '原稿をコピーしました');
  const currentURL = other.url(); await other.getByRole('link', { name: '公演情報へ戻る', exact: true }).click(); assert.equal(other.url(), currentURL);
  const backup = JSON.parse(await downloadJSON(other, () => other.getByRole('button', { name: 'JSONを書き出す', exact: true }).click())); assert.equal(backup.project.modules['front-desk'].data.guidance, 'このタブの未保存案内'); assert.equal(await stored(other), latest);
  other.once('dialog', dialog => dialog.dismiss()); await other.getByRole('button', { name: '保存データを読み直す', exact: true }).click(); assert.equal(await other.getByLabel('当日案内文', { exact: true }).inputValue(), 'このタブの未保存案内');
  other.once('dialog', dialog => dialog.accept()); await other.getByRole('button', { name: '保存データを読み直す', exact: true }).click(); await waitForText(other.getByRole('status'), '保存済みの公演を読み込みました'); assert.equal(await other.getByLabel('保存データの競合', { exact: true }).isVisible(), false); assert.equal(await other.getByLabel('劇団名', { exact: true }).inputValue(), '別タブの最新劇団'); assert.equal(await other.getByLabel('当日案内文', { exact: true }).inputValue(), '');
});

test('SAVE-02: same-tab external writes refuse automatic save, import and deletion without changing either document', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + master);
  const latest = fullFixture(); latest.project.id = 'different-project'; latest.project.title = '別の保存公演';
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data: latest }); const saved = await stored(page);
  await page.getByLabel('劇団名', { exact: true }).fill('この画面の入力'); assert.equal(await stored(page), saved); assert.equal(await page.getByLabel('保存データの競合', { exact: true }).isVisible(), true);
  const backup = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click())); assert.equal(backup.project.companyName, 'この画面の入力'); assert.equal(backup.project.id, 'project-demo');
  page.once('dialog', dialog => dialog.accept()); await upload(page, fixture()); await waitForText(page.getByRole('status'), '別のタブなどで保存データが変わりました'); assert.equal(await page.getByLabel('劇団名', { exact: true }).inputValue(), 'この画面の入力'); assert.equal(await stored(page), saved);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '全データを消去', exact: true }).click(); assert.equal(await stored(page), saved);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '保存データを読み直す', exact: true }).click(); await waitForText(page.getByRole('status'), '保存済みの公演を読み込みました'); assert.equal(await page.getByLabel('公演タイトル（必須）', { exact: true }).inputValue(), '別の保存公演');
});

test('SAVE-02/03: external removal and corrupt replacement are protected and can be inspected after reload', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + master);
  await page.evaluate(key => localStorage.removeItem(key), STORAGE_KEY); await page.getByLabel('劇団名', { exact: true }).fill('消去後の未保存'); assert.equal(await stored(page), null);
  const backup = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click())); assert.equal(backup.project.companyName, '消去後の未保存');
  await page.evaluate(key => localStorage.setItem(key, '{broken'), STORAGE_KEY); page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '保存データを読み直す', exact: true }).click(); await page.getByRole('heading', { name: '保存データを読み込めません', exact: true }).waitFor(); assert.equal(await stored(page), '{broken'); assert.equal(await downloadJSON(page, () => page.getByRole('button', { name: '破損データをそのまま書き出す', exact: true }).click()), '{broken');
});

test('SAVE-03/04: copy success does not clear a storage failure, but a later successful save restores navigation', async t => {
  const page = await setup(t, { saved: fullFixture() }); await page.goto(origin + budget); await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.evaluate(() => { const original = Storage.prototype.setItem; window.restoreStorageForTest = () => Storage.prototype.setItem = original; Storage.prototype.setItem = function(key, value) { if (key.startsWith('codex-tool-lab:')) throw new DOMException('quota', 'QuotaExceededError'); return original.call(this, key, value); }; });
  const saved = await stored(page); await page.getByLabel('来場者1人当たりの変動費（円）', { exact: true }).fill('700'); assert.equal(await stored(page), saved);
  await page.getByRole('button', { name: '原稿をコピー', exact: true }).click(); await waitForText(page.getByRole('status'), '原稿をコピーしました'); const currentURL = page.url(); await page.getByRole('link', { name: '公演情報へ戻る', exact: true }).click(); assert.equal(page.url(), currentURL);
  await page.evaluate(() => window.restoreStorageForTest()); await page.getByLabel('来場者1人当たりの変動費（円）', { exact: true }).fill('600'); assert.equal(JSON.parse(await stored(page)).project.modules.budget.data.variableCostPerAttendee, 600);
  await page.getByRole('link', { name: '公演情報へ戻る', exact: true }).click(); await page.waitForURL('**/index.html?projectId=*');
});

async function uploadModule(page, source) {
  await page.locator('input[data-import=module]').setInputFiles({ name: 'module.json', mimeType: 'application/json', buffer: Buffer.from(source) });
}
test('PACK-01/02/03: module-only export and confirmed import retain current master, other work and assets', async t => {
  const original = JSON.parse(await readFile(path.join(projectRoot, 'samples/demo.json'), 'utf8')), current = structuredClone(original);
  original.project.modules.flyer.data.introduction = '共有された原稿'; current.project.title = '現在の公演表記'; current.project.venue.name = '現在の会場'; current.project.ticket.priceCategories[0].price = 4000; current.project.documents.push({ legacyAsset: true });
  const page = await setup(t, { saved: current, width: 375 }); await page.goto(origin + prefix + 'modules/flyer/index.html'); const saved = await stored(page);
  const source = moduleBackup(original, 'flyer'); page.once('dialog', dialog => dialog.dismiss()); await uploadModule(page, source); assert.equal(await stored(page), saved); assert.equal(await page.getByLabel('公演紹介文', { exact: true }).inputValue(), current.project.modules.flyer.data.introduction);
  page.once('dialog', dialog => dialog.accept()); await uploadModule(page, source); await waitForText(page.getByRole('status'), 'このモジュールのJSONを取り込み、保存しました'); const updated = JSON.parse(await stored(page)); assert.equal(updated.project.modules.flyer.data.introduction, '共有された原稿'); assert.equal(updated.project.title, '現在の公演表記'); assert.equal(updated.project.venue.name, '現在の会場'); assert.equal(updated.project.ticket.priceCategories[0].price, 4000); assert.deepEqual(updated.project.modules.budget, current.project.modules.budget); assert.deepEqual(updated.project.documents, current.project.documents);
  const packet = JSON.parse(await downloadJSON(page, () => page.getByRole('button', { name: 'このモジュールのJSONを書き出す', exact: true }).click())); assert.deepEqual(Object.keys(packet.document.project.modules), ['flyer']); assert.equal(packet.document.project.documents.length, 0); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
test('PACK-02/03: wrong module/project/full format and current reference mismatch leave saved module untouched', async t => {
  const d = fullFixture(); d.project.modules.budget.data.plannedSales = []; d.project.performanceDates[0].capacity = 10;
  const page = await setup(t, { saved: d }); await page.goto(origin + prefix + 'modules/tickets/index.html'); const saved = await stored(page);
  const source = JSON.parse(await readFile(path.join(projectRoot, 'samples/demo.json'), 'utf8'));
  await uploadModule(page, moduleBackup(source, 'flyer')); await waitForText(page.getByRole('status'), '別のモジュール'); assert.equal(await stored(page), saved);
  await uploadModule(page, JSON.stringify(source)); await waitForText(page.getByRole('status'), '専用JSON'); assert.equal(await stored(page), saved);
  const other = structuredClone(source); other.project.id = 'other-project'; other.project.calendarEvents = []; await uploadModule(page, moduleBackup(other, 'tickets')); await waitForText(page.getByRole('status'), '公演IDが一致しません'); assert.equal(await stored(page), saved);
  await uploadModule(page, moduleBackup(source, 'tickets')); await waitForText(page.getByRole('status'), '販売可能席数'); assert.equal(await stored(page), saved);
});
test('PACK-03: missing or invalid modules cannot export; quota and conflict preserve recoverable data', async t => {
  const empty = await setup(t, { saved: fixture() }); await empty.goto(origin + prefix + 'modules/flyer/index.html'); const original = await stored(empty); let downloads = 0; empty.on('download', () => downloads++); await empty.getByRole('button', { name: 'このモジュールのJSONを書き出す', exact: true }).click(); assert.ok((await empty.getByRole('status').innerText()).includes('未入力')); assert.equal(downloads, 0); assert.equal(await stored(empty), original);
  const source = fullFixture(); source.project.modules.flyer.data.introduction = '取込後の未保存原稿'; const packet = moduleBackup(source, 'flyer');
  const quota = await setup(t, { saved: fullFixture(), failure: 'quota' }); await quota.goto(origin + prefix + 'modules/flyer/index.html'); const quotaSaved = await stored(quota); quota.once('dialog', dialog => dialog.accept()); await uploadModule(quota, packet); await waitForText(quota.getByRole('status'), '保存できません'); assert.equal(await stored(quota), quotaSaved); const backup = JSON.parse(await downloadJSON(quota, () => quota.getByRole('button', { name: 'JSONを書き出す', exact: true }).click())); assert.equal(backup.project.modules.flyer.data.introduction, '取込後の未保存原稿');
  const conflict = await setup(t, { saved: fullFixture() }); await conflict.goto(origin + prefix + 'modules/flyer/index.html'); await conflict.evaluate(key => { const d = JSON.parse(localStorage.getItem(key)); d.project.companyName = '別保存'; localStorage.setItem(key, JSON.stringify(d)); }, STORAGE_KEY); const latest = await stored(conflict); conflict.once('dialog', dialog => dialog.accept()); await uploadModule(conflict, packet); await waitForText(conflict.getByRole('status'), '別のタブなどで保存データが変わりました'); assert.equal(await stored(conflict), latest); assert.equal(await conflict.getByLabel('公演紹介文', { exact: true }).inputValue(), '');
});

test('CONTRACT-01/02/03: mobile contract dates protect saving, payment agenda links and cancellation history', async t => {
  const d=fullFixture(), budgetBefore=structuredClone(d.project.modules.budget);
  const page=await setup(t,{saved:d,width:375});await page.goto(origin+prefix+'modules/contracts/index.html');
  await page.getByRole('button',{name:'契約を追加',exact:true}).click();await page.getByLabel('契約1の名称',{exact:true}).fill('架空の照明協力');
  await page.getByLabel('契約1の担当役割',{exact:true}).fill('照明担当A');await page.getByLabel('契約1の金額（円）',{exact:true}).fill('30000');
  await page.getByLabel('契約1の支払予定日',{exact:true}).fill(tokyoToday());
  let saved=await stored(page);await page.getByLabel('契約1の金額（円）',{exact:true}).fill('-1');assert.equal(await stored(page),saved);
  await page.getByLabel('契約1の金額（円）',{exact:true}).fill('30000');saved=await stored(page);await page.getByLabel('契約1の請求書状態',{exact:true}).selectOption('received');assert.equal(await stored(page),saved);
  await page.getByLabel('契約1の請求書受領日',{exact:true}).fill(tokyoToday());saved=await stored(page);
  await page.getByLabel('契約1の支払状態',{exact:true}).selectOption('paid');assert.equal(await stored(page),saved);
  await page.getByLabel('契約1の支払日',{exact:true}).fill(tokyoToday());await page.reload();assert.equal(await page.getByLabel('契約1の支払状態',{exact:true}).inputValue(),'paid');
  await page.getByLabel('契約1の契約状態',{exact:true}).selectOption('cancelled');assert.ok((await text(page)).includes('支払済み額（取消も含む）'));assert.ok((await text(page)).includes('30,000円'));
  assert.deepEqual(JSON.parse(await stored(page)).project.modules.budget,budgetBefore);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/tmp/os-contracts-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'カレンダー',exact:true}).click();await page.getByLabel('予定の表示範囲',{exact:true}).selectOption('today');
  await page.getByRole('link',{name:/契約支払：架空の照明協力/}).click();await page.waitForURL('**/modules/contracts/index.html?projectId=*#item-*');
  assert.equal(await page.getByLabel('契約1の名称',{exact:true}).inputValue(),'架空の照明協力');
});

test('CONTRACT-04/05: explicit CSV and backup, private default sharing and no outside requests or executed input',async t=>{
  const d=JSON.parse(await readFile(path.join(projectRoot,'samples/demo.json'),'utf8'));d.project.modules.contracts.data.items[0].name='=HOSTILE()';d.project.modules.contracts.data.items[0].notes='<img src=x onerror="window.contractBad=true">';
  const page=await setup(t,{saved:d,width:375}),requests=[];page.on('request',r=>{if(!r.url().startsWith(origin+prefix))requests.push(r.url());});
  let downloads=0;page.on('download',()=>downloads++);await page.goto(origin+prefix+'modules/contracts/index.html');assert.equal(downloads,0);const saved=await stored(page);
  const out=await downloadJSON(page,()=>page.getByRole('button',{name:'契約CSVを書き出す',exact:true}).click());assert.ok(out.includes("'=HOSTILE()"));
  const backup=JSON.parse(await downloadJSON(page,()=>page.getByRole('button',{name:'このモジュールのJSONを書き出す',exact:true}).click()));assert.equal(backup.moduleId,'contracts');
  await page.getByRole('button',{name:'共有用資料を作成',exact:true}).click();const preview=page.getByLabel('共有するJSONの内容',{exact:true});assert.equal((await preview.innerText()).includes('HOSTILE'),false);
  await page.getByRole('checkbox',{name:'作業データ（原稿・メモ・金額など）',exact:true}).check();assert.ok((await preview.innerText()).includes('HOSTILE'));
  assert.equal(await page.locator('#main img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.contractBad)),false);assert.deepEqual(requests,[]);assert.equal(await stored(page),saved);
});

test('CONTRACT-01: legacy contract extension is kept and never silently initialized',async t=>{
  const d=fullFixture();d.project.modules.contracts={id:'contracts',status:'in-progress',startDate:null,dueDate:null,progress:0,alerts:[],data:{privateLegacy:'keep'}};
  const page=await setup(t,{saved:d});await page.goto(origin+prefix+'modules/contracts/index.html');assert.equal(await page.getByRole('button',{name:'契約を追加',exact:true}).count(),0);
  assert.deepEqual(JSON.parse(await stored(page)).project.modules.contracts.data,{privateLegacy:'keep'});
});

test('FUND-01/02/03: mobile grant receipts, report dates, cancellation and calendar row links',async t=>{
 const d=fullFixture(),before=structuredClone(d.project.modules.settlement),page=await setup(t,{saved:d,width:375});await page.goto(origin+prefix+'modules/funding/index.html');
 await page.getByRole('button',{name:'案件を追加',exact:true}).click();await page.getByLabel('案件1の名称',{exact:true}).fill('架空の公演助成');await page.getByLabel('案件1の団体名',{exact:true}).fill('文化団体A');await page.getByLabel('案件1の状態',{exact:true}).selectOption('confirmed');await page.getByLabel('案件1の採択・確定額（円）',{exact:true}).fill('50000');await page.getByLabel('案件1の入金予定日',{exact:true}).fill(tokyoToday());await page.getByLabel('案件1の報告期限（助成金）',{exact:true}).fill(tokyoToday());
 let saved=await stored(page);await page.getByLabel('案件1の入金済み額（円）',{exact:true}).fill('10000');assert.equal(await stored(page),saved);await page.getByLabel('案件1の入金日',{exact:true}).fill(tokyoToday());saved=await stored(page);await page.getByLabel('案件1の入金済み額（円）',{exact:true}).fill('50001');assert.equal(await stored(page),saved);
 await page.getByLabel('案件1の入金済み額（円）',{exact:true}).fill('10000');saved=await stored(page);await page.getByLabel('案件1の報告状態',{exact:true}).selectOption('submitted');assert.equal(await stored(page),saved);await page.getByLabel('案件1の報告提出日',{exact:true}).fill(tokyoToday());await page.reload();assert.equal(await page.getByLabel('案件1の入金済み額（円）',{exact:true}).inputValue(),'10000');assert.ok((await text(page)).includes('40,000円'));
 await page.getByLabel('案件1の状態',{exact:true}).selectOption('cancelled');assert.ok((await text(page)).includes('10,000円'));assert.deepEqual(JSON.parse(await stored(page)).project.modules.settlement,before);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/os-funding-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'カレンダー',exact:true}).click();await page.getByLabel('予定の表示範囲',{exact:true}).selectOption('today');await page.getByRole('link',{name:/助成・協賛・広告入金：架空の公演助成/}).click();await page.waitForURL('**/modules/funding/index.html?projectId=*#item-*');assert.equal(await page.getByLabel('案件1の名称',{exact:true}).inputValue(),'架空の公演助成');
});
test('FUND-01/02/04/05: advertising material dates, safe CSV, selective shares and no outside requests',async t=>{
 const d=JSON.parse(await readFile(path.join(projectRoot,'samples/demo.json'),'utf8')),r=d.project.modules.funding.data.items[0];r.kind='advertisement';r.adSlot='架空のパンフ枠';r.name='=HOSTILE()';r.notes='<img src=x onerror="window.fundBad=true">';r.materialStatus='pending';
 const page=await setup(t,{saved:d,width:375}),requests=[];page.on('request',r=>{if(new URL(r.url()).origin!==origin)requests.push(r.url());});let downloads=0;page.on('download',()=>downloads++);await page.goto(origin+prefix+'modules/funding/index.html');assert.equal(downloads,0);let saved=await stored(page);
 await page.getByLabel('案件1の入稿状態',{exact:true}).selectOption('received');assert.equal(await stored(page),saved);await page.getByLabel('案件1の入稿受領日',{exact:true}).fill(tokyoToday());saved=await stored(page);
 const out=await downloadJSON(page,()=>page.getByRole('button',{name:'助成・協賛・広告CSVを書き出す',exact:true}).click());assert.ok(out.includes("'=HOSTILE()"));const packet=JSON.parse(await downloadJSON(page,()=>page.getByRole('button',{name:'このモジュールのJSONを書き出す',exact:true}).click()));assert.equal(packet.moduleId,'funding');
 await page.getByRole('button',{name:'共有用資料を作成',exact:true}).click();const preview=page.getByLabel('共有するJSONの内容',{exact:true});assert.equal((await preview.innerText()).includes('HOSTILE'),false);await page.getByRole('checkbox',{name:'作業データ（原稿・メモ・金額など）',exact:true}).check();assert.ok((await preview.innerText()).includes('HOSTILE'));assert.equal(await page.locator('#main img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.fundBad)),false);assert.deepEqual(requests,[]);assert.equal(await stored(page),saved);
});
test('FUND-05: legacy funding data stays intact without silently creating rows',async t=>{
 const d=fullFixture();d.project.modules.funding.data={privateLegacy:'keep'};const page=await setup(t,{saved:d});await page.goto(origin+prefix+'modules/funding/index.html');assert.equal(await page.getByRole('button',{name:'案件を追加',exact:true}).count(),0);assert.deepEqual(JSON.parse(await stored(page)).project.modules.funding.data,{privateLegacy:'keep'});
});
