import { csv, safeSum } from '../../shared/common.js';
import { totals } from './model.js';
import { calculateBudget } from '../budget/calculator.js';
import { totals as ticketTotals, stageTotals } from '../tickets/model.js';
import { totals as showDayTotals } from '../show-day/model.js';
const categories = { ticket: 'チケット', goods: '物販', venue: '会場', staff: '出演・スタッフ', other: 'その他' };
const missing = module => module ? '旧形式のため集計対象外' : '未入力';
export function reportRows(project, data) {
  const actual = totals(data), rows = [];
  const add = (group, name, value, unit = '円', note = '') => rows.push([group, name, value, unit, note]);
  add('集計条件', '入力済み決算明細', data.items.length, '件', '入力のない区分は0円。決算の確定・税務帳票ではありません。');
  for (const [key, label] of [['income', '実収入'], ['expense', '経費'], ['profit', '収支'], ['received', '入金済み'], ['paid', '支払済み'], ['cash', '資金収支'], ['receivable', '未収'], ['payable', '未払']]) add('決算', label, actual[key]);
  for (const kind of ['income', 'expense']) for (const [category, label] of Object.entries(categories)) {
    const items = data.items.filter(r => r.kind === kind && r.category === category);
    if (items.length) add('区分別', `${kind === 'income' ? '収入' : '経費'}：${label}`, safeSum(items.map(r => r.amount)));
  }
  for (const row of data.items.filter(r => r.settled < r.amount)) add('未決済', `${row.kind === 'income' ? '入金' : '支払'}：${row.name}`, row.amount - row.settled, '円', `期限：${row.date ?? '未設定'}${row.notes ? '\n' + row.notes : ''}`);
  const plan = project.modules.budget ? calculateBudget(project) : null;
  if (plan) {
    add('予算', '想定販売枚数', plan.attendees, '枚');
    for (const [key, label] of [['revenue', '想定売上'], ['expenses', '想定費用'], ['profit', '想定収支']]) add('予算', label, plan[key], '円', '現在の予算と料金による想定');
    for (const [a, b, label] of [['income', 'revenue', '実収入−想定売上'], ['expense', 'expenses', '経費−想定費用'], ['profit', 'profit', '収支−想定収支']]) add('予算との差', label, BigInt(actual[a]) - BigInt(plan[b]), '円', '決算−予算。費用差は節約額ではありません。');
  } else add('予算', '比較', '未入力', '', '予算なしでは差額を集計しません。');
  const tickets = project.modules.tickets;
  if (tickets?.data?.version === 1) {
    const sales = ticketTotals(project, tickets.data);
    add('販売実績', '実績販売枚数', sales.count, '枚', '入場者数ではありません。');
    add('販売実績', '販売可能席数', sales.capacity, '席'); add('販売実績', '残席', sales.remaining, '席');
    add('販売実績', '販売率', sales.rate === null ? '—' : sales.rate.toFixed(1), sales.rate === null ? '' : '％');
    add('参考値', '現行料金によるチケット参考売上', sales.revenue, '円', '過去の実収入ではなく、決算へ加算しません。');
    if (plan) add('予算との差', '実績販売−想定販売', BigInt(sales.count) - BigInt(plan.attendees), '枚');
    for (const stage of stageTotals(project, tickets.data)) {
      const date = `${stage.date.slice(0, 10)} ${stage.date.slice(11, 16)}（日本時間）`;
      add('ステージ別', `ステージ${stage.index}・実績販売`, stage.count, '枚', date);
      add('ステージ別', `ステージ${stage.index}・残席`, stage.remaining, '席', date);
    }
  } else add('販売実績', '集計', missing(tickets), '', '入力のない販売を実績0枚とは扱いません。');
  const show = project.modules['show-day'];
  if (show?.data?.version === 1) {
    const day = showDayTotals(show.data);
    add('当日記録', '物販数量', day.quantity, '個');
    add('参考値', '当日記録の物販参考売上', day.revenue, '円', '入金確認は別途必要。決算へ加算しません。');
    add('当日記録', '未対応トラブル', day.unresolved, '件');
  } else add('当日記録', '集計', missing(show), '', '当日記録なしでは物販やトラブルを集計しません。');
  return rows;
}
export function report(project, data) {
  return [`${project.title}\n公演収支・実績レポート\n劇団：${project.companyName}\n会場：${project.venue.name}`, '入力済みデータの集計です。未確定・未入力の可能性があり、実収入と参考売上は別です。',
    ...reportRows(project, data).map(([group, name, value, unit, note]) => `${group} · ${name}：${typeof value === 'number' || typeof value === 'bigint' ? value.toLocaleString('ja-JP') : value}${unit}${note ? '\n' + note : ''}`)].join('\n\n');
}
export const reportCSV = (project, data) => csv([['公演', '区分', '項目', '値', '単位', '説明'], ...reportRows(project, data).map(row => [project.title, ...row])]);
