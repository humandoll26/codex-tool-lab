import { collectionEditor } from '../../shared/work-editor.js';
import { exportCSV } from './model.js';
export const editor = ctx => collectionEditor(ctx, {
  title: '交通・宿泊・ケータリング', hint: '対象は役割ラベルで記録してください。個人の連絡先・パスポート・健康情報は入力しないでください。総額は手入力です。チェックアウト日は宿泊の予定に使います。取消後も支払記録は残ります。決算への転記は自分で確認して行ってください。',
  rowTitle: '手配', addLabel: '手配を追加',
  newRow: () => ({ name: '', kind: 'transport', roles: '', people: 1, method: '', location: '', date: null, endDate: null, meals: '', status: 'planning', amount: 0, paid: 0, paymentDue: null, paidDate: null, notes: '' }),
  rowFields: [{key:'name',label:'名称'}, {key:'kind',label:'種別',options:[{value:'transport',label:'交通'},{value:'lodging',label:'宿泊'},{value:'meals',label:'食事・ケータリング'}]},
    {key:'roles',label:'対象役割'}, {key:'people',label:'人数',type:'number'}, {key:'method',label:'移動手段'}, {key:'location',label:'滞在先・場所'},
    {key:'date',label:'利用日',type:'date'}, {key:'endDate',label:'チェックアウト日（宿泊）',type:'date'}, {key:'meals',label:'食事内容'},
    {key:'status',label:'状態',options:[{value:'planning',label:'検討中'},{value:'booked',label:'手配済み'},{value:'completed',label:'利用完了'},{value:'cancelled',label:'取消'}]},
    {key:'amount',label:'総額（円）',type:'number'}, {key:'paid',label:'支払済み額（円）',type:'number'}, {key:'paymentDue',label:'支払予定日',type:'date'}, {key:'paidDate',label:'支払日',type:'date'}, {key:'notes',label:'備考',type:'textarea'}],
  export: exportCSV, exportLabel: '交通・宿泊・食事CSVを書き出す', fileName: 'travel.csv', mime: 'text/csv'
});
