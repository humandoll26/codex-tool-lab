export const JSON_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, depth: 64, values: 50000, arrayItems: 1000, salesCells: 2000 });
const encoder = new TextEncoder();
const sizeError = 'JSONは2MiB以下にしてください。大きな資料は別ファイルに保管してください。';

export function assertJSONSize(source) {
  if (typeof source !== 'string') throw new Error('JSONの文字列が必要です。');
  if (source.length > JSON_LIMITS.bytes || encoder.encode(source).byteLength > JSON_LIMITS.bytes) throw new Error(sizeError);
}
export function parseBoundedJSON(source) {
  assertJSONSize(source);
  let value;
  try { value = JSON.parse(source); } catch { throw new Error('JSONの形式が不正です。'); }
  const issues = inspectJSON(value);
  if (issues.length) throw new Error(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
  return value;
}
export async function readJSONFile(file) {
  if (file.size > JSON_LIMITS.bytes) throw new Error(sizeError);
  const source = await file.text(); assertJSONSize(source); return source;
}
// Explicit enter/leave frames bound depth without consuming the call stack.
// Active ancestors reject cycles while permitting repeated, non-cyclic values.
export function inspectJSON(root) {
  const stack = [{ value: root, path: '', depth: 0 }], active = new WeakSet();
  let count = 0;
  while (stack.length) {
    const { value, path, depth, leave } = stack.pop();
    if (leave) { active.delete(value); continue; }
    const fail = message => [{ path, message }];
    if (++count > JSON_LIMITS.values) return fail('JSONの項目数は50,000以下にしてください。');
    if (depth > JSON_LIMITS.depth) return fail('JSONの深さは64以下にしてください。');
    if (typeof value === 'number' && !Number.isFinite(value)) return fail('JSONの数値が有限値ではありません。');
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) continue;
    if (typeof value !== 'object') return fail('JSONに保存できない値があります。');
    if (active.has(value)) return fail('JSONに循環参照があります。');
    if (Array.isArray(value) && value.length > JSON_LIMITS.arrayItems) return fail('配列は1,000件以下にしてください。');
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail('JSONのオブジェクト構造が不正です。');
    const entries = Object.entries(value);
    if (entries.length + count > JSON_LIMITS.values) return fail('JSONの項目数は50,000以下にしてください。');
    active.add(value); stack.push({ value, leave: true });
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, child] = entries[i]; stack.push({ value: child, path: path ? `${path}.${key}` : key, depth: depth + 1 });
    }
  }
  return [];
}
