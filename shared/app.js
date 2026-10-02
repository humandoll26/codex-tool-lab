import { editor as archiveEditor } from '../modules/archive/editor.js';
import { editor as venueEditor } from '../modules/venue/editor.js';
import { editor as rightsEditor } from '../modules/rights/editor.js';
import { editor as show_dayEditor } from '../modules/show-day/editor.js';
import { editor as front_deskEditor } from '../modules/front-desk/editor.js';
import { editor as settlementEditor } from '../modules/settlement/editor.js';
import { editor as programEditor } from '../modules/program/editor.js';
import { editor as stage_operationsEditor } from '../modules/stage-operations/editor.js';
import { createBudgetEditor } from '../modules/budget/editor.js';
import { report as budgetReport } from '../modules/budget/outputs.js';
import { editor as flyerEditor } from '../modules/flyer/editor.js';
import { editor as distributionEditor } from '../modules/distribution/editor.js';
import { editor as publicityEditor } from '../modules/publicity/editor.js';
import { editor as ticketsEditor } from '../modules/tickets/editor.js';
import { editor as rehearsalEditor } from '../modules/rehearsal/editor.js';
import { editor as submissionsEditor } from '../modules/submissions/editor.js';
import { DEFINITIONS } from './modules.js';
import { calendarView, calendarOverview } from './calendar-view.js';
import { dashboardView } from './dashboard-view.js';
import { tokyoToday } from './schedule.js';
import { moduleBackup, mergeModuleBackup } from './module-backup.js';
import { newDocument, newId, emptyBudget, STATUSES, STATUS_LABELS, validateDocument,
  calculateBudget, parseDocument, prepareDocument, readDocument, writeDocument, removeDocument, STORAGE_KEY } from './model.js';

const root = document.querySelector('#main');
const isBudget = document.body.dataset.view === 'budget';
const view = document.body.dataset.view;
const isModule = Boolean(DEFINITIONS[view]);
const editors = { archive: archiveEditor, flyer: flyerEditor, distribution: distributionEditor, publicity: publicityEditor, tickets: ticketsEditor, rehearsal: rehearsalEditor, submissions: submissionsEditor, 'front-desk': front_deskEditor, 'settlement': settlementEditor, 'program': programEditor, 'stage-operations': stage_operationsEditor, 'venue': venueEditor, 'rights': rightsEditor, 'show-day': show_dayEditor };
const storage = { getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) };
const loaded = readDocument(storage);
let expectedRaw = loaded.raw;
let storageBlocked = loaded.kind === 'unavailable';
let storageConflict = false;
let conflictOutput;
let draft = loaded.document ? structuredClone(loaded.document) : newDocument();
let corrupt = loaded.kind === 'corrupt';
let saveMessage = loaded.kind === 'saved' ? '保存済みの公演を読み込みました。' :
  loaded.kind === 'unavailable' ? loaded.error : '公演タイトルとステージ日時を入力して始めてください。';
let messageType = loaded.kind === 'unavailable' ? 'warning' : '';
let touched = false;
let notice, errorSummary, results, exportButton, navigation, backupButton;
let fields = new Map();
let scheduleOutput;
let repairOutput;
let repairIds = new Set();
const dashboardState = { query: '', status: 'active' };
const calendarState = { month: tokyoToday().slice(0, 7), module: '', scope: 'month' };
const yen = value => `${value.toLocaleString('ja-JP')}円`;
const people = value => `${value.toLocaleString('ja-JP')}人`;
const paths = { budget: 'project.modules.budget.data', stages: 'project.performanceDates', prices: 'project.ticket.priceCategories' };

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
function button(label, action, className = 'secondary') { return el('button', { type: 'button', className, onClick: action }, label); }
function field(label, path, value, change, options = {}) {
  const controlId = `field-${path.replaceAll('.', '-')}`;
  const control = options.options ? el('select', { id: controlId }) : options.type === 'textarea' ? el('textarea', { id: controlId, rows: '4' }) : el('input', { id: controlId,
    type: options.type ?? 'text', ...(options.type === 'number' ? { min: '0', step: '1', inputmode: 'numeric' } : {}) });
  if (options.options) {
    if (!options.options.some(o => o.value === value)) control.append(el('option', { value: value ?? '' }, '選択してください'));
    for (const option of options.options) control.append(el('option', { value: option.value }, option.label));
  }
  control.value = value ?? '';
  control.disabled = Boolean(options.disabled);
  const error = el('span', { id: `${controlId}-error`, className: 'field-error' });
  control.setAttribute('aria-labelledby', `${controlId}-label`);
  control.setAttribute('aria-describedby', error.id);
  control.addEventListener(options.options ? 'change' : 'input', () => {
    let next = control.value;
    if (options.type === 'number') next = next === '' ? '' : Number(next);
    change(next);
    update();
    if (options.rebuild) render();
  });
  fields.set(path, { control, error });
  return el('label', { className: 'field', for: controlId }, el('span', { id: `${controlId}-label` }, label), control, error);
}
function mutate(action) { action(); update(); render(); }
function getBudget() { return draft.project.modules.budget ?? emptyBudget(draft.project.ticket.priceCategories[0]?.id ?? ''); }
function editBudget(action) {
  draft.project.modules.budget ??= emptyBudget(draft.project.ticket.priceCategories[0]?.id ?? '');
  action(draft.project.modules.budget);
}
function linkToMaster() { return isModule ? '../../index.html' : './index.html'; }
function moduleValue(id) {
  return draft.project.modules[id] ?? { id, status: 'not-started', startDate: null, dueDate: null, progress: 0, alerts: [], data: DEFINITIONS[id].defaults() };
}
function editModule(id, action) {
  draft.project.modules[id] ??= moduleValue(id);
  action(draft.project.modules[id]);
}
function notify(message, type = '') { saveMessage = message; messageType = type; if (notice) { notice.textContent = message; notice.className = `notice ${type}`; } }
const storageOptions = () => expectedRaw === undefined ? {} : { expectedRaw };
function updateConflictNotice() {
  if (!conflictOutput) return;
  conflictOutput.replaceChildren(); conflictOutput.hidden = !storageConflict;
  if (storageConflict) conflictOutput.append(el('p', {}, '他のタブなどで保存内容が変わっています。この画面の編集は保持し、自動保存と画面間の移動を止めています。必要なら「JSONを書き出す」で退避してください。'),
    button('保存データを読み直す', () => {
      if (!confirm('この画面の未保存入力を破棄し、保存データを読み直しますか？必要なら先にJSONを書き出してください。')) return;
      const url = new URL(location.href); url.searchParams.delete('projectId'); history.replaceState(null, '', url); location.reload();
    }));
}
function savedResult(result) {
  if (result.ok) { expectedRaw = result.raw; storageBlocked = false; storageConflict = false; }
  else { storageBlocked = true; if (result.conflict) storageConflict = true; }
  updateConflictNotice();
}
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    if (event.storageArea !== window.localStorage || storage.getItem(STORAGE_KEY) === expectedRaw) return;
    storageConflict = true; storageBlocked = true;
    updateConflictNotice(); notify('別のタブなどで保存データが変わりました。この画面の編集は保持しています。', 'warning');
  } catch { storageBlocked = true; notify('保存データを読み取れません。画面内の内容をJSONへ書き出してください。', 'warning'); }
});

function download(source, name, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([source], { type: `${mime};charset=utf-8` }));
  const anchor = el('a', { href: url, download: name });
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function textPreview(source, title) {
  const preview = el('pre', { className: 'text-preview' }, source);
  const copy = button('原稿をコピー', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(source);
      notify('原稿をコピーしました。');
    } catch {
      if (preview.isConnected) {
        const range = document.createRange(); range.selectNodeContents(preview);
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      }
      notify('自動コピーを利用できません。プレビューの文字を選択し、ブラウザのコピー操作を使ってください。');
    }
  });
  return el('div', {}, el('h3', {}, title), copy, preview);
}
function exportJSON() {
  try { download(JSON.stringify(prepareDocument(draft), null, 2), `theater-production-${draft.project.id}.json`); }
  catch { notify('入力エラーを修正してからJSONを書き出してください。', 'error'); }
}
function exportModuleJSON() {
  if (corrupt) return;
  try { download(moduleBackup(draft, view), `theater-production-${view}.json`); }
  catch (error) { notify(`モジュールを書き出せませんでした。${error.message}`, 'error'); }
}
async function importModuleJSON(file) {
  if (!file || !isModule || corrupt) return;
  let next;
  try { next = mergeModuleBackup(draft, await file.text(), view); }
  catch (error) { notify(`モジュールを取り込めませんでした。現在のデータは変更していません。\n${error.message}`, 'error'); return; }
  if (!confirm(`「${next.sourceTitle}」の${DEFINITIONS[view].name}を取り込み、このモジュールの入力と手動・逆算予定を置き換えますか？公演情報・他のモジュールは保持し、現在の料金と席数で集計します。`)) return;
  const result = writeDocument(storage, next.document, storageOptions()); savedResult(result);
  if (result.conflict) { notify(result.error, 'warning'); return; }
  draft = result.document; touched = true;
  notify(result.ok ? 'このモジュールのJSONを取り込み、保存しました。' : result.error, result.ok ? '' : 'warning'); render();
}
async function importJSON(file) {
  if (!file) return;
  let next;
  try { next = parseDocument(await file.text()); }
  catch (error) { notify(`取込みできませんでした。現在のデータは変更していません。\n${error.message}`, 'error'); return; }
  if (!window.confirm(`「${next.project.title}」を取り込み、現在の公演を置き換えますか？`)) return;
  const result = writeDocument(storage, next, storageOptions());
  savedResult(result);
  if (result.conflict) { notify(result.error, 'warning'); return; }
  draft = result.document; corrupt = false; touched = true;
  const url = new URL(location.href); url.searchParams.delete('projectId'); history.replaceState(null, '', url);
  notify(result.ok ? 'JSONを取り込み、保存しました。' : result.error, result.ok ? '' : 'warning');
  render();
}
async function loadSample() {
  try {
    const response = await fetch(new URL('../samples/demo.json', import.meta.url));
    if (!response.ok) throw new Error('サンプルファイルを取得できませんでした。');
    await importJSON(await response.blob());
  } catch (error) { notify(error.message, 'error'); }
}
function reset() {
  if (!window.confirm('このOSの公演データを全消去しますか？元に戻せません。必要なら先にJSONを書き出してください。')) return;
  const result = removeDocument(storage, storageOptions());
  if (!result.ok) { savedResult(result); notify(result.error, result.conflict ? 'warning' : 'error'); return; }
  expectedRaw = null; storageBlocked = false; storageConflict = false;
  draft = newDocument(); corrupt = false; touched = false;
  const url = new URL(location.href); url.searchParams.delete('projectId'); history.replaceState(null, '', url);
  notify('このOSの保存データを消去しました。新しい公演を入力できます。'); render();
}
function update(persist = true) {
  const issues = validateDocument(draft);
  ensureRepairs(issues);
  if (persist) touched = true;
  for (const [path, item] of fields) {
    const matching = touched ? issues.filter(i => i.path === path) : [];
    item.error.textContent = matching.map(i => i.message).join(' ');
    item.control.setAttribute('aria-invalid', matching.length ? 'true' : 'false');
  }
  const referenceControl = fields.get(`${paths.budget}.referencePriceCategoryId`)?.control;
  if (referenceControl) for (const option of referenceControl.options) {
    const price = draft.project.ticket.priceCategories.find(p => p.id === option.value);
    if (price) option.textContent = `${price.name} · ${typeof price.price === 'number' ? yen(price.price) : '料金未入力'}`;
  }
  errorSummary.replaceChildren();
  if (issues.length && touched) {
    errorSummary.append(el('strong', {}, '入力を確認してください。現在の入力は保存・計算に使いません。'));
    const list = el('ul', { className: 'errors' });
    for (const issue of issues) {
      const item = fields.get(issue.path);
      if (item) {
        const anchor = el('a', { href: `#${item.control.id}` }, `${item.control.labels[0]?.firstChild.textContent}: ${issue.message}`);
        anchor.addEventListener('click', event => {
          event.preventDefault();
          for (let parent = item.control.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
          item.control.focus();
        });
        list.append(el('li', {}, anchor));
      } else list.append(el('li', {}, `${issue.path}: ${issue.message}`));
    }
    errorSummary.append(list);
  }
  errorSummary.hidden = !issues.length || !touched;
  exportButton.disabled = issues.length > 0 || corrupt;
  if (navigation) {
    navigation.setAttribute('aria-disabled', issues.length ? 'true' : 'false');
    navigation.href = `${isModule || view !== 'master' ? linkToMaster() : 'modules/budget/index.html'}?projectId=${encodeURIComponent(draft.project.id)}`;
  }
  showResults(issues);
  if (scheduleOutput && persist) {
    if (view === 'calendar') {
      const first = scheduleOutput.firstElementChild;
      const next = issues.length ? el('div', { className: 'notice warning' }, '入力エラーを修正すると予定を表示します。') : calendarOverview(scheduleContext(), calendarState);
      first?.replaceWith(next);
    } else refreshSchedule(issues);
  }
  if (persist) {
    if (issues.length) notify('未保存の入力があります。エラーを修正すると自動保存します。最後に保存できた公演は保持しています。', 'warning');
    else if (storageConflict) notify('他のタブなどで保存データが変わっています。画面内の内容をJSONへ退避し、保存データを読み直してください。', 'warning');
    else if (!corrupt) {
      const result = writeDocument(storage, draft, storageOptions());
      savedResult(result);
      draft.project.updatedAt = result.document.project.updatedAt;
      notify(result.ok ? '自動保存しました。' : result.error, result.ok ? '' : 'warning');
    }
  }
}
function showResults(issues) {
  if (!results) return;
  results.replaceChildren();
  if (issues.length) { results.append(el('p', { className: 'empty' }, '入力がそろうと試算結果が表示されます。エラーのある値では計算しません。')); return; }
  if (isModule && !isBudget) {
    const data = moduleValue(view).data, def = DEFINITIONS[view];
    if (data.version !== 1) { results.append(el('p', {}, 'このモジュールの旧形式はJSONで保持しています。')); return; }
    const summary = el('div', { className: 'summary' });
    for (const [label, value] of def.metrics(draft.project, data)) summary.append(el('div', { className: 'stat' }, el('span', {}, label), el('strong', {}, value)));
    results.append(summary);
    if (def.warnings) for (const text of def.warnings(draft.project, data)) results.append(el('p', { className: 'notice warning' }, text));
    if (def.stageTotals) for (const stage of def.stageTotals(draft.project, data)) results.append(el('p', {}, `ステージ${stage.index}：実績${stage.count}枚 / 残席${stage.remaining}席 / 参考売上${yen(stage.revenue)}`));
    if (view === 'flyer') results.append(textPreview(def.publicationText(draft.project, data), '掲載情報プレビュー'));
    else if (def.previewText) results.append(textPreview(def.previewText(draft.project, data), '出力プレビュー'));
    return;
  }
  if (!draft.project.modules.budget) { results.append(el('p', {}, '予算の入力を開始してください。')); return; }
  const r = calculateBudget(draft.project);
  const summary = el('div', { className: 'summary', 'data-testid': 'results' });
  for (const [label, value, negative] of [
    ['想定来場者数', people(r.attendees)], ['売上', yen(r.revenue)], ['費用', yen(r.expenses)],
    ['収支', yen(r.profit), r.profit < 0], ['販売率', r.salesRate === null ? '—' : `${r.salesRate.toFixed(1)}%`],
    ['基準料金での損益分岐', r.breakEven === null ? '黒字化できない' : people(r.breakEven)]]) {
    summary.append(el('div', { className: `stat ${negative ? 'negative' : ''}` }, el('span', {}, label), el('strong', {}, value)));
  }
  results.append(summary);
  if (r.breakEven === null) results.append(el('p', { className: 'notice warning' }, 'この基準料金では黒字化できない'));
  if (r.exceedsCapacity) results.append(el('p', { className: 'notice warning' }, '損益分岐人数が収容可能人数を超える'));
  if (isBudget) results.append(textPreview(budgetReport(draft.project), '予算プレビュー'));
}
function masterEditor() {
  const p = draft.project;
  const card = el('section', { className: 'card', 'aria-label': '公演情報' }, el('h2', {}, '公演情報'));
  card.append(el('div', { className: 'grid' },
    field('公演タイトル（必須）', 'project.title', p.title, v => p.title = v),
    field('劇団名', 'project.companyName', p.companyName, v => p.companyName = v),
    field('劇場名', 'project.venue.name', p.venue.name, v => p.venue.name = v)));
  card.append(el('h3', {}, 'ステージ'), el('p', { className: 'hint' }, '日時は日本時間。販売可能席数を入力してください。'));
  p.performanceDates.forEach((stage, i) => {
    const row = el('div', { className: 'row', id: `item-${stage.id}` });
    row.append(el('div', { className: 'row-fields' },
      field(`ステージ${i + 1}の日時`, `${paths.stages}.${i}.startsAt`, stage.startsAt.slice(0, 16), v => stage.startsAt = v ? `${v}:00+09:00` : '', { type: 'datetime-local' }),
      field(`ステージ${i + 1}の販売可能席数`, `${paths.stages}.${i}.capacity`, stage.capacity, v => stage.capacity = v, { type: 'number' })));
    row.append(button(`ステージ${i + 1}を削除`, () => mutate(() => p.performanceDates.splice(i, 1)), 'danger'));
    card.append(row);
  });
  card.append(button('ステージを追加', () => mutate(() => p.performanceDates.push({ id: newId('stage'), startsAt: '', capacity: 0 }))));
  card.append(el('h3', {}, '料金区分'));
  p.ticket.priceCategories.forEach((price, i) => {
    const row = el('div', { className: 'row' });
    row.append(el('div', { className: 'row-fields' },
      field(`料金区分${i + 1}の名称`, `${paths.prices}.${i}.name`, price.name, v => price.name = v),
      field(`料金区分${i + 1}の料金（円）`, `${paths.prices}.${i}.price`, price.price, v => price.price = v, { type: 'number' })));
    row.append(button(`料金区分${i + 1}を削除`, () => mutate(() => p.ticket.priceCategories.splice(i, 1)), 'danger'));
    card.append(row);
  });
  card.append(button('料金区分を追加', () => mutate(() => p.ticket.priceCategories.push({ id: newId('price'), name: '', price: 0 }))));
  card.append(el('p', { className: 'hint' }, 'ステージや料金を削除しても、予算の販売枚数は自動で削除しません。参照エラーが出たら予算側で該当行を削除・修正してください。'));
  return card;
}
function budgetEditor() {
  return createBudgetEditor({ document: draft, el, field, button, mutate, getBudget,
    editBudget, paths, yen, fields, update, exportData: (producer, filename, mime) => {
      if (!draft.project.modules.budget) { notify('予算の入力を開始してから書き出してください。'); return; }
      if (validateDocument(draft).length) { update(); notify('入力エラーを修正してから書き出してください。', 'error'); return; }
      download(producer(draft.project), filename, mime);
    } });
}

function extraEditor(id) {
  const def = DEFINITIONS[id], module = moduleValue(id);
  if (module.data.version !== 1) return el('section', { className: 'card' }, el('h2', {}, `${def.name}の既存データ`),
    el('p', {}, '既存データはこの画面の編集形式と異なります。JSON書出しで保管してから、必要な場合だけ形式を切り替えてください。'),
    button('このモジュールの編集形式に切り替える', () => {
      if (confirm('このモジュールの既存データだけを置き換えます。先にJSONを書き出しましたか？')) mutate(() => editModule(id, m => m.data = def.defaults()));
    }, 'danger'));
  const exportData = (producer, filename, mime) => {
    if (validateDocument(draft).length) { update(); notify('入力エラーを修正してから書き出してください。', 'error'); return; }
    download(producer(draft.project, moduleValue(id).data), filename, mime);
  };
  return editors[id]({ id, def, project: draft.project, data: module.data, getData: () => moduleValue(id).data,
    el, field, button, mutate, fields, update, notify, exportData, edit: action => editModule(id, m => action(m.data)) });
}
function metadata(id) {
  const m = id === 'budget' ? getBudget() : moduleValue(id), name = DEFINITIONS[id].name;
  const card = el('section', { className: 'card' }, el('h2', {}, `${name}の進行`));
  if (id !== 'budget') card.append(field(`${name}の状態`, `project.modules.${id}.status`, m.status,
    v => editModule(id, m => m.status = v), { options: STATUSES.map((value, i) => ({ value, label: STATUS_LABELS[i] })) }));
  const change = action => id === 'budget' ? editBudget(action) : editModule(id, action);
  card.append(el('div', { className: 'grid' },
    field(`${name}の開始日`, `project.modules.${id}.startDate`, m.startDate, v => change(m => m.startDate = v || null), { type: 'date' }),
    field(`${name}の期限`, `project.modules.${id}.dueDate`, m.dueDate, v => change(m => m.dueDate = v || null), { type: 'date' }),
    field(`${name}の進捗（%）`, `project.modules.${id}.progress`, m.progress, v => change(m => m.progress = v), { type: 'number' })));
  return card;
}
function guardNavigation(event) {
  if (validateDocument(draft).length) { event.preventDefault(); update(); notify('移動前に入力エラーを修正してください。未保存の値を失わないよう、この画面で修正できます。', 'warning'); return false; }
  if (storageBlocked || storageConflict) { event.preventDefault(); notify('ブラウザに保存できていないため、別画面へデータを引き継げません。この画面で編集し、JSONを書き出してください。', 'warning'); return false; }
  return true;
}
function modulePicker() {
  const select = el('select', { 'aria-label': '作業モジュール', onChange: event => {
    const id = event.target.value;
    if (!Object.hasOwn(DEFINITIONS, id)) return;
    if (!guardNavigation(event)) { event.target.value = isModule ? view : ''; return; }
    location.assign(`${isModule ? '../../' : './'}modules/${id}/index.html?projectId=${encodeURIComponent(draft.project.id)}`);
  } }, el('option', { value: '' }, '作業を選択してください'), Object.entries(DEFINITIONS).map(([id, def]) => el('option', { value: id }, def.name)));
  select.value = isModule ? view : '';
  return el('label', { className: 'field' }, el('span', {}, '作業モジュール'), select);
}
function ensureRepairs(issues) {
  if (!repairOutput) return;
  for (const id of Object.keys(DEFINITIONS)) {
    if (id === view || (id === 'budget' && !isModule) || repairIds.has(id) || !issues.some(i => i.path.startsWith(`project.modules.${id}.`))) continue;
    const details = el('details', { open: '', 'data-repair-module': id }, el('summary', {}, `${DEFINITIONS[id].name}の入力・参照エラーを修正する`), metadata(id), id === 'budget' ? budgetEditor() : extraEditor(id));
    repairIds.add(id);
    repairOutput.append(details);
  }
}
function projectLink(label, path, hash = '') {
  return el('a', { className: 'button secondary', href: `${isModule ? '../../' : './'}${path}?projectId=${encodeURIComponent(draft.project.id)}${hash}`, onClick: guardNavigation }, label);
}
function scheduleContext() {
  const exportSchedule = (producer, events, filename, mime) => {
    if (validateDocument(draft).length || corrupt) { update(); notify('入力エラーを修正してから書き出してください。', 'error'); return; }
    if (!events.length) { notify('表示中の予定がありません。表示月やフィルタを変更してください。'); return; }
    try { download(producer(draft.project, events), filename, mime); }
    catch (error) { notify(`カレンダーを書き出せませんでした。${error.message}`, 'error'); }
  };
  return { project: draft.project, el, field, button, mutate, render, notify, projectLink, exportSchedule };
}
function refreshSchedule(issues) {
  scheduleOutput.replaceChildren();
  if (view === 'calendar') {
    scheduleOutput.append(...calendarView(scheduleContext(), calendarState));
    if (issues.length) scheduleOutput.firstElementChild.replaceWith(el('p', { className: 'notice warning' }, '入力エラーを修正すると予定を表示します。'));
  } else if (issues.length) scheduleOutput.append(el('p', { className: 'notice warning' }, '入力エラーを修正すると予定を表示します。'));
  else scheduleOutput.append(...dashboardView(scheduleContext(), dashboardState));
}

function render() {
  fields = new Map(); navigation = null; results = null; scheduleOutput = null;
  repairOutput = null; repairIds = new Set();
  root.replaceChildren();
  notice = el('div', { className: `notice ${messageType}`, role: 'status', 'aria-live': 'polite', style: 'white-space:pre-wrap' }, saveMessage);
  root.append(notice);
  conflictOutput = el('section', { className: 'notice warning', 'aria-label': '保存データの競合' });
  root.append(conflictOutput); updateConflictNotice();
  const requestedId = new URL(location.href).searchParams.get('projectId');
  if (requestedId !== null && requestedId !== draft.project.id) {
    root.append(el('section', { className: 'card' }, el('h2', {}, '公演が見つかりません'),
      el('p', {}, '指定された公演IDは、このブラウザの保存データと一致しません。現在のデータは変更していません。'),
      el('a', { href: linkToMaster(), className: 'button' }, '公演の作成・編集へ戻る')));
    return;
  }
  exportButton = button('JSONを書き出す', exportJSON);
  const input = el('input', { type: 'file', 'data-import': 'project', accept: '.json,application/json', hidden: '' });
  input.addEventListener('change', () => { const file = input.files[0]; input.value = ''; importJSON(file); });
  const toolbar = el('div', { className: 'toolbar' }, exportButton, button('JSONを取り込む', () => input.click()), button('サンプル公演を試す', loadSample),
    button('全データを消去', reset, 'danger'), input);
  root.append(toolbar);
  if (isModule && !corrupt) {
    const moduleInput = el('input', { type: 'file', 'data-import': 'module', accept: '.json,application/json', hidden: '' });
    moduleInput.addEventListener('change', () => { const file = moduleInput.files[0]; moduleInput.value = ''; importModuleJSON(file); });
    root.append(el('div', { className: 'toolbar' }, button('このモジュールのJSONを書き出す', exportModuleJSON), button('このモジュールのJSONを取り込む', () => moduleInput.click()), moduleInput),
      el('p', { className: 'hint' }, 'モジュール専用JSONは同じ公演IDで使います。共通公演情報も含むため、共有前に内容を確認してください。全体のバックアップは「JSONを書き出す」を使ってください。'));
  }
  if (corrupt) {
    exportButton.disabled = true;
    backupButton = button('破損データをそのまま書き出す', () => download(loaded.raw, 'theater-production-recovery.json'));
    root.append(el('section', { className: 'card' }, el('h2', {}, '保存データを読み込めません'),
      el('p', {}, '破損した保存データは上書きしていません。元データを書き出して保管し、正常なJSONを取り込むか、確認のうえ全消去してください。'),
      el('p', { className: 'hint' }, loaded.error), backupButton));
    return;
  }
  errorSummary = el('div', { className: 'notice error', role: 'alert', 'data-testid': 'validation-errors' });
  root.append(errorSummary);
  navigation = el('a', { className: 'button', onClick: guardNavigation }, isModule || view !== 'master' ? '公演情報へ戻る' : '予算モジュールを開く');
  root.append(el('div', { className: 'heading' }, el('p', { className: 'hint' }, '1公演 · 日本時間 · 自動保存'), navigation));
  root.append(el('nav', { className: 'toolbar', 'aria-label': '制作ナビゲーション' }, projectLink('ダッシュボード', 'dashboard.html'), projectLink('カレンダー', 'calendar.html')));
  root.append(modulePicker());
  if (view === 'calendar' || view === 'dashboard') {
    scheduleOutput = el('div', { 'data-testid': 'schedule' }); root.append(scheduleOutput);
    refreshSchedule(validateDocument(draft));
  }
  if (isModule) {
    const details = el('details', {}, el('summary', {}, '公演情報を作成・編集する'), masterEditor());
    details.open = loaded.kind !== 'saved' || validateDocument(draft).some(i => i.path.startsWith(paths.stages) || i.path.startsWith(paths.prices) || i.path === 'project.title');
    root.append(details, metadata(view), isBudget ? budgetEditor() : extraEditor(view));
  } else {
    const master = masterEditor();
    if (view === 'master') root.append(master);
    else root.append(el('details', {}, el('summary', {}, '公演情報を作成・編集する'), master));
    root.append(el('details', {}, el('summary', {}, '予算の参照エラー・入力を修正する'), budgetEditor()));
  }
  results = el('div', { 'aria-live': 'polite', 'aria-atomic': 'true' });
  root.append(el('section', { className: 'card', 'aria-label': '試算結果' }, el('h2', {}, isModule && !isBudget ? '作業のまとめ' : '公演予算の試算'), results));
  repairOutput = el('div', { 'data-testid': 'module-repairs' });
  root.append(repairOutput);
  if (view !== 'calendar' && validateDocument(draft).some(i => i.path.startsWith('project.calendarEvents.'))) {
    const recovery = el('details', { open: '' }, el('summary', {}, '関連先が変わった予定を修正する'), ...calendarView(scheduleContext(), calendarState));
    root.append(recovery);
  }
  root.append(el('section', { className: 'card' }, el('h2', {}, '制作モジュール'),
    el('div', { className: 'toolbar' }, Object.entries(DEFINITIONS).map(([id, def]) => projectLink(def.name, `modules/${id}/index.html`)))));
  if (!isModule) {
    const modules = [['契約・支払い', '契約と支払の確認']];
    root.append(el('section', { className: 'card' }, el('h2', {}, 'これからのモジュール'),
      el('p', { className: 'hint' }, '15の制作モジュールを利用できます。以下は将来予定です。'),
      el('ul', { className: 'module-list' }, modules.map(([name, description]) => el('li', {}, el('strong', {}, name), el('p', { className: 'hint' }, `${description} · 将来予定`))))));
  }
  update(false);
  if (location.hash.startsWith('#item-')) {
    let hash;
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { hash = ''; }
    const item = document.getElementById(hash);
    if (item) { for (let parent = item.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; item.scrollIntoView(); }
  }
}
window.addEventListener('beforeunload', event => {
  if (touched && (validateDocument(draft).length || messageType === 'warning')) { event.preventDefault(); event.returnValue = ''; }
});
render();
