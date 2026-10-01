import { checker, validDate, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, items: [] });
export function validate(data, base) {
  const c = checker(base);
  c.rows(data.items, 'items').forEach((r, i) => {
    if (!r) return;
    const p = `items.${i}`;
    for (const key of ['name', 'recipient', 'assignee', 'notes']) c.text(r[key], `${p}.${key}`, key === 'name');
    c.choice(r.category, `${p}.category`, ['theater', 'fire', 'schedule', 'other']);
    c.choice(r.status, `${p}.status`, ['pending', 'preparing', 'submitted', 'returned']);
    if (!validDate(r.dueDate)) c.error(`${p}.dueDate`, '正しい提出期限を入力してください。');
    c.date(r.submittedDate, `${p}.submittedDate`);
    if (r.status === 'submitted' && !validDate(r.submittedDate)) c.error(`${p}.submittedDate`, '提出済みには提出日を入力してください。');
  });
  return c.issues;
}
export const metrics = (project, data) => [['提出物', `${data.items.length}件`], ['未提出', `${data.items.filter(r => r.status !== 'submitted').length}件`], ['提出済み', `${data.items.filter(r => r.status === 'submitted').length}件`], ['差戻し', `${data.items.filter(r => r.status === 'returned').length}件`]];
export const exportCSV = (project, data) => csv([['提出物', '提出先', '種別', '担当ラベル', '期限', '状態', '提出日', '備考'], ...data.items.map(r => [r.name, r.recipient, r.category, r.assignee, r.dueDate, r.status, r.submittedDate, r.notes])]);
