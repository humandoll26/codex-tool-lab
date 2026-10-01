import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture } from './fixture.js';
import { validateDocument, parseDocument, prepareDocument, writeDocument, STORAGE_KEY } from '../shared/model.js';
import * as rehearsal from '../modules/rehearsal/model.js';
import * as submissions from '../modules/submissions/model.js';
import { agenda, eventsFor } from '../shared/schedule.js';
const row = () => ({ id: 'practice', name: '読み合わせ', date: '2026-10-10', startTime: '13:00', endTime: '17:00', venue: '稽古室', participants: '出演A', attendance: '', staff: '', notes: '第一幕', message: '台本持参', status: 'planned', history: [] });
const paper = () => ({ id: 'paper', name: '図面', recipient: '劇場', category: 'schedule', assignee: '舞台担当', dueDate: '2026-10-10', status: 'pending', submittedDate: null, notes: '' });
function document() {
 const d=fixture();
 for (const [id,item] of [['rehearsal',row()],['submissions',paper()]]) d.project.modules[id]={id,status:'in-progress',startDate:null,dueDate:null,progress:0,alerts:[],data:{version:1,items:[item]}};
 return d;
}
test('NEXT-01/03: seven-module sample and recorded history survive JSON round trips with old budget intact', async () => {
 const d=document(), budget=structuredClone(d.project.modules.budget);
 assert.equal(rehearsal.recordSchedule(d.project.modules.rehearsal.data.items[0],new Date('2026-10-01T00:00:00Z')),true);
 const restored=parseDocument(JSON.stringify(prepareDocument(d)));
 assert.deepEqual(restored.project.modules.budget,budget);
 assert.equal(restored.project.modules.rehearsal.data.items[0].history.length,1);
 const demo=parseDocument(await readFile(new URL('../samples/demo.json',import.meta.url),'utf8'));
 assert.equal(Object.keys(demo.project.modules).length,7);
 assert.equal(validateDocument(fixture()).length,0);
});
for (const [field,value] of [['date','2026-02-30'],['date',null],['startTime','24:00'],['startTime','x'],['endTime','13:00'],['endTime','12:59'],['status','unknown'],['history',{}]]) {
 test(`NEXT-02: invalid rehearsal ${field}=${value} does not overwrite saved data`,()=>{
  const d=document(), saved=JSON.stringify(d), store={getItem:()=>saved,setItem:()=>assert.fail('must not save')};
  d.project.modules.rehearsal.data.items[0][field]=value;
  assert.ok(validateDocument(d).length);
  assert.throws(()=>writeDocument(store,d));assert.equal(store.getItem(STORAGE_KEY),saved);
 });
}
test('NEXT-03: explicit snapshots record venue/date changes once and invalid records are rejected',()=>{
 const r=row();const now=new Date('2026-10-01T00:00:00Z');
 assert.equal(rehearsal.recordSchedule(r,now),true);
 assert.equal(rehearsal.recordSchedule(r,now),false);
 r.date='2026-10-11';r.venue='別室';assert.equal(rehearsal.recordSchedule(r,now),true);
 assert.equal(r.history[0].venue,'稽古室');assert.equal(r.history.length,2);
 r.history[0].recordedAt='2026-02-30T00:00:00.000Z';assert.ok(rehearsal.validate({items:[r]},'r').length);
 assert.throws(()=>rehearsal.recordSchedule(r,now));
});
test('NEXT-02/04: contact text and CSV preserve content and escape formula prefixes',()=>{
 const d=document();const r=d.project.modules.rehearsal.data.items[0];r.name='=1+1';r.message='hello,"world"\nnext';
 assert.ok(rehearsal.announcement(d.project,d.project.modules.rehearsal.data).includes('13:00〜17:00'));
 assert.ok(rehearsal.announcement(d.project,d.project.modules.rehearsal.data).includes('hello,"world"\nnext'));
 assert.ok(rehearsal.exportCSV(d.project,d.project.modules.rehearsal.data).includes('"\'=1+1"'));
 const s=d.project.modules.submissions.data.items[0];s.name='@SUM(1)';assert.ok(submissions.exportCSV(d.project,d.project.modules.submissions.data).includes('"\'@SUM(1)"'));
});
for (const [field,value] of [['dueDate','2026-02-30'],['dueDate',null],['submittedDate','x'],['status','unknown'],['category','unknown']]) {
 test(`NEXT-04: invalid submission ${field} rejects import`,()=>{const d=document();d.project.modules.submissions.data.items[0][field]=value;assert.throws(()=>parseDocument(JSON.stringify(d)));});
}
test('NEXT-04/05: submitted date is required, late submission is accepted and returned work is overdue',()=>{
 const d=document(),s=d.project.modules.submissions.data.items[0],r=d.project.modules.rehearsal.data.items[0];
 s.status='submitted';assert.ok(validateDocument(d).some(i=>i.path.endsWith('submittedDate')));
 s.submittedDate='2026-10-12';assert.equal(validateDocument(d).length,0);
 r.status='cancelled';assert.equal(agenda(d.project,'2026-10-13').overdue.length,0);
 s.status='returned';assert.equal(agenda(d.project,'2026-10-13').overdue.length,1);
 s.status='submitted';r.status='planned';assert.equal(agenda(d.project,'2026-10-13').overdue.length,1);
 r.status='completed';assert.equal(agenda(d.project,'2026-10-13').overdue.length,0);
 const e=eventsFor(d.project).find(e=>e.moduleId==='rehearsal');assert.equal(e.time,'13:00');assert.equal(e.relatedItemId,'practice');
 assert.deepEqual(submissions.metrics(d.project,d.project.modules.submissions.data).map(x=>x[1]),['1件','0件','1件','0件']);
});
