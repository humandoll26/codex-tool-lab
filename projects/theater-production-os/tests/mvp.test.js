import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, memoryStorage } from './fixture.js';
import { DEFINITIONS } from '../shared/modules.js';
import { csv } from '../shared/common.js';
import { validateDocument, writeDocument, readDocument, parseDocument, STORAGE_KEY } from '../shared/model.js';
import { totals as distributionTotals } from '../modules/distribution/model.js';
import { totals as salesTotals, stageTotals } from '../modules/tickets/model.js';
import { publicationText } from '../modules/flyer/model.js';
import { tokyoToday, weekRange, addDays, firstDay, generateTemplate, agenda, TEMPLATE } from '../shared/schedule.js';

function withModule(id) {
  const d = fixture(); d.project.modules[id] = { id, status: 'in-progress', startDate: null, dueDate: null, progress: 0, alerts: [], data: DEFINITIONS[id].defaults() }; return d;
}
const distributionRow = () => ({ id: 'distribution-row', name: '架空劇場', assignee: '制作A', date: '2026-11-01', method: 'hand', planned: 100, shipped: 20, status: 'confirmed' });
const publicityRow = () => ({ id: 'post-row', title: 'チケット発売', channel: 'SNS', date: '2026-11-01', text: '架空原稿', materials: '', status: 'draft' });

test('MVP-02: flyer uses master fields and preserves item approval through JSON', () => {
  const d = withModule('flyer'), b = d.project.modules.flyer.data;
  b.items.push({ id: 'copy-1', name: '紹介', text: '<b>架空原稿</b>', status: 'approved' });
  b.officialUrl = 'https://example.com/show';
  d.project.title = '変更後の公演'; d.project.ticket.priceCategories[0].price = 4000;
  assert.deepEqual(validateDocument(d), []);
  const text = publicationText(d.project, b); assert.ok(text.includes('変更後の公演')); assert.ok(text.includes('4,000円')); assert.ok(text.includes('<b>架空原稿</b>'));
  assert.deepEqual(parseDocument(JSON.stringify(d)), d);
});
test('MVP-03: distribution totals and safe CSV', () => {
  const d = withModule('distribution'), b = d.project.modules.distribution.data;
  b.printed = 500; b.items.push(distributionRow());
  assert.deepEqual(validateDocument(d), []);
  assert.deepEqual(distributionTotals(b), { planned: 100, shipped: 20, unassigned: 400, remaining: 480 });
  b.items[0].name = '=SUM(1,2)'; const out = DEFINITIONS.distribution.exportCSV(b);
  assert.ok(out.startsWith('\uFEFF')); assert.ok(out.includes("'=SUM(1,2)"));
  assert.ok(csv([['a"b', 'line\nbreak', '@formula']]).includes('"a""b"'));
});
test('MVP-05: actual sales are separate from planned sales, including stage totals', () => {
  const d = withModule('tickets'), data = d.project.modules.tickets.data;
  data.sales.push({ stageId: 'stage-1', priceCategoryId: 'general', quantity: 25 });
  assert.deepEqual(validateDocument(d), []);
  assert.deepEqual(salesTotals(d.project, data), { count: 25, capacity: 200, remaining: 175, revenue: 75000, rate: 12.5 });
  assert.equal(stageTotals(d.project, data)[0].remaining, 75);
  assert.equal(d.project.modules.budget.data.plannedSales[0].quantity, 80);
  d.project.ticket.priceCategories[0].price = 4000;
  assert.equal(salesTotals(d.project, data).revenue, 100000);
});

const badCases = [
  ['flyer', b => b.officialUrl = 'javascript:alert(1)'],
  ['flyer', b => b.printDate = '2026-02-30'],
  ['flyer', b => b.items = [{ id: 'a', name: '', text: '', status: 'approved' }]],
  ['distribution', b => { b.printed = 99; b.items.push(distributionRow()); }],
  ['distribution', b => { b.printed = 100; const row = distributionRow(); row.shipped = 101; b.items.push(row); }],
  ['distribution', b => b.printed = -1],
  ['distribution', b => b.printed = 0.5],
  ['distribution', b => b.printed = Number.MAX_SAFE_INTEGER + 1],
  ['distribution', b => { b.printed = Number.MAX_SAFE_INTEGER; const row = distributionRow(); row.planned = Number.MAX_SAFE_INTEGER; b.items.push(row, { ...row, id: 'second' }); }],
  ['publicity', b => { const row = publicityRow(); row.date = '2026-13-01'; b.items.push(row); }],
  ['publicity', b => { const row = publicityRow(); row.channel = ''; b.items.push(row); }],
  ['publicity', b => { const row = publicityRow(); row.status = 'unknown'; b.items.push(row); }],
  ['publicity', b => b.items.push(publicityRow(), publicityRow())],
  ['tickets', b => b.sales.push({ stageId: 'missing', priceCategoryId: 'general', quantity: 1 })],
  ['tickets', b => b.sales.push({ stageId: 'stage-1', priceCategoryId: 'missing', quantity: 1 })],
  ['tickets', b => b.sales.push({ stageId: 'stage-1', priceCategoryId: 'general', quantity: 101 })],
  ['tickets', b => b.sales.push({ stageId: 'stage-1', priceCategoryId: 'general', quantity: -1 })],
  ['tickets', b => b.sales.push({ stageId: 'stage-1', priceCategoryId: 'general', quantity: 0.5 })],
  ['tickets', b => { const r = { stageId: 'stage-1', priceCategoryId: 'general', quantity: 1 }; b.sales.push(r, { ...r }); }]
];
badCases.forEach(([id, modify], i) => test(`MVP-03/04/05/09: reject invalid ${id} data #${i + 1} without overwriting`, () => {
  const d = withModule(id), storage = memoryStorage(); writeDocument(storage, d); const saved = storage.getItem(STORAGE_KEY);
  modify(d.project.modules[id].data); assert.ok(validateDocument(d).length);
  assert.throws(() => writeDocument(storage, d)); assert.equal(storage.getItem(STORAGE_KEY), saved);
}));

test('MVP-09: old phase-1 and unknown module extensions remain valid', () => {
  const d = fixture(); d.project.modules.flyer = { id: 'flyer', status: 'on-hold', startDate: null, dueDate: null, progress: 0, alerts: [], data: { arbitrary: ['keep'] } };
  assert.deepEqual(validateDocument(d), []); const storage = memoryStorage(); writeDocument(storage, d);
  assert.deepEqual(readDocument(storage).document.project.modules.flyer.data, { arbitrary: ['keep'] });
});
test('MVP-06: Tokyo midnight, Monday week and leap-year arithmetic', () => {
  assert.equal(tokyoToday(new Date('2026-09-30T15:00:00Z')), '2026-10-01');
  assert.deepEqual(weekRange('2026-10-04'), { start: '2026-09-28', end: '2026-10-04' });
  assert.deepEqual(weekRange('2026-10-05'), { start: '2026-10-05', end: '2026-10-11' });
  assert.equal(addDays('2028-03-01', -1), '2028-02-29'); assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});
test('MVP-07: reverse schedules preserve manual entries, IDs, status and names without duplicates', () => {
  const d = fixture(), p = d.project;
  const manual = { dataVersion: 1, id: 'manual', projectId: p.id, moduleId: 'flyer', title: '手動予定', date: '2026-11-01', type: 'manual', status: 'planned', relatedItemId: null };
  p.calendarEvents = [manual, { legacy: true }];
  p.calendarEvents = generateTemplate(p); assert.equal(p.calendarEvents.length, TEMPLATE.length + 2);
  assert.deepEqual(validateDocument(d), []);
  const task = p.calendarEvents.find(e => e.templateId === 'flyer-print'); task.status = 'completed'; task.title = '編集済み';
  const ids = p.calendarEvents.map(e => e.id);
  p.productionTemplate = Object.fromEntries(TEMPLATE.map(t => [t.id, t.days])); p.productionTemplate['flyer-print'] = 30;
  p.calendarEvents = generateTemplate(p); assert.deepEqual(p.calendarEvents.map(e => e.id), ids);
  const next = p.calendarEvents.find(e => e.templateId === 'flyer-print'); assert.equal(next.date, addDays(firstDay(p), -30)); assert.equal(next.status, 'completed'); assert.equal(next.title, '編集済み');
  assert.deepEqual(p.calendarEvents[0], manual); assert.deepEqual(p.calendarEvents[1], { legacy: true });
  p.performanceDates[0].startsAt = '2026-12-30T14:00:00+09:00'; p.performanceDates[1].startsAt = '2026-12-30T18:00:00+09:00';
  assert.equal(agenda(p, '2026-10-01').changedTemplate, true);
});
test('MVP-06/08: module rows, completion and deadlines feed the agenda', () => {
  const d = withModule('publicity'), p = d.project;
  p.modules.publicity.startDate = '2026-10-02'; p.modules.publicity.status = 'not-started'; p.modules.publicity.dueDate = '2026-09-20';
  const row = publicityRow(); row.date = '2026-09-30'; p.modules.publicity.data.items.push(row);
  const a = agenda(p, '2026-09-30'); assert.ok(a.today.some(e => e.relatedItemId === row.id));
  assert.ok(a.overdue.some(e => e.moduleId === 'publicity')); assert.deepEqual(a.soon, ['publicity']);
  row.status = 'published'; assert.equal(agenda(p, '2026-10-01').overdue.some(e => e.relatedItemId === row.id), false);
  p.modules.publicity.status = 'not-needed'; assert.equal(agenda(p, '2026-10-01').overdue.some(e => e.moduleId === 'publicity'), false);
});
test('MVP-07/09: invalid event IDs, dates, template duplication and settings are rejected', () => {
  for (const modify of [p => p.calendarEvents[0].date = '2026-02-30', p => p.calendarEvents[0].projectId = 'other', p => p.calendarEvents.push({ ...p.calendarEvents[0] }),
    p => p.calendarEvents.push({ ...p.calendarEvents[0], id: 'another' }), p => p.productionTemplate = { 'budget-start': -1 }, p => p.calendarEvents[0].relatedItemId = 'missing']) {
    const d = fixture(); d.project.calendarEvents = generateTemplate(d.project); modify(d.project); assert.ok(validateDocument(d).length);
  }
});
