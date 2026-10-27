// Always-on phone access through Tailscale.
//   node src/phone.js on    start the background server now and at every login
//   node src/phone.js off   stop it and remove it from startup
// The background server only listens on this laptop's Tailscale address (and
// localhost), so only devices signed in to your Tailscale account can reach it.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, HOME, DIST_DIR } from './lib/config.js';
import { tailscaleIPv4, PORT } from './lib/net.js';
import { ps, lit } from './lib/powershell.js';

const PID_FILE = path.join(HOME, 'phone-server.pid');
const SERVE = path.join(ROOT, 'src', 'serve.js');
const windows = process.platform === 'win32';
const STARTUP = windows ? path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Life Dashboard Phone.lnk') : null;

function stopServer() {
  if (!fs.existsSync(PID_FILE)) return false;
  const pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
  fs.rmSync(PID_FILE, { force: true });
  try { process.kill(pid); return true; } catch { return false; }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function reachable(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
}

if (process.argv[2] === 'off') {
  const stopped = stopServer();
  if (STARTUP && fs.existsSync(STARTUP)) fs.rmSync(STARTUP);
  console.log(`${stopped ? 'Stopped the phone server' : 'The phone server was not running'} and removed it from startup.`);
  console.log('Your dashboard and data are untouched. "Phone Access On.cmd" turns it back on.');
  process.exit(0);
}

const ip = tailscaleIPv4();
if (!ip) {
  console.log(`Tailscale isn't connected on this laptop yet. One-time setup:

  1. Install Tailscale on this laptop: https://tailscale.com/download/windows
     Open it and sign in (Google, Microsoft or Apple account).
  2. Install Tailscale on your iPhone from the App Store and sign in with the SAME account.
     Turn on the VPN switch when the app asks.
  3. Double-click "Phone Access On.cmd" again.

Tailscale is free for personal use. It connects only your own devices to each other.`);
  process.exit(1);
}
if (!fs.existsSync(path.join(DIST_DIR, 'life-dashboard.html'))) {
  console.log('Building the dashboard first…');
  (await import('./build.js')).runBuild();
}

// Restart cleanly so the server runs this version of the code.
if (stopServer()) await wait(1000);

if (windows) {
  // Start at every login, hidden (no window), via a shortcut in the Startup folder.
  const args = `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "& ${lit(process.execPath)} ${lit(SERVE)} --tailscale"`;
  ps(`
$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${lit(STARTUP)})
$s.TargetPath = 'powershell.exe'
$s.Arguments = ${lit(args)}
$s.WorkingDirectory = ${lit(ROOT)}
$s.WindowStyle = 7
$s.Description = 'Life Dashboard phone access (Tailscale only)'
$s.Save()
`);
}

spawn(process.execPath, [SERVE, '--tailscale'], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true }).unref();

const url = `http://${ip}:${PORT}`;
let ok = false;
for (let i = 0; i < 10 && !ok; i++) { await wait(1000); ok = await reachable(url); }
if (!ok) {
  console.log(`✗ The server didn't answer at ${url}. Details may be in ${path.join(HOME, 'phone-server.log')}.`);
  process.exit(1);
}

console.log(`✓ Phone access is on${windows ? ' and will start by itself whenever you log in' : ''}.

Your dashboard link (works anywhere, as long as this laptop is on and online):

    ${url}

On your iPhone:
  1. Make sure the Tailscale app is connected (VPN switch on).
  2. Open the link above in Safari. (Typing it once is enough.)
  3. Tap Share → Add to Home Screen. Remove the old home-screen icon if you had one.

Only devices signed in to your Tailscale account can open it; it is not on your Wi-Fi or the internet.
If Windows asks whether Node.js may use the network, allow it — the server itself only listens on Tailscale.
The daily update keeps it fresh, and the page reloads itself when you reopen it after 10+ minutes. "Phone Access Off.cmd" turns this off.`);
