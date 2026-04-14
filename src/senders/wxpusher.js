export async function sendToWxPusher(env, message) {
  const appToken = env.WXPUSHER_APP_TOKEN;
  const uids = splitCsv(env.WXPUSHER_UIDS);
  const topicIds = splitNumberCsv(env.WXPUSHER_TOPIC_IDS);

  if (!appToken) {
    throw new Error("Missing config: WXPUSHER_APP_TOKEN");
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
      content: message.html,
      summary: message.summary || message.title,
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
