import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { validateDocument, parseDocument, writeDocument } from '../shared/model.js';
import { defaults, totals, exportCSV } from '../modules/contracts/model.js';
import { eventsFor, agenda } from '../shared/schedule.js';
import { sharedModule } from '../shared/module-share.js';
import { moduleBackup, mergeModuleBackup } from '../shared/module-backup.js';
const row = () => ({id:'contract-1',name:'架空の契約',role:'担当A',status:'agreed',amount:30000,invoiceStatus:'pending',invoiceDate:null,paymentDue:'2026-10-01',paymentStatus:'pending',paidDate:null,notes:''});
function doc() { const d=fixture(); d.project.modules.contracts={id:'contracts',status:'in-progress',startDate:null,dueDate:null,progress:0,alerts:[],data:{...defaults(),items:[row()]}}; return d; }
test('CONTRACT-01/03: totals, zero, cancellation retains historical paid amount and stops overdue',()=>{
 const d=doc(),data=d.project.modules.contracts.data,r=data.items[0]; assert.equal(validateDocument(d).length,0);
 assert.deepEqual(totals(data),{amount:30000,paid:0,unpaid:30000,invoices:1});
 assert.equal(agenda(d.project,'2026-10-02').overdue.length,1);assert.equal(eventsFor(d.project).find(e=>e.moduleId==='contracts').relatedItemId,r.id);
 r.paymentStatus='paid';r.paidDate='2026-10-02';r.invoiceStatus='received';r.invoiceDate='2026-10-01';
 assert.deepEqual(totals(data),{amount:30000,paid:30000,unpaid:0,invoices:0});assert.equal(agenda(d.project,'2026-10-02').overdue.length,0);
 r.status='cancelled';assert.deepEqual(totals(data),{amount:0,paid:30000,unpaid:0,invoices:0});r.paymentStatus='pending';assert.equal(agenda(d.project,'2026-10-02').overdue.length,0);
 r.amount=0;assert.equal(validateDocument(d).length,0);assert.deepEqual(parseDocument(JSON.stringify(d)),d);
});
test('CONTRACT-02: invalid inputs cannot overwrite last saved data',()=>{
 const changes=[r=>r.amount=-1,r=>r.amount=.5,r=>r.status='bad',r=>r.invoiceStatus='bad',r=>r.paymentStatus='bad',r=>r.paymentDue='2026-02-30',r=>r.paidDate='bad',r=>r.invoiceDate='bad',r=>r.invoiceStatus='received',r=>r.paymentStatus='paid',r=>r.name='',r=>r.role=null];
 for(const change of changes){const d=doc();change(d.project.modules.contracts.data.items[0]);assert.ok(validateDocument(d).length);assert.throws(()=>writeDocument({setItem:()=>assert.fail('no write')},d));}
 const d=doc();d.project.modules.contracts.data.items.push(row());assert.ok(validateDocument(d).length);
 d.project.modules.contracts.data.items[1].id='contract-2';d.project.modules.contracts.data.items[0].amount=Number.MAX_SAFE_INTEGER;assert.ok(validateDocument(d).some(i=>i.path.endsWith('items')));
});
test('CONTRACT-04: CSV literal formulas, selective sharing and backup preservation',()=>{
 const d=doc(),data=d.project.modules.contracts.data;data.items[0].name='=HOSTILE()';data.items[0].notes='<img src=x onerror=alert(1)>';data.items[0].privateExtension='excluded';
 assert.ok(exportCSV(d.project,data).includes("'=HOSTILE()"));
 assert.equal(JSON.parse(sharedModule(d,'contracts')).module.data,undefined);
 const share=JSON.parse(sharedModule(d,'contracts',{data:true}));assert.equal(share.module.data.items[0].amount,30000);assert.equal(share.module.data.items[0].privateExtension,undefined);
 const packet=moduleBackup(d,'contracts');const restored=mergeModuleBackup(d,packet,'contracts').document;assert.equal(restored.project.modules.contracts.data.items[0].privateExtension,'excluded');assert.deepEqual(restored.project.modules.budget,d.project.modules.budget);
});
