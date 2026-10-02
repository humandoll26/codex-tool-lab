import { collectionEditor } from '../../shared/work-editor.js';
import { exportCSV } from './model.js';
export const editor=ctx=>collectionEditor(ctx,{
 title:'決算・入出金',hint:'確認した実収入と経費を入力します。現在価格による参考売上は自動転記しません。釣銭元手・税務計算は含めません。',rowTitle:'決算明細',addLabel:'決算明細を追加',
 newRow:()=>({name:'',kind:'expense',category:'other',amount:0,settled:0,date:null,notes:''}),
 rowFields:[{key:'name',label:'名称'},{key:'kind',label:'収入／支出',options:[{value:'income',label:'収入'},{value:'expense',label:'支出'}]},{key:'category',label:'区分',options:[{value:'ticket',label:'チケット'},{value:'goods',label:'物販'},{value:'venue',label:'会場'},{value:'staff',label:'出演・スタッフ費'},{value:'other',label:'その他'}]}, {key:'amount',label:'金額（円）',type:'number'},{key:'settled',label:'入出金済み額（円）',type:'number'},{key:'date',label:'期限',type:'date'},{key:'notes',label:'メモ',type:'textarea'}],
 export:exportCSV,exportLabel:'決算CSVを書き出す',fileName:'settlement.csv',mime:'text/csv'
});
