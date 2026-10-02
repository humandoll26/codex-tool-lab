import { SHARE_OPTIONS, defaultShareOptions, sharedModule, supportsShareData } from './module-share.js';
export function openSharePreview({ el, button, download, getDocument, id }) {
  const selection = defaultShareOptions(), previousFocus = document.activeElement, previousScroll = { x: scrollX, y: scrollY };
  const background = [...document.body.children].map(node => ({ node, hidden: node.hidden }));
  const close = () => {
    panel.remove(); for (const item of background) item.node.hidden = item.hidden;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    window.scrollTo(previousScroll.x, previousScroll.y);
  };
  const preview = el('pre', { className: 'text-preview share-json', 'aria-label': '共有するJSONの内容' });
  const status = el('p', { role: 'status' }); let source;
  const refresh = () => {
    try { source = sharedModule(getDocument(), id, selection); preview.textContent = source; output.disabled = false; status.textContent = '表示中の内容だけを書き出します。'; }
    catch (error) { source = null; preview.textContent = ''; output.disabled = true; status.textContent = error.message; }
  };
  const output = button('共有用JSON資料を書き出す', () => {
    // Rebuild on explicit export so a stale preview cannot export a changed draft.
    refresh(); if (source !== null) download(source, `theater-production-${id}-share.json`);
  });
  const controls = SHARE_OPTIONS.map(option => {
    const control = el('input', { type: 'checkbox', onChange: () => { selection[option.key] = control.checked; refresh(); } });
    control.checked = selection[option.key];
    if (option.key === 'data' && !supportsShareData(id, getDocument().project.modules[id])) control.disabled = true;
    return el('label', { className: 'share-option' }, control, option.label);
  });
  const panel = el('section', { className: 'shell share-panel', 'aria-label': '共有用資料の作成', tabindex: '-1' },
    el('h1', {}, '共有用資料の作成'),
    el('p', {}, '相手に渡す項目を選び、下の内容を確認してください。閲覧用のJSON資料です。復元にはバックアップ用JSONを使ってください。'),
    el('fieldset', {}, el('legend', {}, '共有する項目'), ...controls),
    el('p', { className: 'notice warning' }, '作業データには原稿・メモ・担当役割・金額・保存原稿が含まれます。文章内の私的情報は自動で削除しません。'),
    ...(supportsShareData(id, getDocument().project.modules[id]) ? [] : [el('p', {}, '旧形式の作業データは共有用資料に含められません。進行状況は共有できます。')]),
    status, preview, el('div', { className: 'toolbar' }, output, button('編集画面へ戻る', close)));
  refresh(); for (const item of background) item.node.hidden = true;
  document.body.append(panel); panel.focus();
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
}
