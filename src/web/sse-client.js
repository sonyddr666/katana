// SSE Client for real-time streaming updates
// Not fully integrated yet - placeholder for future enhancement

export class SSEClient {
  private eventSource: EventSource | null = null;
  private sessionId: string;
  private onToolUpdate?: (data: any) => void;
  private onConnected?: () => void;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  connect() {
    const url = `/stream/${this.sessionId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log(`[SSE] Connected for session ${this.sessionId}`);
      this.onConnected?.();
    };

    this.eventSource.onmessage = (event) => {
      console.log("[SSE] Message:", event.data);
    };

    this.eventSource.addEventListener("tool_update", (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      console.log("[SSE] Tool update:", data);
      this.onToolUpdate?.(data);
    });

    this.eventSource.onerror = (err) => {
      console.error("[SSE] Error:", err);
      this.disconnect();
    };
  }

  onToolUpdateCallback(cb: (data: any) => void) {
    this.onToolUpdate = cb;
  }

  onConnectedCallback(cb: () => void) {
    this.onConnected = cb;
  }

  disconnect() {
    this.eventSource?.close();
    this.eventSource = null;
  }
}

// Auto-connect on page load if sessionId exists
document.addEventListener("DOMContentLoaded", () => {
  // Future: integrate with main.js for live tool updates
});
