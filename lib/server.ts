import { env } from "cloudflare:workers";
import {
  DomainError,
  USERS,
  analytics,
  applyCommand,
  seedState,
  userById,
  type State,
} from "./model";

const COOKIE = "saints_demo";
type WorkspaceRow = { id: string; data: string; version: number };
type SessionRow = {
  token_hash: string;
  workspace_id: string;
  user_id: string;
  expires_at: string;
};
const db = () => {
  if (!env.DB) throw new Error("DB binding is missing");
  return env.DB;
};
const bucket = () => {
  if (!env.BUCKET) throw new Error("BUCKET binding is missing");
  return env.BUCKET;
};
function json(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function csrf(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    throw new DomainError("Запрос с другого сайта отклонён.", 403);
}
async function auth(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new DomainError("Откройте демо под одной из ролей.", 401);
  const session = await db()
    .prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await hash(token), new Date().toISOString())
    .first<SessionRow>();
  if (!session)
    throw new DomainError("Демо-сессия истекла. Войдите снова.", 401);
  const row = await db()
    .prepare("SELECT id, data, version FROM workspaces WHERE id = ?")
    .bind(session.workspace_id)
    .first<WorkspaceRow>();
  if (!row) throw new DomainError("Демо-пространство недоступно.", 401);
  return {
    session,
    row,
    user: userById(session.user_id),
    state: JSON.parse(row.data) as State,
  };
}
async function save(row: WorkspaceRow, state: State) {
  const result = await db()
    .prepare(
      "UPDATE workspaces SET data = ?, version = version + 1 WHERE id = ? AND version = ?",
    )
    .bind(JSON.stringify(state), row.id, row.version)
    .run();
  if (result.meta.changes !== 1)
    throw new DomainError(
      "Данные уже изменились. Обновите доску и повторите действие.",
      409,
    );
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 20000)
    throw new DomainError("Слишком большой запрос.", 413);
  const raw = await request.text();
  if (raw.length > 20000) throw new DomainError("Слишком большой запрос.", 413);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new DomainError("Некорректный JSON.");
  }
}
function view(state: State, userId: string, version: number) {
  return { state, user: userById(userId), users: USERS, version };
}
export async function handle(request: Request, parts: string[]) {
  try {
    const path = parts.join("/");
    if (request.method !== "GET") csrf(request);
    if (path === "session" && request.method === "POST") {
      const input = await body(request);
      const user = userById(String(input.userId));
      let current: Awaited<ReturnType<typeof auth>> | null = null;
      try {
        current = await auth(request);
      } catch (e) {
        if (!(e instanceof DomainError && e.status === 401)) throw e;
      }
      let workspaceId = current?.row.id,
        state = current?.state;
      if (!workspaceId) {
        workspaceId = crypto.randomUUID();
        state = seedState();
        await db()
          .prepare(
            "INSERT INTO workspaces (id, data, version, created_at) VALUES (?, ?, 1, ?)",
          )
          .bind(workspaceId, JSON.stringify(state), new Date().toISOString())
          .run();
      }
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const tokenHash = await hash(token);
      const statements = [
        db()
          .prepare(
            "INSERT INTO sessions (token_hash, workspace_id, user_id, expires_at) VALUES (?, ?, ?, ?)",
          )
          .bind(
            tokenHash,
            workspaceId,
            user.id,
            new Date(Date.now() + 7 * 86400000).toISOString(),
          ),
      ];
      if (current)
        statements.push(
          db()
            .prepare("DELETE FROM sessions WHERE token_hash = ?")
            .bind(current.session.token_hash),
        );
      await db().batch(statements);
      const secure =
        new URL(request.url).protocol === "https:" ? "; Secure" : "";
      return json(view(state!, user.id, current?.row.version ?? 1), 200, {
        "Set-Cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`,
      });
    }
    const current = await auth(request);
    if (path === "state" && request.method === "GET")
      return json(view(current.state, current.user.id, current.row.version));
    if (path === "analytics" && request.method === "GET") {
      if (current.user.role !== "manager")
        throw new DomainError("Аналитика доступна руководителю.", 403);
      return json(analytics(current.state));
    }
    if (path === "command" && request.method === "POST") {
      const input = await body(request);
      if (input.version !== current.row.version)
        throw new DomainError(
          "Доска обновилась. Обновите данные и повторите действие.",
          409,
        );
      const state = applyCommand(current.state, current.user, input);
      await save(current.row, state);
      return json(view(state, current.user.id, current.row.version + 1));
    }
    if (path === "upload" && request.method === "POST") {
      if (current.user.role !== "creative")
        throw new DomainError("Файлы добавляет исполнитель задачи.", 403);
      if (
        Number(request.headers.get("content-length")) >
        5 * 1024 * 1024 + 16384
      )
        throw new DomainError("Максимум 5 МБ на файл.", 413);
      const form = await request.formData();
      const taskId = String(form.get("taskId"));
      const task = current.state.tasks.find((t) => t.id === taskId);
      if (
        !task ||
        task.assigneeId !== current.user.id ||
        !["progress", "revision"].includes(task.status)
      )
        throw new DomainError(
          "Можно загрузить файл только в свою активную задачу.",
          403,
        );
      if (current.state.files.length >= 30)
        throw new DomainError(
          "В демо доступно до 30 файлов. Используйте ссылку.",
        );
      const file = form.get("file");
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > 5 * 1024 * 1024
      )
        throw new DomainError("Выберите непустой файл до 5 МБ.");
      const allowed = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf",
        "video/mp4",
        "application/zip",
        "application/x-zip-compressed",
        "text/plain",
      ];
      if (!allowed.includes(file.type))
        throw new DomainError(
          "Поддерживаются PNG, JPG, WebP, PDF, MP4, ZIP и TXT.",
        );
      const attachment = {
        id: crypto.randomUUID(),
        name: file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 120),
        size: file.size,
        type: file.type,
        taskId,
        uploaderId: current.user.id,
      };
      const key = `${current.row.id}/${attachment.id}`;
      await bucket().put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
      try {
        const next = structuredClone(current.state);
        next.files.push(attachment);
        await save(current.row, next);
      } catch (e) {
        await bucket().delete(key);
        throw e;
      }
      return json({ attachment, version: current.row.version + 1 });
    }
    if (
      parts[0] === "files" &&
      parts.length === 2 &&
      request.method === "GET"
    ) {
      const file = current.state.files.find((f) => f.id === parts[1]);
      if (!file) throw new DomainError("Файл не найден.", 404);
      const item = await bucket().get(`${current.row.id}/${file.id}`);
      if (!item) throw new DomainError("Файл недоступен.", 404);
      return new Response(item.body, {
        headers: {
          "Content-Type": file.type,
          "Content-Disposition": `attachment; filename="creative-result"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'",
          "Cache-Control": "private, no-store",
        },
      });
    }
    return json({ error: "Маршрут не найден." }, 404);
  } catch (error) {
    // Drain bounded rejected JSON bodies so local/edge HTTP keep-alive stays usable.
    if (
      !request.bodyUsed &&
      request.body &&
      Number(request.headers.get("content-length")) <= 20000
    ) {
      try {
        await request.arrayBuffer();
      } catch {
        /* disconnected client */
      }
    }
    if (error instanceof DomainError)
      return json({ error: error.message }, error.status);
    console.error(
      "API request failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json(
      {
        error:
          "Сервер временно недоступен. Обновите страницу или повторите позже.",
      },
      500,
    );
  }
}
