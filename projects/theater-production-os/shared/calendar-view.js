import { TEMPLATE, tokyoToday, generateTemplate, eventsFor, weekRange, agenda } from './schedule.js';
import { DEFINITIONS } from './modules.js';
import { newId } from './common.js';
import { calendarICS, calendarCSV } from './calendar-outputs.js';
export function eventList(ctx, events, empty = '予定はありません。') {
  const { el } = ctx;
  if (!events.length) return el('p', { className: 'hint' }, empty);
  return el('ul', { className: 'agenda-list' }, events.map(event => {
    const label = `${event.date}${event.time ? ` ${event.time}` : ''} · ${event.title} · ${event.status === 'completed' ? '完了' : event.status === 'cancelled' ? '中止' : event.status === 'on-hold' ? '保留' : '予定'}`;
    const target = event.moduleId === 'project' ? 'index.html' : Object.hasOwn(DEFINITIONS, event.moduleId) ? `modules/${event.moduleId}/index.html` : null;
    return el('li', {}, target ? ctx.projectLink(label, target, event.relatedItemId ? `#item-${encodeURIComponent(event.relatedItemId)}` : '') : el('span', {}, `${label}（未対応モジュール）`));
  }));
}
export function calendarOverview(ctx, state) {
  const { project, el, field, button, mutate, render, notify } = ctx;
  const today = tokyoToday(), all = eventsFor(project);
  const card = el('section', { className: 'card', 'aria-label': '制作カレンダー' }, el('h2', {}, '制作カレンダー'));
  const moduleSelect = el('select', { 'aria-label': '予定のモジュールフィルタ', onChange: e => { state.module = e.target.value; render(); } },
    el('option', { value: '' }, 'すべてのモジュール'), el('option', { value: 'project' }, '公演情報'),
    Object.entries(DEFINITIONS).map(([id, def]) => el('option', { value: id }, def.name)));
  moduleSelect.value = state.module;
  const scope = el('select', { 'aria-label': '予定の表示範囲', onChange: e => { state.scope = e.target.value; state.selectedDate = null; render(); } },
    [['month', '月間'], ['week', '今週'], ['today', '今日']].map(([value, label]) => el('option', { value }, label)));
  scope.value = state.scope;
  const month = el('input', { type: 'month', value: state.month, 'aria-label': '表示する月', onChange: e => { if (e.target.value) { state.month = e.target.value; state.selectedDate = null; render(); } } });
  card.append(el('div', { className: 'grid' }, el('label', { className: 'field' }, '表示する月', month), el('label', { className: 'field' }, '表示範囲', scope), el('label', { className: 'field' }, 'モジュール', moduleSelect)));
  const week = weekRange(today);
  const inRange = all.filter(e => (!state.module || e.moduleId === state.module) && (state.scope === 'today' ? e.date === today : state.scope === 'week' ? e.date >= week.start && e.date <= week.end : e.date.startsWith(state.month)));
  const selected = state.scope === 'month' && state.selectedDate ? inRange.filter(e => e.date === state.selectedDate) : inRange;
  card.append(el('p', { className: 'hint' }, `日本時間の今日：${today} · ${state.selectedDate ? state.selectedDate + 'の予定 · ' : ''}${selected.length}件`));
  card.append(el('div', { className: 'toolbar' },
    ctx.button('表示中の予定をICSで書き出す', () => ctx.exportSchedule(calendarICS, selected, 'production-calendar.ics', 'text/calendar')),
    ctx.button('表示中の予定をCSVで書き出す', () => ctx.exportSchedule(calendarCSV, selected, 'production-calendar.csv', 'text/csv'))),
    el('p', { className: 'hint' }, '表示条件に合う予定を書き出します（完了・中止も含む）。取り込み後の更新や重複の扱いはカレンダーアプリにより異なります。'));
  if (state.scope === 'month' && state.selectedDate) card.append(button('月全体の予定に戻す', () => { state.selectedDate = null; render(); }));
  if (state.scope === 'month') {
    const [year, monthNumber] = state.month.split('-').map(Number);
    const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const first = new Date(`${state.month}-01T00:00:00Z`).getUTCDay();
    const grid = el('div', { className: 'month-grid', 'aria-label': '月間予定' });
    for (const day of ['月', '火', '水', '木', '金', '土', '日']) grid.append(el('div', { className: 'weekday' }, day));
    for (let i = 0; i < (first + 6) % 7; i++) grid.append(el('div', { className: 'calendar-empty', 'aria-hidden': 'true' }));
    for (let day = 1; day <= count; day++) {
      const date = `${state.month}-${String(day).padStart(2, '0')}`;
      const dayEvents = inRange.filter(e => e.date === date);
      grid.append(el('div', { className: `calendar-day ${date === today ? 'today' : ''} ${date === state.selectedDate ? 'selected' : ''}` },
        el('button', { type: 'button', className: 'day-select', 'aria-label': `${date}の予定を表示`, 'aria-pressed': date === state.selectedDate ? 'true' : 'false', onClick: () => { state.selectedDate = date; render(); } }, String(day)),
        dayEvents.length ? el('span', { className: 'day-count' }, `${dayEvents.length}件`) : null,
        ...dayEvents.map(event => {
          const target = event.moduleId === 'project' ? 'index.html' : Object.hasOwn(DEFINITIONS, event.moduleId) ? `modules/${event.moduleId}/index.html` : null;
          return target ? ctx.projectLink(event.title, target, event.relatedItemId ? `#item-${encodeURIComponent(event.relatedItemId)}` : '') : el('span', {}, event.title);
        })));
    }
    card.append(grid);
  }
  card.append(eventList(ctx, selected));
  return card;
}

export function calendarView(ctx, state) {
  const { project, el, field, button, mutate, render, notify } = ctx;
  const today = tokyoToday();
  const card = calendarOverview(ctx, state);
  const manual = el('section', { className: 'card', 'aria-label': '手動予定' }, el('h2', {}, '追加した予定'));
  project.calendarEvents.forEach((event, i) => {
    if (!event || event.dataVersion !== 1) return;
    const path = `project.calendarEvents.${i}`;
    const row = el('div', { className: 'row', id: `item-${event.id}` });
    row.append(el('div', { className: 'grid' },
      field(`予定${i + 1}の名称`, `${path}.title`, event.title, v => event.title = v),
      field(`予定${i + 1}の日付`, `${path}.date`, event.date, v => event.date = v, { type: 'date' }),
      field(`予定${i + 1}のモジュール`, `${path}.moduleId`, event.moduleId, v => event.moduleId = v,
        { disabled: event.type === 'template', options: [{ value: 'project', label: '公演情報' }, ...Object.entries(DEFINITIONS).map(([value, d]) => ({ value, label: d.name }))] }),
      field(`予定${i + 1}の状態`, `${path}.status`, event.status, v => event.status = v,
        { options: [{ value: 'planned', label: '予定' }, { value: 'completed', label: '完了' }, { value: 'on-hold', label: '保留' }] })));
    row.append(button(`予定${i + 1}を削除`, () => mutate(() => project.calendarEvents.splice(i, 1)), 'danger'));
    manual.append(row);
  });
  manual.append(button('予定を追加', () => mutate(() => project.calendarEvents.push({ dataVersion: 1, id: newId('event'), projectId: project.id, moduleId: 'project', title: '', date: today, type: 'manual', status: 'planned', relatedItemId: null }))));
  const legacy = project.calendarEvents.filter(e => !e || e.dataVersion !== 1).length;
  if (legacy) manual.append(el('p', { className: 'hint' }, `旧形式の予定${legacy}件はJSONに保持しています。日付・公演ID・名称がそろうものだけ表示します。`));
  const template = el('section', { className: 'card' }, el('h2', {}, '本番から逆算する'),
    el('p', { className: 'hint' }, '最初のステージ日からの日数です。生成はボタンを押したときだけ行い、手動予定は保持します。'));
  if (agenda(project, today).changedTemplate) template.append(el('p', { className: 'notice warning' }, '公演日が逆算予定の生成時から変わっています。内容を確認して生成し直してください。'));
  for (const item of TEMPLATE) template.append(field(`${item.title}：本番何日前`, `project.productionTemplate.${item.id}`,
    project.productionTemplate?.[item.id] ?? item.days, value => {
      project.productionTemplate ??= Object.fromEntries(TEMPLATE.map(t => [t.id, t.days]));
      project.productionTemplate[item.id] = value;
    }, { type: 'number' }));
  template.append(button('逆算予定を生成・更新', () => {
    let next;
    try { next = generateTemplate(project); } catch (error) { notify(error.message, 'error'); return; }
    if (project.calendarEvents.some(e => e?.dataVersion === 1 && e.type === 'template') && !confirm('既存の逆算予定の日付を更新しますか？手動予定、完了・保留状態、編集した名称は保持します。')) return;
    mutate(() => project.calendarEvents = next);
  }));
  return [card, manual, template];
}
