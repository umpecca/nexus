// Manages the optional MCP tunnel by spawning the user's installed ngrok CLI as a child process.
// Nexus does not bundle ngrok and does not store an authtoken: the CLI reads its own configured
// authtoken (`ngrok config add-authtoken`). The agent dials outbound, so no inbound port is opened.

const { spawn } = require("node:child_process");

const NGROK_COMMAND = "ngrok";
const STARTUP_TIMEOUT_MS = 20000;
const DOMAIN_PATTERN = /^[a-z0-9.-]+$/i;

let child = null;
let activeCommand = "";
let activePort = 0;
let activeDomain = "";
let publicUrl = null;
let lastError = null;
let domainFallback = false;
let pending = null;

function getTunnelState() {
  return {
    connected: Boolean(child && publicUrl),
    url: publicUrl,
    error: lastError,
    domainFallback
  };
}

function resetActiveState() {
  activeCommand = "";
  activePort = 0;
  activeDomain = "";
  domainFallback = false;
}

// Kill the running agent without letting its exit handler report a spurious disconnect.
function killChild() {
  if (!child) {
    return;
  }
  const current = child;
  child = null;
  publicUrl = null;
  try {
    current.removeAllListeners();
    current.kill();
  } catch {
    // A failed kill should not block reconfiguration.
  }
}

function buildArgs(port, domain) {
  const args = ["http", String(port), "--log", "stdout", "--log-format", "json"];
  if (domain) {
    args.push("--domain", domain);
  }
  return args;
}

// A macOS app launched from Finder/Dock does not inherit the shell PATH, so a Homebrew-installed
// ngrok (in /opt/homebrew/bin or /usr/local/bin) is invisible to a bare spawn. Prepend those
// standard locations so the agent is found. Idempotent and only applied on macOS.
function ensureMacHomebrewOnPath() {
  if (process.platform !== "darwin") {
    return;
  }
  const extraDirs = ["/opt/homebrew/bin", "/usr/local/bin"];
  const currentDirs = (process.env.PATH || "").split(":");
  const missing = extraDirs.filter((dir) => !currentDirs.includes(dir));
  if (missing.length > 0) {
    process.env.PATH = [...missing, ...currentDirs].filter(Boolean).join(":");
  }
}

// Map ngrok's raw error text to a friendlier, actionable message where we can.
function describeNgrokError(message) {
  const text = String(message || "");
  if (/ERR_NGROK_4018|authtoken|authentication failed|sign up/i.test(text)) {
    return "ngrok needs an authtoken. Run `ngrok config add-authtoken <token>` in a terminal, then try again.";
  }
  return text;
}

// Spawn the agent and resolve once it logs a public URL, or reject on error/exit/timeout. The
// returned child keeps running after a successful resolve; an exit afterward marks a disconnect.
function spawnAgent(command, port, domain) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBuffer = "";
    let errorMessage = "";

    ensureMacHomebrewOnPath();

    let proc;
    try {
      proc = spawn(command, buildArgs(port, domain), { windowsHide: true });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        proc.kill();
      } catch {
        // ignore
      }
      reject(new Error("Timed out waiting for the ngrok tunnel to start."));
    }, STARTUP_TIMEOUT_MS);

    function finishSuccess(url) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ proc, url });
    }

    function finishError(message) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      try {
        proc.kill();
      } catch {
        // ignore
      }
      reject(new Error(message || "The ngrok tunnel could not be started."));
    }

    function handleLine(line) {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (entry && typeof entry.url === "string" && entry.msg === "started tunnel") {
        finishSuccess(entry.url);
        return;
      }
      // Only genuine error-level lines are failures. Info lines can carry err:"<nil>".
      const level = entry && (entry.lvl || entry.level);
      if (level === "error" || level === "crit") {
        const detail = (entry.err && entry.err !== "<nil>" ? entry.err : entry.msg) || "";
        if (detail) {
          errorMessage = String(detail);
        }
      }
    }

    if (proc.stdout) {
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk;
        let index;
        while ((index = stdoutBuffer.indexOf("\n")) !== -1) {
          const line = stdoutBuffer.slice(0, index);
          stdoutBuffer = stdoutBuffer.slice(index + 1);
          handleLine(line);
        }
      });
    }

    if (proc.stderr) {
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk) => {
        const text = String(chunk).trim();
        if (text) {
          errorMessage = text;
        }
      });
    }

    proc.on("error", (err) => {
      if (err && err.code === "ENOENT") {
        finishError(
          `ngrok was not found (tried "${command}"). Install the ngrok CLI and run ` +
            "`ngrok config add-authtoken <token>`, or set a correct ngrok path."
        );
      } else {
        finishError(err && err.message ? err.message : String(err));
      }
    });

    proc.on("exit", (code) => {
      if (settled) {
        // The agent exited after a successful start: reflect the disconnect for the next read.
        if (proc === child) {
          child = null;
          publicUrl = null;
          if (!lastError) {
            lastError = "The ngrok tunnel stopped.";
          }
        }
        return;
      }
      finishError(describeNgrokError(errorMessage) || `ngrok exited (code ${code}) before the tunnel started.`);
    });
  });
}

async function ensureTunnelInternal(command, port, domain) {
  // Already connected to the same target: nothing to do.
  if (
    child &&
    publicUrl &&
    activeCommand === command &&
    activePort === port &&
    activeDomain === domain
  ) {
    lastError = null;
    return getTunnelState();
  }

  killChild();
  resetActiveState();

  if (domain && !DOMAIN_PATTERN.test(domain)) {
    lastError = "The ngrok domain contains invalid characters.";
    return getTunnelState();
  }

  try {
    const started = await spawnAgent(command, port, domain);
    child = started.proc;
    publicUrl = started.url;
    activeCommand = command;
    activePort = port;
    activeDomain = domain;
    domainFallback = false;
    lastError = null;
    return getTunnelState();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // A requested domain may be unavailable (not reserved, in use, or wrong plan). Fall back to a
    // random URL so the tunnel still works, and flag that the requested domain was not used.
    if (domain) {
      try {
        const started = await spawnAgent(command, port, "");
        child = started.proc;
        publicUrl = started.url;
        activeCommand = command;
        activePort = port;
        activeDomain = domain;
        domainFallback = true;
        lastError = null;
        return getTunnelState();
      } catch (fallbackError) {
        child = null;
        publicUrl = null;
        resetActiveState();
        lastError = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return getTunnelState();
      }
    }

    child = null;
    publicUrl = null;
    resetActiveState();
    lastError = message;
    return getTunnelState();
  }
}

// Serialize ensure/stop calls so overlapping mcp:configure events cannot spawn two agents.
function runExclusive(task) {
  const next = (pending ?? Promise.resolve()).then(task, task);
  pending = next.catch(() => {});
  return next;
}

function ensureTunnel({ port, domain, command }) {
  const resolvedCommand = String(command ?? "").trim() || NGROK_COMMAND;
  return runExclusive(() =>
    ensureTunnelInternal(resolvedCommand, port, String(domain ?? "").trim())
  );
}

function stopTunnel() {
  return runExclusive(async () => {
    killChild();
    resetActiveState();
    lastError = null;
    return getTunnelState();
  });
}

module.exports = {
  ensureTunnel,
  stopTunnel,
  getTunnelState
};
