import { collectionEditor } from '../../shared/work-editor.js';import {timeline,exportCSV} from './model.js';
export function editor(ctx){const card=collectionEditor(ctx,{
 title:'建込・舞台進行',hint:'日時は日本時間・同日内です。同部署・同場所の時間重複は注意を表示し、並行作業を許容します。',rowTitle:'舞台作業',addLabel:'舞台作業を追加',
 newRow:()=>({name:'',date:null,startTime:'09:00',endTime:'10:00',department:'舞台',place:'',people:0,assignee:'',notes:'',status:'planned'}),
 rowFields:[{key:'name',label:'名称'},{key:'date',label:'日付',type:'date'},{key:'startTime',label:'開始時刻',type:'time'},{key:'endTime',label:'終了時刻',type:'time'},{key:'department',label:'部署'},{key:'place',label:'場所'},{key:'people',label:'必要人数',type:'number'},{key:'assignee',label:'担当役割'},{key:'notes',label:'メモ',type:'textarea'},{key:'status',label:'状態',options:[{value:'planned',label:'予定'},{value:'completed',label:'完了'},{value:'cancelled',label:'中止'}]}],export:timeline,exportLabel:'舞台進行表を書き出す',fileName:'stage-operations.txt',mime:'text/plain'
});card.append(ctx.button('舞台CSVを書き出す',()=>ctx.exportData(exportCSV,'stage-operations.csv','text/csv')));return card;}
