import {
  access,
  appendFile as fsAppendFile,
  mkdir,
  readdir,
  readFile as fsReadFile,
  stat,
  unlink,
  writeFile as fsWriteFile,
} from "fs/promises";
import path from "path";

import { config } from "../../config/env";

const WORKSPACE_ROOT = path.resolve(config.workspaceDir);

function safePath(relativePath: string): string {
  const fullPath = path.resolve(WORKSPACE_ROOT, relativePath || ".");
  const relative = path.relative(WORKSPACE_ROOT, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
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
    const fileStats = await stat(fullPath);

    return {
      ok: true,
      scope: "workspace",
      data: { filepath, content, size: fileStats.size },
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
    const dir = path.dirname(fullPath);

    await mkdir(dir, { recursive: true });

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
    const dir = path.dirname(fullPath);
    await mkdir(dir, { recursive: true });
    await fsAppendFile(fullPath, content, "utf-8");

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
    const entries = await readdir(fullDir, { withFileTypes: true });

    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(fullDir, entry.name);
        const entryStats = await stat(entryPath);
        return {
        name: entry.name,
        isDirectory: entry.isDirectory(),
          path: path.join(relativeDir, entry.name),
          size: entry.isDirectory() ? 0 : entryStats.size,
        };
      })
    );

    files.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });

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
    await unlink(fullPath);

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
