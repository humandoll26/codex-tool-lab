export function editor(ctx) {
  const { project, data, el, field, button, mutate, edit, fields, update } = ctx;
  const base = 'project.modules.tickets.data';
  const card = el('section', { className: 'card', 'aria-label': '販売進捗の入力' }, el('h2', {}, '実績販売枚数'),
    el('p', { className: 'hint' }, '予算の想定販売とは別の実績です。参考売上は現在の料金で計算するため、割引・払戻し・料金変更前の実収入を表しません。'));
  for (const [si, stage] of project.performanceDates.entries()) {
    const row = el('div', { className: 'row', id: `item-${stage.id}` }, el('h3', {}, `ステージ${si + 1} · ${stage.startsAt.slice(0, 16).replace('T', ' ')}`));
    for (const price of project.ticket.priceCategories) {
      const i = data.sales.findIndex(s => s.stageId === stage.id && s.priceCategoryId === price.id);
      const path = i < 0 ? `actual.${stage.id}.${price.id}` : `${base}.sales.${i}.quantity`;
      row.append(field(`ステージ${si + 1}・${price.name}の実績販売枚数`, path, i < 0 ? 0 : data.sales[i].quantity, quantity => edit(d => {
        const sale = d.sales.find(s => s.stageId === stage.id && s.priceCategoryId === price.id);
        if (sale) sale.quantity = quantity; else d.sales.push({ stageId: stage.id, priceCategoryId: price.id, quantity });
      }), { type: 'number' }));
      if (i < 0) { const item = fields.get(path); item.control.addEventListener('input', () => {
        const index = ctx.getData().sales.findIndex(s => s.stageId === stage.id && s.priceCategoryId === price.id);
        fields.delete(path); fields.set(`${base}.sales.${index}.quantity`, item); update(false);
      }); }
    }
    card.append(row);
  }
  const stages = new Set(project.performanceDates.map(s => s.id)), prices = new Set(project.ticket.priceCategories.map(p => p.id));
  data.sales.forEach((s, i) => { if (!stages.has(s.stageId) || !prices.has(s.priceCategoryId)) card.append(el('div', { className: 'notice error' },
    el('p', {}, `参照先のない実績行：${s.stageId} / ${s.priceCategoryId} · ${s.quantity}枚`),
    button('参照先のない実績行を削除', () => mutate(() => edit(d => d.sales.splice(i, 1))), 'danger'))); });
  card.append(button('販売CSVを書き出す', () => ctx.exportData(ctx.def.exportCSV, 'tickets.csv', 'text/csv')));
  return card;
}
