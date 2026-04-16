import { spawn } from "child_process";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { config } from "../config/env";

const MAX_STDOUT = 5000;
const MAX_STDERR = 2000;
const HARD_TIMEOUT_MS = 10_000;

export async function runPython(args: { code: string }): Promise<any> {
  const { code } = args;

  if (typeof code !== "string" || !code.trim()) {
    return {
      ok: false,
      scope: "system",
      data: { error: "Missing or empty 'code' argument" },
      suggested_next: "Provide Python code to execute"
    };
  }

  const tmpDir = tmpdir();
  const scriptPath = join(tmpDir, `codex_py_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.py`);
  writeFileSync(scriptPath, code, "utf-8");

  const pythonExecutable = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

  return new Promise((resolve) => {
    const started = Date.now();
    const timeoutMs = Math.min(config.toolTimeoutMs, HARD_TIMEOUT_MS);
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    const cleanup = () => {
      try {
        if (existsSync(scriptPath)) {
          unlinkSync(scriptPath);
        }
      } catch {
        // ignore
      }
    };

    const finish = (payload: any) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      cleanup();
      resolve(payload);
    };

    // -I: isolated mode (ignora env vars e user site-packages)
    // -S: não importa site.py
    // -B: não escreve arquivos .pyc
    const proc = spawn(pythonExecutable, ["-I", "-S", "-B", "--", scriptPath], {
      cwd: tmpDir,
      env: {
        PATH: process.env.PATH,
        PYTHONIOENCODING: "utf-8",
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;

    proc.stdout?.on("data", (data: Buffer) => {
      if (stdout.length >= MAX_STDOUT) {
        stdoutTruncated = true;
        return;
      }
      stdout += data.toString();
      if (stdout.length > MAX_STDOUT) {
        stdout = stdout.substring(0, MAX_STDOUT);
        stdoutTruncated = true;
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      if (stderr.length >= MAX_STDERR) {
        stderrTruncated = true;
        return;
      }
      stderr += data.toString();
      if (stderr.length > MAX_STDERR) {
        stderr = stderr.substring(0, MAX_STDERR);
        stderrTruncated = true;
      }
    });

    proc.on("close", (code) => {
      const latency = Date.now() - started;
      finish({
        ok: code === 0,
        scope: "system",
        data: {
          stdout,
          stderr,
          exitCode: code,
          latency_ms: latency,
          truncated: { stdout: stdoutTruncated, stderr: stderrTruncated }
        },
        suggested_next: code === 0 ? "Process completed" : "Fix the error and retry"
      });
    });

    proc.on("error", (err) => {
      finish({
        ok: false,
        scope: "system",
        data: { error: err.message },
        suggested_next: `Ensure ${pythonExecutable} is installed and accessible`
      });
    });

    timeoutHandle = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish({
        ok: false,
        scope: "system",
        data: { error: `Execution timeout (${timeoutMs}ms)` },
        suggested_next: "Simplify the code or increase timeout"
      });
    }, timeoutMs);
  });
}
