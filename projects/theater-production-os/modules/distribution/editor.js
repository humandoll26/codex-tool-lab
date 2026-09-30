import { collectionEditor } from '../../shared/work-editor.js';
import { exportCSV } from './model.js';
export const editor = ctx => collectionEditor(ctx, {
  title: 'チラシ配布', hint: '配布先の団体名と担当ラベルで管理します。個人の住所・連絡先は入力しないでください。',
  fields: [{ key: 'printed', label: '印刷総部数', type: 'number' }], rowTitle: '配布先', addLabel: '配布先を追加',
  newRow: () => ({ name: '', assignee: '', method: 'hand', date: null, planned: 0, shipped: 0, status: 'uncontacted' }),
  rowFields: [{ key: 'name', label: '名称' }, { key: 'assignee', label: '担当ラベル' }, { key: 'date', label: '予定日', type: 'date' },
    { key: 'method', label: '配布方法', options: [{ value: 'hand', label: '手渡し' }, { value: 'mail', label: '発送' }, { value: 'insert', label: '折込' }] },
    { key: 'planned', label: '予定部数', type: 'number' }, { key: 'shipped', label: '配布済み部数', type: 'number' },
    { key: 'status', label: '連絡状態', options: [{ value: 'uncontacted', label: '未連絡' }, { value: 'contacted', label: '連絡中' }, { value: 'confirmed', label: '確認済み' }] }],
  export: (p, d) => exportCSV(d), exportLabel: '配布CSVを書き出す', fileName: 'distribution.csv', mime: 'text/csv'
});
