// Serves ~/LifeDashboard/life-dashboard.html on your home Wi-Fi so your phone can open it
// and add it to the home screen. Only runs while this command is running.
//   npm run serve
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIST_DIR, fail } from './lib/config.js';

const file = path.join(DIST_DIR, 'life-dashboard.html');
if (!fs.existsSync(file)) fail('No dashboard yet. Run: npm run build');
const port = Number(process.env.PORT) || 8787;

http.createServer((req, res) => {
  if (req.url !== '/' && !req.url.startsWith('/?')) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res); // re-read each time, so a rebuild shows up on refresh
}).listen(port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\nLife Dashboard on this laptop: http://localhost:${port}`);
  for (const ip of ips) console.log(`On your phone (same Wi-Fi):    http://${ip}:${port}`);
  console.log('\nOn iPhone: open that link in Safari → Share → Add to Home Screen.');
  console.log('Anyone on this Wi-Fi who knows the address can see it while this runs. Ctrl+C to stop.\n');
});
