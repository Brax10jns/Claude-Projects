import { execFileSync } from 'node:child_process';

// A PowerShell single-quoted string literal.
export const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Runs a PowerShell script and returns its output. -EncodedCommand sidesteps every
// command-line quoting rule between Node, Windows and PowerShell. Progress output
// is silenced and stderr captured, so progress records don't leak out as CLIXML.
export function ps(script) {
  const encoded = Buffer.from(`$ProgressPreference = 'SilentlyContinue'\n${script}`, 'utf16le').toString('base64');
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    const detail = String(e.stderr || '').replace(/#< CLIXML[\s\S]*?<\/Objs>/g, '').trim();
    throw new Error(`PowerShell failed: ${detail || e.message}`);
  }
}
