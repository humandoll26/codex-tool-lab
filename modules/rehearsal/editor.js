import { collectionEditor } from '../../shared/work-editor.js';
import { announcement, exportCSV, recordSchedule } from './model.js';
export function editor(ctx) {
  const card = collectionEditor(ctx, {
    title: '稽古・連絡調整', hint: '日時は日本時間・同日内です。参加者は役割ラベルで管理し、個人の連絡先は入力しないでください。',
    rowTitle: '稽古', addLabel: '稽古を追加',
    newRow: () => ({ name: '', date: null, startTime: '13:00', endTime: '17:00', venue: '', participants: '', attendance: '', staff: '', notes: '', message: '', status: 'planned', history: [] }),
    rowFields: [{ key: 'name', label: '名称' }, { key: 'date', label: '日付', type: 'date' }, { key: 'startTime', label: '開始時刻', type: 'time' }, { key: 'endTime', label: '終了時刻', type: 'time' },
      { key: 'venue', label: '稽古場' }, { key: 'participants', label: '参加役割', type: 'textarea' }, { key: 'attendance', label: '欠席・遅刻メモ', type: 'textarea' },
      { key: 'staff', label: '必要スタッフ' }, { key: 'notes', label: '稽古内容', type: 'textarea' }, { key: 'message', label: '連絡事項', type: 'textarea' },
      { key: 'status', label: '状態', options: [{ value: 'planned', label: '予定' }, { value: 'completed', label: '完了' }, { value: 'cancelled', label: '中止' }] }],
    export: announcement, exportLabel: '全体連絡文を書き出す', fileName: 'rehearsal.txt', mime: 'text/plain',
    rowExtras: (row, i) => [
      ctx.button(`稽古${i + 1}の予定変更を記録`, () => {
        let changed;
        try { changed = recordSchedule(structuredClone(row)); } catch (error) { ctx.notify(error.message, 'error'); return; }
        if (!changed) { ctx.notify('同じ日時・場所は記録済みです。'); return; }
        ctx.mutate(() => ctx.edit(data => recordSchedule(data.items[i])));
      }),
      ctx.el('p', { className: 'hint' }, '日時・場所の変更後に記録ボタンを押してください。最初の記録が比較の基準になります。'),
      ctx.el('ol', { 'aria-label': `稽古${i + 1}の変更履歴` }, row.history.map(h => ctx.el('li', {}, `${h.date} ${h.startTime}〜${h.endTime} · ${h.venue || '未定'}（記録：${h.recordedAt}）`)))
    ]
  });
  card.append(ctx.button('稽古CSVを書き出す', () => ctx.exportData(exportCSV, 'rehearsal.csv', 'text/csv')));
  return card;
}
