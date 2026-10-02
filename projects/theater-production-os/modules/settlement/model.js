import { checker, safeSum, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, items: [] });
export function totals(d){
 const sum=(kind,key)=>safeSum(d.items.filter(r=>r.kind===kind).map(r=>r[key]));
 const income=sum('income','amount'),expense=sum('expense','amount'),received=sum('income','settled'),paid=sum('expense','settled');
 return {income,expense,received,paid,profit:safeSum([income,-expense]),cash:safeSum([received,-paid]),receivable:income-received,payable:expense-paid};
}
export function validate(d,base){const c=checker(base);c.rows(d.items,'items').forEach((r,i)=>{if(!r)return;const p=`items.${i}`;
 c.text(r.name,`${p}.name`,true);c.text(r.notes,`${p}.notes`);c.choice(r.kind,`${p}.kind`,['income','expense']);c.choice(r.category,`${p}.category`,['ticket','goods','venue','staff','other']);c.date(r.date,`${p}.date`);c.number(r.amount,`${p}.amount`);c.number(r.settled,`${p}.settled`);
 if(Number.isSafeInteger(r.amount)&&Number.isSafeInteger(r.settled)&&r.settled>r.amount)c.error(`${p}.settled`,'入出金済み額が明細金額を超えています。');
 });if(!c.issues.length)try{totals(d);}catch(e){c.error('items',e.message);}return c.issues;}
export const metrics=(p,d)=>{const t=totals(d),yen=n=>`${n.toLocaleString('ja-JP')}円`;return [['実収入',yen(t.income)],['経費',yen(t.expense)],['収支',yen(t.profit)],['入金−支払',yen(t.cash)],['未収',yen(t.receivable)],['未払',yen(t.payable)]];};
export const events=(p,d)=>d.items.map(r=>({title:`${r.kind==='income'?'入金':'支払'}：${r.name}`,date:r.date,status:r.settled===r.amount?'completed':'planned',relatedItemId:r.id}));
export const exportCSV=(p,d)=>csv([['明細','収入／支出','区分','金額','入出金済み','未決済','期限','メモ'],...d.items.map(r=>[r.name,r.kind,r.category,r.amount,r.settled,r.amount-r.settled,r.date,r.notes])]);
