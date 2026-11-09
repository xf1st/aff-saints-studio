import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  analytics,
  seedState,
  userById,
  workMs,
  isOverdue,
  safeUrl,
} from "../lib/model.ts";
const buyer = userById("buyer"),
  creative = userById("creative"),
  creative2 = userById("creative2"),
  manager = userById("manager");
const at = (h) => new Date(Date.UTC(2026, 10, 10, h)).toISOString();
const create = {
  action: "create",
  title: "Тест полного цикла",
  offer: "Demo",
  geo: "BR",
  format: "Статика",
  quantity: 2,
  priority: "normal",
  description: "Проверить полный цикл",
  references: ["https://example.com/"],
  deadline: at(23),
};
test("full lifecycle: creation, claim, result, revision, credits, approval, history and time", () => {
  let state = { tasks: [], nextNumber: 1, files: [] };
  state = applyCommand(state, buyer, create, at(1));
  const id = state.tasks[0].id;
  const act = (u, action, h, args = {}) => {
    state = applyCommand(state, u, { action, taskId: id, ...args }, at(h));
  };
  act(creative, "claim", 2);
  act(creative, "credit", 3, { service: "Runway", amount: 15 });
  act(creative, "submit", 4, {
    url: "https://example.com/v1",
    fileIds: [],
    note: "Первая версия",
  });
  act(buyer, "revise", 5, { note: "Увеличить заголовок" });
  act(creative, "credit", 6, { service: "Runway", amount: 5 });
  act(creative, "credit", 6, { service: "OpenAI", amount: 2.5 });
  act(creative, "submit", 7, { url: "https://example.com/v2", fileIds: [] });
  act(buyer, "approve", 9);
  const t = state.tasks[0];
  assert.equal(t.status, "done");
  assert.equal(t.cycle, 2);
  assert.equal(t.results.length, 2);
  assert.equal(t.takenAt, at(2));
  assert.equal(t.submittedAt, at(7));
  assert.equal(t.completedAt, at(9));
  assert.equal(t.history.length, 9);
  assert.equal(t.credits[1].cycle, 2);
  assert.equal(workMs(t, Date.parse(at(15))), 4 * 3600000);
  const m = analytics(state, Date.parse(at(15)));
  assert.equal(m.done, 1);
  assert.equal(m.averageWorkMs, 4 * 3600000);
  assert.equal(m.averageLeadMs, 7 * 3600000);
  assert.deepEqual(
    m.creditBreakdown.find((c) => c.service === "Runway"),
    { service: "Runway", userId: "creative", amount: 20, revisions: 5 },
  );
  assert.equal(isOverdue(t, Date.parse(at(23)) + 10000), false);
});
test("server role rules reject all unauthorized transitions", () => {
  const initial = seedState(Date.parse(at(12)));
  assert.throws(
    () => applyCommand(initial, manager, create, at(12)),
    /только байер/,
  );
  assert.throws(
    () => applyCommand(initial, buyer, { action: "claim", taskId: "demo-1" }),
    /только креативщик/,
  );
  assert.throws(
    () =>
      applyCommand(initial, creative2, {
        action: "submit",
        taskId: "demo-2",
        fileIds: [],
        url: "https://example.com/",
      }),
    /исполнителю/,
  );
  assert.throws(
    () =>
      applyCommand(initial, creative, { action: "approve", taskId: "demo-3" }),
    /байер/,
  );
  assert.throws(
    () => applyCommand(initial, buyer, { action: "approve", taskId: "demo-2" }),
    /не на проверке/,
  );
  assert.throws(
    () =>
      applyCommand(initial, creative2, { action: "claim", taskId: "demo-2" }),
    /уже взяли/,
  );
});
test("validation rejects invalid URLs, deadlines, negative credits and empty results", () => {
  assert.throws(() => safeUrl("javascript:alert(1)"), /HTTPS/);
  assert.throws(() => safeUrl("https://user:pass@example.com/"), /HTTPS/);
  for (const quantity of [0, -1, 1.2, "2", Infinity])
    assert.throws(() =>
      applyCommand(
        { tasks: [], nextNumber: 1, files: [] },
        buyer,
        { ...create, quantity },
        at(1),
      ),
    );
  assert.throws(
    () =>
      applyCommand(
        { tasks: [], nextNumber: 1, files: [] },
        buyer,
        { ...create, deadline: at(0) },
        at(1),
      ),
    /будущем/,
  );
  const initial = seedState(Date.parse(at(12)));
  assert.throws(
    () =>
      applyCommand(initial, creative, {
        action: "submit",
        taskId: "demo-2",
        fileIds: [],
      }),
    /ссылку или файл/,
  );
  assert.throws(
    () =>
      applyCommand(initial, creative, {
        action: "credit",
        taskId: "demo-2",
        service: "Runway",
        amount: -5,
      }),
    /число/,
  );
  assert.throws(
    () =>
      applyCommand(initial, creative, {
        action: "submit",
        taskId: "demo-2",
        fileIds: ["foreign-file"],
      }),
    /недоступен/,
  );
  assert.throws(
    () =>
      applyCommand(initial, buyer, {
        action: "revise",
        taskId: "demo-3",
        note: "",
      }),
    /Описание правок/,
  );
});
test("commands do not mutate their input; ongoing revisions count; seed stages and metrics are consistent", () => {
  const initial = seedState(Date.parse(at(12))),
    before = JSON.stringify(initial);
  applyCommand(
    initial,
    creative,
    { action: "claim", taskId: "demo-1" },
    at(12),
  );
  assert.equal(JSON.stringify(initial), before);
  const m = analytics(initial, Date.parse(at(12)));
  assert.equal(m.total, 6);
  assert.equal(m.done, 1);
  assert.equal(m.overdue, 1);
  assert.equal(m.averageWorkMs, 4 * 3600000);
  assert.equal(m.averageLeadMs, 7 * 3600000);
  assert.equal(workMs(initial.tasks[3], Date.parse(at(12))), 36 * 3600000);
  assert.equal(
    analytics({ tasks: [], nextNumber: 1, files: [] }).averageWorkMs,
    null,
  );
});
