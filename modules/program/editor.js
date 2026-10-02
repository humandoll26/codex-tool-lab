import { collectionEditor } from '../../shared/work-editor.js';import { exportCSV,publicationText } from './model.js';
export function editor(ctx){const card=collectionEditor(ctx,{
 title:'パンフレット原稿',hint:'文字原稿を集めて校正します。受領・校正・校了には本文が必要です。個人の連絡先を入力せず、担当役割で管理します。',fields:[{key:'printDate',label:'パンフ入稿予定日',type:'date'}],rowTitle:'パンフ原稿',addLabel:'パンフ原稿を追加',
 newRow:()=>({name:'',category:'structure',assignee:'',date:null,text:'',status:'pending'}),
 rowFields:[{key:'name',label:'名称'},{key:'category',label:'種別',options:[{value:'structure',label:'構成'},{value:'contribution',label:'寄稿'},{value:'profile',label:'プロフィール'},{value:'advertisement',label:'広告'}]},{key:'assignee',label:'担当役割'},{key:'date',label:'原稿期限',type:'date'},{key:'text',label:'本文',type:'textarea'},{key:'status',label:'状態',options:[{value:'pending',label:'未依頼'},{value:'requested',label:'依頼済み'},{value:'received',label:'受領'},{value:'review',label:'校正中'},{value:'approved',label:'校了'}]}],export:publicationText,exportLabel:'パンフ掲載文を書き出す',fileName:'program.txt',mime:'text/plain'
});card.append(ctx.button('パンフCSVを書き出す',()=>ctx.exportData(exportCSV,'program.csv','text/csv')));return card;}
