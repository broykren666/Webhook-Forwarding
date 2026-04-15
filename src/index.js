import { buildMessageTemplate } from "./templates.js";
import { sendToTelegram } from "./senders/telegram.js";
import { sendToWxPusher } from "./senders/wxpusher.js";

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

      const authError = checkAuth(request, env, url, channel);

      if (authError) {
        return json(
          {
            ok: false,
            error: authError,
          },
          401
        );
      }

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
      const message = buildMessageTemplate({ payload, request, source });

      const useAi = url.searchParams.get("use_ai") === "true" || url.searchParams.get("use_ai") === "1";
      if (useAi && env.AI) {
        try {
          const rawData = JSON.stringify(payload);
          // 截断数据以防止超出模型 token 限制
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
          // 发生错误时，将无缝降级并继续使用原有硬编码模板的数据
        }
      }

      const result = await sendByChannel(channel, env, message);

      return json({
        ok: true,
        channel,
        title: message.title,
        result,
      });
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
};

function resolveChannel(pathname) {
  if (pathname.startsWith("/wx/") || pathname === "/wx") {
    return "wx";
  }

  if (pathname.startsWith("/tg/") || pathname === "/tg") {
    return "tg";
  }

  return "";
}

function checkAuth(request, env, url, channel) {
  const expectedToken = getChannelToken(env, channel);

  if (!expectedToken) {
    return `Missing config: ${channel === "wx" ? "WXPUSHER_TOKEN" : "TG_TOKEN"}`;
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const headerToken = request.headers.get("x-webhook-token") || "";
  const queryToken = url.searchParams.get("token") || "";
  const providedToken = bearerToken || headerToken.trim() || queryToken.trim();

  if (!providedToken) {
    return "Unauthorized";
  }

  if (providedToken !== expectedToken) {
    return "Invalid token";
  }

  return null;
}

function getChannelToken(env, channel) {
  if (channel === "wx") {
    return typeof env.WXPUSHER_TOKEN === "string" ? env.WXPUSHER_TOKEN.trim() : "";
  }

  if (channel === "tg") {
    return typeof env.TG_TOKEN === "string" ? env.TG_TOKEN.trim() : "";
  }

  return "";
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

async function sendByChannel(channel, env, message) {
  if (channel === "wx") {
    return sendToWxPusher(env, message);
  }

  if (channel === "tg") {
    return sendToTelegram(env, message);
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
