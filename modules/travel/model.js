import { checker, safeSum, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, items: [] });
export function totals(data) {
  const active = data.items.filter(r => r.status !== 'cancelled');
  return { amount: safeSum(active.map(r => r.amount)), paid: safeSum(data.items.map(r => r.paid)),
    unpaid: safeSum(active.map(r => r.amount - r.paid)), arranged: active.filter(r => r.status !== 'planning').length };
}
export function validate(data, base) {
  const c = checker(base);
  c.rows(data.items, 'items').forEach((r, i) => {
    if (!r) return;
    const p = `items.${i}`;
    for (const key of ['name', 'roles', 'method', 'location', 'meals', 'notes']) c.text(r[key], `${p}.${key}`, key === 'name');
    c.choice(r.kind, `${p}.kind`, ['transport', 'lodging', 'meals']);
    c.choice(r.status, `${p}.status`, ['planning', 'booked', 'completed', 'cancelled']);
    for (const key of ['date', 'endDate', 'paymentDue', 'paidDate']) c.date(r[key], `${p}.${key}`);
    for (const key of ['people', 'amount', 'paid']) c.number(r[key], `${p}.${key}`);
    if (['booked', 'completed'].includes(r.status)) {
      if (r.date === null) c.error(`${p}.date`, '手配済み・利用完了には利用日が必要です。');
      if (r.people === 0) c.error(`${p}.people`, '手配済み・利用完了には1人以上を入力してください。');
      if (r.kind === 'lodging' && r.endDate === null) c.error(`${p}.endDate`, '宿泊にはチェックアウト日が必要です。');
    }
    if (r.endDate !== null && (r.date === null || r.endDate <= r.date)) c.error(`${p}.endDate`, '利用日より後のチェックアウト日を入力してください。');
    if (Number.isSafeInteger(r.amount) && Number.isSafeInteger(r.paid) && r.paid > r.amount) c.error(`${p}.paid`, '支払済み額が総額を超えています。');
    if (r.paid > 0 && r.paidDate === null) c.error(`${p}.paidDate`, '支払済み額には支払日が必要です。');
  });
  if (!c.issues.length) try { totals(data); } catch (error) { c.error('items', error.message); }
  return c.issues;
}
export const metrics = (project, data) => {
  const t = totals(data), yen = n => `${n.toLocaleString('ja-JP')}円`;
  return [['取消以外の手配総額', yen(t.amount)], ['支払済み額（取消も含む）', yen(t.paid)], ['取消以外の未払額', yen(t.unpaid)], ['手配済み・利用完了', `${t.arranged}件`]];
};
export const events = (project, data) => data.items.flatMap(r => {
  const status = complete => complete ? 'completed' : r.status === 'cancelled' ? 'cancelled' : 'planned';
  const event = (key, title, date, complete) => ({ key, title: `${title}：${r.name}`, date, status: status(complete), relatedItemId: r.id });
  return [event('use', {transport:'移動',lodging:'宿泊',meals:'食事'}[r.kind], r.date, r.status === 'completed'),
    ...(r.kind === 'lodging' ? [event('checkout', 'チェックアウト', r.endDate, r.status === 'completed')] : []),
    event('payment', '手配支払', r.paymentDue, r.paid === r.amount && (r.amount > 0 || ['booked', 'completed'].includes(r.status)))];
});
export const exportCSV = (project, data) => csv([['手配名', '種別', '対象役割', '人数', '移動手段', '滞在先・場所', '利用日', 'チェックアウト日', '食事内容', '状態', '総額（円）', '支払済み額（円）', '支払予定日', '支払日', '備考'],
  ...data.items.map(r => [r.name, r.kind, r.roles, r.people, r.method, r.location, r.date, r.endDate, r.meals, r.status, r.amount, r.paid, r.paymentDue, r.paidDate, r.notes])]);
