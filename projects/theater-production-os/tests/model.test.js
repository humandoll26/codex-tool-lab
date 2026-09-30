import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, memoryStorage } from './fixture.js';
import { STORAGE_KEY, STATUSES, validateDocument, calculateBudget, parseDocument,
  writeDocument, readDocument, removeDocument, newDocument } from '../shared/model.js';

test('AC-03: documented two-stage budget', () => {
  const d = fixture();
  assert.deepEqual(validateDocument(d), []);
  assert.deepEqual(calculateBudget(d.project), { attendees: 160, revenue: 480000, capacity: 200,
    fixed: 100000, expenses: 180000, profit: 300000, salesRate: 80, breakEven: 40, exceedsCapacity: false });
});

test('AC-04: zero capacity, free tickets and break-even boundaries', () => {
  const d = fixture(), b = d.project.modules.budget.data;
  d.project.performanceDates.forEach(s => s.capacity = 0); b.plannedSales = [];
  assert.equal(calculateBudget(d.project).salesRate, null);
  d.project.ticket.priceCategories[0].price = 0;
  b.variableCostPerAttendee = 0;
  assert.equal(calculateBudget(d.project).breakEven, null);
  b.fixedCosts = [];
  assert.equal(calculateBudget(d.project).breakEven, 0);
  b.variableCostPerAttendee = 1;
  assert.equal(calculateBudget(d.project).breakEven, null);
  d.project.ticket.priceCategories[0].price = 3; b.fixedCosts = [{ id: 'c', name: '費用', amount: 5 }];
  assert.equal(calculateBudget(d.project).breakEven, 3);
  assert.equal(calculateBudget(d.project).exceedsCapacity, true);
});

test('multiple prices, missing pairs are zero, capacity uses per-stage totals', () => {
  const d = fixture();
  d.project.ticket.priceCategories.push({ id: 'student', name: '学生', price: 2000 });
  d.project.modules.budget.data.plannedSales.push({ stageId: 'stage-1', priceCategoryId: 'student', quantity: 20 });
  assert.deepEqual(validateDocument(d), []);
  assert.equal(calculateBudget(d.project).revenue, 520000);
  d.project.modules.budget.data.plannedSales[2].quantity = 21;
  assert.ok(validateDocument(d).some(i => i.message.includes('席数を超え')));
});

const invalidCases = [
  ['blank title', d => d.project.title = '  '],
  ['blank category name', d => d.project.ticket.priceCategories[0].name = ''],
  ['blank cost name', d => d.project.modules.budget.data.fixedCosts[0].name = ''],
  ['blank number', d => d.project.modules.budget.data.variableCostPerAttendee = ''],
  ['negative number', d => d.project.performanceDates[0].capacity = -1],
  ['decimal number', d => d.project.ticket.priceCategories[0].price = 0.5],
  ['non-number', d => d.project.modules.budget.data.plannedSales[0].quantity = 'abc'],
  ['unsafe integer', d => d.project.ticket.priceCategories[0].price = Number.MAX_SAFE_INTEGER + 1],
  ['unsafe calculation', d => d.project.ticket.priceCategories[0].price = Number.MAX_SAFE_INTEGER],
  ['invalid calendar date', d => d.project.performanceDates[0].startsAt = '2026-02-30T14:00:00+09:00'],
  ['invalid time', d => d.project.performanceDates[0].startsAt = '2026-11-30T25:00:00+09:00'],
  ['wrong time zone', d => d.project.performanceDates[0].startsAt = '2026-11-30T14:00:00Z'],
  ['duplicate stage id', d => d.project.performanceDates[1].id = 'stage-1'],
  ['duplicate price id', d => d.project.ticket.priceCategories.push({ ...d.project.ticket.priceCategories[0] })],
  ['duplicate cost id', d => d.project.modules.budget.data.fixedCosts.push({ ...d.project.modules.budget.data.fixedCosts[0] })],
  ['duplicate sale pair', d => d.project.modules.budget.data.plannedSales.push({ ...d.project.modules.budget.data.plannedSales[0] })],
  ['dangling stage', d => d.project.performanceDates.pop()],
  ['dangling price', d => d.project.ticket.priceCategories = []],
  ['over capacity', d => d.project.performanceDates[0].capacity = 79],
  ['unknown schema', d => d.schemaVersion = 2],
  ['wrong module id', d => d.project.modules.budget.id = 'other'],
  ['wrong module status', d => d.project.modules.budget.status = 'soon'],
  ['invalid module date', d => d.project.modules.budget.dueDate = '2026-02-30'],
  ['invalid update date', d => d.project.updatedAt = '2026-02-30T00:00:00Z'],
  ['invalid module progress', d => d.project.modules.budget.progress = 101],
  ['invalid extension module data', d => d.project.modules.flyer = { ...d.project.modules.budget, id: 'flyer', data: [] }],
  ['invalid top-level structure', d => d.project = []]
];
for (const [name, modify] of invalidCases) test(`AC-05/07: ${name} rejects saving without changing the prior data`, () => {
  const storage = memoryStorage(); writeDocument(storage, fixture());
  const saved = storage.getItem(STORAGE_KEY);
  const d = fixture(); modify(d);
  assert.ok(validateDocument(d).length);
  assert.throws(() => parseDocument(JSON.stringify(d)));
  assert.throws(() => writeDocument(storage, d));
  assert.equal(storage.getItem(STORAGE_KEY), saved);
});

test('AC-06: JSON preserves IDs, extension fields and unimplemented module contents', () => {
  const d = fixture();
  d.project.modules.flyer = { id: 'flyer', status: 'on-hold', startDate: '2026-10-01', dueDate: null,
    progress: 15.5, alerts: [{ text: '原稿待ち' }], data: { text: '架空原稿', nested: [1, null, true] } };
  d.project.cast = [{ id: 'sample', note: '架空サンプル' }];
  d.project.calendarEvents = [{ id: 'later', date: '2026-10-01' }]; d.project.documents = [{ title: '架空資料' }];
  const storage = memoryStorage(); const result = writeDocument(storage, d);
  assert.deepEqual(readDocument(storage).document, result.document);
  assert.deepEqual(parseDocument(JSON.stringify(result.document)), result.document);
  assert.deepEqual(result.document.project.modules.flyer, d.project.modules.flyer);
  assert.deepEqual(result.document.project.cast, d.project.cast);
  assert.equal(result.document.project.id, d.project.id);
});

test('AC-07/09: invalid JSON and corrupt storage are not replaced during loading', () => {
  const storage = memoryStorage(); storage.setItem(STORAGE_KEY, '{broken');
  assert.throws(() => parseDocument('{broken'), /JSON/);
  assert.equal(readDocument(storage).kind, 'corrupt');
  assert.equal(storage.getItem(STORAGE_KEY), '{broken');
  assert.equal(readDocument(storage).raw, '{broken');
});

test('AC-08: only this OS key is removed', () => {
  const storage = memoryStorage(); writeDocument(storage, fixture()); storage.setItem('another-tool', 'keep');
  assert.equal(removeDocument(storage).ok, true);
  assert.equal(storage.getItem(STORAGE_KEY), null); assert.equal(storage.getItem('another-tool'), 'keep');
});

test('AC-09: storage failure retains exportable in-memory data', () => {
  const storage = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('disabled'); } };
  assert.equal(readDocument(storage).kind, 'unavailable');
  const result = writeDocument(storage, fixture()); assert.equal(result.ok, false);
  assert.deepEqual(parseDocument(JSON.stringify(result.document)), result.document);
  assert.equal(removeDocument(storage).ok, false);
});

test('AC-10: master edits change results, never rewrite planned sales', () => {
  const d = fixture(), sales = structuredClone(d.project.modules.budget.data.plannedSales);
  d.project.ticket.priceCategories[0].price = 4000;
  assert.equal(calculateBudget(d.project).revenue, 640000);
  d.project.performanceDates[0].capacity = 50;
  assert.ok(validateDocument(d).some(i => i.path.endsWith('capacity')));
  assert.deepEqual(d.project.modules.budget.data.plannedSales, sales);
});

test('AC-12: all documented module states round-trip', () => {
  for (const status of STATUSES) {
    const d = fixture(); d.project.modules.budget.status = status;
    assert.equal(parseDocument(JSON.stringify(d)).project.modules.budget.status, status);
  }
});

test('new incomplete project cannot overwrite a saved project', () => {
  const storage = memoryStorage(); writeDocument(storage, fixture());
  const saved = storage.getItem(STORAGE_KEY);
  assert.throws(() => writeDocument(storage, newDocument()));
  assert.equal(storage.getItem(STORAGE_KEY), saved);
});

test('ISO stage times with minute precision or fractional seconds are supported', () => {
  for (const startsAt of ['2026-11-30T14:00+09:00', '2026-11-30T14:00:30.123+09:00']) {
    const d = fixture(); d.project.performanceDates[0].startsAt = startsAt;
    assert.deepEqual(validateDocument(d), []);
  }
});

test('non-finite extension numbers cannot be saved or imported as JSON exponent overflow', () => {
  const d = fixture(); d.project.extra = Infinity;
  assert.ok(validateDocument(d).length);
  const storage = memoryStorage(); writeDocument(storage, fixture()); const saved = storage.getItem(STORAGE_KEY);
  assert.throws(() => writeDocument(storage, d)); assert.equal(storage.getItem(STORAGE_KEY), saved);
  const source = JSON.stringify(fixture()).replace('"title":"架空公演"', '"extra":1e999,"title":"架空公演"');
  assert.throws(() => parseDocument(source), /有限値/);
});
