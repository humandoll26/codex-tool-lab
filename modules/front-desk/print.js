import { printHeader, printTable } from '../../shared/print-view.js';
const categories = { staff: '配置', sign: '掲示', tickets: '当日券', cash: '釣銭', supplies: '備品', guidance: '場内案内' };
const statuses = { pending: '未着手', preparing: '準備中', completed: '完了', 'not-needed': '不要' };
export function printDocument(project, data, el) {
  return [printHeader(el, project, '受付用資料'),
    el('h2', {}, '公演日時・料金'),
    printTable(el, ['ステージ', '日時（日本時間）', '販売可能席数'], project.performanceDates.map((stage, i) => [i + 1, stage.startsAt.slice(0, 16).replace('T', ' '), stage.capacity])),
    printTable(el, ['料金区分', '料金（税込）'], project.ticket.priceCategories.map(price => [price.name, `${price.price.toLocaleString('ja-JP')}円`])),
    el('h2', {}, '受付の案内'), el('p', {}, `釣銭元手：${data.changeFund.toLocaleString('ja-JP')}円（費用・売上とは別）`),
    el('p', { className: 'print-text' }, data.guidance || '案内文は未入力です。'),
    el('h2', {}, '受付準備一覧'),
    printTable(el, ['作業・区分', '担当役割・期限', '準備数 / 必要数', '状態', 'メモ'],
      data.items.map(row => [`${row.name}\n${categories[row.category]}`, `${row.assignee || '未定'}\n${row.date ?? '期限未設定'}`, `${row.ready} / ${row.needed}`, statuses[row.status], row.notes]), '受付作業は未登録です。')];
}
