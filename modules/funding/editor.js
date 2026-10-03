import { collectionEditor } from '../../shared/work-editor.js';
import { exportCSV } from './model.js';
export const editor = ctx => collectionEditor(ctx, {
  title: '助成金・協賛・広告', hint: '団体名で記録し、担当者の個人情報は入力しないでください。申請・報告は助成金、広告枠・入稿は広告の案件で使います。採択・確定額と実際の入金額を区別し、取消後も入金記録は残ります。決算への転記は自分で確認して行ってください。',
  rowTitle: '案件', addLabel: '案件を追加',
  newRow: () => ({ name: '', kind: 'grant', organization: '', status: 'candidate', amount: 0, received: 0, receivedDate: null, paymentDue: null,
    applicationDue: null, reportDue: null, reportStatus: 'pending', reportDate: null, adSlot: '', materialDue: null, materialStatus: 'pending', materialDate: null, notes: '' }),
  rowFields: [{ key: 'name', label: '名称' }, { key: 'kind', label: '種別', options: [{value:'grant',label:'助成金'},{value:'sponsorship',label:'協賛'},{value:'advertisement',label:'広告'}] },
    { key: 'organization', label: '団体名' }, { key: 'status', label: '状態', options: [{value:'candidate',label:'候補'},{value:'preparing',label:'準備中'},{value:'applied',label:'申請・確認中'},{value:'confirmed',label:'採択・確定'},{value:'rejected',label:'不採択・辞退'},{value:'cancelled',label:'取消'}] },
    { key: 'amount', label: '採択・確定額（円）', type: 'number' }, { key: 'received', label: '入金済み額（円）', type: 'number' },
    { key: 'receivedDate', label: '入金日', type: 'date' }, { key: 'paymentDue', label: '入金予定日', type: 'date' },
    { key: 'applicationDue', label: '申請締切（助成金）', type: 'date' }, { key: 'reportDue', label: '報告期限（助成金）', type: 'date' },
    { key: 'reportStatus', label: '報告状態', options: [{value:'pending',label:'未提出'},{value:'submitted',label:'提出済み'},{value:'not-needed',label:'不要'}] }, { key: 'reportDate', label: '報告提出日', type: 'date' },
    { key: 'adSlot', label: '広告枠（広告）' }, { key: 'materialDue', label: '入稿期限（広告）', type: 'date' },
    { key: 'materialStatus', label: '入稿状態', options: [{value:'pending',label:'未受領'},{value:'received',label:'受領済み'},{value:'not-needed',label:'不要'}] }, { key: 'materialDate', label: '入稿受領日', type: 'date' },
    { key: 'notes', label: '備考', type: 'textarea' }],
  export: exportCSV, exportLabel: '助成・協賛・広告CSVを書き出す', fileName: 'funding.csv', mime: 'text/csv'
});
