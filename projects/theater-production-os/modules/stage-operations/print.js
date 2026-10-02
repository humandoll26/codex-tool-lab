import { printHeader, printTable } from '../../shared/print-view.js';
import { ordered, warnings } from './model.js';
const statuses = { planned: '予定', completed: '完了', cancelled: '取消' };
export function printDocument(project, data, el) {
  const notices = warnings(project, data);
  return [printHeader(el, project, '舞台進行表'),
    el('h2', {}, '作業タイムスケジュール'),
    printTable(el, ['日付・開始〜終了', '作業・部署', '場所', '人数・担当役割', '状態', 'メモ'], ordered(data).map(row => [
      `${row.date}\n${row.startTime}〜${row.endTime}`, `${row.name}\n${row.department}`, row.place || '未定', `${row.people}人\n${row.assignee || '未定'}`, statuses[row.status], row.notes
    ]), '舞台作業は未登録です。'),
    ...(notices.length ? [el('h2', {}, '時間重複の注意'), el('ul', {}, notices.map(notice => el('li', {}, notice))), ...(notices.length === 100 ? [el('p', {}, '重複注意は先頭100件を表示しています。作業を整理して再確認してください。')] : [])] : []),
    el('p', { className: 'hint' }, '完了・取消の作業も含みます。並行作業の可否は担当者が確認してください。')];
}
