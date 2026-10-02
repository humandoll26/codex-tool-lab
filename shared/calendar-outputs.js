import { csv, validDate, validTime } from './common.js';
import { DEFINITIONS } from './modules.js';

const labels = { planned: '予定', completed: '完了', cancelled: '中止', 'on-hold': '保留' };
const moduleName = id => id === 'project' ? '公演情報' : DEFINITIONS[id]?.name ?? id;
const text = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
const encoder = new TextEncoder();
function fold(line) {
  let result = '', current = '', bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { result += current + '\r\n'; current = ' '; bytes = 1; }
    current += char; bytes += size;
  }
  return result + current;
}
function utc(date, time) {
  if (!validDate(date) || !validTime(time)) throw new Error('予定の日付または時刻が不正です。');
  const result = new Date(`${date}T${time}:00+09:00`).toISOString().replaceAll('-', '').replaceAll(':', '').replace('.000', '');
  if (!/^\d{8}T\d{6}Z$/.test(result)) throw new Error('カレンダー出力の日付範囲を超えています。');
  return result;
}
export function calendarICS(project, events, now = new Date()) {
  const stamp = now.toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Theater Production OS//Calendar 0.7//JA', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${text(project.title)}`];
  const seen = new Set();
  for (const event of events) {
    if (!validDate(event.date)) throw new Error('予定の日付が不正です。');
    const uid = encodeURIComponent(JSON.stringify([project.id, event.moduleId, event.type, event.id])) + '@theater-production-os.local';
    if (seen.has(uid)) throw new Error('予定IDが重複しています。元の予定を確認してください。');
    seen.add(uid);
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`);
    if (event.time) {
      lines.push(`DTSTART:${utc(event.date, event.time)}`);
      if (event.endTime) {
        if (!validTime(event.endTime) || event.endTime <= event.time) throw new Error('予定の終了時刻を確認してください。');
        lines.push(`DTEND:${utc(event.date, event.endTime)}`);
      }
    } else lines.push(`DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`);
    lines.push(`SUMMARY:${text(event.title)}`,
      `DESCRIPTION:${text(`${project.title}\n${moduleName(event.moduleId)}\n状態：${labels[event.status] ?? '予定'}\n${event.time ? '時刻は日本時間の入力から変換' : '終日の予定'}`)}`,
      `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : event.status === 'on-hold' ? 'TENTATIVE' : 'CONFIRMED'}`,
      `TRANSP:${['completed', 'cancelled'].includes(event.status) ? 'TRANSPARENT' : 'OPAQUE'}`);
    const place = event.location ?? (event.type === 'performance' ? project.venue.name : '');
    if (place) lines.push(`LOCATION:${text(place)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
export function calendarCSV(project, events) {
  return csv([['公演', '予定', '日付', '開始（日本時間）', '終了（日本時間）', 'モジュール', '状態', '場所'],
    ...events.map(e => [project.title, e.title, e.date, e.time ?? '', e.endTime ?? '', moduleName(e.moduleId), labels[e.status] ?? '予定',
      e.location ?? (e.type === 'performance' ? project.venue.name : '')])]);
}
