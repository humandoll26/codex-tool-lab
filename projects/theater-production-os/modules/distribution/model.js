import { checker, safeSum, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, printed: 0, items: [] });
export function totals(data) {
  const planned = safeSum(data.items.map(r => r.planned)), shipped = safeSum(data.items.map(r => r.shipped));
  return { planned, shipped, unassigned: data.printed - planned, remaining: data.printed - shipped };
}
export function validate(data, base) {
  const c = checker(base); c.number(data.printed, 'printed');
  c.rows(data.items, 'items').forEach((r, i) => { if (!r) return; const p = `items.${i}`;
    c.text(r.name, `${p}.name`, true); c.text(r.assignee, `${p}.assignee`); c.date(r.date, `${p}.date`);
    c.choice(r.method, `${p}.method`, ['hand', 'mail', 'insert']); c.choice(r.status, `${p}.status`, ['uncontacted', 'contacted', 'confirmed']);
    c.number(r.planned, `${p}.planned`); c.number(r.shipped, `${p}.shipped`);
    if (Number.isSafeInteger(r.planned) && Number.isSafeInteger(r.shipped) && r.shipped > r.planned) c.error(`${p}.shipped`, '配布済み部数が予定部数を超えています。');
  });
  if (!c.issues.length) try { if (totals(data).planned > data.printed) c.error('printed', '配布予定部数の合計が印刷総部数を超えています。'); } catch (e) { c.error('printed', e.message); }
  return c.issues;
}
export const metrics = (project, data) => { const t = totals(data); return [['配布予定', `${t.planned}部`], ['配布済み', `${t.shipped}部`], ['未配布残部', `${t.remaining}部`], ['未割当', `${t.unassigned}部`]]; };
export const exportCSV = data => csv([['配布先', '担当', '方法', '予定日', '予定部数', '配布済み', '連絡状態'], ...data.items.map(r => [r.name, r.assignee, r.method, r.date, r.planned, r.shipped, r.status])]);
