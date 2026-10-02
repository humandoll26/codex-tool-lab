import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { moduleBackup, parseModuleBackup, mergeModuleBackup } from '../shared/module-backup.js';
import { fixture } from './fixture.js';
const sample = () => readFile(new URL('../samples/demo.json', import.meta.url), 'utf8').then(JSON.parse);
const task = (projectId, moduleId, id) => ({ dataVersion: 1, id, projectId, moduleId, title: '手動予定', date: '2026-12-01', status: 'planned', type: 'manual', relatedItemId: null });
test('PACK-01: only the selected module and its events are exported, with shared master and module extensions retained', async () => {
  const doc = await sample(); doc.project.documents.push({ privateAsset: 'exclude' }); doc.project.modules.flyer.custom = { retained: true }; doc.project.calendarEvents.push(task(doc.project.id, 'flyer', 'flyer-manual')); const before = JSON.stringify(doc);
  const packet = parseModuleBackup(moduleBackup(doc, 'flyer'), 'flyer');
  assert.deepEqual(Object.keys(packet.document.project.modules), ['flyer']); assert.equal(packet.document.project.documents.length, 0); assert.ok(packet.document.project.calendarEvents.every(e => e.moduleId === 'flyer'));
  assert.equal(packet.document.project.performanceDates.length, 2); assert.deepEqual(packet.document.project.modules.flyer.custom, { retained: true }); assert.equal(JSON.stringify(doc), before);
});
test('PACK-02: target-only merge retains current master, other modules, documents and their events', async () => {
  const source = await sample(), current = structuredClone(source); source.project.modules.flyer.data.introduction = '引継ぎ原稿'; source.project.calendarEvents.push(task(source.project.id, 'flyer', 'flyer-manual'));
  current.project.title = '現在の公演表記'; current.project.venue.name = '現在の会場'; current.project.ticket.priceCategories[0].price = 4000; current.project.documents = [{ old: true }]; current.project.calendarEvents.push(task(current.project.id, 'publicity', 'other-manual'));
  const before = JSON.stringify(current), merged = mergeModuleBackup(current, moduleBackup(source, 'flyer'), 'flyer').document;
  assert.equal(merged.project.modules.flyer.data.introduction, '引継ぎ原稿'); assert.equal(merged.project.title, '現在の公演表記'); assert.equal(merged.project.venue.name, '現在の会場'); assert.equal(merged.project.ticket.priceCategories[0].price, 4000); assert.deepEqual(merged.project.documents, current.project.documents);
  for (const id of Object.keys(current.project.modules).filter(id => id !== 'flyer')) assert.deepEqual(merged.project.modules[id], current.project.modules[id]);
  assert.ok(merged.project.calendarEvents.some(e => e.id === 'flyer-manual')); assert.ok(merged.project.calendarEvents.some(e => e.id === 'other-manual')); assert.equal(JSON.stringify(current), before);
});
test('PACK-02: other projects, other modules, unsupported versions and full documents cannot silently replace a module', async () => {
  const doc = await sample(), source = moduleBackup(doc, 'flyer'), packet = JSON.parse(source), different = structuredClone(doc); different.project.id = 'other-project';
  assert.throws(() => mergeModuleBackup(different, source, 'flyer'), /公演ID/); assert.throws(() => parseModuleBackup(source, 'tickets'), /別のモジュール/);
  assert.throws(() => parseModuleBackup(JSON.stringify(doc), 'flyer'), /専用JSON/); assert.throws(() => parseModuleBackup('{broken', 'flyer'), /JSON/);
  packet.formatVersion = 2; assert.throws(() => parseModuleBackup(JSON.stringify(packet), 'flyer'), /専用JSON/);
});
test('PACK-02: packet scope cannot smuggle other modules, assets or calendar events', async () => {
  const doc = await sample(), base = JSON.parse(moduleBackup(doc, 'flyer'));
  for (const change of [p => p.document.project.modules.tickets = doc.project.modules.tickets, p => p.document.project.documents.push({ extra: true }), p => p.document.project.calendarEvents.push(task(doc.project.id, 'project', 'foreign'))]) {
    const packet = structuredClone(base); change(packet); assert.throws(() => parseModuleBackup(JSON.stringify(packet), 'flyer'), /対象以外/);
  }
});
test('PACK-02: current master reference deletions and lower capacity reject merge without altering current data', async () => {
  const doc = await sample(), packet = moduleBackup(doc, 'tickets'), current = structuredClone(doc);
  current.project.performanceDates[0].capacity = 10; const before = JSON.stringify(current); assert.throws(() => mergeModuleBackup(current, packet, 'tickets'), /販売可能席数/); assert.equal(JSON.stringify(current), before);
  current.project.performanceDates.shift(); assert.throws(() => mergeModuleBackup(current, packet, 'tickets'), /参照先/);
});
test('PACK-01/03: absent modules do not produce fake defaults and legacy extensions round-trip as target data', () => {
  const doc = fixture(); assert.throws(() => moduleBackup(doc, 'flyer'), /未入力/); assert.throws(() => moduleBackup(doc, '__proto__'), /対応/);
  doc.project.modules.flyer = { id: 'flyer', status: 'on-hold', startDate: null, dueDate: null, progress: 0, alerts: [], data: { legacy: { retained: true } } };
  const source = moduleBackup(doc, 'flyer'), merged = mergeModuleBackup(doc, source, 'flyer').document; assert.deepEqual(merged.project.modules.flyer.data, doc.project.modules.flyer.data);
});
