import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarICS, calendarCSV } from '../shared/calendar-outputs.js';
import { eventsFor } from '../shared/schedule.js';
import { fixture } from './fixture.js';
import { readFile } from 'node:fs/promises';
const now = new Date('2026-10-02T01:10:20Z');
const unfold = value => value.replace(/\r\n[ \t]/g, '');
const entries = value => unfold(value).split(/^BEGIN:VEVENT\r\n/m).slice(1).map(s => s.split(/^END:VEVENT\r\n/m)[0]);
const property = (entry, name) => entry.split('\r\n').find(s => s.startsWith(name + ':'))?.slice(name.length + 1);
const event = (extra = {}) => ({ id: 'task-1', moduleId: 'rehearsal', type: 'task', title: '稽古', date: '2026-11-30', status: 'planned', ...extra });
test('CAL-01: Japan starts and known ends convert to UTC, absent ends remain unspecified', () => {
  const project = fixture().project;
  const list = entries(calendarICS(project, [event({ time: '00:30', endTime: '02:00', location: '稽古場' }), event({ id: 'task-2', time: '14:00' }), event({ id: 'day' })], now));
  assert.equal(property(list[0], 'DTSTART'), '20261129T153000Z');
  assert.equal(property(list[0], 'DTEND'), '20261129T170000Z');
  assert.equal(property(list[0], 'LOCATION'), '稽古場');
  assert.equal(property(list[1], 'DTSTART'), '20261130T050000Z');
  assert.equal(property(list[1], 'DTEND'), undefined);
  assert.ok(list[2].includes('DTSTART;VALUE=DATE:20261130\r\n'));
  assert.equal(property(list[2], 'DTEND'), undefined);
  assert.equal(property(list[0], 'DTSTAMP'), '20261002T011020Z');
});
test('CAL-02: IDs remain stable across text/date changes and differ between projects and sources', () => {
  const p = fixture().project;
  const uid = (project, ev) => property(entries(calendarICS(project, [ev], now))[0], 'UID');
  const first = uid(p, event());
  assert.equal(uid(p, event({ date: '2026-12-01', title: '更新' })), first);
  assert.notEqual(uid({ ...p, id: 'other' }, event()), first);
  assert.notEqual(uid(p, event({ type: 'manual' })), first);
  assert.notEqual(uid(p, event({ moduleId: 'venue' })), first);
  assert.throws(() => calendarICS(p, [event(), event()], now), /重複/);
});
test('CAL-02: hold, cancelled and completed retain distinct meaning', () => {
  const rows = entries(calendarICS(fixture().project, ['on-hold', 'cancelled', 'completed'].map((status, i) => event({ id: String(i), status })), now));
  assert.equal(property(rows[0], 'STATUS'), 'TENTATIVE');
  assert.equal(property(rows[1], 'STATUS'), 'CANCELLED');
  assert.equal(property(rows[2], 'STATUS'), 'CONFIRMED');
  assert.equal(property(rows[2], 'TRANSP'), 'TRANSPARENT');
  assert.ok(property(rows[2], 'DESCRIPTION').includes('状態：完了'));
});
test('CAL-03: hostile newlines and TEXT delimiters cannot create additional calendar components', () => {
  const p = fixture().project; p.title = '公演;\\,\r\nBEGIN:VEVENT\r\nATTENDEE:someone';
  const title = '題名;\\,\r\nEND:VEVENT\nBEGIN:VEVENT\u0000';
  const output = calendarICS(p, [event({ title, time: '14:00', location: '会場\rBEGIN:VEVENT' })], now);
  assert.equal(entries(output).length, 1);
  assert.equal(output.includes('\u0000'), false);
  assert.equal(property(entries(output)[0], 'SUMMARY'), '題名\\;\\\\\\,\\nEND:VEVENT\\nBEGIN:VEVENT');
  assert.ok(output.endsWith('END:VCALENDAR\r\n'));
  assert.equal(output.replaceAll('\r\n', '').includes('\n'), false);
});
test('CAL-03: UTF-8 folding stays within 75 bytes and preserves Japanese and emoji', () => {
  const title = '上演予定🎭'.repeat(90);
  const output = calendarICS(fixture().project, [event({ title })], now);
  for (const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  assert.equal(property(entries(output)[0], 'SUMMARY'), title);
  assert.equal(output.includes('\uFFFD'), false);
});
test('CAL-01/05: registry aggregation retains known ends and separate locations', async () => {
  const p = JSON.parse(await readFile(new URL('../samples/demo.json', import.meta.url), 'utf8')).project;
  const events = eventsFor(p), output = entries(calendarICS(p, events, now));
  const rehearsal = events.find(e => e.moduleId === 'rehearsal' && e.type === 'task');
  assert.equal(rehearsal.endTime, p.modules.rehearsal.data.items[0].endTime);
  assert.equal(rehearsal.location, p.modules.rehearsal.data.items[0].venue);
  const stage = events.find(e => e.moduleId === 'stage-operations' && e.type === 'task');
  assert.equal(stage.endTime, p.modules['stage-operations'].data.items[0].endTime);
  assert.equal(output.length, events.length);
  assert.equal(property(output.find(e => property(e, 'SUMMARY') === '本番：架空公演'), 'LOCATION'), p.venue.name);
});
test('CAL-05: CSV neutralizes formula-like labels and contains explicit Japan time and state', () => {
  const p = fixture().project; p.title = '=NOW()';
  const out = calendarCSV(p, [event({ title: '+formula', time: '14:00', endTime: '16:00', status: 'completed' })]);
  assert.ok(out.startsWith('\uFEFF'));
  assert.ok(out.includes('"\'=NOW()"')); assert.ok(out.includes('"\'+formula"'));
  assert.ok(out.includes('"14:00","16:00","稽古","完了"'));
});
test('CAL-01: unsupported times and reversed ends fail rather than produce malformed calendars', () => {
  for (const extra of [{ time: '24:00' }, { date: '2026-02-30' }, { time: '14:00', endTime: '13:00' }]) {
    assert.throws(() => calendarICS(fixture().project, [event(extra)], now));
  }
});
