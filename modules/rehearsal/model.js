import { checker, validDate, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, items: [] });
export const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validate(data, base) {
  const c = checker(base);
  c.rows(data.items, 'items').forEach((r, i) => {
    if (!r) return;
    const p = `items.${i}`;
    for (const key of ['name', 'venue', 'participants', 'attendance', 'staff', 'notes', 'message']) c.text(r[key], `${p}.${key}`, key === 'name');
    if (!validDate(r.date)) c.error(`${p}.date`, '正しい稽古日を入力してください。');
    for (const key of ['startTime', 'endTime']) if (!validTime(r[key])) c.error(`${p}.${key}`, '時刻はHH:mmで入力してください。');
    if (validTime(r.startTime) && validTime(r.endTime) && r.endTime <= r.startTime) c.error(`${p}.endTime`, '終了時刻は同日の開始時刻より後にしてください。');
    c.choice(r.status, `${p}.status`, ['planned', 'completed', 'cancelled']);
    if (!Array.isArray(r.history)) { c.error(`${p}.history`, '変更履歴は配列が必要です。'); return; }
    r.history.forEach((h, n) => {
      const path = `${p}.history.${n}`;
      if (!h || typeof h !== 'object' || Array.isArray(h)) { c.error(path, '変更履歴が不正です。'); return; }
      if (!validDate(h.date) || !validTime(h.startTime) || !validTime(h.endTime) || h.endTime <= h.startTime) c.error(path, '変更履歴の日時が不正です。');
      c.text(h.venue, `${path}.venue`);
      if (typeof h.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(h.recordedAt) || !Number.isFinite(Date.parse(h.recordedAt)) || new Date(h.recordedAt).toISOString() !== h.recordedAt) c.error(`${path}.recordedAt`, '記録日時が不正です。');
    });
  });
  return c.issues;
}
export function recordSchedule(row, now = new Date()) {
  const issues = validate({ items: [row] }, 'rehearsal');
  if (issues.length) throw new Error('稽古の入力エラーを修正してから記録してください。');
  const snapshot = { date: row.date, startTime: row.startTime, endTime: row.endTime, venue: row.venue };
  const last = row.history.at(-1);
  if (last && Object.entries(snapshot).every(([key, value]) => last[key] === value)) return false;
  row.history.push({ ...snapshot, recordedAt: now.toISOString() });
  return true;
}
export function announcement(project, data) {
  const labels = { planned: '予定', completed: '完了', cancelled: '中止' };
  return [project.title, ...data.items.map(r => [
    `${r.name}（${labels[r.status]}）`, `${r.date} ${r.startTime}〜${r.endTime}（日本時間）`,
    `稽古場：${r.venue || '未定'}`, r.participants && `参加役割：${r.participants}`, r.attendance && `欠席・遅刻：${r.attendance}`,
    r.staff && `必要スタッフ：${r.staff}`, r.notes && `稽古内容：${r.notes}`, r.message && `連絡事項：${r.message}`
  ].filter(Boolean).join('\n'))].join('\n\n');
}
export const exportCSV = (project, data) => csv([['稽古名', '日付', '開始（日本時間）', '終了', '稽古場', '参加役割', '欠席・遅刻', '必要スタッフ', '内容', '連絡事項', '状態'], ...data.items.map(r => [r.name, r.date, r.startTime, r.endTime, r.venue, r.participants, r.attendance, r.staff, r.notes, r.message, r.status])]);
export const metrics = (project, data) => [['稽古', `${data.items.length}件`], ['予定', `${data.items.filter(r => r.status === 'planned').length}件`], ['完了', `${data.items.filter(r => r.status === 'completed').length}件`], ['中止', `${data.items.filter(r => r.status === 'cancelled').length}件`]];
