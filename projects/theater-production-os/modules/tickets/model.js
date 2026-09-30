import { checker, safeSum, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, sales: [] });
export function totals(project, data) {
  const prices = new Map(project.ticket.priceCategories.map(p => [p.id, p.price]));
  const count = safeSum(data.sales.map(s => s.quantity));
  const capacity = safeSum(project.performanceDates.map(s => s.capacity));
  const money = data.sales.reduce((sum, s) => sum + BigInt(s.quantity) * BigInt(prices.get(s.priceCategoryId)), 0n);
  if (money > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('参考売上が安全な整数範囲を超えています。');
  return { count, capacity, remaining: capacity - count, revenue: Number(money), rate: capacity ? count / capacity * 100 : null };
}
export function stageTotals(project, data) {
  return project.performanceDates.map((stage, index) => {
    const sales = data.sales.filter(s => s.stageId === stage.id);
    const total = totals({ ...project, performanceDates: [stage] }, { ...data, sales });
    return { index: index + 1, date: stage.startsAt, ...total };
  });
}
export function validate(data, base, project) {
  const c = checker(base);
  if (!Array.isArray(data.sales)) { c.error('sales', '配列が必要です。'); return c.issues; }
  const stages = new Map((Array.isArray(project.performanceDates) ? project.performanceDates : []).filter(s => s && typeof s === 'object').map(s => [s.id, s]));
  const prices = new Set((Array.isArray(project.ticket?.priceCategories) ? project.ticket.priceCategories : []).filter(s => s && typeof s === 'object').map(p => p.id));
  const pairs = new Set(), counts = new Map();
  data.sales.forEach((r, i) => { const p = `sales.${i}`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) { c.error(p, '販売行が不正です。'); return; }
    if (!stages.has(r.stageId)) c.error(`${p}.stageId`, '参照先のステージがありません。');
    if (!prices.has(r.priceCategoryId)) c.error(`${p}.priceCategoryId`, '参照先の料金区分がありません。');
    const pair = JSON.stringify([r.stageId, r.priceCategoryId]);
    if (pairs.has(pair)) c.error(p, '販売行が重複しています。'); pairs.add(pair);
    c.number(r.quantity, `${p}.quantity`);
    if (Number.isSafeInteger(r.quantity) && r.quantity >= 0) counts.set(r.stageId, (counts.get(r.stageId) ?? 0n) + BigInt(r.quantity));
  });
  for (const [stageId, count] of counts) {
    const stage = stages.get(stageId);
    if (stage && Number.isSafeInteger(stage.capacity) && count > BigInt(stage.capacity)) data.sales.forEach((s, i) => { if (s?.stageId === stageId) c.error(`sales.${i}.quantity`, '実績販売枚数が販売可能席数を超えています。'); });
  }
  if (!c.issues.length && [...prices].length && [...stages.values()].every(s => Number.isSafeInteger(s.capacity) && s.capacity >= 0) && project.ticket.priceCategories.every(p => Number.isSafeInteger(p.price) && p.price >= 0)) {
    try { totals(project, data); } catch (e) { c.error('sales', e.message); }
  }
  return c.issues;
}
export const metrics = (project, data) => { const t = totals(project, data); return [['実績販売枚数', `${t.count}枚`], ['残席', `${t.remaining}席`], ['現行料金による参考売上', `${t.revenue.toLocaleString('ja-JP')}円`], ['販売率', t.rate === null ? '—' : `${t.rate.toFixed(1)}%`]]; };
export const exportCSV = (project, data) => csv([['日時（日本時間）', '料金区分', '現行料金', '実績枚数'], ...project.performanceDates.flatMap(s => project.ticket.priceCategories.map(p => [s.startsAt, p.name, p.price, data.sales.find(r => r.stageId === s.id && r.priceCategoryId === p.id)?.quantity ?? 0]))]);
