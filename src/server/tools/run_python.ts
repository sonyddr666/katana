import { spawn } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { config } from "../config/env";

export async function runPython(args: { code: string }): Promise<any> {
  const { code } = args;

  try {
    const tmpDir = tmpdir();
    const scriptPath = join(tmpDir, `codex_py_${Date.now()}.py`);
    const fs = await import("fs");
    fs.writeFileSync(scriptPath, code, "utf-8");

    const pythonExecutable = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

    return new Promise((resolve) => {
      const started = Date.now();
      const timeoutMs = Math.min(config.toolTimeoutMs, 10000);
      let settled = false;
      let timeoutHandle: NodeJS.Timeout | undefined;

      const cleanup = () => {
        try {
          if (existsSync(scriptPath)) {
            unlinkSync(scriptPath);
          }
        } catch {
          // ignore cleanup errors
        }
      };

      const finish = (payload: any) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        cleanup();
        resolve(payload);
      };

      const proc = spawn(pythonExecutable, [scriptPath], {
        cwd: tmpDir,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        const latency = Date.now() - started;

        finish({
          ok: code === 0,
          scope: "system",
          data: {
            stdout: stdout.substring(0, 5000),
            stderr: stderr.substring(0, 2000),
            exitCode: code,
            latency_ms: latency,
          },
          suggested_next: code === 0 ? "Process completed" : "Fix the error and retry",
        });
      });

      proc.on("error", (err) => {
        finish({
          ok: false,
          scope: "system",
          data: { error: err.message },
          suggested_next: `Ensure ${pythonExecutable} is installed and accessible`,
        });
      });

      timeoutHandle = setTimeout(() => {
        proc.kill("SIGKILL");
        finish({
          ok: false,
          scope: "system",
          data: { error: `Execution timeout (${timeoutMs}ms)` },
          suggested_next: "Simplify the code or increase timeout",
        });
      }, timeoutMs);
    });
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: { error: error.message },
    };
  }
}
