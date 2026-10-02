// All user text reaches the existing text-node builder, never HTML parsing.
export function printHeader(el, project, title) {
  return el('header', {}, el('p', { className: 'hint' }, title), el('h1', {}, project.title),
    el('p', {}, `劇団：${project.companyName || '未入力'} · 会場：${project.venue.name || '未入力'}`),
    el('p', { className: 'hint' }, '現在の入力から作成した資料です。日時は日本時間です。'));
}
export function printTable(el, headers, rows, empty = '登録されていません。') {
  if (!rows.length) return el('p', {}, empty);
  return el('div', { className: 'print-table-wrap' }, el('table', { className: 'print-table' },
    el('thead', {}, el('tr', {}, headers.map(label => el('th', { scope: 'col' }, label)))),
    el('tbody', {}, rows.map(row => el('tr', {}, row.map(value => el('td', {}, value ?? '')))))));
}
export function openPrintPreview(ctx, content) {
  const { el, button } = ctx;
  const previousFocus = document.activeElement, previousScroll = { x: scrollX, y: scrollY };
  const background = [...document.body.children].map(node => ({ node, hidden: node.hidden }));
  const close = () => {
    panel.remove(); document.body.classList.remove('print-preview');
    for (const item of background) item.node.hidden = item.hidden;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    window.scrollTo(previousScroll.x, previousScroll.y);
  };
  const printStatus = el('p', { role: 'status' });
  const print = button('印刷・PDF保存', () => {
    try { window.print(); } catch { printStatus.textContent = 'このブラウザでは印刷を開始できません。ブラウザの共有・印刷メニューを使ってください。'; }
  });
  const panel = el('section', { className: 'print-panel shell', 'aria-label': '印刷用プレビュー', tabindex: '-1' },
    el('div', { className: 'print-controls' }, el('h2', {}, '印刷用プレビュー'),
      el('p', {}, '印刷画面でプリンターやPDF保存を選んでください。用紙はA4を想定しています。'),
      el('div', { className: 'toolbar' }, print, button('編集画面へ戻る', close)), printStatus),
    el('article', { className: 'print-document' }, content));
  for (const item of background) item.node.hidden = true;
  document.body.classList.add('print-preview'); document.body.append(panel); panel.focus(); window.scrollTo(0, 0);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
}
