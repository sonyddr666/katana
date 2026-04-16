import { Router, type Request, type Response } from "express";

import { activateAuthSlot, deleteAuthSlot, getAuthPoolSummary, getAuthSlot, saveAuthSlot, setAuthSlotEnabled, testAuthSlot, validateAdminPin, resolveEffectiveAuthFromRequest } from "./auth-pool";
import { clearThreadBySessionId, deleteChat, getChat, listChats, searchChats, summarizeChat } from "./chat-store";
import { handleChatCompletions } from "./chat-completions";
import { config } from "./config/env";
import { getUploadedFile, parseMultipartUpload, saveUploadedFile } from "./file-store";
import { clearSession } from "./history/store";
import { getStoreState, setStoreState } from "./store-state";

function adminGuard(req: Request, res: Response): boolean {
  const validation = validateAdminPin(req);
  if (!validation.ok) {
    res.status(validation.status || 403).json({ error: validation.error });
    return false;
  }
  return true;
}

export function setupHubApiRoutes(): Router {
  const router = Router();

  router.post("/chat/completions", async (req, res, next) => {
    try {
      await handleChatCompletions(req, res);
    } catch (error) {
      next(error);
    }
  });

  router.post("/responses", async (req, res, next) => {
    try {
      await handleChatCompletions(req, res);
    } catch (error) {
      next(error);
    }
  });

  router.get("/models", async (req, res) => {
    const authSelection = await resolveEffectiveAuthFromRequest(req);
    res.json({
      object: "list",
      data: config.availableModels.map((id) => ({ id, object: "model", owned_by: "chatgpt.com" })),
      _auth_pool: { effective: { slot_id: authSelection.slotId, label: authSelection.label } }
    });
  });

  router.get("/store", async (_req, res) => {
    const state = await getStoreState();
    res.json({
      ...state,
      codex_store: false,
      mode: "native_resume",
      description: "O bridge Codex envia store=false. Quando habilitado, o backend tenta retomar via previous_response_id."
    });
  });

  router.post("/store/enable", async (_req, res) => {
    const state = await setStoreState(true);
    res.json({
      ...state,
      codex_store: false,
      mode: "native_resume",
      message: "native resume enabled"
    });
  });

  router.post("/store/disable", async (_req, res) => {
    const state = await setStoreState(false);
    res.json({
      ...state,
      codex_store: false,
      mode: "native_resume",
      message: "native resume disabled"
    });
  });

  router.get("/chats/search", async (req, res) => {
    const max = Math.max(1, Math.min(Number(req.query.max || 50), 200));
    const results = (await searchChats(String(req.query.q || ""))).slice(0, max).map(summarizeChat);
    res.json({ results });
  });

  router.get("/chats", async (_req, res) => {
    const chats = (await listChats()).map(summarizeChat);
    res.json({ chats });
  });

  router.get("/chats/:chatId", async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json(chat);
  });

  router.post("/chats/:chatId/resume", async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json(chat);
  });

  router.delete("/chats/:chatId", async (req, res) => {
    const deleted = await deleteChat(req.params.chatId);
    res.json({ deleted, chat_id: req.params.chatId });
  });

  router.delete("/threads/:sessionId", async (req, res) => {
    const updated_chats = await clearThreadBySessionId(req.params.sessionId);
    const deleted_history = await clearSession(req.params.sessionId);
    res.json({ session_id: req.params.sessionId, updated_chats, deleted_history });
  });

  router.get("/auth-pool", async (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }
    res.json(await getAuthPoolSummary());
  });

  router.post("/auth-pool/activate", async (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }
    await activateAuthSlot(String(req.body?.slot_id || ""));
    res.json(await getAuthPoolSummary());
  });

  router.post("/auth-pool/:slotId/test", async (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }
    const result = await testAuthSlot(req.params.slotId);
    res.status(result.status).json(result);
  });

  router.get("/auth-pool/:slotId", async (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }
    const auth = await getAuthSlot(req.params.slotId);
    res.json({
      slot: (await getAuthPoolSummary()).slots.find((slot) => slot.id === req.params.slotId),
      auth
    });
  });

  router.put("/auth-pool/:slotId", async (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }
    await saveAuthSlot(String(req.params.slotId), req.body?.auth || {}, req.body?.enabled !== false);
    if (req.body?.enabled === false) {
      await setAuthSlotEnabled(String(req.params.slotId), false);
    }
    res.json({ pool: await getAuthPoolSummary() });
  });

  router.delete("/auth-pool/:slotId", async (req, res) => {
    if (!adminGuard(req, res)) {
      return;
    }
    await deleteAuthSlot(String(req.params.slotId));
    res.json(await getAuthPoolSummary());
  });

  router.post("/files", async (req, res) => {
    try {
      if (String(req.headers["content-type"] || "").includes("multipart/form-data")) {
        const parsed = await parseMultipartUpload(req);
        const stored = await saveUploadedFile({ filename: parsed.filename, mime: parsed.mime, buffer: parsed.buffer });
        res.json(stored);
        return;
      }

      const name = String(req.body?.name || "upload.bin");
      const mime = String(req.body?.mime || "application/octet-stream");
      const content = String(req.body?.content || "");
      const buffer = req.body?.encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf-8");
      const stored = await saveUploadedFile({ filename: name, mime, buffer });
      res.json(stored);
    } catch (error: any) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  router.get("/files/:fileId", async (req, res) => {
    const stored = await getUploadedFile(req.params.fileId);
    if (!stored) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.setHeader("Content-Type", stored.meta.mime || "application/octet-stream");
    res.setHeader("Content-Length", String(stored.buffer.length));
    res.setHeader("Content-Disposition", `inline; filename="${stored.meta.name}"`);
    res.end(stored.buffer);
  });

  return router;
}
