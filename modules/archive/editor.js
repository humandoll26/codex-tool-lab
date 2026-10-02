import { collectionEditor } from '../../shared/work-editor.js';
import { validateDocument } from '../../shared/model.js';
import { report, exportCSV } from './model.js';
import { report as settlementReport } from '../settlement/outputs.js';
export function editor(ctx) {
  const { data, el, field, button, edit, mutate, notify } = ctx;
  const card = collectionEditor(ctx, {
    title: '資料の所在・引継ぎ', hint: '完成資料の保存場所と引継ぎを記録します。実ファイルは保存しません。URLは文字として保持し、自動でアクセスしません。',
    fields: [{ key: 'socialResults', label: 'SNS実績メモ', type: 'textarea' }, { key: 'reflection', label: '公演の反省点', type: 'textarea' }, { key: 'handover', label: '次回への引継ぎ', type: 'textarea' }],
    rowTitle: '資料', addLabel: '資料を追加', newRow: () => ({ name: '', category: 'other', status: 'pending', dueDate: null, location: '', keeper: '', recordedDate: null, notes: '' }),
    rowFields: [{ key: 'name', label: '名称' }, { key: 'category', label: '区分', options: [['flyer', 'チラシ'], ['program', 'パンフ'], ['photo', '写真'], ['video', '映像'], ['script', '脚本'], ['finance', '収支'], ['other', 'その他']].map(([value, label]) => ({ value, label })) },
      { key: 'status', label: '状態', options: [{ value: 'pending', label: '未収集' }, { value: 'collected', label: '所在記録済み' }, { value: 'not-needed', label: '不要' }] },
      { key: 'dueDate', label: '収集期限', type: 'date' }, { key: 'location', label: '保存場所' }, { key: 'keeper', label: '保管担当役割' }, { key: 'recordedDate', label: '所在記録日', type: 'date' }, { key: 'notes', label: '備考', type: 'textarea' }],
    export: exportCSV, exportLabel: '資料一覧CSVを書き出す', fileName: 'archive.csv', mime: 'text/csv'
  });
  card.insertBefore(field('実来場者数（未入力は空欄）', 'project.modules.archive.data.attendance', data.attendance, value => edit(d => d.attendance = value === '' ? null : value), { type: 'number' }), card.children[2] ?? null);
  card.append(button('アーカイブ原稿を書き出す', () => ctx.exportData(report, 'archive.txt', 'text/plain')),
    el('h3', {}, '収支原稿を保存する'), el('p', { className: 'hint' }, '現在の決算・販売・予算から生成した原稿を保存します。以後の変更は自動反映しません。'));
  if (data.snapshot) card.append(el('p', {}, `保存日時（UTC）：${data.snapshot.capturedAt ?? '不正な日時'}`));
  card.append(button('現在の収支原稿をアーカイブに保存', () => {
    if (validateDocument({ schemaVersion: 1, project: ctx.project }).length) { ctx.update(); notify('入力エラーを修正してから収支原稿を保存してください。', 'error'); return; }
    const settlement = ctx.project.modules.settlement?.data;
    if (settlement?.version !== 1 || !settlement.items.length) { notify('先に決算で実収入・経費の明細を入力してください。', 'error'); return; }
    const source = settlementReport(ctx.project, settlement), current = ctx.getData().snapshot;
    if (current?.report === source) { notify('同じ収支原稿は保存済みです。'); return; }
    if (current && !confirm('保存済みの収支原稿を現在の原稿で置き換えますか？必要なら先にJSONを書き出してください。')) return;
    mutate(() => edit(d => d.snapshot = { projectId: ctx.project.id, capturedAt: new Date().toISOString(), report: source }));
    notify('現在の収支原稿をアーカイブに保存しました。');
  }));
  if (data.snapshot !== null) card.append(button('保存した収支原稿を削除', () => {
    if (confirm('アーカイブの収支原稿だけを削除しますか？決算の入力は保持します。')) mutate(() => edit(d => d.snapshot = null));
  }, 'danger'));
  return card;
}
