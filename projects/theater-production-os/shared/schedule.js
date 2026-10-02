import { validDate, isRecord, newId, checker } from './common.js';
import { DEFINITIONS } from './modules.js';
export const TEMPLATE = [
  { id: 'budget-start', moduleId: 'budget', title: '予算・料金を検討', days: 100 },
  { id: 'flyer-start', moduleId: 'flyer', title: 'チラシ掲載情報を準備', days: 75 },
  { id: 'flyer-print', moduleId: 'flyer', title: 'チラシ入稿', days: 50 },
  { id: 'publicity-start', moduleId: 'publicity', title: '公演告知を開始', days: 45 },
  { id: 'tickets-start', moduleId: 'tickets', title: 'チケット販売進捗を確認', days: 40 },
  { id: 'distribution-start', moduleId: 'distribution', title: 'チラシ配布を確認', days: 30 }
];
export function tokyoToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key).value).join('-');
}
export function addDays(date, days) {
  if (!validDate(date) || !Number.isSafeInteger(days)) throw new Error('日付または日数が不正です。');
  const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days);
  const result = value.toISOString().slice(0, 10);
  if (!validDate(result)) throw new Error('予定日が対応範囲を超えています。');
  return result;
}
export const firstDay = p => p.performanceDates.length ? [...p.performanceDates].map(s => s.startsAt.slice(0, 10)).sort()[0] : null;
export const dayDifference = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
export function weekRange(today) {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const start = addDays(today, -(day + 6) % 7); return { start, end: addDays(start, 6) };
}
export function validateSchedule(project) {
  const c = checker('project');
  const events = Array.isArray(project.calendarEvents) ? project.calendarEvents : [];
  const ids = new Set(), templateIds = new Set();
  events.forEach((event, i) => {
    if (!isRecord(event) || event.dataVersion !== 1) return;
    const p = `calendarEvents.${i}`;
    if (typeof event.id !== 'string' || !event.id.trim() || ids.has(event.id)) c.error(`${p}.id`, '予定IDが空、または重複しています。');
    ids.add(event.id);
    if (event.projectId !== project.id) c.error(`${p}.projectId`, '予定の公演IDが一致しません。');
    if (!['project', ...Object.keys(DEFINITIONS)].includes(event.moduleId)) c.error(`${p}.moduleId`, '対応するモジュールを選んでください。');
    c.text(event.title, `${p}.title`, true);
    if (!validDate(event.date)) c.error(`${p}.date`, '正しい予定日を入力してください。');
    c.choice(event.status, `${p}.status`, ['planned', 'completed', 'on-hold']);
    c.choice(event.type, `${p}.type`, ['manual', 'template']);
    if (event.relatedItemId !== null && typeof event.relatedItemId !== 'string') c.error(`${p}.relatedItemId`, '関連IDが不正です。');
    else if (event.relatedItemId !== null) {
      const rows = event.moduleId === 'project' || event.moduleId === 'tickets' ? project.performanceDates : event.moduleId === 'budget' ? project.modules?.budget?.data?.fixedCosts : project.modules?.[event.moduleId]?.data?.items;
      if (!Array.isArray(rows) || !rows.some(row => row?.id === event.relatedItemId)) c.error(`${p}.relatedItemId`, '関連する作業がありません。');
    }
    if (event.type === 'template' && (!TEMPLATE.some(t => t.id === event.templateId && t.moduleId === event.moduleId) || !validDate(event.baseDate))) c.error(p, '逆算予定の基準が不正です。');
    if (event.type === 'template') { if (templateIds.has(event.templateId)) c.error(p, '同じ逆算予定が重複しています。'); templateIds.add(event.templateId); }
  });
  if (project.productionTemplate !== undefined) {
    if (!isRecord(project.productionTemplate)) c.error('productionTemplate', 'テンプレート設定が不正です。');
    else for (const task of TEMPLATE) {
      const days = project.productionTemplate[task.id];
      if (!Number.isSafeInteger(days) || days < 0 || days > 3650) c.error(`productionTemplate.${task.id}`, '本番前0〜3650日の整数を入力してください。');
    }
  }
  return c.issues;
}
export function generateTemplate(project) {
  const base = firstDay(project);
  if (!validDate(base)) throw new Error('先に公演のステージ日時を入力してください。');
  const issues = validateSchedule(project); if (issues.length) throw new Error(issues.map(i => i.message).join(' '));
  const settings = project.productionTemplate ?? Object.fromEntries(TEMPLATE.map(t => [t.id, t.days]));
  const existing = new Map(project.calendarEvents.filter(e => isRecord(e) && e.dataVersion === 1 && e.type === 'template').map(e => [e.templateId, e]));
  const generated = TEMPLATE.map(task => {
    const old = existing.get(task.id);
    return { ...old, dataVersion: 1, id: old?.id ?? newId('event'), projectId: project.id, moduleId: task.moduleId,
      title: old?.title ?? task.title, date: addDays(base, -settings[task.id]), type: 'template',
      status: old?.status ?? 'planned', relatedItemId: old?.relatedItemId ?? null, templateId: task.id, baseDate: base };
  });
  return [...project.calendarEvents.filter(e => !isRecord(e) || e.dataVersion !== 1 || e.type !== 'template'), ...generated];
}
export function eventsFor(project) {
  const events = [];
  const add = event => { if (validDate(event.date)) events.push(event); };
  for (const s of project.performanceDates) add({ id: `stage-${s.id}`, moduleId: 'project', title: `本番：${project.title}`, date: s.startsAt.slice(0, 10), status: 'planned', relatedItemId: s.id, type: 'performance', time: s.startsAt.slice(11, 16) });
  for (const [id, def] of Object.entries(DEFINITIONS)) {
    const m = project.modules[id]; if (!m) continue;
    const status = ['completed', 'not-needed'].includes(m.status) ? 'completed' : m.status === 'on-hold' ? 'on-hold' : 'planned';
    for (const [key, label] of [['startDate', '開始'], ['dueDate', '期限']]) if (m[key]) add({ id: `${id}-${key}`, moduleId: id, title: `${def.name}：${label}`, date: m[key], status, relatedItemId: null, type: key });
    const data = m.data; if (data?.version !== 1) continue;
    if (def.events) for (const event of def.events(project, data)) add({ ...event, id: `${id}-${event.relatedItemId ?? 'global'}`, moduleId: id, type: 'task', status: ['completed', 'cancelled'].includes(event.status) ? event.status : status });
    if (id === 'flyer') for (const [key, title] of [['printDate', 'チラシ入稿'], ['deliveryDate', 'チラシ納品']]) if (data[key]) add({ id: `${id}-${key}`, moduleId: id, title, date: data[key], status, relatedItemId: null, type: 'task' });
    if (['distribution', 'publicity'].includes(id)) for (const row of data.items) if (row.date) add({ id: `${id}-${row.id}`, moduleId: id,
      title: id === 'distribution' ? `配布：${row.name}` : `投稿：${row.title}`, date: row.date,
      status: (id === 'distribution' ? row.shipped >= row.planned && row.planned > 0 : row.status === 'published') ? 'completed' : status,
      relatedItemId: row.id, type: 'task' });
    if (id === 'rehearsal') for (const row of data.items) add({ id: `${id}-${row.id}`, moduleId: id, title: `稽古：${row.name}`, date: row.date, time: row.startTime,
      status: row.status === 'cancelled' ? 'cancelled' : row.status === 'completed' ? 'completed' : status, relatedItemId: row.id, type: 'task' });
    if (id === 'submissions') for (const row of data.items) add({ id: `${id}-${row.id}`, moduleId: id, title: `提出：${row.name}`, date: row.dueDate,
      status: row.status === 'submitted' ? 'completed' : status, relatedItemId: row.id, type: 'task' });
  }
  project.calendarEvents.forEach((e, i) => {
    if (isRecord(e) && e.projectId === project.id && typeof e.title === 'string' && typeof e.moduleId === 'string' && validDate(e.date)) add({ ...e, id: e.id ?? `legacy-${i}`, legacy: e.dataVersion !== 1 });
  });
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title));
}
export function agenda(project, today = tokyoToday()) {
  const events = eventsFor(project), week = weekRange(today);
  const pending = events.filter(e => !['completed', 'cancelled'].includes(e.status) && !['completed', 'not-needed'].includes(project.modules[e.moduleId]?.status));
  return { events, today: events.filter(e => e.date === today), week: events.filter(e => e.date >= week.start && e.date <= week.end),
    overdue: pending.filter(e => e.date < today && e.type !== 'performance'),
    soon: Object.keys(DEFINITIONS).filter(id => {
      const m = project.modules[id]; return m && m.status === 'not-started' && m.startDate && m.startDate >= today && m.startDate <= addDays(today, 7);
    }), changedTemplate: project.calendarEvents.some(e => isRecord(e) && e.type === 'template' && e.dataVersion === 1 && e.baseDate !== firstDay(project)) };
}
