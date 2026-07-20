import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const windows = process.platform === "win32";
const virtualPython = join(
  root,
  ".venv",
  windows ? "Scripts/python.exe" : "bin/python",
);
const python = existsSync(virtualPython)
  ? virtualPython
  : windows
    ? "python"
    : "python3";
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const children = [];
let stopping = false;

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`[${name}] Could not start: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `[${name}] stopped unexpectedly (${signal ?? `exit ${code ?? 1}`}).`,
      );
      stop(code ?? 1);
    }
  });
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 500);
}

start("api", python, [
  "-m",
  "uvicorn",
  "app:app",
  "--reload",
  "--host",
  "127.0.0.1",
  "--port",
  process.env.API_PORT ?? "8000",
]);
start("web", process.execPath, [
  nextCli,
  "dev",
  "--webpack",
  "--hostname",
  process.env.WEB_HOST ?? "127.0.0.1",
  "--port",
  process.env.WEB_PORT ?? "3000",
]);

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
