import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  arch,
  cpus,
  platform,
  release,
  tmpdir,
  totalmem,
} from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function readPositiveInteger(name, fallback) {
  const value = Number(readArgument(name, String(fallback)));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  return value;
}

const parameters = {
  warmupRuns: readPositiveInteger("warmup", 2),
  measuredRuns: readPositiveInteger("samples", 20),
  interruptDelayMs: readPositiveInteger("interrupt-delay", 8),
  settleDelayMs: readPositiveInteger("settle-delay", 24),
  timeoutMs: readPositiveInteger("timeout", 15000),
};

if (parameters.measuredRuns === 0) {
  throw new Error("--samples must be greater than zero.");
}

const port = readPositiveInteger("port", 5191);
const outputPath = path.resolve(
  rootDirectory,
  readArgument(
    "output",
    "benchmarks/results/concurrent-lab.latest.json",
  ),
);
const sessionName = `koact-benchmark-${process.pid}`;
const serverUrl = `http://127.0.0.1:${port}/?benchmark=1`;
const viewport = { width: 1280, height: 720 };
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "koact-benchmark-"),
);
const browserResultPath = path.join(temporaryDirectory, "result.json");
let serverOutput = "";
let serverExitCode = null;
let browserOpened = false;

const server = spawn(
  "pnpm",
  [
    "--filter",
    "concurrent-lab",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: rootDirectory,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.once("exit", (code) => {
  serverExitCode = code;
});

async function runPlaywright(args, timeout = 120000) {
  return execFileAsync("playwright-cli", [`-s=${sessionName}`, ...args], {
    cwd: temporaryDirectory,
    maxBuffer: 50 * 1024 * 1024,
    timeout,
  });
}

async function waitForServer() {
  const expiresAt = Date.now() + 20000;
  while (Date.now() < expiresAt) {
    if (serverExitCode !== null) {
      throw new Error(`Vite exited before startup.\n${serverOutput}`);
    }
    try {
      const response = await fetch(serverUrl);
      if (response.ok) return;
    } catch {
      // The server has not bound the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${serverUrl}.\n${serverOutput}`);
}

async function stopServer() {
  if (serverExitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (serverExitCode === null) server.kill("SIGKILL");
}

try {
  const { stdout: playwrightVersion } = await execFileAsync(
    "playwright-cli",
    ["--version"],
    {
      cwd: rootDirectory,
    },
  );
  await waitForServer();
  await runPlaywright(["open", "--browser=chrome", serverUrl]);
  browserOpened = true;
  await runPlaywright([
    "resize",
    String(viewport.width),
    String(viewport.height),
  ]);

  const expression = `async () => JSON.stringify(await window.__KOACT_BENCHMARK__.run(${JSON.stringify(parameters)}))`;
  await runPlaywright(
    ["eval", expression, `--filename=${browserResultPath}`],
    Math.max(
      120000,
      parameters.timeoutMs *
        (parameters.warmupRuns + parameters.measuredRuns),
    ),
  );

  let report = JSON.parse(await readFile(browserResultPath, "utf8"));
  if (typeof report === "string") report = JSON.parse(report);
  if (!report.summary?.samplesWithPreemption) {
    throw new Error(
      "Benchmark produced no higher-priority aborts; no report was saved.",
    );
  }
  const processors = cpus();
  report.runner = {
    node: process.version,
    playwrightCli: playwrightVersion.trim(),
    os: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: processors[0]?.model || "unknown",
      logicalCpuCount: processors.length,
      totalMemoryBytes: totalmem(),
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Benchmark written to ${path.relative(rootDirectory, outputPath)}`);
  console.log(JSON.stringify(report.summary, null, 2));
} finally {
  if (browserOpened) {
    await runPlaywright(["close"]).catch(() => {});
  }
  await stopServer();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
