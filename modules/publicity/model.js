import { checker, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, items: [] });
export function validate(data, base) {
  const c = checker(base);
  c.rows(data.items, 'items').forEach((r, i) => { if (!r) return; const p = `items.${i}`;
    c.text(r.title, `${p}.title`, true); c.text(r.channel, `${p}.channel`, true);
    c.text(r.text, `${p}.text`); c.text(r.materials, `${p}.materials`); c.date(r.date, `${p}.date`);
    c.choice(r.status, `${p}.status`, ['draft', 'approved', 'published']);
  });
  return c.issues;
}
export const metrics = (project, data) => [['予定投稿', `${data.items.length}件`], ['公開済み', `${data.items.filter(r => r.status === 'published').length}件`]];
export const exportCSV = data => csv([['題名', '媒体', '予定日', '状態', '原稿', '素材メモ'], ...data.items.map(r => [r.title, r.channel, r.date, r.status, r.text, r.materials])]);
