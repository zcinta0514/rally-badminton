// Version headings and player-facing bullets in CHANGELOG.md feed both entry points.
export function parseReleaseHistory(markdown) {
  const history = [];
  let current;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{1,2} /.test(line)) {
      const match = line.match(/^#{1,2} (\d+\.\d+\.\d+)\s*(.*)$/);
      current = match && {version:match[1], detail:match[2].replace(/^—\s*/, ''), items:[]};
      if (current) history.push(current);
    } else if (current && line.startsWith('- ')) current.items.push(line.slice(2));
  }
  return history.filter(entry => entry.items.length);
}
