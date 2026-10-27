// Asks for a calendar link or RescueTime key, saves it to your config.json,
// syncs that source and rebuilds the dashboard. Used by the .cmd launchers.
//   node src/connect.js calendar | rescuetime
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, setConfigValue, CONFIG_FILE } from './lib/config.js';
import { syncCalendar } from './sources/calendar.js';
import { syncRescueTime } from './sources/rescuetime.js';

const SOURCES = {
  calendar: {
    name: 'iCloud Calendar',
    key: ['calendar', 'icsUrl'],
    intro: [
      'Share your Tasks calendar as a link first:',
      '  iPhone: Calendar app → Calendars → (i) next to Tasks → turn on Public Calendar → Share Link → Copy',
      'Then send the link to this laptop (e.g. email or Notes) and copy it.',
    ],
    ask: 'Paste the link here (starts with webcal://) and press Enter: ',
    valid: (v) => /^(webcal|https?):\/\/\S+$/i.test(v),
    invalid: 'That does not look like a calendar link. It should start with webcal://',
    sync: syncCalendar,
  },
  rescuetime: {
    name: 'RescueTime',
    key: ['rescueTime', 'apiKey'],
    intro: [
      'Create an API key first:',
      '  https://www.rescuetime.com/anapi/manage → enter a name (e.g. Life Dashboard) → Activate a new key → copy it',
    ],
    ask: 'Paste the API key here and press Enter: ',
    valid: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v),
    invalid: 'That does not look like a RescueTime API key (a long string of letters and numbers).',
    sync: syncRescueTime,
  },
};

const src = SOURCES[process.argv[2]];
if (!src) {
  console.error('Usage: node src/connect.js calendar|rescuetime');
  process.exit(1);
}

let config = loadConfig();
const current = config[src.key[0]][src.key[1]];
console.log(`\nConnect ${src.name}\n`);
console.log(src.intro.join('\n') + '\n');
if (current) console.log(`Already set. Press Enter to keep it, or paste a new one.\n`);

const rl = readline.createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
let value;
for (;;) {
  process.stdout.write(src.ask);
  const { value: line, done } = await lines.next();
  if (done) process.exit(1);
  value = line.trim().replace(/^["']|["']$/g, '');
  if (!value && current) { value = current; break; }
  if (src.valid(value)) break;
  console.log(`  ${src.invalid}\n`);
}
rl.close();

setConfigValue(src.key.join('.'), value);
console.log(`Saved to ${CONFIG_FILE}`);
config = loadConfig();
try {
  await src.sync(config);
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
execFileSync(process.execPath, [fileURLToPath(new URL('./build.js', import.meta.url))], { stdio: 'inherit' });
