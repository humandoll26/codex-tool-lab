import { newId } from './common.js';
export function collectionEditor(ctx, config) {
  const { id, data, el, field, button, mutate, edit } = ctx;
  const base = `project.modules.${id}.data`;
  const card = el('section', { className: 'card', 'aria-label': `${config.title}の入力` }, el('h2', {}, config.title), el('p', { className: 'hint' }, config.hint));
  for (const spec of config.fields ?? []) card.append(field(spec.label, `${base}.${spec.key}`, data[spec.key], value => edit(d => d[spec.key] = spec.type === 'date' && !value ? null : value), spec));
  if (config.export) card.append(button(config.exportLabel, () => ctx.exportData(config.export, config.fileName, config.mime)));
  data.items.forEach((row, i) => {
    const node = el('div', { className: 'row', id: `item-${row.id}` }, el('h3', {}, `${config.rowTitle}${i + 1}`));
    for (const spec of config.rowFields) node.append(field(`${config.rowTitle}${i + 1}の${spec.label}`, `${base}.items.${i}.${spec.key}`, row[spec.key], value => edit(d => d.items[i][spec.key] = spec.type === 'date' && !value ? null : value), spec));
    if (config.rowExport) node.append(button('この原稿を書き出す', () => ctx.exportData((p, d) => d.items[i].text, 'post.txt', 'text/plain')));
    if (config.rowExtras) node.append(...config.rowExtras(row, i));
    node.append(button(`${config.rowTitle}${i + 1}を削除`, () => mutate(() => edit(d => d.items.splice(i, 1))), 'danger')); card.append(node);
  });
  card.append(button(config.addLabel, () => mutate(() => edit(d => d.items.push({ id: newId(id), ...config.newRow() })))));
  return card;
}
