// Match snapshots contain plain objects, arrays and primitives. Preserve values
// such as undefined when older WebViews lack the native clone API.
function copyPlain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(copyPlain);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyPlain(item)]));
}

export function cloneMatchSnapshot(value) {
  return typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone(value) : copyPlain(value);
}
