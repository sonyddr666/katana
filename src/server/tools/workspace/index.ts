import { readFile as fsReadFile, writeFile as fsWriteFile, access, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { config } from "../../config/env";

const WORKSPACE_ROOT = config.workspaceDir || "/workspace";

function safePath(relativePath: string): string {
  const fullPath = resolve(WORKSPACE_ROOT, relativePath);
  if (!fullPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path traversal attempt detected");
  }
  return fullPath;
}

export async function readFile(args: { filepath: string }): Promise<any> {
  const { filepath } = args;

  try {
    const fullPath = safePath(filepath);

    try {
      await access(fullPath);
    } catch {
      return {
        ok: false,
        scope: "workspace",
        data: { error: "File not found", filepath },
        suggested_next: "Use write_file to create it",
      };
    }

    const content = await fsReadFile(fullPath, "utf-8");

    return {
      ok: true,
      scope: "workspace",
      data: { filepath, content, size: content.length },
      suggested_next: "Use write_file or append_file to modify",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "workspace",
      data: { error: error.message, filepath },
    };
  }
}

export async function writeFile(args: { filepath: string; content: string }): Promise<any> {
  const { filepath, content } = args;

  try {
    const fullPath = safePath(filepath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/") || fullPath.length);

    // Ensure directory exists
    if (dir) {
      try {
        await mkdir(dir, { recursive: true });
      } catch {
        // ignore mkdir errors
      }
    }

    await fsWriteFile(fullPath, content, "utf-8");

    return {
      ok: true,
      scope: "workspace",
      data: { filepath, size: content.length, action: "written" },
      suggested_next: "Use read_file to verify content",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "workspace",
      data: { error: error.message, filepath },
    };
  }
}

export async function appendFile(args: { filepath: string; content: string }): Promise<any> {
  const { filepath, content } = args;

  try {
    const fullPath = safePath(filepath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // dir might be empty (root), ignore
    }

    const fs = await import("fs");
    fs.appendFileSync(fullPath, content + "\n", "utf-8");

    return {
      ok: true,
      scope: "workspace",
      data: { filepath, appended: content.length },
      suggested_next: "Use read_file to verify",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "workspace",
      data: { error: error.message, filepath },
    };
  }
}

export async function listFiles(args: { dir?: string }): Promise<any> {
  const { dir: relativeDir = "." } = args;

  try {
    const fullDir = safePath(relativeDir);
    const fs = await import("fs");

    const entries = fs.readdirSync(fullDir, { withFileTypes: true });

    const files = entries
      .map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: join(relativeDir, entry.name),
      }))
      .sort((a, b) => (a.isDirectory ? -1 : b.isDirectory ? 1 : 0));

    return {
      ok: true,
      scope: "workspace",
      data: { dir: relativeDir, files },
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "workspace",
      data: { error: error.message, dir: relativeDir },
    };
  }
}

export async function deleteFile(args: { filepath: string }): Promise<any> {
  const { filepath } = args;

  try {
    const fullPath = safePath(filepath);

    const fs = await import("fs");
    fs.unlinkSync(fullPath);

    return {
      ok: true,
      scope: "workspace",
      data: { filepath, deleted: true },
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "workspace",
      data: { error: error.message, filepath },
      suggested_next: "File might not exist or be protected",
    };
  }
}
