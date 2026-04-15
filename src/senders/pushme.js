export async function sendToPushMe(config, message) {
  const pushKey = config.PUSH_KEY;

  if (!pushKey) {
    throw new Error("Missing config: PUSH_KEY");
  }

  const response = await fetch("https://push.i-i.me", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      push_key: pushKey,
      title: message.title || message.summary || "Webhook",
      content: message.html || message.summary,
      type: "html",
    }),
  });

  const resultBody = await response.text();

  if (resultBody !== "success") {
    throw new Error(`PushMe API failed: ${resultBody}`);
  }

  return { ok: true, result: resultBody };
}
