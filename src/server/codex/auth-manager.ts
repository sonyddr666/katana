import { promises as fs } from "fs";

import axios from "axios";

import { config, loadAuth as loadAuthFromFile } from "../config/env";

export interface CodexAuthRecord extends Record<string, any> {
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
  account_id?: string;
  _access?: string;
  _account_id?: string;
}

export interface GetValidAuthOptions {
  auth?: CodexAuthRecord | null;
  persist?: (auth: CodexAuthRecord) => Promise<void>;
}

let refreshPromise: Promise<CodexAuthRecord> | null = null;

export function extractAccessToken(auth: CodexAuthRecord | null | undefined): string {
  if (!auth) {
    return "";
  }
  return auth.tokens?.access_token || auth.access || "";
}

export function extractRefreshToken(auth: CodexAuthRecord | null | undefined): string {
  if (!auth) {
    return "";
  }
  return auth.tokens?.refresh_token || auth.refresh || "";
}

export function extractExpiresSeconds(auth: CodexAuthRecord | null | undefined): number {
  if (!auth) {
    return 0;
  }
  const raw = auth.tokens?.expires_at || auth.expires || 0;
  if (!raw) {
    return 0;
  }
  return raw > 1e10 ? raw / 1000 : raw;
}

export function extractAccountId(auth: CodexAuthRecord | null | undefined): string {
  if (!auth) {
    return "";
  }
  return String(auth.accountId || auth.account_id || "");
}

export function hasUsableAuth(auth: CodexAuthRecord | null | undefined): boolean {
  return Boolean(extractAccessToken(auth) || extractRefreshToken(auth));
}

export function loadAuth(): CodexAuthRecord | null {
  const rawEnv = config.authJson?.trim();
  if (rawEnv) {
    try {
      return JSON.parse(rawEnv) as CodexAuthRecord;
    } catch (error) {
      throw new Error(`AUTH_JSON is invalid JSON: ${String(error)}`);
    }
  }

  return loadAuthFromFile() as CodexAuthRecord | null;
}

async function saveAuth(auth: CodexAuthRecord): Promise<void> {
  if (config.authJson?.trim()) {
    return;
  }

  await fs.writeFile(config.authFile, `${JSON.stringify(auth, null, 2)}\n`, "utf-8");
}

export async function refreshAuth(auth: CodexAuthRecord, persist?: (auth: CodexAuthRecord) => Promise<void>): Promise<CodexAuthRecord> {
  const refreshToken = extractRefreshToken(auth);
  if (!refreshToken) {
    throw new Error("No refresh token available in auth.json");
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await axios.post(
        config.codexRefreshUrl,
        {
          refreshToken
        },
        {
          timeout: Math.max(config.toolTimeoutMs, 30000),
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Origin: "https://chatgpt.com",
            Referer: "https://chatgpt.com/"
          },
          validateStatus: () => true
        }
      );

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Auth refresh failed (${response.status}): ${JSON.stringify(response.data).slice(0, 300)}`);
      }

      const payload = response.data || {};
      const nextAccess = payload.accessToken || payload.access_token || "";
      const nextRefresh = payload.refreshToken || payload.refresh_token || refreshToken;
      const nextExpires = payload.expires_at || Math.floor(Date.now() / 1000) + 3600;
      const updated: CodexAuthRecord = {
        ...auth
      };

      if (updated.tokens) {
        updated.tokens = {
          ...updated.tokens,
          access_token: nextAccess,
          refresh_token: nextRefresh,
          expires_at: nextExpires
        };
      } else {
        updated.access = nextAccess;
        updated.refresh = nextRefresh;
        updated.expires = nextExpires;
      }

      if (persist) {
        await persist(updated);
      } else {
        await saveAuth(updated);
      }
      return updated;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function getValidAuth(options: GetValidAuthOptions = {}): Promise<CodexAuthRecord> {
  const auth = options.auth || loadAuth();
  if (!auth) {
    throw new Error("auth.json was not found. Configure AUTH_JSON or AUTH_FILE.");
  }

  let current = auth;
  const expiresAt = extractExpiresSeconds(current);
  if (expiresAt && Date.now() / 1000 > expiresAt - 60) {
    current = await refreshAuth(current, options.persist);
  }

  const accessToken = extractAccessToken(current);
  if (!accessToken) {
    throw new Error("No access token available in auth.json");
  }

  return {
    ...current,
    _access: accessToken,
    _account_id: extractAccountId(current)
  };
}

export async function codexHeaders(options: GetValidAuthOptions = {}): Promise<Record<string, string>> {
  const auth = await getValidAuth(options);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth._access}`,
    "Content-Type": "application/json",
    Origin: "https://chatgpt.com",
    Referer: "https://chatgpt.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };

  if (auth._account_id) {
    headers["chatgpt-account-id"] = auth._account_id;
  }

  return headers;
}
