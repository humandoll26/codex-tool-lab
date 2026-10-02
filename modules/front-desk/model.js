import { checker, safeSum, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, changeFund: 0, guidance: '', items: [] });
export function validate(data, base) {
 const c=checker(base);c.number(data.changeFund,'changeFund');c.text(data.guidance,'guidance');
 c.rows(data.items,'items').forEach((r,i)=>{if(!r)return;const p=`items.${i}`;
  c.text(r.name,`${p}.name`,true);c.text(r.assignee,`${p}.assignee`);c.text(r.notes,`${p}.notes`);c.date(r.date,`${p}.date`);
  c.choice(r.category,`${p}.category`,['staff','sign','tickets','cash','supplies','guidance']);c.choice(r.status,`${p}.status`,['pending','preparing','completed','not-needed']);
  c.number(r.needed,`${p}.needed`);c.number(r.ready,`${p}.ready`);
  if(Number.isSafeInteger(r.needed)&&Number.isSafeInteger(r.ready)){if(r.ready>r.needed)c.error(`${p}.ready`,'準備済み数が必要数を超えています。');if(r.status==='completed'&&r.ready<r.needed)c.error(`${p}.status`,'必要数を準備してから完了にしてください。');}
 });
 if(!c.issues.length)try{safeSum(data.items.filter(r=>r.status!=='not-needed').map(r=>r.needed));safeSum(data.items.filter(r=>r.status!=='not-needed').map(r=>r.ready));}catch(e){c.error('items',e.message);}
 return c.issues;
}
export const metrics = (p,d)=>{const rows=d.items.filter(r=>r.status!=='not-needed');return [['未完了',`${rows.filter(r=>r.status!=='completed').length}件`],['不足数',`${safeSum(rows.map(r=>r.needed-r.ready))}個`],['釣銭元手',`${d.changeFund.toLocaleString('ja-JP')}円`]];};
export const events = (p,d)=>d.items.map(r=>({title:`受付：${r.name}`,date:r.date,status:['completed','not-needed'].includes(r.status)?'completed':'planned',relatedItemId:r.id}));
export const exportCSV = (p,d)=>csv([['作業','区分','担当役割','期限','必要数','準備済み数','状態','メモ'],...d.items.map(r=>[r.name,r.category,r.assignee,r.date,r.needed,r.ready,r.status,r.notes])]);
export const announcement = (p,d)=>[p.title,`会場：${p.venue.name}`,`釣銭元手：${d.changeFund.toLocaleString('ja-JP')}円（費用とは別）`,d.guidance,...d.items.filter(r=>r.status!=='not-needed').map(r=>`${r.name}：${r.ready}/${r.needed} · ${r.assignee||'担当未定'}${r.notes?' · '+r.notes:''}`)].filter(Boolean).join('\n');
