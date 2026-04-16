const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.SMOKE_PORT || 8099);
const baseUrl = `http://127.0.0.1:${port}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // keep polling
    }

    await sleep(300);
  }

  throw new Error(`Server did not become healthy within ${timeoutMs}ms`);
}

async function run() {
  const hasAuth = Boolean(process.env.AUTH_JSON) || fs.existsSync(path.join(process.cwd(), "auth.json"));
  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: process.env.NODE_ENV || "development"
  };

  const server = spawn(process.execPath, ["dist/server/index.js"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const health = await waitForServer();

    const rootResponse = await fetch(`${baseUrl}/`);
    const rootHtml = await rootResponse.text();

    const modelsResponse = await fetch(`${baseUrl}/v1/models`);
    const models = await modelsResponse.json();

    const storeResponse = await fetch(`${baseUrl}/v1/store`);
    const store = await storeResponse.json();

    const chatsResponse = await fetch(`${baseUrl}/v1/chats`);
    const chats = await chatsResponse.json();

    const authPoolResponse = await fetch(`${baseUrl}/v1/auth-pool`);
    const authPool = await authPoolResponse.json();

    const toolsResponse = await fetch(`${baseUrl}/tools/list`);
    const tools = await toolsResponse.json();

    const toolRunResponse = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "smoke-tool",
        method: "tools.run",
        params: {
          tool: "eval_math",
          args: {
            expression: "12 * 15 + 3"
          }
        }
      })
    });

    const toolRun = await toolRunResponse.json();

    let chat = null;
    if (hasAuth) {
      const chatResponse = await fetch(`${baseUrl}/rpc`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "smoke-chat",
          method: "chat",
          params: {
            model: "gpt-5.4-mini",
            sessionId: "smoke-session",
            messages: [
              {
                role: "user",
                content: "Responda somente: smoke ok"
              }
            ],
            tools_enabled: false
          }
        })
      });

      chat = await chatResponse.json();
    }

    const summary = {
      health,
      root_ok: rootResponse.ok && rootHtml.includes("CODEX-JSON-RPC"),
      models_count: Array.isArray(models.data) ? models.data.length : 0,
      store_enabled: Boolean(store?.store_enabled),
      chats_count: Array.isArray(chats?.chats) ? chats.chats.length : 0,
      auth_pool_slots: Array.isArray(authPool?.slots) ? authPool.slots.length : 0,
      tools_count: tools?.result?.tools?.length || 0,
      auth_detected: hasAuth,
      chat_finish_reason: chat?.result?.choices?.[0]?.finish_reason || null,
      tool_attempts: chat?.result?.tool_execution?.attempts?.length || 0,
      tool_run_ok: Boolean(toolRun?.result?.result?.ok)
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    server.kill();
    await sleep(300);

    if (stderr.trim()) {
      console.error("[smoke-test stderr]");
      console.error(stderr.trim());
    }

    if (stdout.trim()) {
      console.log("[smoke-test server stdout]");
      console.log(stdout.trim());
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
