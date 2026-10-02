import { csv } from '../../shared/common.js';
import { calculateBudget } from './calculator.js';
const yen = value => `${value.toLocaleString('ja-JP')}円`;
export function report(project) {
  const r = calculateBudget(project), b = project.modules.budget.data;
  const reference = project.ticket.priceCategories.find(p => p.id === b.referencePriceCategoryId);
  const prices = new Map(project.ticket.priceCategories.map(p => [p.id, p]));
  const stages = new Map(project.performanceDates.map(p => [p.id, p]));
  return [project.title, '公演予算の試算（想定販売・税込総額）', `会場：${project.venue.name}`,
    `想定来場者数：${r.attendees}人`, `売上：${yen(r.revenue)}`, `費用：${yen(r.expenses)}`, `収支：${yen(r.profit)}`,
    `販売率：${r.salesRate === null ? '—' : r.salesRate.toFixed(1) + '%'}`,
    `基準料金：${reference.name} ${yen(reference.price)}`,
    `基準料金での損益分岐：${r.breakEven === null ? '黒字化できない' : r.breakEven + '人'}${r.exceedsCapacity ? '（収容可能人数を超える）' : ''}`,
    '全員が基準料金で購入する場合の参考値です。実績販売・実収入ではありません。',
    '固定費', ...b.fixedCosts.map(c => `${c.name}：${yen(c.amount)}`),
    `1人当たり変動費：${yen(b.variableCostPerAttendee)}`,
    '想定販売', ...b.plannedSales.map(s => `${stages.get(s.stageId).startsAt.slice(0, 16).replace('T', ' ')}（日本時間） ${prices.get(s.priceCategoryId).name}：${s.quantity}枚 × ${yen(prices.get(s.priceCategoryId).price)}`)
  ].join('\n');
}
export function exportCSV(project) {
  const r = calculateBudget(project), b = project.modules.budget.data;
  const prices = new Map(project.ticket.priceCategories.map(p => [p.id, p]));
  const stages = new Map(project.performanceDates.map(p => [p.id, p]));
  return csv([
    ['区分', '項目', 'ステージ日時（日本時間）', '料金区分', '数量', '単価（円）', '合計（円）', '備考'],
    ['集計', '想定来場者数', '', '', r.attendees, '', '', '人・想定'],
    ['集計', '売上', '', '', '', '', r.revenue, '想定販売'],
    ['集計', '費用', '', '', '', '', r.expenses, '税込総額'],
    ['集計', '収支', '', '', '', '', r.profit, '試算'],
    ['集計', '販売率', '', '', '', '', '', r.salesRate === null ? '—' : r.salesRate.toFixed(1) + '%'],
    ['集計', '基準料金での損益分岐', '', '', r.breakEven ?? '', '', '', r.breakEven === null ? '黒字化できない' : r.exceedsCapacity ? '収容可能人数を超える' : '人・全員が基準料金の場合'],
    ...b.fixedCosts.map(c => ['固定費', c.name, '', '', '', '', c.amount, '']),
    ['変動費', '来場者1人当たり', '', '', r.attendees, b.variableCostPerAttendee, Number(BigInt(r.attendees) * BigInt(b.variableCostPerAttendee)), ''],
    ...b.plannedSales.map(s => ['想定販売', project.title, stages.get(s.stageId).startsAt, prices.get(s.priceCategoryId).name, s.quantity, prices.get(s.priceCategoryId).price, Number(BigInt(s.quantity) * BigInt(prices.get(s.priceCategoryId).price)), '枚・実績とは別'])
  ]);
}
