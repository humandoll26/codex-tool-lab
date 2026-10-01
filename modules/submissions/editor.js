import { collectionEditor } from '../../shared/work-editor.js';
import { exportCSV } from './model.js';
export const editor = ctx => collectionEditor(ctx, {
  title: '申請・劇場提出物', hint: '提出先と担当は団体名・役割ラベルで管理します。書類の添付・送信は行いません。提出済みには提出日を入力してください。',
  rowTitle: '提出物', addLabel: '提出物を追加',
  newRow: () => ({ name: '', recipient: '', category: 'theater', assignee: '', dueDate: null, status: 'pending', submittedDate: null, notes: '' }),
  rowFields: [{ key: 'name', label: '名称' }, { key: 'recipient', label: '提出先' }, { key: 'category', label: '種別', options: [{ value: 'theater', label: '劇場書類' }, { value: 'fire', label: '消防等の申請' }, { value: 'schedule', label: '図面・進行表' }, { value: 'other', label: 'その他' }] },
    { key: 'assignee', label: '担当ラベル' }, { key: 'dueDate', label: '期限', type: 'date' },
    { key: 'status', label: '状態', options: [{ value: 'pending', label: '未着手' }, { value: 'preparing', label: '準備中' }, { value: 'submitted', label: '提出済み' }, { value: 'returned', label: '差戻し' }] },
    { key: 'submittedDate', label: '提出日', type: 'date' }, { key: 'notes', label: '備考', type: 'textarea' }],
  export: exportCSV, exportLabel: '提出物CSVを書き出す', fileName: 'submissions.csv', mime: 'text/csv'
});
