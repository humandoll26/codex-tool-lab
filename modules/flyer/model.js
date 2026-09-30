import { checker } from '../../shared/common.js';
export const defaults = () => ({ version: 1, introduction: '', contactText: '', officialUrl: '', printDate: null, deliveryDate: null, items: [] });
export function validate(data, base) {
  const c = checker(base);
  for (const key of ['introduction', 'contactText', 'officialUrl']) c.text(data[key], key);
  if (data.officialUrl) { try { const u = new URL(data.officialUrl); if (!['http:', 'https:'].includes(u.protocol)) throw Error(); } catch { c.error('officialUrl', 'httpまたはhttpsのURLを入力してください。'); } }
  c.date(data.printDate, 'printDate'); c.date(data.deliveryDate, 'deliveryDate');
  c.rows(data.items, 'items').forEach((row, i) => { if (!row) return;
    c.text(row.name, `items.${i}.name`, true); c.text(row.text, `items.${i}.text`);
    c.choice(row.status, `items.${i}.status`, ['draft', 'review', 'approved']);
  });
  return c.issues;
}
export function publicationText(project, data) {
  const lines = [project.title, project.companyName, `会場：${project.venue.name}`,
    ...project.performanceDates.map((s, i) => `ステージ${i + 1}：${s.startsAt.slice(0, 16).replace('T', ' ')}（日本時間）`),
    ...project.ticket.priceCategories.map(p => `${p.name}：${p.price.toLocaleString('ja-JP')}円`),
    data.introduction, ...data.items.map(row => `${row.name}\n${row.text}`),
    data.contactText ? `お問い合わせ：${data.contactText}` : '', data.officialUrl];
  return lines.filter(Boolean).join('\n\n');
}
export const metrics = (project, data) => [['原稿項目', `${data.items.length}件`], ['校了', `${data.items.filter(r => r.status === 'approved').length}件`]];
export const warnings = project => [!project.companyName.trim() && '劇団名が未入力です。', !project.venue.name.trim() && '劇場名が未入力です。', !project.performanceDates.length && 'ステージ日時が未登録です。'].filter(Boolean);
