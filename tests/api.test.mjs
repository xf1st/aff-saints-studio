import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5180";
let cookie = "",
  version = 1,
  taskId,
  fileId;
async function api(path, payload, expected = 200, options = {}) {
  const r = await fetch(base + "/api/" + path, {
    method: payload ? "POST" : "GET",
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(payload instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options,
    },
    ...(payload
      ? {
          body: payload instanceof FormData ? payload : JSON.stringify(payload),
        }
      : {}),
  });
  const raw = await r.text();
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(path + " HTTP " + r.status + ": " + raw);
  }
  assert.equal(r.status, expected, JSON.stringify(value));
  const sessionCookie = r.headers.getSetCookie().find(value => value.startsWith("saints_demo="));
  if (sessionCookie) cookie = sessionCookie.split(";")[0];
  if (value.version) version = value.version;
  return value;
}
const login = (userId) => api("session", { userId });
const command = (action, extra = {}, status = 200) =>
  api("command", { action, taskId, version, ...extra }, status);
test("HTTP full cycle, authentication, CSRF, version conflicts, role rules, R2 upload and isolation", async () => {
  await api("state", null, 401);
  await api("session", { userId: "buyer" }, 403, {
    Origin: "https://evil.example",
  });
  await login("buyer");
  await api("analytics", null, 403);
  let result = await command("create", {
    title: "API — полный цикл",
    offer: "Demo",
    geo: "BR",
    format: "Статика",
    quantity: 2,
    description: "Тестовая задача",
    references: [],
    priority: "high",
    deadline: new Date(Date.now() + 86400000).toISOString(),
  });
  taskId = result.state.tasks[0].id;
  await command("claim", {}, 403);
  await login("creative");
  const staleVersion = version;
  await command("claim");
  await api(
    "command",
    {
      action: "credit",
      taskId,
      version: staleVersion,
      service: "Runway",
      amount: 2,
    },
    409,
  );
  await command("credit", { service: "Runway", amount: 10 });
  const form = new FormData();
  form.set("taskId", taskId);
  form.set(
    "file",
    new File(["demo creative\n"], "creative.txt", { type: "text/plain" }),
  );
  const upload = await api("upload", form);
  fileId = upload.attachment.id;
  await command("submit", {
    fileIds: [fileId],
    note: "Первая версия",
    url: "",
  });
  await login("buyer");
  await command("revise", { note: "Сделать заголовок крупнее" });
  await login("creative2");
  await command("credit", { service: "Runway", amount: 2 }, 403);
  await login("creative");
  await command("credit", { service: "Runway", amount: 3 });
  await command("submit", {
    fileIds: [fileId],
    note: "Правки",
    url: "https://example.com/",
  });
  await login("buyer");
  result = await command("approve");
  assert.equal(
    result.state.tasks.find((t) => t.id === taskId).results.length,
    2,
  );
  const persisted = await api("state");
  assert.equal(
    persisted.state.tasks.find((t) => t.id === taskId).status,
    "done",
  );
  const fileResponse = await fetch(base + "/api/files/" + fileId, {
    headers: { Cookie: cookie },
  });
  assert.equal(fileResponse.status, 200);
  assert.equal(await fileResponse.text(), "demo creative\n");
  assert.match(fileResponse.headers.get("content-disposition"), /attachment/);
  await login("manager");
  const metrics = await api("analytics");
  const expense = metrics.creditBreakdown.find(
    (c) => c.service === "Runway" && c.userId === "creative",
  );
  assert.equal(expense.revisions, 3);
  assert.equal(expense.amount, 93);
  const ownCookie = cookie;
  cookie = "";
  await login("buyer");
  const separate = await api("state");
  assert.equal(
    separate.state.tasks.some((t) => t.id === taskId),
    false,
  );
  const otherFile = await fetch(base + "/api/files/" + fileId, {
    headers: { Cookie: cookie },
  });
  assert.equal(otherFile.status, 404);
  cookie = ownCookie;
});
