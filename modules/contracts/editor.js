import { collectionEditor } from '../../shared/work-editor.js';
import { exportCSV } from './model.js';
export const editor = ctx => collectionEditor(ctx, {
  title: '契約・支払い', hint: '担当は役割ラベルで記録してください。金額は手入力の税込総額です。決算には自動転記しません。請求書の保管・決済・税務計算は行いません。取消後も支払済み記録は残ります。',
  rowTitle: '契約', addLabel: '契約を追加',
  newRow: () => ({ name: '', role: '', status: 'draft', amount: 0, invoiceStatus: 'pending', invoiceDate: null, paymentDue: null, paymentStatus: 'pending', paidDate: null, notes: '' }),
  rowFields: [{ key: 'name', label: '名称' }, { key: 'role', label: '担当役割' },
    { key: 'status', label: '契約状態', options: [{value:'draft',label:'準備中'},{value:'sent',label:'確認依頼中'},{value:'agreed',label:'合意済み'},{value:'cancelled',label:'取消'}] },
    { key: 'amount', label: '金額（円）', type: 'number' },
    { key: 'invoiceStatus', label: '請求書状態', options: [{value:'pending',label:'未受領'},{value:'received',label:'受領済み'},{value:'not-needed',label:'不要'}] },
    { key: 'invoiceDate', label: '請求書受領日', type: 'date' }, { key: 'paymentDue', label: '支払予定日', type: 'date' },
    { key: 'paymentStatus', label: '支払状態', options: [{value:'pending',label:'未払'},{value:'paid',label:'支払済み'}] },
    { key: 'paidDate', label: '支払日', type: 'date' }, { key: 'notes', label: '備考', type: 'textarea' }],
  export: exportCSV, exportLabel: '契約CSVを書き出す', fileName: 'contracts.csv', mime: 'text/csv'
});
