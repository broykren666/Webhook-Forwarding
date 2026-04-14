export function buildMessageTemplate({ payload, request, source }) {
  const eventName = getEventName(request, payload);
  const context = {
    payload,
    request,
    source: {
      ...source,
      eventName,
    },
  };

  if (isGitHubEvent(context)) {
    return buildGitHubTemplate(context);
  }

  return buildDefaultTemplate(context);
}

function buildGitHubTemplate(context) {
  if (isGitHubPushEvent(context)) {
    return buildGitHubPushTemplate(context);
  }

  if (isGitHubWorkflowRunEvent(context)) {
    return buildGitHubWorkflowRunTemplate(context);
  }

  return buildGitHubGenericTemplate(context);
}

function buildGitHubPushTemplate({ payload, source }) {
  const repoName = payload.repository?.full_name || payload.repository?.name || "GitHub";
  const branch = getGitRefName(payload.ref);
  const pusher = payload.pusher?.name || payload.sender?.login || "unknown";
  const compareUrl = payload.compare || payload.repository?.html_url || "";
  const time = formatTime(source.receivedAt);
  const action = buildGitHubPushAction(payload);

  return {
    title: `${repoName} 有新的 push`,
    summary: action,
    html: `
      <h2>${escapeHtml(repoName)}</h2>
      <p><b>时间：</b>${escapeHtml(time)}</p>
      <p><b>分支：</b>${escapeHtml(branch)}</p>
      <p><b>执行人：</b>${escapeHtml(pusher)}</p>
      ${
        compareUrl
          ? `<p><b>链接：</b><a href="${escapeHtml(compareUrl)}">${escapeHtml(compareUrl)}</a></p>`
          : ""
      }
    `.trim(),
  };
}

function buildGitHubGenericTemplate({ payload, source }) {
  const repoName = payload.repository?.full_name || payload.repository?.name || "GitHub";
  const time = formatTime(source.receivedAt);
  const actor = getGitHubActor(payload);
  const action = getGitHubActionText(payload, source.eventName, actor);
  const targetTitle = getGitHubTargetTitle(payload);
  const targetNumber = getGitHubTargetNumber(payload);
  const targetUrl = getGitHubTargetUrl(payload);
  const eventLabel = getGitHubEventLabel(source.eventName);

  return {
    title: `${repoName} ${eventLabel}`,
    summary: action,
    html: `
      <h2>${escapeHtml(repoName)}</h2>
      <p><b>时间：</b>${escapeHtml(time)}</p>
      <p><b>事件：</b>${escapeHtml(eventLabel)}</p>
      <p><b>动作：</b>${escapeHtml(action)}</p>
      ${
        targetTitle
          ? `<p><b>标题：</b>${escapeHtml(targetTitle)}</p>`
          : ""
      }
      ${
        targetNumber
          ? `<p><b>编号：</b>${escapeHtml(String(targetNumber))}</p>`
          : ""
      }
      <p><b>执行人：</b>${escapeHtml(actor)}</p>
      ${
        targetUrl
          ? `<p><b>链接：</b><a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a></p>`
          : ""
      }
    `.trim(),
  };
}

function buildGitHubWorkflowRunTemplate({ payload, source }) {
  const repoName = payload.repository?.full_name || payload.repository?.name || "GitHub";
  const workflowRun = payload.workflow_run || {};
  const time = formatTime(source.receivedAt);
  const actor = getGitHubActor(payload);
  const workflowName = workflowRun.name || "unknown";
  const branch = workflowRun.head_branch || "unknown";
  const status = workflowRun.status || "unknown";
  const conclusion = workflowRun.conclusion || "running";
  const headSha = workflowRun.head_sha ? workflowRun.head_sha.slice(0, 7) : "";
  const headMessage = workflowRun.head_commit?.message
    ? workflowRun.head_commit.message.split("\n")[0].trim()
    : "";
  const htmlUrl = workflowRun.html_url || payload.repository?.html_url || "";
  const summary = `${workflowName} ${translateWorkflowConclusion(conclusion, status)}`;

  return {
    title: `${repoName} 工作流通知`,
    summary,
    html: `
      <h2>${escapeHtml(repoName)}</h2>
      <p><b>时间：</b>${escapeHtml(time)}</p>
      <p><b>工作流：</b>${escapeHtml(workflowName)}</p>
      <p><b>分支：</b>${escapeHtml(branch)}</p>
      <p><b>状态：</b>${escapeHtml(status)}</p>
      <p><b>结果：</b>${escapeHtml(conclusion)}</p>
      <p><b>触发人：</b>${escapeHtml(actor)}</p>
      ${
        headSha
          ? `<p><b>提交：</b>${escapeHtml(headSha)}</p>`
          : ""
      }
      ${
        headMessage
          ? `<p><b>说明：</b>${escapeHtml(headMessage)}</p>`
          : ""
      }
      ${
        htmlUrl
          ? `<p><b>链接：</b><a href="${escapeHtml(htmlUrl)}">${escapeHtml(htmlUrl)}</a></p>`
          : ""
      }
    `.trim(),
  };
}

function buildDefaultTemplate({ payload, request, source }) {
  const title = buildDefaultTitle(payload, request, source.eventName);
  const summary = buildDefaultSummary(payload);
  const prettyPayload = escapeHtml(JSON.stringify(payload, null, 2));

  return {
    title,
    summary,
    html: `
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(summary)}</p>
      <hr />
      <p><b>Path:</b> ${escapeHtml(source.path)}</p>
      <p><b>Method:</b> ${escapeHtml(source.method)}</p>
      <p><b>Event:</b> ${escapeHtml(source.eventName || "unknown")}</p>
      <p><b>IP:</b> ${escapeHtml(source.ip)}</p>
      <p><b>User-Agent:</b> ${escapeHtml(source.userAgent)}</p>
      <p><b>Received At:</b> ${escapeHtml(source.receivedAt)}</p>
      <hr />
      <pre>${prettyPayload}</pre>
    `.trim(),
  };
}

function getEventName(request, payload) {
  const githubEvent = request.headers.get("x-github-event");

  if (githubEvent && githubEvent.trim()) {
    return githubEvent.trim();
  }

  if (typeof payload.event === "string" && payload.event.trim()) {
    return payload.event.trim();
  }

  if (typeof payload.type === "string" && payload.type.trim()) {
    return payload.type.trim();
  }

  return "";
}

function isGitHubEvent({ payload, source }) {
  return Boolean(
    source.eventName &&
      payload &&
      typeof payload === "object" &&
      (payload.repository || payload.sender || payload.organization)
  );
}

function isGitHubPushEvent({ payload, source }) {
  return source.eventName === "push" && payload && typeof payload === "object" && payload.repository;
}

function isGitHubWorkflowRunEvent({ payload, source }) {
  return (
    source.eventName === "workflow_run" &&
    payload &&
    typeof payload === "object" &&
    payload.workflow_run
  );
}

function buildDefaultTitle(payload, request, eventName) {
  if (typeof payload.title === "string" && payload.title.trim()) {
    return payload.title.trim();
  }

  if (eventName) {
    return `Webhook: ${eventName}`;
  }

  const path = new URL(request.url).pathname;
  return `Webhook Notification ${path}`;
}

function buildDefaultSummary(payload) {
  if (typeof payload.content === "string" && payload.content.trim()) {
    return payload.content.trim();
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  return "Received a new webhook event.";
}

function buildGitHubPushAction(payload) {
  const branch = getGitRefName(payload.ref);
  const commitCount = Array.isArray(payload.commits) ? payload.commits.length : 0;
  const pusher = payload.pusher?.name || payload.sender?.login || "unknown";
  const headMessage = payload.head_commit?.message
    ? payload.head_commit.message.split("\n")[0].trim()
    : "";

  let action = `${pusher} 推送到 ${branch}`;

  if (commitCount > 0) {
    action += `，共 ${commitCount} 次提交`;
  }

  if (headMessage) {
    action += `：${headMessage}`;
  }

  return action;
}

function getGitHubActor(payload) {
  return payload.sender?.login || payload.pusher?.name || "unknown";
}

function getGitHubActionText(payload, eventName, actor) {
  const action = typeof payload.action === "string" && payload.action.trim() ? payload.action.trim() : "";

  if (action) {
    return `${actor} ${translateGitHubAction(action)} ${getGitHubEventLabel(eventName)}`;
  }

  if (eventName) {
    return `${actor} 触发了 ${getGitHubEventLabel(eventName)}`;
  }

  return `${actor} 触发了 GitHub 事件`;
}

function getGitHubTargetTitle(payload) {
  return (
    payload.pull_request?.title ||
    payload.issue?.title ||
    payload.release?.name ||
    payload.release?.tag_name ||
    payload.discussion?.title ||
    payload.comment?.body?.split("\n")[0]?.trim() ||
    payload.review?.body?.split("\n")[0]?.trim() ||
    ""
  );
}

function getGitHubTargetNumber(payload) {
  return (
    payload.pull_request?.number ||
    payload.issue?.number ||
    payload.discussion?.number ||
    payload.release?.id ||
    ""
  );
}

function getGitHubTargetUrl(payload) {
  return (
    payload.pull_request?.html_url ||
    payload.issue?.html_url ||
    payload.release?.html_url ||
    payload.discussion?.html_url ||
    payload.comment?.html_url ||
    payload.review?.html_url ||
    payload.repository?.html_url ||
    ""
  );
}

function getGitHubEventLabel(eventName) {
  if (!eventName) {
    return "GitHub 事件";
  }

  const labels = {
    issues: "Issue",
    issue_comment: "Issue 评论",
    pull_request: "Pull Request",
    pull_request_review: "PR 审查",
    pull_request_review_comment: "PR 评论",
    release: "Release",
    discussion: "Discussion",
    discussion_comment: "Discussion 评论",
    fork: "Fork",
    watch: "Star",
    create: "创建",
    delete: "删除",
    push: "Push",
  };

  return labels[eventName] || eventName;
}

function translateGitHubAction(action) {
  const actions = {
    opened: "打开了",
    closed: "关闭了",
    reopened: "重新打开了",
    created: "创建了",
    edited: "更新了",
    deleted: "删除了",
    published: "发布了",
    submitted: "提交了",
    synchronized: "同步了",
    assigned: "分配了",
    unassigned: "取消分配了",
    labeled: "添加了标签到",
    unlabeled: "移除了标签从",
    locked: "锁定了",
    unlocked: "解锁了",
    pinned: "置顶了",
    unpinned: "取消置顶了",
    converted_to_draft: "转成草稿了",
    ready_for_review: "标记为可审查了",
    reviewed: "审查了",
    released: "发布了",
  };

  return actions[action] || action;
}

function translateWorkflowConclusion(conclusion, status) {
  if (status && status !== "completed") {
    const running = {
      queued: "排队中",
      in_progress: "执行中",
      requested: "已请求",
      waiting: "等待中",
      pending: "处理中",
    };

    return running[status] || status;
  }

  const conclusions = {
    success: "成功",
    failure: "失败",
    neutral: "中立",
    cancelled: "已取消",
    skipped: "已跳过",
    timed_out: "超时",
    action_required: "需要处理",
    startup_failure: "启动失败",
    stale: "已过期",
  };

  return conclusions[conclusion] || conclusion || "已完成";
}

function getGitRefName(ref) {
  if (typeof ref !== "string" || !ref) {
    return "unknown";
  }

  return ref.replace("refs/heads/", "").replace("refs/tags/", "");
}

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
