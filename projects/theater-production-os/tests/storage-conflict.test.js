import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocument, writeDocument, removeDocument, STORAGE_KEY } from '../shared/model.js';
import { fixture, memoryStorage } from './fixture.js';
test('SAVE-01: guarded writes succeed only against the saved baseline and expose the exact written raw value', () => {
  const storage = memoryStorage(); assert.equal(readDocument(storage).raw, null);
  const a = writeDocument(storage, fixture(), { expectedRaw: null }); assert.equal(a.ok, true); assert.equal(a.raw, storage.getItem(STORAGE_KEY)); assert.equal(readDocument(storage).raw, a.raw);
  const change = fixture(); change.project.companyName = '別タブ'; const b = writeDocument(storage, change, { expectedRaw: a.raw }); assert.equal(b.ok, true);
  const stale = fixture(); stale.project.venue.name = '未保存の稽古場'; const result = writeDocument(storage, stale, { expectedRaw: a.raw });
  assert.equal(result.ok, false); assert.equal(result.conflict, true); assert.equal(result.document.project.venue.name, '未保存の稽古場'); assert.equal(storage.getItem(STORAGE_KEY), b.raw); assert.equal(stale.project.venue.name, '未保存の稽古場');
});
test('SAVE-01: external deletion and a different project refuse stale saves and deletes', () => {
  const storage = memoryStorage(), first = writeDocument(storage, fixture()); storage.removeItem(STORAGE_KEY);
  assert.equal(writeDocument(storage, fixture(), { expectedRaw: first.raw }).conflict, true); assert.equal(storage.getItem(STORAGE_KEY), null);
  const next = fixture(); next.project.id = 'different-project'; const other = writeDocument(storage, next);
  assert.equal(removeDocument(storage, { expectedRaw: first.raw }).conflict, true); assert.equal(storage.getItem(STORAGE_KEY), other.raw);
  storage.setItem('other-tool', 'keep'); assert.equal(removeDocument(storage, { expectedRaw: other.raw }).ok, true); assert.equal(storage.getItem('other-tool'), 'keep');
});
test('SAVE-01/04: corrupted storage can be deleted against its exact baseline and unavailable reads do not cause writes', () => {
  const storage = memoryStorage(); storage.setItem(STORAGE_KEY, '{broken'); const loaded = readDocument(storage); assert.equal(loaded.kind, 'corrupt');
  assert.equal(removeDocument(storage, { expectedRaw: loaded.raw }).ok, true);
  let writes = 0; const denied = { getItem() { throw Error('denied'); }, setItem() { writes++; } };
  assert.equal(writeDocument(denied, fixture(), { expectedRaw: null }).ok, false); assert.equal(writes, 0);
});
test('SAVE-01: equal values and changes to other keys do not create a conflict', () => {
  const storage = memoryStorage(), first = writeDocument(storage, fixture()); storage.setItem(STORAGE_KEY, first.raw); storage.setItem('other-tool', 'changed');
  assert.equal(writeDocument(storage, first.document, { expectedRaw: first.raw }).ok, true);
});
