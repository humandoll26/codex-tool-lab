import { collectionEditor } from '../../shared/work-editor.js';
import { publicationText } from './model.js';
export const editor = ctx => collectionEditor(ctx, {
  title: 'チラシ掲載情報', hint: '公演名・会場・日時・料金は公演情報を参照します。入力は文字原稿です。画像組版には対応していません。',
  fields: [{ key: 'introduction', label: '公演紹介文', type: 'textarea' }, { key: 'contactText', label: '問い合わせ案内' },
    { key: 'officialUrl', label: '公式URL', type: 'url' }, { key: 'printDate', label: '入稿予定日', type: 'date' }, { key: 'deliveryDate', label: '納品予定日', type: 'date' }],
  rowTitle: '原稿', addLabel: '原稿項目を追加', newRow: () => ({ name: '', text: '', status: 'draft' }),
  rowFields: [{ key: 'name', label: '項目名' }, { key: 'text', label: '本文', type: 'textarea' },
    { key: 'status', label: '校正状態', options: [{ value: 'draft', label: '下書き' }, { value: 'review', label: '校正中' }, { value: 'approved', label: '校了' }] }],
  export: publicationText, exportLabel: '掲載情報を書き出す', fileName: 'flyer.txt', mime: 'text/plain'
});
