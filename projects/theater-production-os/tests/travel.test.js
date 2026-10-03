import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { validateDocument, parseDocument, writeDocument } from '../shared/model.js';
import { totals, exportCSV } from '../modules/travel/model.js';
import { eventsFor, agenda } from '../shared/schedule.js';
import { sharedModule } from '../shared/module-share.js';
import { moduleBackup, mergeModuleBackup } from '../shared/module-backup.js';
const row = () => ({id:'travel-1',name:'架空の宿泊',kind:'lodging',roles:'舞台班A',people:2,method:'',location:'サンプル宿泊先',date:'2026-10-01',endDate:'2026-10-02',meals:'朝食',status:'booked',amount:20000,paid:5000,paymentDue:'2026-10-02',paidDate:'2026-09-30',notes:''});
function doc() { const d=fixture();d.project.modules.travel={id:'travel',status:'in-progress',startDate:null,dueDate:null,progress:0,alerts:[],data:{version:1,items:[row()]}};return d; }
test('TRAVEL-01/03: lodging, unique dates, partial payment and cancellation retain actual paid amount',()=>{
 const d=doc(),data=d.project.modules.travel.data,r=data.items[0];assert.deepEqual(validateDocument(d),[]);assert.deepEqual(totals(data),{amount:20000,paid:5000,unpaid:15000,arranged:1});
 const e=eventsFor(d.project).filter(e=>e.moduleId==='travel');assert.equal(e.length,3);assert.equal(new Set(e.map(x=>x.id)).size,3);assert.equal(agenda(d.project,'2026-10-03').overdue.length,3);
 r.status='completed';assert.equal(agenda(d.project,'2026-10-03').overdue.length,1);r.paid=20000;assert.equal(agenda(d.project,'2026-10-03').overdue.length,0);
 r.status='cancelled';assert.deepEqual(totals(data),{amount:0,paid:20000,unpaid:0,arranged:0});assert.deepEqual(parseDocument(JSON.stringify(d)),d);r.paid=0;assert.equal(agenda(d.project,'2026-10-03').overdue.length,0);
});
test('TRAVEL-02: invalid money, dates, required booking fields and aggregate overflow cannot write',()=>{
 const changes=[r=>r.name='',r=>r.kind='bad',r=>r.status='bad',r=>r.people=-1,r=>r.people=.5,r=>r.people=0,r=>r.amount=-1,r=>r.amount=.5,r=>r.paid=20001,r=>r.paid=-1,r=>r.paidDate=null,r=>r.date=null,r=>r.endDate=null,r=>r.endDate=r.date,r=>r.endDate='2026-09-30',r=>r.paymentDue='2026-02-30',r=>r.paidDate='bad',r=>r.endDate='bad',r=>r.location=null];
 for(const change of changes){const d=doc();change(d.project.modules.travel.data.items[0]);assert.ok(validateDocument(d).length);assert.throws(()=>writeDocument({setItem:()=>assert.fail('must not write')},d));}
 const d=doc(),data=d.project.modules.travel.data;data.items.push(row());assert.ok(validateDocument(d).length);data.items[1].id='travel-2';data.items[0].amount=Number.MAX_SAFE_INTEGER;assert.ok(validateDocument(d).some(i=>i.path.endsWith('items')));
});
test('TRAVEL-01/03: transport and meals ignore stored checkout, unspecified planning and zero-cost booking',()=>{
 const d=doc(),r=d.project.modules.travel.data.items[0];for(const kind of ['transport','meals']){r.kind=kind;assert.deepEqual(validateDocument(d),[]);assert.equal(eventsFor(d.project).filter(e=>e.moduleId==='travel').length,2);}
 r.date=null;r.endDate=null;r.status='planning';r.people=0;r.paid=0;r.paidDate=null;r.amount=0;assert.deepEqual(validateDocument(d),[]);assert.equal(eventsFor(d.project).find(e=>e.title.startsWith('手配支払')).status,'planned');
 r.status='booked';r.date='2026-10-01';r.people=1;assert.deepEqual(validateDocument(d),[]);assert.equal(eventsFor(d.project).find(e=>e.title.startsWith('手配支払')).status,'completed');
});
test('TRAVEL-04: formula-safe CSV, private defaults, positive whitelist and backup extension retention',()=>{
 const d=doc(),r=d.project.modules.travel.data.items[0];r.name='=HOSTILE()';r.notes='<img src=x onerror=alert(1)>';r.privateExtension='exclude';assert.ok(exportCSV(d.project,d.project.modules.travel.data).includes("'=HOSTILE()"));
 assert.equal(JSON.parse(sharedModule(d,'travel')).module.data,undefined);const share=JSON.parse(sharedModule(d,'travel',{data:true}));assert.equal(share.module.data.items[0].people,2);assert.equal(share.module.data.items[0].privateExtension,undefined);
 const restored=mergeModuleBackup(d,moduleBackup(d,'travel'),'travel').document;assert.equal(restored.project.modules.travel.data.items[0].privateExtension,'exclude');assert.deepEqual(restored.project.modules.budget,d.project.modules.budget);
});
