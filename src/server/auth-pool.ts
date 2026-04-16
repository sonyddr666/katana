import { promises as fs } from "fs";
import path from "path";

import type { Request } from "express";

import { config } from "./config/env";
import type { CodexAuthRecord } from "./codex/auth-manager";
import { getValidAuth, loadAuth as loadDefaultAuth } from "./codex/auth-manager";

const SLOT_IDS = ["auth1", "auth2", "auth3", "auth4", "auth5"] as const;

type SlotId = (typeof SLOT_IDS)[number];

interface AuthPoolMeta {
  current_slot?: SlotId | null;
  enabled?: Record<string, boolean>;
}

export interface AuthSlotSummary {
  id: SlotId;
  exists: boolean;
  enabled: boolean;
  is_current: boolean;
  account_id: string | null;
  access_preview: string | null;
  updated_at: number | null;
}

export interface EffectiveAuthSelection {
  slotId: string | null;
  label: string;
  auth: CodexAuthRecord | null;
  persist?: (auth: CodexAuthRecord) => Promise<void>;
}

function slotFile(slotId: SlotId): string {
  return path.join(config.authPoolDir, `${slotId}.json`);
}

function metaFile(): string {
  return path.join(config.authPoolDir, "meta.json");
}

async function loadMeta(): Promise<AuthPoolMeta> {
  try {
    const raw = await fs.readFile(metaFile(), "utf-8");
    const parsed = JSON.parse(raw) as AuthPoolMeta;
    return {
      current_slot: SLOT_IDS.includes(parsed.current_slot as SlotId) ? (parsed.current_slot as SlotId) : null,
      enabled: parsed.enabled || {}
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return { current_slot: null, enabled: {} };
    }
    throw error;
  }
}

async function saveMeta(meta: AuthPoolMeta): Promise<void> {
  await fs.writeFile(metaFile(), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
}

function previewToken(token: string | undefined): string | null {
  if (!token) {
    return null;
  }
  return token.length <= 18 ? token : `${token.slice(0, 10)}…${token.slice(-6)}`;
}

function normalizeSlotId(slotId: string | undefined | null): SlotId | null {
  if (!slotId) {
    return null;
  }
  const normalized = String(slotId).trim() as SlotId;
  return SLOT_IDS.includes(normalized) ? normalized : null;
}

export function getAuthPoolSlotIds(): readonly SlotId[] {
  return SLOT_IDS;
}

export async function getAuthSlot(slotId: string): Promise<CodexAuthRecord | null> {
  const normalized = normalizeSlotId(slotId);
  if (!normalized) {
    return null;
  }

  try {
    const raw = await fs.readFile(slotFile(normalized), "utf-8");
    return JSON.parse(raw) as CodexAuthRecord;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveAuthSlot(slotId: string, auth: CodexAuthRecord, enabled = true): Promise<void> {
  const normalized = normalizeSlotId(slotId);
  if (!normalized) {
    throw new Error("Invalid auth slot id");
  }

  await fs.writeFile(slotFile(normalized), `${JSON.stringify(auth, null, 2)}\n`, "utf-8");
  const meta = await loadMeta();
  meta.enabled = meta.enabled || {};
  meta.enabled[normalized] = Boolean(enabled);
  if (!meta.current_slot) {
    meta.current_slot = normalized;
  }
  await saveMeta(meta);
}

export async function deleteAuthSlot(slotId: string): Promise<void> {
  const normalized = normalizeSlotId(slotId);
  if (!normalized) {
    throw new Error("Invalid auth slot id");
  }

  try {
    await fs.unlink(slotFile(normalized));
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const meta = await loadMeta();
  meta.enabled = meta.enabled || {};
  delete meta.enabled[normalized];
  if (meta.current_slot === normalized) {
    meta.current_slot = null;
  }
  await saveMeta(meta);
}

export async function setAuthSlotEnabled(slotId: string, enabled: boolean): Promise<void> {
  const normalized = normalizeSlotId(slotId);
  if (!normalized) {
    throw new Error("Invalid auth slot id");
  }
  const meta = await loadMeta();
  meta.enabled = meta.enabled || {};
  meta.enabled[normalized] = Boolean(enabled);
  await saveMeta(meta);
}

export async function activateAuthSlot(slotId: string): Promise<void> {
  const normalized = normalizeSlotId(slotId);
  if (!normalized) {
    throw new Error("Invalid auth slot id");
  }
  const meta = await loadMeta();
  meta.current_slot = normalized;
  meta.enabled = meta.enabled || {};
  if (meta.enabled[normalized] === undefined) {
    meta.enabled[normalized] = true;
  }
  await saveMeta(meta);
}

export async function getAuthPoolSummary(): Promise<{ current_slot: SlotId | null; slots: AuthSlotSummary[] }> {
  const meta = await loadMeta();
  const slots = await Promise.all(
    SLOT_IDS.map(async (slotId) => {
      const auth = await getAuthSlot(slotId);
      let stats: { mtimeMs: number } | null = null;
      try {
        stats = await fs.stat(slotFile(slotId));
      } catch {}
      return {
        id: slotId,
        exists: Boolean(auth),
        enabled: Boolean(meta.enabled?.[slotId]),
        is_current: meta.current_slot === slotId,
        account_id: auth ? String(auth.accountId || auth.account_id || "") || null : null,
        access_preview: auth ? previewToken(String(auth.access || auth.tokens?.access_token || "")) : null,
        updated_at: stats ? Math.floor(stats.mtimeMs / 1000) : null
      } satisfies AuthSlotSummary;
    })
  );

  return {
    current_slot: meta.current_slot || null,
    slots
  };
}

export async function resolveEffectiveAuthSelection(preferredSlot?: string | null): Promise<EffectiveAuthSelection> {
  const preferred = normalizeSlotId(preferredSlot);
  const summary = await getAuthPoolSummary();

  const findUsable = async (slotId: SlotId | null | undefined): Promise<EffectiveAuthSelection | null> => {
    if (!slotId) {
      return null;
    }
    const slot = summary.slots.find((item) => item.id === slotId);
    if (!slot?.exists || !slot.enabled) {
      return null;
    }
    const auth = await getAuthSlot(slotId);
    if (!auth) {
      return null;
    }
    return {
      slotId,
      label: `${slotId}${slot.is_current ? " (current)" : ""}`,
      auth,
      persist: async (updated) => {
        await saveAuthSlot(slotId, updated, true);
      }
    };
  };

  const direct = await findUsable(preferred);
  if (direct) {
    return direct;
  }

  const current = await findUsable(summary.current_slot || null);
  if (current) {
    return current;
  }

  for (const slot of summary.slots) {
    const candidate = await findUsable(slot.id);
    if (candidate) {
      return candidate;
    }
  }

  const fallback = loadDefaultAuth();
  return {
    slotId: null,
    label: fallback ? "default auth.json" : "no auth configured",
    auth: fallback
  };
}

export async function resolveEffectiveAuthFromRequest(req: Request): Promise<EffectiveAuthSelection> {
  const headerSlot = req.headers["x-auth-slot"];
  const slotValue = Array.isArray(headerSlot) ? headerSlot[0] : headerSlot;
  return resolveEffectiveAuthSelection(slotValue || (req.body?.auth_slot as string | undefined) || null);
}

export function isLocalRequest(req: Request): boolean {
  const ip = String(req.ip || req.socket.remoteAddress || "");
  return ip.includes("127.0.0.1") || ip.includes("::1");
}

export function validateAdminPin(req: Request): { ok: boolean; status?: number; error?: string } {
  if (!config.adminPin) {
    return { ok: true };
  }

  if (isLocalRequest(req)) {
    return { ok: true };
  }

  const provided = String(req.headers["x-admin-pin"] || "").trim();
  if (!provided) {
    return { ok: false, status: 401, error: "ADMIN_PIN required" };
  }
  if (provided !== config.adminPin) {
    return { ok: false, status: 403, error: "Invalid ADMIN_PIN" };
  }
  return { ok: true };
}

export async function testAuthSlot(slotId: string): Promise<{ ok: boolean; status: number; reply_preview?: string; response_id?: string; error?: string }> {
  const normalized = normalizeSlotId(slotId);
  if (!normalized) {
    throw new Error("Invalid auth slot id");
  }
  const auth = await getAuthSlot(normalized);
  if (!auth) {
    return { ok: false, status: 404, error: "Auth slot does not exist" };
  }

  try {
    const valid = await getValidAuth({
      auth,
      persist: async (updated: CodexAuthRecord) => {
        await saveAuthSlot(normalized, updated, true);
      }
    });
    return {
      ok: true,
      status: 200,
      reply_preview: previewToken(String(valid._access || "")) || undefined
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 500,
      error: error.message || String(error)
    };
  }
}
