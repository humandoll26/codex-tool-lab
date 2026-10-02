import { checker, isRecord, csv } from '../../shared/common.js';
export const defaults = () => ({ version: 1, attendance: null, socialResults: '', reflection: '', handover: '', snapshot: null, items: [] });
const labels = { pending: '未収集', collected: '所在記録済み', 'not-needed': '不要' };
const categories = { flyer: 'チラシ', program: 'パンフ', photo: '写真', video: '映像', script: '脚本', finance: '収支', other: 'その他' };
export function validate(data, base, project) {
  const c = checker(base);
  if (data.attendance !== null) c.number(data.attendance, 'attendance');
  for (const key of ['socialResults', 'reflection', 'handover']) c.text(data[key], key);
  c.rows(data.items, 'items').forEach((row, i) => {
    if (!row) return; const p = `items.${i}`;
    for (const key of ['name', 'location', 'keeper', 'notes']) c.text(row[key], `${p}.${key}`, key === 'name');
    c.choice(row.category, `${p}.category`, Object.keys(categories)); c.choice(row.status, `${p}.status`, Object.keys(labels));
    c.date(row.dueDate, `${p}.dueDate`); c.date(row.recordedDate, `${p}.recordedDate`);
    if (row.status === 'collected') {
      if (typeof row.location !== 'string' || !row.location.trim()) c.error(`${p}.location`, '資料の保存場所を入力してください。');
      if (!row.recordedDate) c.error(`${p}.recordedDate`, '所在を記録した日付を入力してください。');
    }
  });
  if (data.snapshot !== null) {
    const snapshot = data.snapshot;
    if (!isRecord(snapshot)) c.error('snapshot', '保存原稿の構造が不正です。');
    else {
      if (snapshot.projectId !== project.id) c.error('snapshot.projectId', '保存原稿の公演IDが一致しません。');
      if (typeof snapshot.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshot.capturedAt) || !Number.isFinite(Date.parse(snapshot.capturedAt)) || new Date(snapshot.capturedAt).toISOString() !== snapshot.capturedAt) c.error('snapshot.capturedAt', '保存原稿の日時が不正です。');
      c.text(snapshot.report, 'snapshot.report', true);
    }
  }
  return c.issues;
}
export const metrics = (p, d) => [['資料', `${d.items.length}件`], ['未収集', `${d.items.filter(r => r.status === 'pending').length}件`], ['所在記録済み', `${d.items.filter(r => r.status === 'collected').length}件`], ['実来場者数', d.attendance === null ? '未入力' : `${d.attendance}人`], ['収支原稿', d.snapshot ? '保存あり' : '未保存']];
export const events = (p, d) => d.items.map(r => ({ title: `資料収集：${r.name}`, date: r.dueDate, status: ['collected', 'not-needed'].includes(r.status) ? 'completed' : 'planned', relatedItemId: r.id }));
export function report(p, d) {
  return [p.title, '公演アーカイブ・引継ぎ', `実来場者数：${d.attendance === null ? '未入力' : d.attendance + '人'}（販売枚数とは別）`,
    `SNS実績\n${d.socialResults || '未入力'}`, `反省点\n${d.reflection || '未入力'}`, `次回への引継ぎ\n${d.handover || '未入力'}`,
    '資料の所在記録（実ファイルの存在・バックアップは別途確認）',
    ...d.items.map(r => `${r.name} · ${categories[r.category]} · ${labels[r.status]}\n保存場所：${r.location || '未入力'}\n保管担当：${r.keeper || '未入力'}\n収集期限：${r.dueDate ?? '未設定'} · 所在記録日：${r.recordedDate ?? '未入力'}${r.notes ? '\n' + r.notes : ''}`),
    d.snapshot ? `保存した収支原稿\n保存日時（UTC）：${d.snapshot.capturedAt}\n保存時点の原稿です。現在の入力を自動反映しません。\n\n${d.snapshot.report}` : '収支原稿：未保存'].join('\n\n');
}
export const exportCSV = (p, d) => csv([['公演', '資料', '区分', '状態', '収集期限', '保存場所', '保管担当役割', '所在記録日', '備考'], ...d.items.map(r => [p.title, r.name, categories[r.category], labels[r.status], r.dueDate, r.location, r.keeper, r.recordedDate, r.notes])]);
