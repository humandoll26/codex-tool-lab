import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSON_LIMITS, inspectJSON, assertJSONSize, parseBoundedJSON, readJSONFile } from '../shared/json-limits.js';
import { parseDocument, validateDocument, readDocument, writeDocument, STORAGE_KEY } from '../shared/model.js';
import { moduleBackup, parseModuleBackup } from '../shared/module-backup.js';
import { fixture, memoryStorage } from './fixture.js';
import { defaults as stageDefaults, warnings, metrics } from '../modules/stage-operations/model.js';

test('LIMIT-01: exact UTF-8 size is accepted and one additional byte is rejected', () => {
  assertJSONSize('a'.repeat(JSON_LIMITS.bytes));
  assert.throws(() => assertJSONSize('a'.repeat(JSON_LIMITS.bytes + 1)), /2MiB/);
  const japanese = 'あ'.repeat(Math.floor(JSON_LIMITS.bytes / 3));
  assertJSONSize(japanese + 'aa'); assert.throws(() => assertJSONSize(japanese + 'あ'), /2MiB/);
  assert.throws(() => parseBoundedJSON('a'.repeat(JSON_LIMITS.bytes + 1)), /2MiB/);
});
test('LIMIT-01: bounded iterative traversal rejects depth, cycles and unsupported values', () => {
  let value = null;
  for (let i = 0; i < JSON_LIMITS.depth; i++) value = { a: value };
  assert.deepEqual(inspectJSON(value), []); assert.match(inspectJSON({ a: value })[0].message, /深さ/);
  const cyclic = {}; cyclic.child = cyclic;
  assert.match(inspectJSON(cyclic)[0].message, /循環/);
  for (const value of [Infinity, NaN, undefined, 1n, () => {}, new Date()]) assert.ok(inspectJSON({ value }).length);
  const child = { value: '保管' }; assert.deepEqual(inspectJSON({ a: child, b: child }), []);
  assert.throws(() => parseBoundedJSON('{"a":'.repeat(12000) + 'null' + '}'.repeat(12000)), /深さ/);
});
test('LIMIT-01: arrays and total values have independent exact boundaries', () => {
  assert.deepEqual(inspectJSON(Array(JSON_LIMITS.arrayItems).fill(null)), []);
  assert.match(inspectJSON(Array(JSON_LIMITS.arrayItems + 1).fill(null))[0].message, /1,000/);
  const wide = Object.fromEntries(Array.from({ length: JSON_LIMITS.values - 1 }, (_, i) => [`key${i}`, null]));
  assert.deepEqual(inspectJSON(wide), []); wide.extra = null; assert.match(inspectJSON(wide)[0].message, /50,000/);
});
test('LIMIT-01/02: oversized files are refused before text is read, with a second size check', async () => {
  await assert.rejects(readJSONFile({ size: JSON_LIMITS.bytes + 1, text: () => assert.fail('must not read') }), /2MiB/);
  await assert.rejects(readJSONFile({ size: 0, text: async () => 'あ'.repeat(JSON_LIMITS.bytes) }), /2MiB/);
  assert.equal(await readJSONFile({ size: 2, text: async () => '{}' }), '{}');
});
test('LIMIT-01/03: rejected stored/input data stays intact and normal extensions survive', () => {
  const d = fixture(); d.project.extension = { note: '未知拡張を保持' };
  assert.deepEqual(parseDocument(JSON.stringify(d)).project.extension, d.project.extension);
  const storage = memoryStorage(); writeDocument(storage, d); const raw = storage.getItem(STORAGE_KEY);
  d.project.extension = 'あ'.repeat(JSON_LIMITS.bytes);
  assert.ok(validateDocument(d).length); assert.throws(() => writeDocument(storage, d), /2MiB/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  const oversized = JSON.stringify(d); storage.setItem(STORAGE_KEY, oversized);
  assert.equal(readDocument(storage).kind, 'corrupt'); assert.equal(readDocument(storage).raw, oversized);
  assert.equal(storage.getItem(STORAGE_KEY), oversized);
});
test('LIMIT-02: module packets enforce bounds on the envelope as well as the document', () => {
  const packet = JSON.parse(moduleBackup(fixture(), 'budget'));
  packet.extra = Array(JSON_LIMITS.arrayItems + 1).fill(null);
  assert.throws(() => parseModuleBackup(JSON.stringify(packet), 'budget'), /1,000/);
  packet.extra = 'a'.repeat(JSON_LIMITS.bytes); assert.throws(() => parseModuleBackup(JSON.stringify(packet), 'budget'), /2MiB/);
});
test('LIMIT-02: near-capacity module backup stays importable using compact JSON', () => {
  const d = fixture(); d.project.extension = '';
  const overhead = Buffer.byteLength(JSON.stringify(JSON.parse(moduleBackup(d, 'budget'))));
  d.project.extension = 'x'.repeat(JSON_LIMITS.bytes - overhead - 32);
  const output = moduleBackup(d, 'budget'); assert.ok(Buffer.byteLength(output) <= JSON_LIMITS.bytes);
  assert.equal(output.startsWith('{"format"'), true);
  assert.equal(parseModuleBackup(output, 'budget').document.project.extension, d.project.extension);
});
test('LIMIT-03: excessive stage-price matrices are rejected while the exact boundary works', () => {
  const d = fixture(); delete d.project.modules.budget;
  d.project.performanceDates = Array.from({ length: 40 }, (_, i) => ({ id: `s-${i}`, startsAt: '2026-11-30T14:00+09:00', capacity: 100 }));
  d.project.ticket.priceCategories = Array.from({ length: 50 }, (_, i) => ({ id: `p-${i}`, name: '一般', price: 100 }));
  assert.deepEqual(validateDocument(d), []);
  d.project.ticket.priceCategories.push({ id: 'extra', name: '追加', price: 0 });
  assert.throws(() => parseDocument(JSON.stringify(d)), /2,000/);
});
test('LIMIT-03: many overlapping stage tasks cap output without changing their input', () => {
  const d = stageDefaults(); d.items = Array.from({ length: 1000 }, (_, i) => ({ id: `t-${i}`, name: '舞台作業', date: '2026-10-02', startTime: '09:00', endTime: '10:00', department: '舞台', place: '舞台', people: 1, assignee: '', notes: '', status: 'planned' }));
  const before = JSON.stringify(d); assert.equal(warnings(fixture().project, d).length, 100);
  assert.equal(metrics(fixture().project, d)[2][1], '100件以上'); assert.equal(JSON.stringify(d), before);
});
