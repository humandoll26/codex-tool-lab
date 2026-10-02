export const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
export const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function checker(base) {
  const issues = [];
  const error = (path, message) => issues.push({ path: `${base}.${path}`, message });
  return { issues, error,
    text(value, path, required = false) { if (typeof value !== 'string' || (required && !value.trim())) error(path, required ? '入力してください。' : '文字列が必要です。'); },
    number(value, path) { if (!Number.isSafeInteger(value) || value < 0) error(path, '0以上の安全な整数を入力してください。'); },
    date(value, path) { if (value !== null && !validDate(value)) error(path, '正しい日付を入力してください。'); },
    choice(value, path, choices) { if (!choices.includes(value)) error(path, '選択肢から選んでください。'); },
    rows(value, path) {
      if (!Array.isArray(value)) { error(path, '配列が必要です。'); return []; }
      const seen = new Set();
      return value.map((row, i) => {
        if (!isRecord(row)) { error(`${path}.${i}`, '行の構造が不正です。'); return null; }
        if (typeof row.id !== 'string' || !row.id.trim() || seen.has(row.id)) error(`${path}.${i}.id`, 'IDが空、または重複しています。');
        seen.add(row.id); return row;
      });
    } };
}
export function safeSum(values) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('合計が安全な整数範囲を超えています。');
  return Number(total);
}
export function csv(rows) {
  const cell = value => {
    let text = String(value ?? '');
    if (typeof value === 'string' && (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
