// Serves ~/LifeDashboard/life-dashboard.html so your phone can open it and add it
// to the home screen. The file is re-read on every request, so each rebuild
// shows up on refresh.
//   npm run serve                 in a window, on your Wi-Fi and Tailscale (Open on Phone.cmd)
//   node src/serve.js --tailscale in the background, only on your Tailscale address
//                                 and this laptop (started by Phone Access On.cmd)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DIST_DIR, HOME } from './lib/config.js';
import { tailscaleIPv4, lanIPv4s, PORT } from './lib/net.js';

const file = path.join(DIST_DIR, 'life-dashboard.html');
const background = process.argv.includes('--tailscale');
export const PID_FILE = path.join(HOME, 'phone-server.pid');

function handler(req, res) {
  if (req.url !== '/' && !req.url.startsWith('/?')) { res.writeHead(404).end(); return; }
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('The dashboard has not been built yet. Run "Update Dashboard.cmd" on your laptop.');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

const log = (msg) => {
  if (!background) return console.log(msg);
  fs.mkdirSync(HOME, { recursive: true });
  fs.appendFileSync(path.join(HOME, 'phone-server.log'), `${new Date().toISOString()} ${msg}\n`);
};

function listen(host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once('error', reject);
    server.listen(PORT, host, () => resolve(server));
  });
}

if (!background) {
  try {
    await listen('0.0.0.0');
  } catch (e) {
    console.log(e.code === 'EADDRINUSE'
      ? `\nThe phone server is already running in the background (Phone Access On), so you don't need this window.\nOpen http://localhost:${PORT} here, or your Tailscale link on the phone.`
      : `\n✗ Could not start: ${e.message}`);
    process.exit(e.code === 'EADDRINUSE' ? 0 : 1);
  }
  const ts = tailscaleIPv4();
  console.log(`\nLife Dashboard on this laptop:   http://localhost:${PORT}`);
  if (ts) console.log(`On your phone, anywhere:         http://${ts}:${PORT}   (Tailscale)`);
  for (const ip of lanIPv4s()) console.log(`On your phone, same Wi-Fi only:  http://${ip}:${PORT}`);
  console.log('\nOn iPhone: open the link in Safari → Share → Add to Home Screen.');
  console.log('If Windows asks whether Node.js may use the network, allow it.');
  console.log('While this window is open, anyone on this Wi-Fi who knows the address can see it.');
  console.log('Close the window (or Ctrl+C) to stop. For always-on access, use "Phone Access On.cmd".\n');
} else {
  // Background mode: localhost plus the Tailscale address only, never the Wi-Fi.
  // Tailscale may start after login, and its address can come and go, so keep checking.
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
  const cleanup = () => { try { if (fs.readFileSync(PID_FILE, 'utf8') === String(process.pid)) fs.rmSync(PID_FILE); } catch {} process.exit(0); };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    await listen('127.0.0.1');
  } catch (e) {
    log(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use; another server is running. Exiting.` : `Could not start: ${e.message}`);
    cleanup();
  }
  let tsServer = null, tsIp = null;
  const check = async () => {
    const ip = tailscaleIPv4();
    if (ip === tsIp) return;
    if (tsServer) { tsServer.close(); tsServer = null; log(`Tailscale address ${tsIp} went away.`); }
    tsIp = ip;
    if (!ip) return;
    try {
      tsServer = await listen(ip);
      log(`Serving on http://${ip}:${PORT} (Tailscale) and http://localhost:${PORT}`);
    } catch (e) {
      log(`Could not listen on ${ip}: ${e.message}`);
      tsIp = null;
    }
  };
  await check();
  if (!tsIp) log('Waiting for Tailscale to connect…');
  setInterval(check, 30_000);
}
