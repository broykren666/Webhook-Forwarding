import { buildMessageTemplate } from "./templates.js";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const authError = checkAuth(request, env, url);

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
          service: "webhook-to-wxpusher",
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
      const wxResult = await sendToWxPusher(env, message.title, message.html);

      return json({
        ok: true,
        title: message.title,
        wxpusher: wxResult,
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

function checkAuth(request, env, url) {
  const expectedToken = typeof env.TOKEN === "string" ? env.TOKEN.trim() : "";

  if (!expectedToken) {
    return "Missing config: TOKEN";
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

async function sendToWxPusher(env, title, content) {
  const appToken = env.WXPUSHER_APP_TOKEN;
  const uids = splitCsv(env.WXPUSHER_UIDS);
  const topicIds = splitNumberCsv(env.WXPUSHER_TOPIC_IDS);

  if (!appToken) {
    throw new Error("Missing secret: WXPUSHER_APP_TOKEN");
  }

  if (uids.length === 0 && topicIds.length === 0) {
    throw new Error("Missing target: set WXPUSHER_UIDS or WXPUSHER_TOPIC_IDS");
  }

  const response = await fetch("https://wxpusher.zjiecode.com/api/send/message", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appToken,
      content,
      summary: title,
      contentType: 2,
      uids,
      topicIds,
      verifyPayType: 0,
    }),
  });

  const result = await response.json();

  if (!response.ok || result.code !== 1000) {
    throw new Error(`WxPusher API failed: ${JSON.stringify(result)}`);
  }

  return result;
}

function splitCsv(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitNumberCsv(value) {
  return splitCsv(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
