import { DEFINITIONS } from './modules.js';
import { validateDocument } from './model.js';
import { parseBoundedJSON, assertJSONSize } from './json-limits.js';

export const SHARE_OPTIONS = Object.freeze([
  { key: 'title', label: '公演名', selected: true },
  { key: 'progress', label: 'モジュールの進行状況', selected: true },
  { key: 'company', label: '劇団名', selected: false },
  { key: 'venue', label: '会場名', selected: false },
  { key: 'stages', label: '公演日時・席数', selected: false },
  { key: 'prices', label: '料金区分・料金', selected: false },
  { key: 'data', label: '作業データ（原稿・メモ・金額など）', selected: false }
]);
export const defaultShareOptions = () => Object.fromEntries(SHARE_OPTIONS.map(o => [o.key, o.selected]));
// Each shape is a positive list. No arbitrary extension object is ever cloned.
const pick = (source, keys) => Object.fromEntries(keys.split(' ').filter(k => Object.hasOwn(source, k)).map(k => [k, source[k]]));
const rows = (source, keys) => source.map(row => pick(row, keys));
const schemas = {
  funding: ['version', 'items', 'id name kind organization status amount received receivedDate paymentDue applicationDue reportDue reportStatus reportDate adSlot materialDue materialStatus materialDate notes'],
  contracts: ['version', 'items', 'id name role status amount invoiceStatus invoiceDate paymentDue paymentStatus paidDate notes'],
  budget: ['variableCostPerAttendee referencePriceCategoryId', 'fixedCosts', 'id name amount'],
  flyer: ['version introduction contactText officialUrl printDate deliveryDate', 'items', 'id name text status'],
  distribution: ['version printed', 'items', 'id name assignee method date planned shipped status'],
  publicity: ['version', 'items', 'id title channel date text materials status'],
  tickets: ['version', 'sales', 'stageId priceCategoryId quantity'],
  rehearsal: ['version', 'items', 'id name date startTime endTime venue participants attendance staff notes message status'],
  submissions: ['version', 'items', 'id name recipient category assignee dueDate status submittedDate notes'],
  'front-desk': ['version changeFund guidance', 'items', 'id name category assignee date needed ready status notes'],
  settlement: ['version', 'items', 'id name kind category amount settled date notes'],
  program: ['version printDate', 'items', 'id name category assignee date text status'],
  'stage-operations': ['version', 'items', 'id name date startTime endTime department place people assignee notes status'],
  venue: ['version', 'items', 'id name date status holdUntil fee paid paymentDue loadIn loadOut contact notes'],
  rights: ['version workName author runningMinutes scriptNotes staff', 'items', 'id name contact date status confirmedDate evidence'],
  'show-day': ['version', 'items', 'id name date time category assignee status quantity price notes'],
  archive: ['version attendance socialResults reflection handover', 'items', 'id name category status dueDate location keeper recordedDate notes']
};
export const supportsShareData = (id, module) => id === 'budget' || module?.data?.version === 1;
function projectData(id, data) {
  const [fields, collection, rowFields] = schemas[id];
  const copy = pick(data, fields); copy[collection] = rows(data[collection], rowFields);
  if (id === 'budget') copy.plannedSales = rows(data.plannedSales, 'stageId priceCategoryId quantity');
  if (id === 'rehearsal') copy.items.forEach((row, i) => { row.history = rows(data.items[i].history, 'date startTime endTime venue recordedAt'); });
  if (id === 'archive') copy.snapshot = data.snapshot === null ? null : pick(data.snapshot, 'capturedAt report');
  return copy;
}
export function sharedModule(document, id, selection = defaultShareOptions()) {
  if (!Object.hasOwn(schemas, id) || !Object.hasOwn(DEFINITIONS, id)) throw new Error('対応するモジュールがありません。');
  const issues = validateDocument(document);
  if (issues.length) throw new Error('入力エラーを修正してから共有用資料を作成してください。');
  if (!Object.hasOwn(document.project.modules, id)) throw new Error('このモジュールは未入力です。先に入力を保存してください。');
  const options = defaultShareOptions();
  for (const [key, value] of Object.entries(selection)) {
    if (!Object.hasOwn(options, key) || typeof value !== 'boolean') throw new Error('共有する項目の選択が不正です。');
    options[key] = value;
  }
  const p = document.project, m = p.modules[id], project = {}, module = { id, name: DEFINITIONS[id].name };
  if (options.title) project.title = p.title;
  if (options.company) project.companyName = p.companyName;
  if (options.venue) project.venue = { name: p.venue.name };
  if (options.stages) { project.timeZone = p.timeZone; project.performanceDates = rows(p.performanceDates, 'id startsAt capacity'); }
  if (options.prices) project.ticket = { priceCategories: rows(p.ticket.priceCategories, 'id name price') };
  if (options.progress) Object.assign(module, pick(m, 'status startDate dueDate progress'));
  if (options.data) {
    if (!supportsShareData(id, m)) throw new Error('旧形式の作業データは共有用資料に含められません。');
    module.data = projectData(id, m.data);
  }
  const packet = { format: 'theater-production-os-share', formatVersion: 1, project, module };
  let source = JSON.stringify(packet, null, 2);
  try { assertJSONSize(source); } catch { source = JSON.stringify(packet); }
  parseBoundedJSON(source); return source;
}
