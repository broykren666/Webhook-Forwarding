export async function sendToTelegram(env, message) {
  const botToken = env.TG_BOT_TOKEN;
  const chatId = env.TG_CHAT_ID;

  if (!botToken) {
    throw new Error("Missing config: TG_BOT_TOKEN");
  }

  if (!chatId) {
    throw new Error("Missing config: TG_CHAT_ID");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildTelegramText(message),
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(`Telegram API failed: ${JSON.stringify(result)}`);
  }

  return result;
}

function buildTelegramText(message) {
  const title = escapeHtml(message.title || "Webhook");
  const body = htmlToTelegram(message.html || "");

  return `<b>${title}</b>\n${body}`.trim();
}

function htmlToTelegram(html) {
  return html
    .replace(/<hr\s*\/?>/gi, "\n----------------\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h2>(.*?)<\/h2>/gis, "\n<b>$1</b>\n")
    .replace(/<p>(.*?)<\/p>/gis, "$1\n")
    .replace(/<pre>([\s\S]*?)<\/pre>/gi, "<pre>$1</pre>\n")
    .replace(/<\/?(html|body)>/gi, "")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
