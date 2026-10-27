import os from 'node:os';

const ipv4s = (ifaces) => Object.values(ifaces).flat().filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal).map((i) => i.address);

// Tailscale gives each device a fixed address in 100.64.0.0/10.
export function isTailscale(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

export const tailscaleIPv4 = (ifaces = os.networkInterfaces()) => ipv4s(ifaces).find(isTailscale) || null;
export const lanIPv4s = (ifaces = os.networkInterfaces()) => ipv4s(ifaces).filter((ip) => !isTailscale(ip));

export const PORT = Number(process.env.PORT) || 8787;
