export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

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

      const title = buildTitle(payload, request);
      const summary = buildSummary(payload);
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

      const html = renderHtmlMessage(title, summary, payload, source);
      const wxResult = await sendToWxPusher(env, title, html);

      return json({
        ok: true,
        title,
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

function buildTitle(payload, request) {
  if (typeof payload.title === "string" && payload.title.trim()) {
    return payload.title.trim();
  }

  if (typeof payload.event === "string" && payload.event.trim()) {
    return `Webhook: ${payload.event.trim()}`;
  }

  if (typeof payload.type === "string" && payload.type.trim()) {
    return `Webhook: ${payload.type.trim()}`;
  }

  const path = new URL(request.url).pathname;
  return `Webhook Notification ${path}`;
}

function buildSummary(payload) {
  if (typeof payload.content === "string" && payload.content.trim()) {
    return payload.content.trim();
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  return "Received a new webhook event.";
}

function renderHtmlMessage(title, summary, payload, source) {
  const prettyPayload = escapeHtml(JSON.stringify(payload, null, 2));

  return `
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(summary)}</p>
    <hr />
    <p><b>Path:</b> ${escapeHtml(source.path)}</p>
    <p><b>Method:</b> ${escapeHtml(source.method)}</p>
    <p><b>IP:</b> ${escapeHtml(source.ip)}</p>
    <p><b>User-Agent:</b> ${escapeHtml(source.userAgent)}</p>
    <p><b>Received At:</b> ${escapeHtml(source.receivedAt)}</p>
    <hr />
    <pre>${prettyPayload}</pre>
  `.trim();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
