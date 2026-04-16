// Main application state
const state = {
  sessionId: generateSessionId(),
  messages: [],
  isLoading: false,
  toolsEnabled: true,
  currentModel: "codex-mini",
};

// Elements
const chatContainer = document.getElementById("chat-container")!;
const promptInput = document.getElementById("prompt")!;
const sendButton = document.getElementById("send")!;
const modelSelect = document.getElementById("model-select")!;
const toolsEnabledToggle = document.getElementById("tools-enabled")! as HTMLInputElement;
const clearChatButton = document.getElementById("clear-chat")!;
const statusSpan = document.getElementById("status")!;
const sessionIdSpan = document.getElementById("session-id")!;

// Initialize
async function init() {
  sessionIdSpan.textContent = `Session: ${state.sessionId}`;

  // Populate model select
  const models = await fetchModels();
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.id;
    modelSelect.appendChild(option);
  });

  // Load existing session history
  await loadHistory();

  // Setup event listeners
  sendButton.addEventListener("click", sendMessage);
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  toolsEnabledToggle.addEventListener("change", (e) => {
    state.toolsEnabled = (e.target as HTMLInputElement).checked;
  });
  clearChatButton.addEventListener("click", clearChat);

  // Add welcome message
  addMessage("assistant", "Olá! Sou o CODEX-JSON-RPC. Como posso ajudar?");
}

function generateSessionId(): string {
  return "session-" + Date.now().toString(36) + Math.random().toString(36).substr(2);
}

async function fetchModels() {
  try {
    const res = await fetch("/v1/models");
    const data = await res.json();
    return data.models || [{ id: "codex-mini" }];
  } catch {
    return [{ id: "codex-mini" }, { id: "codex" }];
  }
}

async function loadHistory() {
  try {
    const res = await fetch("/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "load-history",
        method: "history.get",
        params: { sessionId: state.sessionId },
      }),
    });
    const data = await res.json();
    if (data.result?.messages) {
      state.messages = data.result.messages;
      state.messages.forEach((msg: any) => {
        addMessageToDOM(msg.role, msg.content, false);
      });
    }
  } catch (err) {
    console.error("Failed to load history:", err);
  }
}

async function sendMessage() {
  const content = promptInput.value.trim();
  if (!content || state.isLoading) return;

  promptInput.value = "";
  addMessage("user", content);

  state.isLoading = true;
  updateStatus("Digitando...");
  sendButton.disabled = true;

  try {
    const res = await fetch("/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "chat",
        params: {
          model: state.currentModel,
          messages: [{ role: "user", content }],
          tools_enabled: state.toolsEnabled ? [] : ["*"],
          sessionId: state.sessionId,
        },
      }),
    });

    const data = await res.json();
    const assistantMsg = data.result?.choices?.[0]?.message?.content || "(sem resposta)";
    const toolExec = data.result?.tool_execution;

    addMessage("assistant", assistantMsg, toolExec);
  } catch (err: any) {
    addMessage("assistant", `❌ Erro: ${err.message}`);
  } finally {
    state.isLoading = false;
    updateStatus("Pronto");
    sendButton.disabled = false;
    promptInput.focus();
  }
}

function addMessage(role: "user" | "assistant", content: string, toolExec?: any) {
  state.messages.push({ role, content, tool_exec: toolExec });
  addMessageToDOM(role, content, true, toolExec);
}

function addMessageToDOM(
  role: string,
  content: string,
  append: boolean = true,
  toolExec?: any
) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;

  const roleSpan = document.createElement("span");
  roleSpan.className = "message-role";
  roleSpan.textContent = role === "user" ? "Você" : "Assistente";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = marked.parse(content);

  // Syntax highlight
  contentDiv.querySelectorAll("pre code").forEach((block) => {
    hljs.highlightElement(block as HTMLElement);
  });

  msgDiv.appendChild(roleSpan);
  msgDiv.appendChild(contentDiv);

  // Tool execution badges
  if (toolExec?.attempts?.length) {
    const badgeContainer = document.createElement("div");
    badgeContainer.className = "tool-badges";

    toolExec.attempts.forEach((attempt: any) => {
      const badge = document.createElement("span");
      badge.className = `tool-badge ${attempt.result}`;
      badge.textContent = `🔧 ${attempt.action} (${attempt.latency_ms}ms) ${attempt.result === "ok" ? "✅" : "❌"}`;
      badgeContainer.appendChild(badge);
    });

    msgDiv.appendChild(badgeContainer);

    // Expandable attempts list
    const toggle = document.createElement("div");
    toggle.className = "attempts-toggle";
    toggle.textContent = `▼ ${toolExec.attempts.length} tool calls`;
    toggle.onclick = () => {
      const list = document.createElement("div");
      list.className = "attempts-list";
      toolExec.attempts.forEach((attempt: any) => {
        const item = document.createElement("div");
        item.className = `attempt-item ${attempt.result}`;
        item.textContent = `${attempt.action}: ${attempt.result} (${attempt.latency_ms}ms)`;
        if (attempt.error) {
          item.textContent += ` - ${attempt.error}`;
        }
        list.appendChild(item);
      });
      toggle.after(list);
      toggle.remove();
    };
    msgDiv.appendChild(toggle);
  }

  if (append) {
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } else {
    chatContainer.insertBefore(msgDiv, chatContainer.firstChild);
  }
}

function updateStatus(text: string) {
  statusSpan.textContent = text;
}

async function clearChat() {
  if (!confirm("Limpar todo o histórico da sessão?")) return;

  try {
    await fetch("/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "clear",
        method: "history.clear",
        params: { sessionId: state.sessionId },
      }),
    });
  } catch (err) {
    console.error("Failed to clear history:", err);
  }

  state.messages = [];
  chatContainer.innerHTML = "";
  addMessage("assistant", "Histórico limpo. Como posso ajudar?");
}

// Start
init();
