import { collectionEditor } from '../../shared/work-editor.js';
import { exportCSV } from './model.js';
export const editor = ctx => collectionEditor(ctx, {
  title: 'SNS・告知計画', hint: '原稿をまとめて予定を管理します。SNSへの投稿は各サービスで手動で行ってください。',
  rowTitle: '投稿', addLabel: '投稿を追加', newRow: () => ({ title: '', channel: 'SNS', date: null, text: '', materials: '', status: 'draft' }),
  rowFields: [{ key: 'title', label: '題名' }, { key: 'channel', label: '媒体' }, { key: 'date', label: '予定日', type: 'date' },
    { key: 'text', label: '原稿', type: 'textarea' }, { key: 'materials', label: '素材メモ', type: 'textarea' },
    { key: 'status', label: '公開状態', options: [{ value: 'draft', label: '下書き' }, { value: 'approved', label: '確認済み' }, { value: 'published', label: '公開済み' }] }],
  rowExport: true, export: (p, d) => exportCSV(d), exportLabel: '投稿計画CSVを書き出す', fileName: 'publicity.csv', mime: 'text/csv'
});
