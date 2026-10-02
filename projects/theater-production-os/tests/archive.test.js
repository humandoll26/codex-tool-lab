import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validate, report, exportCSV } from '../modules/archive/model.js';
import { fixture } from './fixture.js';
import { parseDocument, prepareDocument, writeDocument, STORAGE_KEY } from '../shared/model.js';
import { memoryStorage } from './fixture.js';
import { eventsFor, agenda } from '../shared/schedule.js';
const row = () => ({ id: 'asset', name: '完成パンフ', category: 'program', status: 'pending', dueDate: '2026-10-01', location: '', keeper: '保管担当', recordedDate: null, notes: '' });
function document() {
  const d = fixture(); d.project.documents = [{ id: 'old-document', extra: { opaque: true } }];
  d.project.modules.archive = { id: 'archive', status: 'in-progress', startDate: null, dueDate: null, progress: 0, alerts: [], data: { ...defaults(), items: [row()] } }; return d;
}
test('ARCH-01: current archive and opaque documents survive JSON round-trip without changing old budget', () => {
  const d = document(); d.project.modules.archive.data.snapshot = { projectId: d.project.id, capturedAt: '2026-10-02T01:00:00.000Z', report: '保存時点の原稿' };
  const parsed = parseDocument(JSON.stringify(prepareDocument(d)));
  assert.deepEqual(parsed.project.modules.archive, d.project.modules.archive); assert.deepEqual(parsed.project.documents, d.project.documents); assert.equal(parsed.project.modules.budget.data.plannedSales[0].quantity, 80);
});
test('ARCH-02: collected assets need both storage location and recorded date, completed deadlines leave overdue', () => {
  const d = document(), data = d.project.modules.archive.data;
  assert.equal(agenda(d.project, '2026-10-02').overdue.some(e => e.moduleId === 'archive'), true);
  data.items[0].status = 'collected'; assert.equal(validate(data, 'archive', d.project).length, 2);
  data.items[0].location = '共有フォルダ / パンフ'; data.items[0].recordedDate = '2026-10-02'; assert.deepEqual(validate(data, 'archive', d.project), []);
  assert.equal(agenda(d.project, '2026-10-02').overdue.some(e => e.moduleId === 'archive'), false);
  assert.equal(eventsFor(d.project).find(e => e.moduleId === 'archive').relatedItemId, 'asset');
  data.items[0].status = 'not-needed'; assert.equal(agenda(d.project, '2026-10-02').overdue.some(e => e.moduleId === 'archive'), false);
});
test('ARCH-02: absent attendance stays distinct from zero and may exceed ticket capacity', () => {
  const d = document(), data = d.project.modules.archive.data;
  assert.ok(report(d.project, data).includes('実来場者数：未入力'));
  data.attendance = 0; assert.ok(report(d.project, data).includes('実来場者数：0人'));
  data.attendance = 500; assert.deepEqual(validate(data, 'archive', d.project), []); assert.ok(report(d.project, data).includes('実来場者数：500人'));
});
for (const [name, mutation] of [
  ['negative attendance', d => d.attendance = -1], ['fractional attendance', d => d.attendance = 1.5], ['bad category', d => d.items[0].category = 'unknown'],
  ['bad date', d => d.items[0].recordedDate = '2026-02-30'], ['bad snapshot project', d => d.snapshot = { projectId: 'other', capturedAt: '2026-10-02T01:00:00.000Z', report: '原稿' }],
  ['bad snapshot date', d => d.snapshot = { projectId: 'project-demo', capturedAt: '2026-02-30T00:00:00.000Z', report: '原稿' }],
  ['empty snapshot report', d => d.snapshot = { projectId: 'project-demo', capturedAt: '2026-10-02T01:00:00.000Z', report: '' }]
]) test(`ARCH-02/03: ${name} rejects saving and importing while preserving existing JSON`, () => {
  const doc = document(), storage = memoryStorage(); assert.equal(writeDocument(storage, doc).ok, true); const before = storage.getItem(STORAGE_KEY);
  mutation(doc.project.modules.archive.data); assert.throws(() => writeDocument(storage, doc)); assert.equal(storage.getItem(STORAGE_KEY), before); assert.throws(() => parseDocument(JSON.stringify(doc)));
});
test('ARCH-03/04: retained financial source text stays independent of current master and asset CSV protects formulas', () => {
  const d = document(), data = d.project.modules.archive.data;
  data.snapshot = { projectId: d.project.id, capturedAt: '2026-10-02T01:00:00.000Z', report: '旧公演\n実収入150000円' };
  d.project.title = '新しい表記'; d.project.ticket.priceCategories[0].price = 5000;
  assert.ok(report(d.project, data).includes('旧公演\n実収入150000円')); assert.equal(data.snapshot.report, '旧公演\n実収入150000円');
  data.items[0].location = '=HYPERLINK("https://example.invalid")'; data.items[0].name = '<img src=x>'; const out = exportCSV(d.project, data);
  assert.ok(out.includes('"\'=HYPERLINK')); assert.ok(out.includes('<img src=x>')); assert.ok(report(d.project, data).includes('現在の入力を自動反映しません'));
});
