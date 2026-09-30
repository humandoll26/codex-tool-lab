import { calculateBudget } from '../modules/budget/calculator.js';
export { calculateBudget } from '../modules/budget/calculator.js';

export const STORAGE_KEY = 'codex-tool-lab:theater-production-os:v1';
export const STATUSES = ['not-started', 'in-progress', 'completed', 'on-hold', 'not-needed'];
export const STATUS_LABELS = ['未着手', '進行中', '完了', '保留', '不要'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.trim().length > 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
export const newId = prefix => `${prefix}-${crypto.randomUUID()}`;

export function emptyBudget(referencePriceCategoryId = '') {
  return { id: 'budget', status: 'not-started', startDate: null, dueDate: null,
    progress: 0, alerts: [], data: { fixedCosts: [], variableCostPerAttendee: 0,
      plannedSales: [], referencePriceCategoryId } };
}

export function newDocument() {
  const priceId = newId('price');
  return { schemaVersion: 1, project: { id: newId('project'), title: '', companyName: '',
    timeZone: 'Asia/Tokyo', venue: { name: '' }, performanceDates: [
      { id: newId('stage'), startsAt: '', capacity: 0 }],
    ticket: { priceCategories: [{ id: priceId, name: '一般', price: 0 }] },
    modules: { budget: emptyBudget(priceId) }, calendarEvents: [], documents: [],
    updatedAt: new Date().toISOString() } };
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validStageDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\+09:00$/.test(value)) return false;
  if (!validDate(value.slice(0, 10))) return false;
  return Number(value.slice(11, 13)) <= 23 && Number(value.slice(14, 16)) <= 59 &&
    (value[16] !== ':' || Number(value.slice(17, 19)) <= 59);
}


export function validateDocument(document) {
  const issues = [];
  const issue = (path, message) => issues.push({ path, message });
  const text = (value, path, required = false) => {
    if (typeof value !== 'string' || (required && !value.trim())) issue(path, required ? '入力してください。' : '文字列で入力してください。');
  };
  const number = (value, path) => { if (!integer(value)) issue(path, '0以上の安全な整数を入力してください。'); };
  const array = (value, path) => {
    if (!Array.isArray(value)) { issue(path, '配列が必要です。'); return []; }
    return value;
  };
  const uniqueRows = (rows, path) => {
    const seen = new Set();
    rows.forEach((row, i) => {
      if (!record(row)) { issue(`${path}.${i}`, 'オブジェクトが必要です。'); return; }
      if (!id(row.id) || seen.has(row.id)) issue(`${path}.${i}.id`, 'IDが空、または重複しています。');
      seen.add(row.id);
    });
  };
  if (!record(document)) return [{ path: '', message: 'JSONオブジェクトが必要です。' }];
  const checkJSON = (value, path) => {
    if (typeof value === 'number' && !Number.isFinite(value)) issue(path, 'JSONの数値が有限値ではありません。');
    else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) checkJSON(child, path ? `${path}.${key}` : key);
    }
  };
  checkJSON(document, '');
  if (document.schemaVersion !== 1) issue('schemaVersion', '対応していないデータ版です。schemaVersionは1が必要です。');
  const p = document.project;
  if (!record(p)) return [...issues, { path: 'project', message: '公演オブジェクトが必要です。' }];
  if (!id(p.id)) issue('project.id', '公演IDが必要です。');
  text(p.title, 'project.title', true);
  text(p.companyName, 'project.companyName');
  if (p.timeZone !== 'Asia/Tokyo') issue('project.timeZone', 'タイムゾーンはAsia/Tokyoが必要です。');
  if (!record(p.venue)) issue('project.venue', '劇場オブジェクトが必要です。');
  else text(p.venue.name, 'project.venue.name');
  const stages = array(p.performanceDates, 'project.performanceDates');
  uniqueRows(stages, 'project.performanceDates');
  stages.forEach((s, i) => {
    if (!record(s)) return;
    if (!validStageDate(s.startsAt)) issue(`project.performanceDates.${i}.startsAt`, '日本時間の正しい日時を入力してください。');
    number(s.capacity, `project.performanceDates.${i}.capacity`);
  });
  if (!record(p.ticket)) issue('project.ticket', 'チケットオブジェクトが必要です。');
  const prices = array(p.ticket?.priceCategories, 'project.ticket.priceCategories');
  uniqueRows(prices, 'project.ticket.priceCategories');
  prices.forEach((c, i) => {
    if (!record(c)) return;
    text(c.name, `project.ticket.priceCategories.${i}.name`, true);
    number(c.price, `project.ticket.priceCategories.${i}.price`);
  });
  array(p.calendarEvents, 'project.calendarEvents');
  array(p.documents, 'project.documents');
  if (typeof p.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(p.updatedAt) || !validDate(p.updatedAt.slice(0, 10)) || !Number.isFinite(Date.parse(p.updatedAt))) {
    issue('project.updatedAt', '更新日時が不正です。');
  }
  if (!record(p.modules)) issue('project.modules', 'モジュールオブジェクトが必要です。');
  else for (const [moduleId, m] of Object.entries(p.modules)) {
    const path = `project.modules.${moduleId}`;
    if (!id(moduleId) || !record(m)) { issue(path, 'モジュールの構造が不正です。'); continue; }
    if (m.id !== moduleId) issue(`${path}.id`, 'モジュールIDとキーが一致しません。');
    if (!STATUSES.includes(m.status)) issue(`${path}.status`, 'モジュール状態が不正です。');
    for (const name of ['startDate', 'dueDate']) {
      if (m[name] !== null && !validDate(m[name])) issue(`${path}.${name}`, '日付はYYYY-MM-DDまたはnullにしてください。');
    }
    if (typeof m.progress !== 'number' || !Number.isFinite(m.progress) || m.progress < 0 || m.progress > 100) issue(`${path}.progress`, '進捗は0〜100の数値です。');
    array(m.alerts, `${path}.alerts`);
    if (!record(m.data)) issue(`${path}.data`, 'モジュールデータはオブジェクトが必要です。');
  }
  const budget = p.modules?.budget;
  if (record(budget) && record(budget.data)) {
    const b = budget.data, base = 'project.modules.budget.data';
    const costs = array(b.fixedCosts, `${base}.fixedCosts`);
    uniqueRows(costs, `${base}.fixedCosts`);
    costs.forEach((c, i) => {
      if (!record(c)) return;
      text(c.name, `${base}.fixedCosts.${i}.name`, true);
      number(c.amount, `${base}.fixedCosts.${i}.amount`);
    });
    number(b.variableCostPerAttendee, `${base}.variableCostPerAttendee`);
    const stageMap = new Map(stages.filter(record).map(s => [s.id, s]));
    const priceIds = new Set(prices.filter(record).map(c => c.id));
    if (!id(b.referencePriceCategoryId) || !priceIds.has(b.referencePriceCategoryId)) issue(`${base}.referencePriceCategoryId`, '存在する基準料金を選んでください。');
    const sales = array(b.plannedSales, `${base}.plannedSales`);
    const pairs = new Set(), totals = new Map();
    sales.forEach((s, i) => {
      const path = `${base}.plannedSales.${i}`;
      if (!record(s)) { issue(path, '販売枚数の構造が不正です。'); return; }
      if (!id(s.stageId) || !stageMap.has(s.stageId)) issue(`${path}.stageId`, '参照先のステージがありません。');
      if (!id(s.priceCategoryId) || !priceIds.has(s.priceCategoryId)) issue(`${path}.priceCategoryId`, '参照先の料金区分がありません。');
      const pair = JSON.stringify([s.stageId, s.priceCategoryId]);
      if (pairs.has(pair)) issue(path, 'ステージ・料金区分の組み合わせが重複しています。');
      pairs.add(pair);
      number(s.quantity, `${path}.quantity`);
      if (integer(s.quantity)) totals.set(s.stageId, (totals.get(s.stageId) ?? 0n) + BigInt(s.quantity));
    });
    for (const [stageId, total] of totals) {
      const stage = stageMap.get(stageId);
      if (stage && integer(stage.capacity) && total > BigInt(stage.capacity)) {
        issue(`project.performanceDates.${stages.indexOf(stage)}.capacity`, '想定販売枚数が販売可能席数を超えています。');
        sales.forEach((s, i) => { if (s?.stageId === stageId) issue(`${base}.plannedSales.${i}.quantity`, 'このステージの想定販売枚数合計が席数を超えています。'); });
      }
    }
    if (!issues.length) {
      try { calculateBudget(p); } catch (error) { issue(base, error.message); }
    }
  }
  return issues;
}

export function parseDocument(source) {
  let document;
  try { document = JSON.parse(source); } catch { throw new Error('JSONの形式が不正です。'); }
  const issues = validateDocument(document);
  if (issues.length) throw new Error(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
  return document;
}

export function prepareDocument(document) {
  const sourceIssues = validateDocument(document);
  if (sourceIssues.length) throw new Error(sourceIssues.map(i => `${i.path}: ${i.message}`).join('\n'));
  const copy = structuredClone(document);
  copy.project.title = copy.project.title.trim();
  copy.project.updatedAt = new Date().toISOString();
  const issues = validateDocument(copy);
  if (issues.length) throw new Error(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
  return copy;
}

export function readDocument(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { kind: 'empty' };
    try { return { kind: 'saved', document: parseDocument(raw) }; }
    catch (error) { return { kind: 'corrupt', error: error.message, raw }; }
  } catch { return { kind: 'unavailable', error: 'このブラウザでは保存データを読み取れません。JSONで書き出して保管してください。' }; }
}

export function writeDocument(storage, document) {
  const copy = prepareDocument(document);
  try { storage.setItem(STORAGE_KEY, JSON.stringify(copy)); return { ok: true, document: copy }; }
  catch { return { ok: false, document: copy, error: '保存できませんでした。画面のデータは維持しています。JSONを書き出して保管してください。' }; }
}

export function removeDocument(storage) {
  try { storage.removeItem(STORAGE_KEY); return { ok: true }; }
  catch { return { ok: false, error: '保存データを消去できませんでした。ブラウザの保存設定を確認してください。' }; }
}
