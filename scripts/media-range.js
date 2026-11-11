// Parse a single HTTP byte range. This function is also embedded in the service worker.
export function parseMediaRange(header, length) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header || '');
  if (!match || (!match[1] && !match[2])) return null;
  const suffix = match[1] === '';
  const start = suffix ? Math.max(0, length - Number(match[2])) : Number(match[1]);
  const end = suffix || match[2] === '' ? length - 1 : Math.min(length - 1, Number(match[2]));
  if (start >= length || end < start) return { status: 416, contentRange: `bytes */${length}` };
  return { status: 206, start, end, contentRange: `bytes ${start}-${end}/${length}` };
}
