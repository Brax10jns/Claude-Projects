// Sets up (or removes) a Windows scheduled task that runs the daily update.
//   node src/schedule.js            ask for a time, register, run once to test
//   node src/schedule.js --remove   remove the task
// If the laptop is off or asleep at that time, Windows runs it as soon as it can.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { ROOT, HOME } from './lib/config.js';

const TASK = 'Life Dashboard Update';
const LOG = path.join(HOME, 'update.log');

if (process.platform !== 'win32') {
  console.log('This sets up a Windows scheduled task. On Mac/Linux, add a cron job instead, e.g.:');
  console.log(`  15 7 * * *  cd "${ROOT}" && "${process.execPath}" src/refresh.js --log`);
  process.exit(0);
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`; // PowerShell single-quoted string
// -EncodedCommand sidesteps every command-line quoting rule between Node, Windows and PowerShell.
// Progress output is silenced and stderr captured, so PowerShell's progress records
// don't leak into the window as CLIXML.
function ps(script) {
  const encoded = Buffer.from(`$ProgressPreference = 'SilentlyContinue'\n${script}`, 'utf16le').toString('base64');
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    const detail = String(e.stderr || '').replace(/#< CLIXML[\s\S]*?<\/Objs>/g, '').trim();
    throw new Error(`PowerShell failed: ${detail || e.message}`);
  }
}

if (process.argv.includes('--remove')) {
  ps(`Unregister-ScheduledTask -TaskName ${lit(TASK)} -Confirm:$false -ErrorAction SilentlyContinue`);
  console.log(`Removed the "${TASK}" scheduled task (if it existed). Your dashboard and data are untouched.`);
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
let time;
for (;;) {
  process.stdout.write('What time should it update each day? (24-hour, e.g. 07:15 — press Enter for 07:15): ');
  const { value, done } = await lines.next();
  const v = done ? '' : value.trim();
  if (!v) { time = '07:15'; break; }
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(v);
  if (m && +m[1] < 24 && +m[2] < 60) { time = `${m[1].padStart(2, '0')}:${m[2]}`; break; }
  console.log('  Please type a time like 07:15 or 21:30.');
}
rl.close();

// The task runs node hidden (via PowerShell) and writes LifeDashboard\update.log.
const inner = `& ${lit(process.execPath)} ${lit(path.join(ROOT, 'src', 'refresh.js'))} --log`;
const argument = `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "${inner.replace(/"/g, '\\"')}"`;
const next = ps(`
$ErrorActionPreference = 'Stop'
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${lit(argument)} -WorkingDirectory ${lit(ROOT)}
$t = New-ScheduledTaskTrigger -Daily -At ${lit(time)}
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName ${lit(TASK)} -Description 'Re-syncs Apple Health, iCloud Calendar and RescueTime and rebuilds the Life Dashboard.' -Action $a -Trigger $t -Settings $s -Force | Out-Null
"$((Get-ScheduledTaskInfo -TaskName ${lit(TASK)}).NextRunTime)"
`);
console.log(`\n✓ Scheduled "${TASK}" daily at ${time}. Next run: ${next}.`);
console.log('  If the laptop is off or asleep then, it runs as soon as it wakes up.');

// Run it once now through Task Scheduler, to prove the scheduled path works.
console.log('\nRunning it once now to test (this can take a minute)…');
const before = fs.existsSync(LOG) ? fs.statSync(LOG).size : 0;
ps(`Start-ScheduledTask -TaskName ${lit(TASK)}`);
const deadline = Date.now() + 180_000;
let state = 'Running';
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 3000));
  state = ps(`(Get-ScheduledTask -TaskName ${lit(TASK)}).State`);
  if (state !== 'Running') break;
}
const log = fs.existsSync(LOG) ? fs.readFileSync(LOG).subarray(before).toString('utf8') : ''; // `before` is in bytes
if (log.includes('Built ')) {
  console.log('✓ The scheduled update ran and rebuilt your dashboard. From its log:');
  for (const line of log.split('\n').filter((l) => /^(── |✗|Built|Today's Life|Latest full|No new export|New export|RescueTime:|Calendar ")/.test(l))) console.log('  ' + line);
} else if (state === 'Running') {
  console.log(`Still running after 3 minutes (a big Health export takes a while). Check ${LOG} later.`);
} else {
  console.log(`✗ The test run didn't finish the update. Task state: ${state}. Log:\n${log || '(empty)'}`);
}
console.log(`\nLog of every run: ${LOG}`);
console.log('To stop the daily update, double-click "Stop Daily Update.cmd".');
