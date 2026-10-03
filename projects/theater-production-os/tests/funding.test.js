import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { validateDocument, parseDocument, writeDocument } from '../shared/model.js';
import { totals, exportCSV } from '../modules/funding/model.js';
import { eventsFor, agenda } from '../shared/schedule.js';
import { sharedModule } from '../shared/module-share.js';
import { moduleBackup, mergeModuleBackup } from '../shared/module-backup.js';
const row = () => ({id:'fund-1',name:'架空の助成',kind:'grant',organization:'文化団体',status:'confirmed',amount:50000,received:10000,receivedDate:'2026-10-01',paymentDue:'2026-10-02',applicationDue:'2026-09-30',reportDue:'2026-10-02',reportStatus:'pending',reportDate:null,adSlot:'',materialDue:null,materialStatus:'not-needed',materialDate:null,notes:''});
function doc() { const d=fixture();d.project.modules.funding={id:'funding',status:'in-progress',startDate:null,dueDate:null,progress:0,alerts:[],data:{version:1,items:[row()]}};return d; }
test('FUND-01/03: partial receipts, unique deadlines, completion and cancellation preserve actual receipts',()=>{
 const d=doc(),data=d.project.modules.funding.data,r=data.items[0];assert.deepEqual(validateDocument(d),[]);assert.deepEqual(totals(data),{confirmed:50000,received:10000,outstanding:40000});
 const e=eventsFor(d.project).filter(e=>e.moduleId==='funding');assert.equal(e.length,3);assert.equal(new Set(e.map(x=>x.id)).size,3);assert.equal(agenda(d.project,'2026-10-03').overdue.length,2);
 r.reportStatus='submitted';r.reportDate='2026-10-02';r.received=50000;assert.equal(agenda(d.project,'2026-10-03').overdue.length,0);
 r.status='cancelled';assert.deepEqual(totals(data),{confirmed:0,received:50000,outstanding:0});assert.deepEqual(parseDocument(JSON.stringify(d)),d);
 r.received=0;r.receivedDate=null;r.amount=0;r.status='candidate';assert.deepEqual(validateDocument(d),[]);assert.equal(eventsFor(d.project).find(e=>e.title.startsWith('助成・協賛・広告入金')).status,'planned');
});
test('FUND-02: invalid funding cannot replace saved values, including aggregate overflow',()=>{
 const changes=[r=>r.name='',r=>r.kind='bad',r=>r.status='bad',r=>r.amount=-1,r=>r.amount=.5,r=>r.received=50001,r=>r.received=-1,r=>r.receivedDate=null,r=>r.status='candidate',r=>r.reportStatus='submitted',r=>r.materialStatus='received',r=>r.reportStatus='bad',r=>r.materialStatus='bad',r=>r.paymentDue='2026-02-30',r=>r.applicationDue='bad',r=>r.reportDue='bad',r=>r.materialDue='bad',r=>r.materialDate='bad',r=>r.reportDate='bad',r=>r.kind='advertisement'];
 for(const change of changes){const d=doc();change(d.project.modules.funding.data.items[0]);assert.ok(validateDocument(d).length);assert.throws(()=>writeDocument({setItem:()=>assert.fail('must not write')},d));}
 const d=doc(),data=d.project.modules.funding.data;data.items.push(row());assert.ok(validateDocument(d).length);data.items[1].id='fund-2';data.items[0].amount=Number.MAX_SAFE_INTEGER;assert.ok(validateDocument(d).some(i=>i.path.endsWith('items')));
});
test('FUND-03: advertisement materials and sponsorship payments ignore inactive kind dates',()=>{
 const d=doc(),r=d.project.modules.funding.data.items[0];r.kind='advertisement';r.adSlot='パンフ半頁';r.materialDue='2026-10-02';r.materialStatus='pending';
 assert.deepEqual(validateDocument(d),[]);assert.equal(eventsFor(d.project).filter(e=>e.moduleId==='funding').length,2);assert.equal(agenda(d.project,'2026-10-03').overdue.length,2);
 r.materialStatus='received';r.materialDate='2026-10-02';assert.equal(agenda(d.project,'2026-10-03').overdue.length,1);r.kind='sponsorship';assert.equal(eventsFor(d.project).filter(e=>e.moduleId==='funding').length,1);
 r.received=0;r.receivedDate=null;r.status='rejected';assert.equal(agenda(d.project,'2026-10-03').overdue.length,0);
});
test('FUND-04: CSV formulas are literal, backups retain extensions, shares exclude private fields by default',()=>{
 const d=doc(),r=d.project.modules.funding.data.items[0];r.name='=HOSTILE()';r.notes='<img src=x onerror=alert(1)>';r.privateExtension='exclude';assert.ok(exportCSV(d.project,d.project.modules.funding.data).includes("'=HOSTILE()"));
 assert.equal(JSON.parse(sharedModule(d,'funding')).module.data,undefined);const share=JSON.parse(sharedModule(d,'funding',{data:true}));assert.equal(share.module.data.items[0].received,10000);assert.equal(share.module.data.items[0].privateExtension,undefined);
 const restored=mergeModuleBackup(d,moduleBackup(d,'funding'),'funding').document;assert.equal(restored.project.modules.funding.data.items[0].privateExtension,'exclude');assert.deepEqual(restored.project.modules.budget,d.project.modules.budget);
});
