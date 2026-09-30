import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { fixture } from '../fixture.js';
import { STORAGE_KEY } from '../../shared/model.js';

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
  await page.locator('input[type=file]').setInputFiles({ name: 'sample.json', mimeType: 'application/json',
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
