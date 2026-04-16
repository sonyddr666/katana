export class SSEClient {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.eventSource = null;
    this.onToolUpdate = null;
    this.onConnected = null;
    this.onAssistantDelta = null;
    this.onCodexEvent = null;
  }

  connect() {
    const url = `/stream/${encodeURIComponent(this.sessionId)}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener("connected", (event) => {
      const data = JSON.parse(event.data);
      console.log("[SSE] Connected:", data);
      if (typeof this.onConnected === "function") {
        this.onConnected(data);
      }
    });

    this.eventSource.addEventListener("tool_update", (event) => {
      const data = JSON.parse(event.data);
      if (typeof this.onToolUpdate === "function") {
        this.onToolUpdate(data);
      }
    });

    this.eventSource.addEventListener("assistant_delta", (event) => {
      const data = JSON.parse(event.data);
      if (typeof this.onAssistantDelta === "function") {
        this.onAssistantDelta(data);
      }
    });

    this.eventSource.addEventListener("codex_event", (event) => {
      const data = JSON.parse(event.data);
      if (typeof this.onCodexEvent === "function") {
        this.onCodexEvent(data);
      }
    });

    this.eventSource.onerror = (error) => {
      console.warn("[SSE] Error:", error);
    };
  }

  onToolUpdateCallback(cb) {
    this.onToolUpdate = cb;
  }

  onConnectedCallback(cb) {
    this.onConnected = cb;
  }

  onAssistantDeltaCallback(cb) {
    this.onAssistantDelta = cb;
  }

  onCodexEventCallback(cb) {
    this.onCodexEvent = cb;
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
