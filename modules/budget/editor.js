import { newId, STATUSES, STATUS_LABELS } from '../../shared/model.js';

export function createBudgetEditor({ document, el, field, button, mutate, getBudget, editBudget, paths, yen, fields, update }) {
  const p = document.project, b = getBudget();
  const card = el('section', { className: 'card', 'aria-label': '予算の入力' }, el('h2', {}, '予算の入力'));
  card.append(el('p', { className: 'hint' }, 'ここで入力する枚数は想定販売です。実績販売・予約者情報は扱いません。金額は税込総額の円です。'));
  card.append(field('予算モジュールの状態', 'project.modules.budget.status', b.status, v => editBudget(m => m.status = v),
    { options: STATUSES.map((value, i) => ({ value, label: STATUS_LABELS[i] })) }));
  card.append(el('h3', {}, '固定費の明細'));
  if (!b.data.fixedCosts.length) card.append(el('p', { className: 'hint' }, '固定費は未登録（0円）。会場費や制作費を追加してください。'));
  b.data.fixedCosts.forEach((cost, i) => {
    const row = el('div', { className: 'row', id: `item-${cost.id}` });
    row.append(el('div', { className: 'row-fields' },
      field(`固定費${i + 1}の名称`, `${paths.budget}.fixedCosts.${i}.name`, cost.name, v => editBudget(m => m.data.fixedCosts[i].name = v)),
      field(`固定費${i + 1}の金額（円）`, `${paths.budget}.fixedCosts.${i}.amount`, cost.amount, v => editBudget(m => m.data.fixedCosts[i].amount = v), { type: 'number' })));
    row.append(button(`固定費${i + 1}を削除`, () => mutate(() => editBudget(m => m.data.fixedCosts.splice(i, 1))), 'danger'));
    card.append(row);
  });
  card.append(button('固定費を追加', () => mutate(() => editBudget(m => m.data.fixedCosts.push({ id: newId('cost'), name: '', amount: 0 })))));
  card.append(field('来場者1人当たりの変動費（円）', `${paths.budget}.variableCostPerAttendee`, b.data.variableCostPerAttendee,
    v => editBudget(m => m.data.variableCostPerAttendee = v), { type: 'number' }));
  card.append(el('h3', {}, 'ステージ・料金別の想定販売枚数'));
  const existing = new Map(b.data.plannedSales.map((s, i) => [JSON.stringify([s.stageId, s.priceCategoryId]), i]));
  if (!p.performanceDates.length || !p.ticket.priceCategories.length) card.append(el('p', { className: 'hint' }, '公演情報にステージと料金区分を追加してください。'));
  for (const [stageIndex, stage] of p.performanceDates.entries()) {
    const row = el('div', { className: 'row' }, el('h3', {}, `ステージ${stageIndex + 1} · ${stage.startsAt ? stage.startsAt.slice(0, 16).replace('T', ' ') : '日時未入力'}`));
    for (const price of p.ticket.priceCategories) {
      const index = existing.get(JSON.stringify([stage.id, price.id]));
      const path = index === undefined ? `sales.${stage.id}.${price.id}` : `${paths.budget}.plannedSales.${index}.quantity`;
      const label = `ステージ${stageIndex + 1}・${price.name || '名称未入力'}の想定販売枚数`;
      const control = field(label, path, index === undefined ? 0 : b.data.plannedSales[index].quantity, value => editBudget(m => {
        const sale = m.data.plannedSales.find(s => s.stageId === stage.id && s.priceCategoryId === price.id);
        if (sale) sale.quantity = value;
        else m.data.plannedSales.push({ stageId: stage.id, priceCategoryId: price.id, quantity: value });
      }), { type: 'number' });
      if (index === undefined) {
        // Rebind the field path after the first edit, without replacing a focused input.
        const item = fields.get(path);
        item.control.addEventListener('input', () => {
          const i = getBudget().data.plannedSales.findIndex(s => s.stageId === stage.id && s.priceCategoryId === price.id);
          fields.delete(path); fields.set(`${paths.budget}.plannedSales.${i}.quantity`, item); update(false);
        });
      }
      row.append(control);
    }
    card.append(row);
  }
  const stageIds = new Set(p.performanceDates.map(s => s.id)), priceIds = new Set(p.ticket.priceCategories.map(c => c.id));
  b.data.plannedSales.forEach((sale, i) => {
    if (!stageIds.has(sale.stageId) || !priceIds.has(sale.priceCategoryId)) card.append(el('div', { className: 'notice error' },
      el('p', {}, `参照先のない販売行：${sale.stageId} / ${sale.priceCategoryId} · ${sale.quantity}枚`),
      button('参照先のない販売行を削除', () => mutate(() => editBudget(m => m.data.plannedSales.splice(i, 1))), 'danger')));
  });
  card.append(field('損益分岐用の基準料金', `${paths.budget}.referencePriceCategoryId`, b.data.referencePriceCategoryId,
    v => editBudget(m => m.data.referencePriceCategoryId = v),
    { options: p.ticket.priceCategories.map(c => ({ value: c.id, label: `${c.name} · ${yen(typeof c.price === 'number' ? c.price : 0)}` })) }));
  card.append(el('p', { className: 'hint' }, '全員がこの基準料金で購入する場合の参考人数です。複数料金の販売構成では実際の損益分岐が変わります。販売予測ではありません。'));
  return card;
}
