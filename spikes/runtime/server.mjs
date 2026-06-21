// Throwaway spike echo server (no dependencies).
// Bound to loopback only — reachable solely via `tailscale serve`, which mirrors
// the planned Switchboard security model. Every response surfaces the data the
// spike needs to answer its questions:
//   - tailscaleIdentity: did `tailscale serve` inject identity headers?
//   - checks.claudeCredentialsPresent: is the host's claude auth visible (cred persistence)?
//   - checks.switchboardConfigPresent: did the ~/.switchboard volume persist?
//   - checks.tmuxSessions: can we supervise detached tmux sessions?
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const PORT = Number(process.env.PORT || 8080);

function checks() {
  const home = os.homedir();
  const claudeCandidates = ['.claude/.credentials.json', '.claude.json', '.config/claude/.credentials.json'];
  const claudeCredentialsPath = claudeCandidates.map((p) => `${home}/${p}`).find((p) => fs.existsSync(p)) || null;
  let tmuxSessions;
  try {
    tmuxSessions = execSync('tmux ls 2>&1', { encoding: 'utf8' }).trim();
  } catch (err) {
    tmuxSessions = `(none / ${err.message})`;
  }
  return {
    claudeCredentialsPresent: Boolean(claudeCredentialsPath),
    claudeCredentialsPath,
    switchboardConfigPresent: fs.existsSync(`${home}/.switchboard`),
    tmuxSessions,
    hostname: os.hostname(),
  };
}

http
  .createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const body = {
      note: 'Switchboard runtime spike echo server',
      path: req.url,
      // THE key question: does `tailscale serve` forward identity to the backend?
      tailscaleIdentity: {
        login: req.headers['tailscale-user-login'] || null,
        name: req.headers['tailscale-user-name'] || null,
        profilePic: req.headers['tailscale-user-profile-pic'] || null,
      },
      allHeaders: req.headers,
      checks: checks(),
    };
    res.end(JSON.stringify(body, null, 2));
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[spike] echo server on 127.0.0.1:${PORT} (loopback only)`);
  });
