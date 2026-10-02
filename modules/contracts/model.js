import { checker, safeSum, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, items: [] });
export function totals(data) {
  const active = data.items.filter(r => r.status !== 'cancelled');
  return { amount: safeSum(active.map(r => r.amount)), paid: safeSum(data.items.filter(r => r.paymentStatus === 'paid').map(r => r.amount)),
    unpaid: safeSum(active.filter(r => r.paymentStatus === 'pending').map(r => r.amount)), invoices: active.filter(r => r.invoiceStatus === 'pending').length };
}
export function validate(data, base) {
  const c = checker(base);
  c.rows(data.items, 'items').forEach((r, i) => {
    if (!r) return;
    const path = `items.${i}`;
    for (const key of ['name', 'role', 'notes']) c.text(r[key], `${path}.${key}`, key === 'name');
    c.choice(r.status, `${path}.status`, ['draft', 'sent', 'agreed', 'cancelled']);
    c.number(r.amount, `${path}.amount`);
    c.choice(r.invoiceStatus, `${path}.invoiceStatus`, ['pending', 'received', 'not-needed']);
    c.choice(r.paymentStatus, `${path}.paymentStatus`, ['pending', 'paid']);
    for (const key of ['invoiceDate', 'paymentDue', 'paidDate']) c.date(r[key], `${path}.${key}`);
    if (r.invoiceStatus === 'received' && r.invoiceDate === null) c.error(`${path}.invoiceDate`, '請求書受領済みには受領日が必要です。');
    if (r.paymentStatus === 'paid' && r.paidDate === null) c.error(`${path}.paidDate`, '支払済みには支払日が必要です。');
  });
  if (!c.issues.length) try { totals(data); } catch (error) { c.error('items', error.message); }
  return c.issues;
}
export const metrics = (project, data) => {
  const t = totals(data), yen = n => `${n.toLocaleString('ja-JP')}円`;
  return [['取消以外の契約金額', yen(t.amount)], ['支払済み額（取消も含む）', yen(t.paid)], ['取消以外の未払額', yen(t.unpaid)], ['請求書未受領', `${t.invoices}件`]];
};
export const events = (project, data) => data.items.map(r => ({ key: 'payment', title: `契約支払：${r.name}`, date: r.paymentDue,
  status: r.paymentStatus === 'paid' ? 'completed' : r.status === 'cancelled' ? 'cancelled' : 'planned', relatedItemId: r.id }));
export const exportCSV = (project, data) => csv([['契約名', '担当役割', '契約状態', '金額（円）', '請求書状態', '請求書受領日', '支払予定日', '支払状態', '支払日', '備考'],
  ...data.items.map(r => [r.name, r.role, r.status, r.amount, r.invoiceStatus, r.invoiceDate, r.paymentDue, r.paymentStatus, r.paidDate, r.notes])]);
