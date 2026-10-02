import { agenda, tokyoToday, firstDay, dayDifference } from './schedule.js';
import { DEFINITIONS } from './modules.js';
import { eventList } from './calendar-view.js';
export function dashboardView(ctx, state = { query: '', status: 'active' }) {
  const { project, el, projectLink } = ctx;
  const today = tokyoToday(), a = agenda(project, today), first = firstDay(project);
  const days = first ? dayDifference(first, today) : null;
  const card = el('section', { className: 'card', 'aria-label': '制作ダッシュボード' }, el('h2', {}, project.title),
    el('p', {}, days === null ? 'ステージ日時を入力すると、本番までの日数を表示します。' : days > 0 ? `本番まであと${days}日` : days === 0 ? '本日が最初の本番日です。' : `最初の本番日から${-days}日経過`),
    el('p', { className: 'hint' }, `日本時間の今日：${today}`));
  const modules = el('div', { className: 'module-cards' });
  const count = el('p', { className: 'hint', role: 'status' });
  const redrawModules = () => {
    modules.replaceChildren();
    const query = state.query.trim().toLocaleLowerCase('ja-JP');
    let shown = 0;
    for (const [id, def] of Object.entries(DEFINITIONS)) {
      const m = project.modules[id], status = m?.status ?? 'not-started';
      if (query && !`${id} ${def.name} ${def.description}`.toLocaleLowerCase('ja-JP').includes(query)) continue;
      if (state.status === 'active' && ['completed', 'not-needed'].includes(status)) continue;
      if (!['all', 'active'].includes(state.status) && status !== state.status) continue;
      shown++;
      const labels = { 'not-started': '未着手', 'in-progress': '進行中', completed: '完了', 'on-hold': '保留', 'not-needed': '不要' };
      const node = el('div', { className: 'module-card' }, el('h3', {}, def.name), el('p', { className: `badge ${status}` }, labels[status]),
        el('p', { className: 'hint' }, def.description), projectLink(`${def.name}を開く`, `modules/${id}/index.html`));
      if (m?.dueDate) node.append(el('p', { className: 'hint' }, `期限：${m.dueDate}`));
      if (id !== 'budget' && m?.data?.version === 1) for (const [label, value] of def.metrics(project, m.data)) node.append(el('p', { className: 'hint' }, `${label}：${value}`));
      modules.append(node);
    }
    count.textContent = `${shown}件表示 / ${Object.keys(DEFINITIONS).length}モジュール`;
    if (!shown) modules.append(el('p', { className: 'hint' }, '条件に合うモジュールはありません。'));
  };
  const search = el('input', { type: 'search', value: state.query, 'aria-label': 'モジュールを検索', onInput: event => { state.query = event.target.value; redrawModules(); } });
  const statusFilter = el('select', { 'aria-label': 'モジュールの表示状態', onChange: event => { state.status = event.target.value; redrawModules(); } },
    [['active', '未完了'], ['all', 'すべて'], ['not-started', '未着手'], ['in-progress', '進行中'], ['completed', '完了'], ['on-hold', '保留'], ['not-needed', '不要']].map(([value, label]) => el('option', { value }, label)));
  statusFilter.value = state.status;
  const moduleCard = el('section', { className: 'card', 'aria-label': '制作モジュールの一覧' }, el('h2', {}, '制作モジュール'),
    el('div', { className: 'grid' }, el('label', { className: 'field' }, 'モジュールを検索', search), el('label', { className: 'field' }, '表示状態', statusFilter)), count, modules);
  redrawModules();
  const group = (title, events, empty) => el('section', { className: 'card' }, el('h2', {}, title), eventList(ctx, events, empty));
  const soon = el('section', { className: 'card' }, el('h2', {}, 'そろそろ開始'), a.soon.length ?
    el('div', { className: 'toolbar' }, a.soon.map(id => projectLink(DEFINITIONS[id].name, `modules/${id}/index.html`))) : el('p', { className: 'hint' }, '今後7日以内に開始予定の未着手モジュールはありません。'));
  const list = [card, group('期限超過', a.overdue, '期限を過ぎた未完了の予定はありません。'), group('今日の予定', a.today), group('今週の予定', a.week), soon, moduleCard];
  if (a.changedTemplate) list.unshift(el('p', { className: 'notice warning' }, '公演日が変わっています。カレンダーで逆算予定を確認・更新してください。'));
  return list;
}
