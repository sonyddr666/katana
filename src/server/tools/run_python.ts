import { spawn } from "child_process";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export async function runPython(args: { code: string }): Promise<any> {
  const { code } = args;

  try {
    // Write code to temp file
    const tmpDir = tmpdir();
    const scriptPath = join(tmpDir, `codex_py_${Date.now()}.py`);

    const fs = await import("fs");
    fs.writeFileSync(scriptPath, code, "utf-8");

    return new Promise((resolve) => {
      const started = Date.now();
      const timeoutMs = 10000;

      const proc = spawn("python3", [scriptPath], {
        timeout: timeoutMs,
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
        try {
          if (existsSync(scriptPath)) unlinkSync(scriptPath);
        } catch {
          /* ignore cleanup errors */
        }

        const latency = Date.now() - started;

        resolve({
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
        try {
          if (existsSync(scriptPath)) unlinkSync(scriptPath);
        } catch {
          /* ignore */
        }

        resolve({
          ok: false,
          scope: "system",
          data: { error: err.message },
          suggested_next: "Ensure python3 is installed and accessible",
        });
      });

      // Timeout guard
      setTimeout(() => {
        proc.kill("SIGKILL");
        resolve({
          ok: false,
          scope: "system",
          data: { error: "Execution timeout (10s)" },
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
