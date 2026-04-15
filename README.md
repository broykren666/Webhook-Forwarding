## 一个部署在 Cloudflare Workers 上的 webhook 转发器

> [!NOTE]
> 它接收外部 `POST` 请求，在完成简单 token 鉴权后，把请求体整理成消息并发送到不同平台。
>
> 目前支持 Telegram，WxPusher ，pushme

### 访问示例

```text
# 健康检查和调用地址
https://example.domain.com/wx/?token=your-tg-token
https://example.domain.com/wx/?token=your-wx-token
https://example.domain.com/wx/?token=your-pm-token

# 使用 Cloudflare Workers AI 时，只需在任意的 URL 末尾附加查询参数 &use_ai=true 或 `&use_ai=1`，脚本将在正常的通知内容顶部追加一条极简的人言化分析总结！
https://example.domain.com/wx/?token=your-tg-token&use_ai=true
https://example.domain.com/wx/?token=your-wx-token&use_ai=true
https://example.domain.com/wx/?token=your-pm-token&use_ai=true
```

### 功能

- `GET /`：健康检查，需要携带 token
- `POST /`：接收 webhook，需要携带 token
- 支持按路径分发到不同通知平台

*脚本支持以下三种 token 传递方式，按这个优先级读取：*

1. `Authorization: Bearer <TOKEN>`
2. `X-Webhook-Token: <TOKEN>`
3. 查询参数 `?token=<TOKEN>`

发送到 WxPusher，使用 `Authorization`：

```bash
curl -X POST "https://example.domain.com/wx/" \
  -H "Authorization: Bearer your-wx-token" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"服务告警\",\"content\":\"订单服务响应超时\",\"event\":\"alarm\",\"level\":\"high\"}"
```

发送到 Telegram，使用 `X-Webhook-Token`：

```bash
curl -X POST "https://example.domain.com/tg/" \
  -H "X-Webhook-Token: your-tg-token" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"测试通知\",\"content\":\"hello\"}"
```

发送到 WxPusher，使用查询参数：

```bash
curl -X POST "https://example.domain.com/wx/?token=your-wx-token" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"测试通知\",\"content\":\"hello\"}"
```

*返回示例：*

成功：

```json
{
  "ok": true,
  "channel": "wx",
  "title": "服务告警",
  "result": {}
}
```

鉴权失败：

```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

### 编写本地配置文件

*创建本地 wrangler.toml 文件示例*：

```toml
name = "webhook"
main = "src/index.js"
compatibility_date = "2026-04-14"

# 自定义域名
# workers_dev = false
# preview_urls = false
# [[routes]]
# pattern = "example.domain.com"
# custom_domain = true

[observability]
enabled = true

[ai]
binding = "AI"

[[queues.producers]]
queue = "webhook-queue"
binding = "WEBHOOK_QUEUE"

[[queues.consumers]]
queue = "webhook-queue"
max_batch_size = 5
max_batch_timeout = 2
```

*创建本地 .dev.vars 文件示例*：

```.env
WXPUSHER='[{"APP_TOKEN":"your-app-token", "UIDS":"your-uid", "TOKEN":"your-wx-token"}]'
TELEGRAM='[{"BOT_TOKEN":"your-bot-token", "CHAT_ID":"your-chat-id", "TOKEN":"your-tg-token"}]'
PUSHME='[{"PUSH_KEY":"your-push-key", "TOKEN":"your-pm-token"}]'
```

### 部署操作

1. 设置变量：

```bash
# 命令：
npx wrangler secret put WXPUSHER
# 填写：
[{"APP_TOKEN":"your-app-token", "UIDS":"your-uid", "TOKEN":"your-wx-token"}]

# 命令：
npx wrangler secret put TELEGRAM
# 填写：
[{"BOT_TOKEN":"your-bot-token", "CHAT_ID":"your-chat-id", "TOKEN":"your-tg-token"}]

# 填写：
npx wrangler secret put PUSHME
# 填写：
[{"PUSH_KEY":"your-push-key", "TOKEN":"your-pm-token"}]
```

*变量说明*：

`WXPUSHER`：支持配置多个 WxPusher 渠道，每个对象包含：

| key       | value          | 说明                             |
| --------- | -------------- | -------------------------------- |
| APP_TOKEN | your-app-token | WxPusher 的 `appToken`           |
| UIDS      | your-uid       | 接收用户 UID，多个用英文逗号分隔 |
| TOKEN     | your-wx-token  | `/wx/` 路径使用的特定鉴权 token  |

`TELEGRAM`：支持配置多个 Telegram 渠道，每个对象包含：

| key       | value          | 说明                            |
| --------- | -------------- | ------------------------------- |
| BOT_TOKEN | your-bot-token | Telegram Bot token              |
| CHAT_ID   | your-chat-id   | Telegram 接收 chat id           |
| TOKEN     | your-tg-token  | `/tg/` 路径使用的特定鉴权 token |

`PUSHME`：支持配置多个 PushMe 渠道，每个对象包含：

| key      | value         | 说明                            |
| -------- | ------------- | ------------------------------- |
| PUSH_KEY | your-push-key | PushMe 的 `push_key`            |
| TOKEN    | your-tg-token | `/pm/` 路径使用的特定鉴权 token |

1. 正式部署时，**必须先在云端创建消息队列** (必须执行一次):

```bash
npx wrangler queues create webhook-queue
```

1. **发布上线**:

```bash
npx wrangler deploy
```

### 测试通知 (Dashboard 面板)

> 项目中自带了一个极为现代化、无需任何前端依赖的轻量网页调试面板。它能自动读取您的 `.dev.vars` 帮助您一键模拟打通 Webhook 通道

1. 完成发布上线。

2. 在项目开启终端执行：

   ```bash
   node test-dashboard.mjs
   ```

3. 在浏览器打开 `http://localhost:3000` ，目标服务节点 (Host)中填写你的项目自定义域名 <https://example.domain.com> ，即可通过精美的可视页面体验一键消息推播，及检测 AI 降维总结效果！
