import { checker, safeSum, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, items: [] });
export function totals(data) {
  const confirmed = data.items.filter(r => r.status === 'confirmed');
  return { confirmed: safeSum(confirmed.map(r => r.amount)), received: safeSum(data.items.map(r => r.received)),
    outstanding: safeSum(confirmed.map(r => r.amount - r.received)) };
}
export function validate(data, base) {
  const c = checker(base);
  c.rows(data.items, 'items').forEach((r, i) => {
    if (!r) return;
    const p = `items.${i}`;
    for (const key of ['name', 'organization', 'adSlot', 'notes']) c.text(r[key], `${p}.${key}`, key === 'name' || key === 'adSlot' && r.kind === 'advertisement');
    c.choice(r.kind, `${p}.kind`, ['grant', 'sponsorship', 'advertisement']);
    c.choice(r.status, `${p}.status`, ['candidate', 'preparing', 'applied', 'confirmed', 'rejected', 'cancelled']);
    c.choice(r.reportStatus, `${p}.reportStatus`, ['pending', 'submitted', 'not-needed']);
    c.choice(r.materialStatus, `${p}.materialStatus`, ['pending', 'received', 'not-needed']);
    for (const key of ['applicationDue', 'reportDue', 'reportDate', 'materialDue', 'materialDate', 'paymentDue', 'receivedDate']) c.date(r[key], `${p}.${key}`);
    for (const key of ['amount', 'received']) c.number(r[key], `${p}.${key}`);
    if (Number.isSafeInteger(r.received) && Number.isSafeInteger(r.amount) && r.received > r.amount) c.error(`${p}.received`, '入金済み額が採択・確定額を超えています。');
    if (r.received > 0 && r.receivedDate === null) c.error(`${p}.receivedDate`, '入金済み額を記録する場合は入金日が必要です。');
    if (r.received > 0 && !['confirmed', 'cancelled'].includes(r.status)) c.error(`${p}.status`, '入金済みの案件は採択・確定または取消で記録してください。');
    if (r.reportStatus === 'submitted' && r.reportDate === null) c.error(`${p}.reportDate`, '報告提出済みには提出日が必要です。');
    if (r.materialStatus === 'received' && r.materialDate === null) c.error(`${p}.materialDate`, '入稿受領済みには受領日が必要です。');
  });
  if (!c.issues.length) try { totals(data); } catch (error) { c.error('items', error.message); }
  return c.issues;
}
export const metrics = (project, data) => {
  const t = totals(data), yen = n => `${n.toLocaleString('ja-JP')}円`;
  return [['採択・確定額', yen(t.confirmed)], ['入金済み額（取消も含む）', yen(t.received)], ['採択・確定分の未入金額', yen(t.outstanding)]];
};
export const events = (project, data) => data.items.flatMap(r => {
  const status = complete => complete ? 'completed' : ['rejected', 'cancelled'].includes(r.status) ? 'cancelled' : 'planned';
  const event = (key, title, date, complete) => ({ key, title: `${title}：${r.name}`, date, status: status(complete), relatedItemId: r.id });
  return [
    ...(r.kind === 'grant' ? [event('application', '助成申請', r.applicationDue, ['applied', 'confirmed', 'rejected'].includes(r.status)), event('report', '助成報告', r.reportDue, r.reportStatus !== 'pending')] : []),
    ...(r.kind === 'advertisement' ? [event('material', '広告入稿', r.materialDue, r.materialStatus !== 'pending')] : []),
    event('payment', '助成・協賛・広告入金', r.paymentDue, r.status === 'confirmed' && r.received === r.amount || r.received > 0 && r.received === r.amount)
  ];
});
export const exportCSV = (project, data) => csv([['案件名', '種別', '団体名', '状態', '採択・確定額（円）', '入金済み額（円）', '入金日', '入金予定日', '申請締切', '報告期限', '報告状態', '報告提出日', '広告枠', '入稿期限', '入稿状態', '入稿受領日', '備考'],
  ...data.items.map(r => [r.name, r.kind, r.organization, r.status, r.amount, r.received, r.receivedDate, r.paymentDue, r.applicationDue, r.reportDue, r.reportStatus, r.reportDate, r.adSlot, r.materialDue, r.materialStatus, r.materialDate, r.notes])]);
