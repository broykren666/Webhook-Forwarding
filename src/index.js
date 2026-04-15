import { buildMessageTemplate } from "./templates.js";
import { sendToTelegram } from "./senders/telegram.js";
import { sendToWxPusher } from "./senders/wxpusher.js";
import { sendToPushMe } from "./senders/pushme.js";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const channel = resolveChannel(url.pathname);

      if (!channel) {
        return json(
          {
            ok: false,
            error: "Not found",
          },
          404
        );
      }

      const validationResult = checkAuth(request, env, url, channel);

      if (!validationResult.ok) {
        return json(
          {
            ok: false,
            error: validationResult.error,
          },
          401
        );
      }
      const activeConfig = validationResult.config;

      if (request.method === "GET") {
        return json({
          ok: true,
          service: "webhook-notify",
          channel,
          now: new Date().toISOString(),
          path: url.pathname,
        });
      }

      if (request.method !== "POST") {
        return json(
          {
            ok: false,
            error: "Method not allowed",
          },
          405
        );
      }

      const contentType = request.headers.get("content-type") || "";
      const bodyText = await request.text();
      const payload = parsePayload(bodyText, contentType);
      const source = {
        method: request.method,
        path: url.pathname,
        ip:
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for") ||
          "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        receivedAt: new Date().toISOString(),
      };
      const useAi = url.searchParams.get("use_ai") === "true" || url.searchParams.get("use_ai") === "1";

      const queueMessage = {
        channel,
        config: activeConfig,
        payload,
        source,
        useAi,
        requestMeta: {
          url: request.url,
          headers: {
            "x-github-event": request.headers.get("x-github-event") || ""
          }
        }
      };

      if (env.WEBHOOK_QUEUE) {
        await env.WEBHOOK_QUEUE.send(queueMessage);
        return json({ ok: true, channel, message: "Accepted and queued" }, 202);
      } else {
        const result = await processMessageSync(queueMessage, env);
        return json({ ok: true, channel, status: "sync_processed", ...result });
      }
    } catch (error) {
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  },

  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        await processMessageSync(msg.body, env);
        msg.ack();
      } catch (err) {
        console.error("Queue process failed:", err);
        msg.retry();
      }
    }
  }
};

async function processMessageSync(data, env) {
  const { channel, config, payload, source, useAi, requestMeta } = data;

  const mockRequest = {
    url: requestMeta.url,
    headers: {
      get: (key) => requestMeta.headers[key.toLowerCase()] || null
    }
  };

  const message = buildMessageTemplate({ payload, request: mockRequest, source });

  if (useAi && env.AI) {
    try {
      const rawData = JSON.stringify(payload);
      const truncatedData = rawData.length > 3000 ? rawData.substring(0, 3000) + '\n...[Data Truncated]' : rawData;
      
      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: '你是一个分析Webhook数据的专业助手。请阅读以下JSON数据，并用简短、专业的中文提炼核心内容与摘要。请精简你的回答，不要超过100个字。' },
          { role: 'user', content: truncatedData }
        ]
      });
      
      if (aiResponse && aiResponse.response) {
        message.content = `🤖【AI智能摘要】\n${aiResponse.response.trim()}\n\n---\n${message.content}`;
      }
    } catch (err) {
      console.error("AI 摘要生成失败", err);
    }
  }

  const result = await sendByChannel(channel, config, message);
  return { title: message.title, result };
}

function resolveChannel(pathname) {
  if (pathname.startsWith("/wx/") || pathname === "/wx") {
    return "wx";
  }

  if (pathname.startsWith("/tg/") || pathname === "/tg") {
    return "tg";
  }

  if (pathname.startsWith("/pm/") || pathname === "/pm") {
    return "pm";
  }

  return "";
}

function checkAuth(request, env, url, channel) {
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const headerToken = request.headers.get("x-webhook-token") || "";
  const queryToken = url.searchParams.get("token") || "";
  const providedToken = bearerToken || headerToken.trim() || queryToken.trim();

  if (!providedToken) {
    return { ok: false, error: "Unauthorized" };
  }

  let configs = [];
  try {
    if (channel === "wx" && env.WXPUSHER) {
      configs = JSON.parse(env.WXPUSHER);
    } else if (channel === "tg" && env.TELEGRAM) {
      configs = JSON.parse(env.TELEGRAM);
    } else if (channel === "pm" && env.PUSHME) {
      configs = JSON.parse(env.PUSHME);
    }
  } catch (e) {
    return { ok: false, error: `Invalid config format for channel: ${channel}` };
  }

  if (!configs || !Array.isArray(configs) || configs.length === 0) {
    return { ok: false, error: `Missing config for channel: ${channel}` };
  }

  const activeConfig = configs.find((c) => c.TOKEN === providedToken);
  if (!activeConfig) {
    return { ok: false, error: "Invalid token" };
  }

  return { ok: true, config: activeConfig };
}

function parsePayload(bodyText, contentType) {
  if (!bodyText) {
    return {};
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(bodyText);
    return Object.fromEntries(params.entries());
  }

  return {
    raw: bodyText,
  };
}

async function sendByChannel(channel, config, message) {
  if (channel === "wx") {
    return sendToWxPusher(config, message);
  }

  if (channel === "tg") {
    return sendToTelegram(config, message);
  }

  if (channel === "pm") {
    return sendToPushMe(config, message);
  }

  throw new Error(`Unsupported channel: ${channel}`);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
