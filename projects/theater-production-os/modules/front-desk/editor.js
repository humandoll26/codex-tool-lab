import { collectionEditor } from '../../shared/work-editor.js';
import { announcement, exportCSV } from './model.js';
import { printDocument } from './print.js';
export function editor(ctx){const card=collectionEditor(ctx,{
 title:'受付準備',hint:'担当は役割ラベルで管理します。釣銭元手は費用や売上とは別です。予約者の個人情報は入力しないでください。',
 fields:[{key:'changeFund',label:'釣銭元手（円）',type:'number'},{key:'guidance',label:'当日案内文',type:'textarea'}],rowTitle:'受付作業',addLabel:'受付作業を追加',
 newRow:()=>({name:'',category:'supplies',assignee:'',date:null,needed:1,ready:0,status:'pending',notes:''}),
 rowFields:[{key:'name',label:'名称'},{key:'category',label:'区分',options:[{value:'staff',label:'配置'},{value:'sign',label:'掲示'},{value:'tickets',label:'当日券'},{value:'cash',label:'釣銭'},{value:'supplies',label:'備品'},{value:'guidance',label:'場内案内'}]}, {key:'assignee',label:'担当役割'},{key:'date',label:'期限',type:'date'},{key:'needed',label:'必要数',type:'number'},{key:'ready',label:'準備済み数',type:'number'},{key:'status',label:'状態',options:[{value:'pending',label:'未着手'},{value:'preparing',label:'準備中'},{value:'completed',label:'完了'},{value:'not-needed',label:'不要'}]},{key:'notes',label:'メモ',type:'textarea'}],
 export:exportCSV,exportLabel:'受付CSVを書き出す',fileName:'front-desk.csv',mime:'text/csv'
});card.append(ctx.button('当日案内文を書き出す',()=>ctx.exportData(announcement,'front-desk.txt','text/plain')), ctx.button('受付資料の印刷用プレビュー', () => ctx.previewPrint(printDocument)));return card;}
