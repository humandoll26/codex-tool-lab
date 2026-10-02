import { DEFINITIONS } from './modules.js';
import { isRecord } from './common.js';
import { parseDocument, prepareDocument, validateDocument } from './model.js';
import { parseBoundedJSON, assertJSONSize } from './json-limits.js';
const format = 'theater-production-os-module';
function ensureModule(id) {
  if (typeof id !== 'string' || !Object.hasOwn(DEFINITIONS, id)) throw new Error('対応するモジュールがありません。');
}
export function moduleBackup(document, id) {
  ensureModule(id);
  if (!Object.hasOwn(document.project.modules, id)) throw new Error('このモジュールは未入力です。先に入力を保存してください。');
  const copy = prepareDocument(document), module = copy.project.modules[id];
  copy.project.modules = { [id]: module };
  copy.project.documents = [];
  copy.project.calendarEvents = copy.project.calendarEvents.filter(e => isRecord(e) && e.moduleId === id);
  // The reduced document must still satisfy the shared master and reference contracts.
  parseDocument(JSON.stringify(copy));
  const packet = { format, formatVersion: 1, moduleId: id, document: copy };
  let output = JSON.stringify(packet, null, 2);
  try { assertJSONSize(output); } catch { output = JSON.stringify(packet); }
  parseBoundedJSON(output); return output;
}
export function parseModuleBackup(source, expectedId) {
  const packet = parseBoundedJSON(source);
  if (!isRecord(packet) || packet.format !== format || packet.formatVersion !== 1) throw new Error('モジュール専用JSONを選んでください。全公演JSONは「JSONを取り込む」を使ってください。');
  ensureModule(packet.moduleId);
  if (packet.moduleId !== expectedId) throw new Error('この画面とは別のモジュールのJSONです。対応する入口で取り込んでください。');
  const document = parseDocument(JSON.stringify(packet.document));
  const ids = Object.keys(document.project.modules);
  if (ids.length !== 1 || ids[0] !== packet.moduleId || document.project.documents.length || document.project.calendarEvents.some(e => !isRecord(e) || e.moduleId !== packet.moduleId)) throw new Error('対象以外のモジュール・資料・予定が含まれています。');
  return { ...packet, document };
}
export function mergeModuleBackup(current, source, expectedId) {
  const packet = parseModuleBackup(source, expectedId);
  if (current.project.id !== packet.document.project.id) throw new Error('公演IDが一致しません。先に同じ公演の全公演JSONを復元してください。');
  const merged = structuredClone(current);
  merged.project.modules[expectedId] = structuredClone(packet.document.project.modules[expectedId]);
  merged.project.calendarEvents = [...merged.project.calendarEvents.filter(e => !isRecord(e) || e.moduleId !== expectedId), ...structuredClone(packet.document.project.calendarEvents)];
  const issues = validateDocument(merged);
  if (issues.length) throw new Error('現在の公演情報との参照や入力を確認してください。\n' + issues.map(i => `${i.path}: ${i.message}`).join('\n'));
  return { document: merged, sourceTitle: packet.document.project.title };
}
