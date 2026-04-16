const elements = {
  tabs: [...document.querySelectorAll(".tab")],
  chatView: document.getElementById("view-chat"),
  historyView: document.getElementById("view-history"),
  authView: document.getElementById("view-auth"),
  chatTitle: document.getElementById("chat-title"),
  chatContainer: document.getElementById("chat-container"),
  rawOutput: document.getElementById("raw-output"),
  prompt: document.getElementById("prompt"),
  send: document.getElementById("send"),
  clearChat: document.getElementById("clear-chat"),
  status: document.getElementById("status"),
  sessionId: document.getElementById("session-id"),
  sessionLabel: document.getElementById("session-label"),
  sessionDot: document.getElementById("session-dot"),
  modeLabel: document.getElementById("mode-label"),
  baseUrl: document.getElementById("base-url"),
  endpoint: document.getElementById("endpoint"),
  modelSelect: document.getElementById("model-select"),
  reloadModels: document.getElementById("reload-models"),
  authSlot: document.getElementById("auth-slot"),
  temperature: document.getElementById("temperature"),
  maxTokens: document.getElementById("max-tokens"),
  reasoningEffort: document.getElementById("reasoning-effort"),
  systemPrompt: document.getElementById("system-prompt"),
  storeStatus: document.getElementById("store-status"),
  storeMessage: document.getElementById("store-message"),
  storeEnable: document.getElementById("store-enable"),
  storeDisable: document.getElementById("store-disable"),
  historySearch: document.getElementById("history-search"),
  reloadHistory: document.getElementById("reload-history"),
  historyList: document.getElementById("history-list"),
  historyMeta: document.getElementById("history-meta"),
  historyMessages: document.getElementById("history-messages"),
  historyResume: document.getElementById("history-resume"),
  historyExport: document.getElementById("history-export"),
  historyDelete: document.getElementById("history-delete"),
  adminPin: document.getElementById("admin-pin"),
  reloadAuth: document.getElementById("reload-auth"),
  authSlots: document.getElementById("auth-slots"),
  authSlotTitle: document.getElementById("auth-slot-title"),
  authEnabled: document.getElementById("auth-enabled"),
  authJson: document.getElementById("auth-json"),
  authActivate: document.getElementById("auth-activate"),
  authSave: document.getElementById("auth-save"),
  authTest: document.getElementById("auth-test"),
  authDelete: document.getElementById("auth-delete"),
  authResult: document.getElementById("auth-result")
};

const DEFAULT_BASE = window.location.origin;
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";
const AUTH_PIN_KEY = "codex-hub:admin-pin";
const AUTH_SLOT_KEY = "codex-hub:auth-slot";

function createChatState(mode) {
  return {
    mode,
    chatId: `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    messages: [],
    resumable: false,
    responseId: null,
    loading: false
  };
}

const state = {
  currentTab: "tester",
  tester: createChatState("tester"),
  interactive: createChatState("interactive"),
  storeEnabled: false,
  authPool: null,
  selectedAuthSlotId: null,
  previewChat: null,
  authSlotSelection: localStorage.getItem(AUTH_SLOT_KEY) || "",
  adminPin: localStorage.getItem(AUTH_PIN_KEY) || ""
};

elements.baseUrl.value = DEFAULT_BASE;
elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
elements.adminPin.value = state.adminPin;

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(timestamp) {
  if (!timestamp) {
    return "—";
  }
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function currentBaseUrl() {
  return (elements.baseUrl.value || DEFAULT_BASE).trim().replace(/\/+$/, "") || DEFAULT_BASE;
}

function buildHeaders(extra = {}) {
  const headers = { ...extra };
  const selectedAuthSlot = elements.authSlot.value || state.authSlotSelection;
  if (selectedAuthSlot) {
    headers["X-Auth-Slot"] = selectedAuthSlot;
  }
  return headers;
}

function buildAdminHeaders(extra = {}) {
  const headers = buildHeaders(extra);
  const pin = String(elements.adminPin.value || state.adminPin || "").trim();
  if (pin) {
    headers["X-Admin-Pin"] = pin;
  }
  return headers;
}

function getActiveChatState() {
  return state[state.currentTab === "interactive" ? "interactive" : "tester"];
}

function setStatus(text, isError = false) {
  elements.status.textContent = text;
  elements.status.style.color = isError ? "#fca5a5" : "#9ca3af";
}

function appendRawLog(label, payload) {
  const entry = document.createElement("div");
  entry.className = "raw-entry";
  const content = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  entry.innerHTML = `<strong>${escHtml(label)}</strong>\n${escHtml(content)}`;
  elements.rawOutput.appendChild(entry);
  elements.rawOutput.scrollTop = elements.rawOutput.scrollHeight;
}

function clearRawLog() {
  elements.rawOutput.innerHTML = "";
}

function enhanceMarkdown(container) {
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".code-copy-button")) {
      return;
    }
    const button = document.createElement("button");
    button.className = "code-copy-button";
    button.textContent = "Copy";
    button.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      await navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy"), 1200);
    });
    pre.appendChild(button);
  });
  container.querySelectorAll("pre code").forEach((code) => window.hljs?.highlightElement(code));
}

function renderChat() {
  const chatState = getActiveChatState();
  elements.chatTitle.textContent = chatState.mode === "interactive" ? "Interactive" : "Tester";
  elements.chatContainer.innerHTML = "";

  if (!chatState.messages.length) {
    const empty = document.createElement("div");
    empty.className = "message assistant";
    empty.innerHTML = `<div class="role">Sistema</div><div class="content">Envie uma mensagem para começar.</div>`;
    elements.chatContainer.appendChild(empty);
  }

  chatState.messages.forEach((message) => {
    const wrapper = document.createElement("div");
    wrapper.className = `message ${message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "error"}`;
    const role = message.role === "assistant" ? "Assistente" : message.role === "user" ? "Você" : "Erro";
    const contentNode = document.createElement("div");
    contentNode.className = "content";
    if (message.role === "assistant") {
      contentNode.innerHTML = window.marked?.parse(message.content || "") || escHtml(message.content || "");
      enhanceMarkdown(contentNode);
    } else {
      contentNode.textContent = message.content || "";
    }
    const meta = message.response_id ? `<div class="hint">response_id: ${escHtml(message.response_id)}</div>` : "";
    wrapper.innerHTML = `<div class="role">${role}</div>`;
    wrapper.appendChild(contentNode);
    if (meta) {
      wrapper.insertAdjacentHTML("beforeend", meta);
    }
    elements.chatContainer.appendChild(wrapper);
  });

  elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
  elements.sessionId.textContent = `session: ${chatState.sessionId}`;
  elements.sessionLabel.textContent = `${chatState.mode} · ${chatState.sessionId}`;
  elements.sessionDot.className = `dot${chatState.resumable ? " active" : ""}`;
  elements.modeLabel.textContent = chatState.mode;
}

function setTab(tab) {
  state.currentTab = tab;
  elements.tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  elements.chatView.classList.toggle("active", tab === "tester" || tab === "interactive");
  elements.historyView.classList.toggle("active", tab === "history");
  elements.authView.classList.toggle("active", tab === "auth");
  if (tab === "history") {
    loadHistoryList();
  } else if (tab === "auth") {
    loadAuthPool();
  } else {
    renderChat();
  }
}

async function loadModels() {
  try {
    const response = await fetch(`${currentBaseUrl()}/v1/models`, { headers: buildHeaders() });
    const payload = await response.json();
    const models = Array.isArray(payload.data) ? payload.data : [];
    elements.modelSelect.innerHTML = models.map((model) => `<option value="${escHtml(model.id)}">${escHtml(model.id)}</option>`).join("") || `<option value="${DEFAULT_MODEL}">${DEFAULT_MODEL}</option>`;
    const active = getActiveChatState();
    elements.modelSelect.value = active.model || DEFAULT_MODEL;
    setStatus("Modelos carregados");
  } catch (error) {
    elements.modelSelect.innerHTML = `<option value="${DEFAULT_MODEL}">${DEFAULT_MODEL}</option>`;
    setStatus(`Erro ao carregar modelos: ${error.message || error}`, true);
  }
}

async function loadStoreState() {
  try {
    const response = await fetch(`${currentBaseUrl()}/v1/store`);
    const payload = await response.json();
    state.storeEnabled = Boolean(payload.store_enabled);
    elements.storeStatus.textContent = state.storeEnabled ? "✅ retomada nativa ativa" : "❌ retomada nativa inativa";
    elements.storeMessage.textContent = state.storeEnabled
      ? "O bridge continua com store=false no Codex; quando houver response_id, o backend enviará apenas a nova mensagem com previous_response_id."
      : "O bridge continua com store=false no Codex; o backend reenviará o histórico completo a cada turno.";
  } catch (error) {
    elements.storeStatus.textContent = "❌ erro ao consultar store";
    elements.storeMessage.textContent = String(error.message || error);
  }
}

async function setStore(enabled) {
  try {
    const endpoint = enabled ? "/v1/store/enable" : "/v1/store/disable";
    await fetch(`${currentBaseUrl()}${endpoint}`, { method: "POST" });
    await loadStoreState();
  } catch (error) {
    setStatus(`Falha ao alterar store: ${error.message || error}`, true);
  }
}

function serializeChatMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    response_id: message.response_id || null,
    latency_ms: message.latency_ms,
    attachments: message.attachments
  }));
}

async function sendMessage() {
  const chatState = getActiveChatState();
  const prompt = elements.prompt.value.trim();
  if (!prompt || chatState.loading) {
    return;
  }

  const userMessage = { role: "user", content: prompt };
  chatState.messages.push(userMessage);
  chatState.loading = true;
  elements.prompt.value = "";
  renderChat();
  clearRawLog();
  appendRawLog("REQUEST", {
    chat_id: chatState.chatId,
    session_id: chatState.sessionId,
    model: elements.modelSelect.value,
    endpoint: elements.endpoint.value,
    mode: chatState.mode
  });
  setStatus("Enviando...");
  elements.send.disabled = true;

  const assistantMessage = { role: "assistant", content: "" };
  chatState.messages.push(assistantMessage);
  renderChat();

  try {
    const payload = {
      model: elements.modelSelect.value || DEFAULT_MODEL,
      temperature: Number(elements.temperature.value || 0.7),
      max_tokens: Number(elements.maxTokens.value || 1200),
      reasoning_effort: elements.reasoningEffort.value || "",
      systemPrompt: elements.systemPrompt.value || DEFAULT_SYSTEM_PROMPT,
      stream: true,
      support_tools: chatState.mode === "interactive",
      mode: chatState.mode,
      chat_id: chatState.chatId,
      session_id: chatState.sessionId,
      messages: serializeChatMessages(chatState.messages.slice(0, -1))
    };

    const response = await fetch(`${currentBaseUrl()}${elements.endpoint.value}`, {
      method: "POST",
      headers: buildHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    if (!response.ok || !response.body) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          continue;
        }
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") {
          continue;
        }
        const event = JSON.parse(raw);
        appendRawLog("STREAM", event);

        if (event.error) {
          throw new Error(event.error);
        }

        if (event.choices?.[0]?.delta?.content) {
          assistantMessage.content += event.choices[0].delta.content;
          renderChat();
        }

        if (event.event === "turn/completed") {
          chatState.responseId = event._response_id || null;
          chatState.resumable = Boolean(event._chat?.resumable || event._native_resume || event._response_id);
          if (event._chat?.chat_id) {
            chatState.chatId = event._chat.chat_id;
            chatState.sessionId = event._chat.session_id || chatState.sessionId;
          }
        }
      }
    }

    assistantMessage.response_id = chatState.responseId;
    setStatus("Resposta concluída");
  } catch (error) {
    assistantMessage.role = "error";
    assistantMessage.content = `Erro: ${error.message || error}`;
    setStatus(`Erro: ${error.message || error}`, true);
  } finally {
    chatState.loading = false;
    elements.send.disabled = false;
    renderChat();
  }
}

async function clearCurrentChat() {
  const chatState = getActiveChatState();
  if (!window.confirm("Limpar a conversa atual?")) {
    return;
  }

  try {
    await fetch(`${currentBaseUrl()}/v1/threads/${encodeURIComponent(chatState.sessionId)}`, {
      method: "DELETE",
      headers: buildHeaders()
    });
  } catch {}

  const fresh = createChatState(chatState.mode);
  state[chatState.mode] = fresh;
  clearRawLog();
  setStatus("Conversa limpa");
  renderChat();
}

function renderHistoryMessages(chat) {
  elements.historyMessages.innerHTML = "";
  (chat.messages || []).forEach((message) => {
    const wrapper = document.createElement("div");
    wrapper.className = `history-message ${message.role === "assistant" ? "assistant" : "user"}`;
    const body = document.createElement("div");
    body.className = "content";
    if (message.role === "assistant") {
      body.innerHTML = window.marked?.parse(message.content || "") || escHtml(message.content || "");
      enhanceMarkdown(body);
    } else {
      body.textContent = message.content || "";
    }
    wrapper.innerHTML = `<div class="role">${message.role}</div>`;
    wrapper.appendChild(body);
    wrapper.insertAdjacentHTML("beforeend", `<div class="meta">${formatDate(message.ts)}${message.response_id ? ` · ${escHtml(message.response_id)}` : ""}</div>`);
    elements.historyMessages.appendChild(wrapper);
  });
}

async function loadHistoryList() {
  try {
    const query = elements.historySearch.value.trim();
    const url = query ? `${currentBaseUrl()}/v1/chats/search?q=${encodeURIComponent(query)}` : `${currentBaseUrl()}/v1/chats`;
    const response = await fetch(url, { headers: buildHeaders() });
    const payload = await response.json();
    const chats = query ? payload.results || [] : payload.chats || [];
    elements.historyList.innerHTML = "";

    if (!chats.length) {
      elements.historyList.innerHTML = `<div class="history-item"><div class="title">Nenhuma conversa encontrada</div></div>`;
      return;
    }

    chats.forEach((chat) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `history-item${state.previewChat?.chat_id === chat.chat_id ? " active" : ""}`;
      item.innerHTML = `<div class="title">${escHtml(chat.title || chat.chat_id)}</div><div class="meta">${escHtml(chat.mode)} · ${escHtml(chat.model)} · ${chat.message_count} msg(s) · ${formatDate(chat.updated_at)}</div>`;
      item.addEventListener("click", () => openHistoryChat(chat.chat_id));
      elements.historyList.appendChild(item);
    });
  } catch (error) {
    elements.historyList.innerHTML = `<div class="history-item"><div class="title">Erro</div><div class="meta">${escHtml(error.message || error)}</div></div>`;
  }
}

async function openHistoryChat(chatId) {
  const response = await fetch(`${currentBaseUrl()}/v1/chats/${encodeURIComponent(chatId)}`, { headers: buildHeaders() });
  if (!response.ok) {
    throw new Error(`Falha ao abrir chat ${chatId}`);
  }
  const chat = await response.json();
  state.previewChat = chat;
  elements.historyMeta.classList.remove("empty");
  elements.historyMeta.innerHTML = `<strong>${escHtml(chat.title || chat.chat_id)}</strong><br><span class="hint">${escHtml(chat.mode)} · ${escHtml(chat.model)} · atualizado em ${formatDate(chat.updated_at)}</span>`;
  renderHistoryMessages(chat);
  elements.historyResume.disabled = false;
  elements.historyExport.disabled = false;
  elements.historyDelete.disabled = false;
  await loadHistoryList();
}

function resumePreviewChat() {
  if (!state.previewChat) {
    return;
  }
  const mode = state.previewChat.mode === "interactive" ? "interactive" : "tester";
  state[mode] = {
    mode,
    chatId: state.previewChat.chat_id,
    sessionId: state.previewChat.session_id,
    messages: (state.previewChat.messages || []).map((message) => ({
      role: message.role,
      content: message.content,
      response_id: message.response_id || null,
      latency_ms: message.latency_ms,
      attachments: message.attachments
    })),
    resumable: Boolean(state.previewChat.resumable),
    responseId: state.previewChat.response_id || null,
    loading: false,
    model: state.previewChat.model
  };
  elements.modelSelect.value = state.previewChat.model || DEFAULT_MODEL;
  elements.systemPrompt.value = state.previewChat.system_prompt || DEFAULT_SYSTEM_PROMPT;
  setTab(mode);
}

async function deletePreviewChat() {
  if (!state.previewChat || !window.confirm("Apagar esta conversa?")) {
    return;
  }
  await fetch(`${currentBaseUrl()}/v1/chats/${encodeURIComponent(state.previewChat.chat_id)}`, {
    method: "DELETE",
    headers: buildHeaders()
  });
  state.previewChat = null;
  elements.historyMeta.classList.add("empty");
  elements.historyMeta.textContent = "Selecione uma conversa.";
  elements.historyMessages.innerHTML = "";
  elements.historyResume.disabled = true;
  elements.historyExport.disabled = true;
  elements.historyDelete.disabled = true;
  await loadHistoryList();
}

function exportPreviewChat() {
  if (!state.previewChat) {
    return;
  }
  const blob = new Blob([JSON.stringify(state.previewChat, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.previewChat.chat_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function updateAuthSlotSelect(summary) {
  const slots = summary?.slots?.filter((slot) => slot.exists) || [];
  elements.authSlot.innerHTML = `<option value="">Auto</option>${slots
    .map((slot) => `<option value="${slot.id}">${slot.id} (${slot.enabled ? "ativo" : "pausado"}${slot.is_current ? ", atual" : ""})</option>`)
    .join("")}`;
  elements.authSlot.value = state.authSlotSelection;
}

async function loadAuthPool() {
  try {
    state.adminPin = elements.adminPin.value.trim();
    localStorage.setItem(AUTH_PIN_KEY, state.adminPin);
    const response = await fetch(`${currentBaseUrl()}/v1/auth-pool`, { headers: buildAdminHeaders() });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || `HTTP ${response.status}`);
    }
    const summary = await response.json();
    state.authPool = summary;
    updateAuthSlotSelect(summary);
    elements.authSlots.innerHTML = "";
    summary.slots.forEach((slot) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `auth-slot-card${state.selectedAuthSlotId === slot.id ? " active" : ""}`;
      card.innerHTML = `<div class="title">${escHtml(slot.id)}</div><div class="meta">${slot.exists ? (slot.account_id || "sem accountId") : "vazio"}<br>${slot.access_preview || "sem token"}<br>${slot.enabled ? "ativo" : "pausado"}${slot.is_current ? " · atual" : ""}</div>`;
      card.addEventListener("click", () => openAuthSlot(slot.id));
      elements.authSlots.appendChild(card);
    });
    elements.authResult.textContent = "Auth pool carregado.";
    if (!state.selectedAuthSlotId) {
      const firstExisting = summary.slots.find((slot) => slot.exists) || summary.slots[0];
      if (firstExisting) {
        await openAuthSlot(firstExisting.id);
      }
    }
  } catch (error) {
    elements.authSlots.innerHTML = `<div class="auth-slot-card"><div class="title">Erro</div><div class="meta">${escHtml(error.message || error)}</div></div>`;
    elements.authResult.textContent = String(error.message || error);
  }
}

async function openAuthSlot(slotId) {
  state.selectedAuthSlotId = slotId;
  const response = await fetch(`${currentBaseUrl()}/v1/auth-pool/${encodeURIComponent(slotId)}`, { headers: buildAdminHeaders() });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || `HTTP ${response.status}`);
  }
  const payload = await response.json();
  elements.authSlotTitle.textContent = slotId;
  elements.authEnabled.checked = Boolean(payload.slot?.enabled);
  elements.authJson.value = payload.auth ? JSON.stringify(payload.auth, null, 2) : JSON.stringify({ access: "", refresh: "", expires: 0, accountId: "" }, null, 2);
  elements.authResult.textContent = JSON.stringify(payload.slot || {}, null, 2);
  await loadAuthPool();
}

async function saveAuthSlot() {
  if (!state.selectedAuthSlotId) {
    return;
  }
  const auth = JSON.parse(elements.authJson.value || "{}");
  const response = await fetch(`${currentBaseUrl()}/v1/auth-pool/${encodeURIComponent(state.selectedAuthSlotId)}`, {
    method: "PUT",
    headers: buildAdminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ auth, enabled: elements.authEnabled.checked })
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || `HTTP ${response.status}`);
  }
  elements.authResult.textContent = "Slot salvo com sucesso.";
  await loadAuthPool();
}

async function activateAuthSlot() {
  if (!state.selectedAuthSlotId) {
    return;
  }
  await fetch(`${currentBaseUrl()}/v1/auth-pool/activate`, {
    method: "POST",
    headers: buildAdminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ slot_id: state.selectedAuthSlotId })
  });
  await loadAuthPool();
}

async function testAuthSlot() {
  if (!state.selectedAuthSlotId) {
    return;
  }
  const response = await fetch(`${currentBaseUrl()}/v1/auth-pool/${encodeURIComponent(state.selectedAuthSlotId)}/test`, {
    method: "POST",
    headers: buildAdminHeaders()
  });
  const payload = await response.json();
  elements.authResult.textContent = JSON.stringify(payload, null, 2);
}

async function deleteAuthSlot() {
  if (!state.selectedAuthSlotId || !window.confirm(`Apagar ${state.selectedAuthSlotId}?`)) {
    return;
  }
  await fetch(`${currentBaseUrl()}/v1/auth-pool/${encodeURIComponent(state.selectedAuthSlotId)}`, {
    method: "DELETE",
    headers: buildAdminHeaders()
  });
  state.selectedAuthSlotId = null;
  elements.authJson.value = "";
  elements.authResult.textContent = "Slot apagado.";
  await loadAuthPool();
}

function bindEvents() {
  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });
  elements.reloadModels.addEventListener("click", loadModels);
  elements.storeEnable.addEventListener("click", () => setStore(true));
  elements.storeDisable.addEventListener("click", () => setStore(false));
  elements.send.addEventListener("click", sendMessage);
  elements.prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  elements.clearChat.addEventListener("click", clearCurrentChat);
  elements.reloadHistory.addEventListener("click", loadHistoryList);
  elements.historySearch.addEventListener("input", () => loadHistoryList());
  elements.historyResume.addEventListener("click", resumePreviewChat);
  elements.historyDelete.addEventListener("click", deletePreviewChat);
  elements.historyExport.addEventListener("click", exportPreviewChat);
  elements.reloadAuth.addEventListener("click", loadAuthPool);
  elements.authSlot.addEventListener("change", () => {
    state.authSlotSelection = elements.authSlot.value;
    localStorage.setItem(AUTH_SLOT_KEY, state.authSlotSelection);
  });
  elements.authSave.addEventListener("click", () => saveAuthSlot().catch((error) => (elements.authResult.textContent = String(error.message || error))));
  elements.authActivate.addEventListener("click", () => activateAuthSlot().catch((error) => (elements.authResult.textContent = String(error.message || error))));
  elements.authTest.addEventListener("click", () => testAuthSlot().catch((error) => (elements.authResult.textContent = String(error.message || error))));
  elements.authDelete.addEventListener("click", () => deleteAuthSlot().catch((error) => (elements.authResult.textContent = String(error.message || error))));
}

async function init() {
  bindEvents();
  renderChat();
  await Promise.all([loadModels(), loadStoreState(), loadAuthPool()]);
  setTab("tester");
}

init().catch((error) => {
  console.error(error);
  setStatus(`Falha ao iniciar: ${error.message || error}`, true);
});
