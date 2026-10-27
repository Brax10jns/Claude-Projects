import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function printTable(headers, rows) {
  const cells = [headers, ...rows].map((r) => r.map((c) => String(c)));
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => [...r[i]].length)));
  const line = (r) => '  ' + r.map((c, i) => c + ' '.repeat(widths[i] - [...c].length)).join('  ');
  console.log(line(cells[0]));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of cells.slice(1)) console.log(line(r));
}

// True when this module is the script node was started with.
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === metaUrl;
}
