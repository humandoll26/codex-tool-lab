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

function fullFixture() {
  const d = fixture();
  for (const id of ['flyer', 'distribution', 'publicity', 'tickets']) d.project.modules[id] = {
    id, status: 'not-started', startDate: null, dueDate: null, progress: 0, alerts: [], data: DEFINITIONS[id].defaults() };
  return d;
}
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

test('MVP-01/09: iPhone sample button loads all five modules after confirmation', async t => {
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
  const d = JSON.parse(await stored(page)); assert.equal(Object.keys(d.project.modules).length, 5);
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
