import http from "http";
import fs from "fs";
import path from "path";

// 1. 读取并解析 .dev.vars 配置
const devVarsPath = path.join(process.cwd(), ".dev.vars");
let envVars = {};
try {
  if (fs.existsSync(devVarsPath)) {
    const content = fs.readFileSync(devVarsPath, "utf-8");
    content.split("\n").forEach(line => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;
      const idx = line.indexOf("=");
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        envVars[key] = val;
      }
    });
  }
} catch (e) {
  console.error("读取 .dev.vars 失败:", e.message);
}

const parseConfigSafely = (key) => {
  try {
    return envVars[key] ? JSON.parse(envVars[key]) : [];
  } catch(e) {
    return [];
  }
};

const platforms = {
  wx: parseConfigSafely("WXPUSHER"),
  tg: parseConfigSafely("TELEGRAM"),
  pm: parseConfigSafely("PUSHME")
};

// 2. 极为现代精美的前端 HTML
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Webhook Dashboard 调试面板</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f1115;
      --card-bg: #1c1f26;
      --card-hover: #252932;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --success: #10b981;
      --danger: #ef4444;
      --border: #334155;
    }
    body {
      margin: 0;
      font-family: 'Inter', system-ui, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 40px 20px;
    }
    h1 {
      font-size: 2.5rem;
      background: linear-gradient(135deg, #60a5fa, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 2rem;
      animation: fadeInDown 0.8s ease;
    }
    .config-header {
      width: 100%;
      max-width: 1100px;
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      background: rgba(255, 255, 255, 0.05);
      padding: 15px 25px;
      border-radius: 12px;
      border: 1px solid var(--border);
      backdrop-filter: blur(10px);
    }
    .main-container {
      display: flex;
      width: 100%;
      max-width: 1100px;
      gap: 20px;
      align-items: flex-start;
    }
    .grid {
      width: 300px;
      display: flex;
      flex-direction: column;
      gap: 25px;
      max-height: 85vh;
      overflow-y: auto;
      padding-right: 15px;
    }
    .platform-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .platform-group-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .platform-group-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--border);
    }
    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card:hover {
      border-color: var(--primary);
      background-color: var(--card-hover);
      transform: translateX(5px);
    }
    .token-row {
      font-family: 'Menlo', monospace;
      font-size: 0.85rem;
      color: #60a5fa;
      background: rgba(59, 130, 246, 0.1);
      padding: 8px 12px;
      border-radius: 6px;
      word-break: break-all;
    }
    .button-row {
      display: flex;
      gap: 10px;
    }
    button {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 8px;
      background-color: var(--primary);
      color: white;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
    }
    button:hover { background-color: var(--primary-hover); }
    button.btn-ai { background: linear-gradient(135deg, #a855f7, #ec4899); }
    button.btn-ai:hover { opacity: 0.9; }
    
    .log-panel {
      flex: 1.8;
      background-color: #000;
      border-radius: 12px;
      border: 1px solid var(--border);
      padding: 20px;
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 0.85rem;
      color: #a78bfa;
      white-space: pre-wrap;
      overflow-y: auto;
      height: 700px;
      box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
    }


    .log-entry { margin-bottom: 10px; position:relative; animation: fadeIn 0.4s ease;}
    .log-time { color: var(--text-muted); font-size: 0.75rem; }
    .log-success { color: var(--success); }
    .log-error { color: var(--danger); }
    
    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  </style>
</head>
<body>

  <h1>🚀 Webhook Debug Dashboard</h1>

  <div class="config-header">
    <div>
      <span style="color: var(--text-muted); margin-right: 10px;">目标服务节点 (Host):</span>
      <input type="text" id="targetHost" class="host-input" value="http://127.0.0.1:8787">
    </div>
    <div>
      <span style="color: var(--text-muted); font-size: 0.9rem;">(数据来源: 本地 .dev.vars)</span>
    </div>
  </div>

  <div class="main-container">
    <div class="grid" id="cardContainer">
      <!-- 动态渲染卡片 -->
    </div>

    <div class="log-panel" id="logPanel">
      <div style="color: var(--text-muted);">[System] Dashboard Initialized. Waiting for tests...</div>
    </div>
  </div>

  <script>
    const logPanel = document.getElementById('logPanel');
    const container = document.getElementById('cardContainer');
    let platforms = {};

    function addLog(type, text, raw) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      const time = new Date().toLocaleTimeString();
      let colorClass = type === 'success' ? 'log-success' : type === 'error' ? 'log-error' : '';
      div.innerHTML = \`<span class="log-time">[\${time}]</span> <strong class="\${colorClass}">\${type.toUpperCase()}</strong> \${text}\n\` + (raw ? \`<div style="color:#e2e8f0; margin-top:5px; padding-left:15px; border-left:2px solid #334155;">\${raw}</div>\` : '');
      logPanel.appendChild(div);
      logPanel.scrollTop = logPanel.scrollHeight;
    }

    async function fireWebhook(channel, configObj, useAi) {
      const host = document.getElementById('targetHost').value;
      const targetUrl = \`\${host}/\${channel}/?token=\${configObj.TOKEN}\${useAi ? '&use_ai=true' : ''}\`;
      
      const testPayload = useAi ? {
        event: "Dashboard_Complex_Trigger",
        data: { alert: "OOM Error Detected", process: "redis-server", hint: "It indicates AI should generate an emergency summarization for these logs." }
      } : {
        title: "⚡ Dashboard 测试",
        content: "这是一条来自 Webhook Dashboard 前端面板的测试连通消息！"
      };

      addLog('info', \`🚀 发送请求至 \${targetUrl} ...\`);

      try {
        const response = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: targetUrl,
            payload: testPayload
          })
        });

        const data = await response.json();
        if (response.ok) {
          addLog('success', \`请求成功完成 (200/202) -> 渠道:\${channel}\`, JSON.stringify(data, null, 2));
        } else {
          addLog('error', \`请求失败 HTTP \${response.status}\`, JSON.stringify(data, null, 2));
        }
      } catch (err) {
        addLog('error', \`网络错误或跨域拦截: \${err.message}\`);
      }
    }

    async function loadData() {
      try {
        const res = await fetch('/api/config');
        platforms = await res.json();
        
        const channelMeta = [
          { key: 'tg', name: 'Telegram' },
          { key: 'wx', name: 'WxPusher' },
          { key: 'pm', name: 'PushMe' }
        ];

        let found = false;
        channelMeta.forEach(meta => {
          const ch = meta.key;
          const configList = platforms[ch] || [];
          
          if (configList.length > 0) {
            found = true;
            const section = document.createElement('div');
            section.className = 'platform-section';
            section.innerHTML = \`<div class="platform-group-title">\${meta.name}</div>\`;
            
            configList.forEach(conf => {
              const card = document.createElement('div');
              card.className = 'card';
              card.innerHTML = \`
                <div class="token-row" title="Full Token: \${conf.TOKEN}">
                  Token: \${conf.TOKEN.slice(0, 8)}...\${conf.TOKEN.slice(-8)}
                </div>
                <div class="button-row">
                  <button onclick='fireWebhook("\${ch}", \${JSON.stringify(conf)}, false)'>📩 标准推送</button>
                  <button class="btn-ai" onclick='fireWebhook("\${ch}", \${JSON.stringify(conf)}, true)'>🤖 AI 总结</button>
                </div>
              \`;
              section.appendChild(card);
            });
            container.appendChild(section);
          }
        });

        if(!found) {
           container.innerHTML = '<div style="color:var(--danger)">并未在您的 .dev.vars 中找到任何有效的主流平台数组配置！请检查格式。</div>';
        }
      } catch(e) {
        addLog('error', '加载本地配置失败，服务端是否重启？');
      }
    }

    loadData();
  </script>

</body>
</html>
`;

// 3. 创建极简 Node.js 本地接口服务器以规避 CORS 和提供代理
const server = http.createServer(async (req, res) => {
  // 注入跨域 (如果需要)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // 1. 首页路由返回纯 HTML
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML_CONTENT);
  }

  // 2. 将解析好的 .dev.vars 内嵌数据返回给前端界面
  if (req.url === '/api/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(platforms));
  }

  // 3. 规避前端直连 localhost:8787 导致的跨域拦截，采用 node 层代发
  if (req.url === '/api/proxy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url, payload } = JSON.parse(body);
        const proxyRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Test-Dashboard' },
          body: JSON.stringify(payload)
        });
        const responseData = await proxyRes.json().catch(() => ({}));
        res.writeHead(proxyRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n======================================`);
  console.log(`🎨 Webhook Dashboard 测试面板已启动!`);
  console.log(`👉 请用浏览器打开: http://localhost:${PORT}`);
  console.log(`======================================\n`);
  console.log(`配置已从 .dev.vars 中提取 [WxPusher: ${platforms.wx.length} 个, Telegram: ${platforms.tg.length} 个, PushMe: ${platforms.pm.length} 个]`);
});
