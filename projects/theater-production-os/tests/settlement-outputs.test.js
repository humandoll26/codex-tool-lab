import test from 'node:test';
import assert from 'node:assert/strict';
import { reportRows, report, reportCSV } from '../modules/settlement/outputs.js';
import { fixture } from './fixture.js';
import { validateDocument } from '../shared/model.js';
const data = () => ({ version: 1, items: [
  { id: 'income', name: 'チケット実収入', kind: 'income', category: 'ticket', amount: 150000, settled: 100000, date: '2026-12-01', notes: '架空の明細' },
  { id: 'expense', name: '会場費', kind: 'expense', category: 'venue', amount: 100000, settled: 50000, date: '2026-12-02', notes: '' }
] });
function project() {
  const p = fixture().project;
  p.modules.tickets = { data: { version: 1, sales: [{ stageId: 'stage-1', priceCategoryId: 'general', quantity: 35 }, { stageId: 'stage-2', priceCategoryId: 'general', quantity: 20 }] } };
  p.modules['show-day'] = { data: { version: 1, items: [{ category: 'goods', quantity: 10, price: 500 }, { category: 'trouble', status: 'pending', quantity: 0, price: 0 }] } };
  p.modules['front-desk'] = { data: { version: 1, changeFund: 10000, items: [] } };
  return p;
}
const value = (rows, group, name) => rows.find(r => r[0] === group && r[1] === name)?.[2];
test('REPORT-01: actual profit, cash, outstanding amounts and category totals exclude references and float', () => {
  const p = project(), d = data(), before = JSON.stringify(p), rows = reportRows(p, d);
  for (const [name, expected] of [['実収入', 150000], ['経費', 100000], ['収支', 50000], ['資金収支', 50000], ['未収', 50000], ['未払', 50000]]) assert.equal(value(rows, '決算', name), expected);
  assert.equal(value(rows, '区分別', '収入：チケット'), 150000);
  assert.equal(value(rows, '未決済', '支払：会場費'), 50000);
  assert.equal(value(rows, '参考値', '現行料金によるチケット参考売上'), 165000);
  assert.equal(value(rows, '参考値', '当日記録の物販参考売上'), 5000);
  assert.equal(value(rows, '当日記録', '未対応トラブル'), 1);
  assert.equal(JSON.stringify(p), before);
});
test('REPORT-02: plan differences and per-stage sales follow current prices without rewriting actual income', () => {
  const p = project(), d = data();
  let rows = reportRows(p, d);
  assert.equal(value(rows, '予算', '想定売上'), 480000);
  assert.equal(value(rows, '予算との差', '実収入−想定売上'), -330000n);
  assert.equal(value(rows, '予算との差', '経費−想定費用'), -80000n);
  assert.equal(value(rows, '予算との差', '収支−想定収支'), -250000n);
  assert.equal(value(rows, '予算との差', '実績販売−想定販売'), -105n);
  assert.equal(value(rows, 'ステージ別', 'ステージ1・実績販売'), 35);
  assert.equal(value(rows, 'ステージ別', 'ステージ2・残席'), 80);
  p.ticket.priceCategories[0].price = 4000; rows = reportRows(p, d);
  assert.equal(value(rows, '決算', '実収入'), 150000);
  assert.equal(value(rows, '予算', '想定売上'), 640000);
  assert.equal(value(rows, '参考値', '現行料金によるチケット参考売上'), 220000);
});
test('REPORT-03: missing and legacy modules stay distinct from recorded zero and zero seats have no NaN', () => {
  const p = fixture().project; delete p.modules.budget;
  let out = report(p, { version: 1, items: [] });
  assert.ok(out.includes('入力済み決算明細：0件')); assert.ok(out.includes('販売実績 · 集計：未入力')); assert.ok(out.includes('予算 · 比較：未入力'));
  p.modules.tickets = { data: { legacy: true } }; p.modules['show-day'] = { data: { version: 0 } };
  out = report(p, data()); assert.ok(out.includes('旧形式のため集計対象外')); assert.equal(out.includes('実績販売枚数：0'), false);
  p.modules.tickets.data = { version: 1, sales: [] }; p.performanceDates.forEach(s => s.capacity = 0);
  out = report(p, data()); assert.ok(out.includes('販売率：—')); assert.ok(out.includes('実績販売枚数：0枚')); assert.equal(/NaN|Infinity/.test(out), false);
});
test('REPORT-03: profit differences larger than safe integers remain exact and numeric in CSV', () => {
  const doc = fixture(), p = doc.project, max = Number.MAX_SAFE_INTEGER;
  p.ticket.priceCategories[0].price = 0; p.modules.budget.data.plannedSales = []; p.modules.budget.data.fixedCosts[0].amount = max;
  const d = { version: 1, items: [{ ...data().items[0], amount: max, settled: max }] };
  p.modules.settlement = { id: 'settlement', status: 'in-progress', startDate: null, dueDate: null, progress: 0, alerts: [], data: d };
  assert.deepEqual(validateDocument(doc), []);
  assert.equal(value(reportRows(p, d), '予算との差', '収支−想定収支'), 18014398509481982n);
  assert.ok(reportCSV(p, d).includes('"18014398509481982"'));
  const loss = { version: 1, items: [{ ...data().items[1], amount: 500000, settled: 0 }] };
  assert.equal(value(reportRows(p, loss), '決算', '収支'), -500000); assert.ok(reportCSV(p, loss).includes('"-500000"'));
});
test('REPORT-05: formula-like and multiline user values are preserved safely in CSV and text', () => {
  const p = project(); p.title = '=NOW()'; const d = data(); d.items[0].name = '=HYPERLINK()'; d.items[0].notes = '<script>x</script>\n"quoted",value';
  const csv = reportCSV(p, d); assert.ok(csv.includes('"\'=NOW()"')); assert.ok(csv.includes('""quoted""')); assert.ok(csv.includes('"-330000"'));
  assert.ok(report(p, d).includes('<script>x</script>')); assert.ok(csv.includes('入金：=HYPERLINK()'));
});
