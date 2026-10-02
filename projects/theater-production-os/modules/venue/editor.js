import {collectionEditor} from '../../shared/work-editor.js';import {exportCSV} from './model.js';
export const editor=ctx=>collectionEditor(ctx,{
 title:'劇場・日程候補',hint:'選択した会場名だけを公演情報へ反映できます。ステージ日時や費用は自動変更しません。連絡先は役割ラベルで記録します。',rowTitle:'会場候補',addLabel:'会場候補を追加',
 newRow:()=>({name:'',date:null,status:'candidate',holdUntil:null,fee:0,paid:0,paymentDue:null,loadIn:'',loadOut:'',contact:'',notes:''}),
 rowFields:[{key:'name',label:'名称'},{key:'date',label:'候補日',type:'date'},{key:'status',label:'予約状態',options:[{value:'candidate',label:'候補'},{value:'held',label:'仮押さえ'},{value:'booked',label:'本予約'},{value:'cancelled',label:'取消'}]},{key:'holdUntil',label:'仮押さえ期限',type:'date'},{key:'fee',label:'利用料（円）',type:'number'},{key:'paid',label:'支払済み額（円）',type:'number'},{key:'paymentDue',label:'支払期限',type:'date'},{key:'loadIn',label:'搬入時刻',type:'time'},{key:'loadOut',label:'搬出時刻',type:'time'},{key:'contact',label:'連絡担当ラベル'},{key:'notes',label:'メモ',type:'textarea'}],
 rowExtras:(r,i)=>[ctx.button(`会場候補${i+1}の名称を公演情報へ反映`,()=>{if(!r.name.trim()){ctx.notify('会場名を入力してください。','error');return;}ctx.mutate(()=>ctx.project.venue.name=r.name);})],export:exportCSV,exportLabel:'会場CSVを書き出す',fileName:'venue.csv',mime:'text/csv'
});
