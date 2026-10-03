import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sharedModule, defaultShareOptions } from '../shared/module-share.js';
import { moduleBackup, parseModuleBackup } from '../shared/module-backup.js';
import { parseDocument } from '../shared/model.js';
import { fixture } from './fixture.js';
import { DEFINITIONS } from '../shared/modules.js';
const sample = async () => JSON.parse(await readFile(new URL('../samples/demo.json', import.meta.url), 'utf8'));
const packet = (d, id, options) => JSON.parse(sharedModule(d, id, options));

test('SHARE-01: default sharing has title and progress only, excludes master/private/financial data', async () => {
  const d = await sample(); d.project.privateExtension = 'PRIVATE_CANARY'; d.project.venue.privateExtension = 'PRIVATE_CANARY';
  d.project.modules.budget.privateExtension = 'PRIVATE_CANARY'; d.project.modules.budget.alerts = ['PRIVATE_CANARY'];
  const before = JSON.stringify(d), p = packet(d, 'budget');
  assert.deepEqual(p.project, { title: d.project.title });
  assert.deepEqual(Object.keys(p.module), ['id', 'name', 'status', 'startDate', 'dueDate', 'progress']);
  assert.equal(p.module.data, undefined); assert.equal(p.document, undefined); assert.equal(p.project.id, undefined);
  assert.equal(JSON.stringify(p).includes('PRIVATE_CANARY'), false); assert.equal(JSON.stringify(d), before);
});
test('SHARE-01: each common checkbox adds only its allowed fields, all unchecked has no context', async () => {
  const d = await sample(), options = Object.fromEntries(Object.keys(defaultShareOptions()).map(k => [k, false]));
  for (const key of ['company', 'venue', 'stages', 'prices']) {
    const p = packet(d, 'flyer', { ...options, [key]: true });
    const expected = { company: ['companyName'], venue: ['venue'], stages: ['timeZone', 'performanceDates'], prices: ['ticket'] }[key];
    assert.deepEqual(Object.keys(p.project), expected); assert.deepEqual(Object.keys(p.module), ['id', 'name']);
  }
  assert.deepEqual(packet(d, 'flyer', options).project, {});
});
test('SHARE-02: all 17 modules project known data and strip extension keys at every supported nesting', async () => {
  const d = await sample();
  d.project.privateExtension = 'PRIVATE_CANARY';
  d.project.venue.privateExtension = 'PRIVATE_CANARY';
  for (const stage of d.project.performanceDates) stage.privateExtension = 'PRIVATE_CANARY';
  for (const price of d.project.ticket.priceCategories) price.privateExtension = 'PRIVATE_CANARY';
  for (const m of Object.values(d.project.modules)) {
    m.privateExtension = 'PRIVATE_CANARY'; m.data.privateExtension = 'PRIVATE_CANARY';
    for (const key of ['items', 'sales', 'plannedSales', 'fixedCosts']) for (const row of m.data[key] || []) {
      row.privateExtension = 'PRIVATE_CANARY'; for (const h of row.history || []) h.privateExtension = 'PRIVATE_CANARY';
    }
  }
  if (d.project.modules.archive.data.snapshot) d.project.modules.archive.data.snapshot.privateExtension = 'PRIVATE_CANARY';
  const before = JSON.stringify(d), selection = Object.fromEntries(Object.keys(defaultShareOptions()).map(k => [k, true]));
  for (const id of Object.keys(DEFINITIONS)) {
    const p = packet(d, id, selection); assert.equal(p.module.id, id); assert.ok(p.module.data);
    assert.equal(JSON.stringify(p).includes('PRIVATE_CANARY'), false, id);
    assert.equal(p.project.documents, undefined); assert.equal(p.project.calendarEvents, undefined); assert.equal(p.project.modules, undefined);
    if (id !== 'budget') assert.equal(p.module.data.version, 1);
  }
  assert.equal(JSON.stringify(d), before);
  assert.equal(JSON.parse(moduleBackup(d, 'flyer')).document.project.privateExtension, 'PRIVATE_CANARY');
});
test('SHARE-02: projected work text is preserved as text and sensitive notes are excluded by default', async () => {
  const d = await sample(); d.project.modules.flyer.data.introduction = '<script>PRIVATE_TEXT</script>';
  assert.equal(sharedModule(d, 'flyer').includes('PRIVATE_TEXT'), false);
  assert.equal(packet(d, 'flyer', { data: true }).module.data.introduction, '<script>PRIVATE_TEXT</script>');
});
test('SHARE-02: actual rehearsal histories and saved reports strip their nested extensions and project IDs', async () => {
  const d = await sample();
  const r = d.project.modules.rehearsal.data.items[0];
  r.history.push({ date: r.date, startTime: r.startTime, endTime: r.endTime, venue: r.venue, recordedAt: '2026-10-02T00:00:00.000Z', privateExtension: 'PRIVATE_CANARY' });
  d.project.modules.archive.data.snapshot = { projectId: d.project.id, capturedAt: '2026-10-02T00:00:00.000Z', report: '保存した架空レポート', privateExtension: 'PRIVATE_CANARY' };
  const rehearsal = packet(d, 'rehearsal', { data: true }), archive = packet(d, 'archive', { data: true });
  assert.deepEqual(Object.keys(rehearsal.module.data.items[0].history[0]), ['date', 'startTime', 'endTime', 'venue', 'recordedAt']);
  assert.deepEqual(archive.module.data.snapshot, { capturedAt: '2026-10-02T00:00:00.000Z', report: '保存した架空レポート' });
  assert.equal(JSON.stringify([rehearsal, archive]).includes('PRIVATE_CANARY'), false);
});
test('SHARE-03: invalid selections, absent modules and invalid source are rejected', () => {
  const d = fixture();
  assert.throws(() => sharedModule(d, '__proto__'), /対応/); assert.throws(() => sharedModule(d, 'flyer'), /未入力/);
  assert.throws(() => sharedModule(d, 'budget', { unknown: true }), /選択/); assert.throws(() => sharedModule(d, 'budget', { data: 'yes' }), /選択/);
  d.project.title = ''; assert.throws(() => sharedModule(d, 'budget'), /入力エラー/);
});
test('SHARE-03: legacy module supports progress only and sharing cannot be imported as backup', () => {
  const d = fixture(); d.project.modules.flyer = { id: 'flyer', status: 'on-hold', startDate: null, dueDate: null, progress: 0, alerts: [], data: { privateLegacy: 'PRIVATE_CANARY' } };
  const source = sharedModule(d, 'flyer'); assert.equal(source.includes('PRIVATE_CANARY'), false);
  assert.throws(() => sharedModule(d, 'flyer', { data: true }), /旧形式/);
  assert.throws(() => parseDocument(source), /共有用資料/); assert.throws(() => parseModuleBackup(source, 'flyer'), /共有用資料/);
});
