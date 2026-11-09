"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileText,
  Filter,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
  ExternalLink,
  Paperclip,
  History,
  RotateCcw,
  Zap,
  Users,
  CircleHelp,
  RefreshCw,
  CalendarDays,
  Download,
  AlertCircle,
} from "lucide-react";
import {
  STAGES,
  USERS,
  isOverdue,
  workMs,
  type Attachment,
  type State,
  type Task,
  type User,
  type Status,
  analytics as calculateAnalytics,
} from "@/lib/model";
type Payload = { state: State; user: User; version: number };
type Metrics = ReturnType<typeof calculateAnalytics>;
const priorityNames = { low: "Низкий", normal: "Обычный", high: "Высокий" };
const date = (iso: string | null, full = false) =>
  iso
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "numeric",
        month: "short",
        ...(full ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(new Date(iso))
    : "—";
const duration = (ms: number | null) =>
  ms === null
    ? "—"
    : ms < 60000
      ? "< 1 мин"
      : ms < 3600000
        ? `${Math.floor(ms / 60000)} мин`
        : `${(ms / 3600000).toFixed(1)} ч`;
const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
const person = (id: string | null) => USERS.find((u) => u.id === id);
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(value.error || "Не удалось выполнить запрос.");
  return value;
}
function Avatar({ id, small = false }: { id: string | null; small?: boolean }) {
  const user = person(id);
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{
        background: user ? `${user.color}22` : "#eeedf0",
        color: user?.color,
      }}
      title={user?.name ?? "Без исполнителя"}
    >
      {user?.initials ?? "–"}
    </span>
  );
}
function Modal({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? "wide" : ""}`}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <span className="eyebrow">SAINTS STUDIO / WORKSPACE</span>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
export default function Dashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<"board" | "analytics">("board");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [priority, setPriority] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [help, setHelp] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<Status | null>(null);
  const [action, setAction] = useState<"submit" | "revise" | "credit" | null>(
    null,
  );
  useEffect(() => {
    request<Payload>("state")
      .then(setData)
      .catch((e) => {
        if (!e.message.includes("демо") && !e.message.includes("сессия"))
          setError(e.message);
      })
      .finally(() => setInitializing(false));
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => {
    setMetrics(null);
    if (data?.user.role === "manager")
      request<Metrics>("analytics")
        .then(setMetrics)
        .catch((e) => setError(e.message));
  }, [data]);
  const refresh = async () => {
    try {
      setError("");
      setData(await request<Payload>("state"));
      setNotice("Данные обновлены");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const login = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      setData(
        await request<Payload>("session", {
          method: "POST",
          body: JSON.stringify({ userId: id }),
        }),
      );
      setSelected(null);
      setAction(null);
      setPage("board");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const command = async (input: Record<string, unknown>): Promise<boolean> => {
    if (!data || busy) return false;
    setBusy(true);
    setError("");
    try {
      setData(
        await request<Payload>("command", {
          method: "POST",
          body: JSON.stringify({ ...input, version: data.version }),
        }),
      );
      setNotice("Изменения сохранены");
      setAction(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (initializing)
    return (
      <div className="splash">
        <span className="brand-mark">
          s<span>✦</span>
        </span>
        <Loader2 className="spin" />
        <p>Открываем студию…</p>
      </div>
    );
  if (!data)
    return (
      <main className="welcome">
        <div className="welcome-story">
          <div className="wordmark">
            <span className="brand-mark">
              s<span>✦</span>
            </span>
            saints<span className="light">studio</span>
          </div>
          <span className="welcome-label">CREATIVE OPERATIONS, SIMPLIFIED</span>
          <h1>
            От идеи
            <br />
            до <em>готово.</em>
          </h1>
          <p>
            Задачи, команда и креативы.
            <br />В одном рабочем пространстве.
          </p>
          <div className="welcome-art">
            <span>ТЗ</span>
            <ArrowRight />
            <span>Креатив</span>
            <ArrowRight />
            <span className="art-done">
              <Check />
              Готово
            </span>
          </div>
          <small>Тестовый прототип · Сергей Юрасов · 2026</small>
        </div>
        <div className="welcome-form">
          <span className="eyebrow">ПОПРОБУЙТЕ В ДЕЙСТВИИ</span>
          <h2>Выберите роль</h2>
          <p>
            Демо-пользователи уже созданы.
            <br />
            Переключайтесь между ними в любой момент.
          </p>
          <div className="persona-list">
            {USERS.map((u) => (
              <button
                disabled={busy}
                className="persona"
                key={u.id}
                onClick={() => login(u.id)}
              >
                <Avatar id={u.id} />
                <span>
                  <strong>{u.name}</strong>
                  <small>{u.label}</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
          <div className="demo-note">
            <Sparkles size={17} />
            <span>
              Собственная песочница с тестовыми задачами. Изменения сохраняются
              на сервере. Не загружайте реальные персональные данные.
            </span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  const { state, user } = data;
  const active = state.tasks.filter((t) => t.status !== "done");
  const mine = (t: Task) =>
    user.role === "buyer" ? t.buyerId === user.id : t.assigneeId === user.id;
  const visible = state.tasks.filter(
    (t) =>
      (!query ||
        `${t.title} ${t.offer} ${t.geo} ${t.number}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (scope !== "mine" || mine(t)) &&
      (scope !== "overdue" || isOverdue(t, now)) &&
      (priority === "all" || t.priority === priority),
  );
  const currentTask = state.tasks.find((t) => t.id === selected);
  const possibleDrop = (t: Task, stage: Status) =>
    (user.role === "creative" && t.status === "new" && stage === "progress") ||
    (user.role === "creative" &&
      t.assigneeId === user.id &&
      ["progress", "revision"].includes(t.status) &&
      stage === "review") ||
    (user.role === "buyer" &&
      t.buyerId === user.id &&
      t.status === "review" &&
      ["revision", "done"].includes(stage));
  const drop = (stage: Status) => {
    const t = state.tasks.find((t) => t.id === dragged);
    setDragged(null);
    setDropHint(null);
    if (!t || !possibleDrop(t, stage)) return;
    if (stage === "progress") void command({ action: "claim", taskId: t.id });
    else if (stage === "done")
      void command({ action: "approve", taskId: t.id });
    else {
      setSelected(t.id);
      setAction(stage === "review" ? "submit" : "revise");
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">
          <span className="brand-mark">
            s<span>✦</span>
          </span>
          saints<span className="light">studio</span>
        </div>
        <div className="workspace">
          <span className="workspace-icon">✦</span>
          <div>
            <strong>Creative team</strong>
            <small>Демо-пространство</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav>
          <button
            className={page === "board" ? "active" : ""}
            onClick={() => setPage("board")}
          >
            <LayoutDashboard size={18} />
            Доска задач<span className="nav-count">{active.length}</span>
          </button>
          {user.role === "manager" && (
            <button
              className={page === "analytics" ? "active" : ""}
              onClick={() => setPage("analytics")}
            >
              <BarChart3 size={18} />
              Аналитика
              <ArrowUpRight size={14} />
            </button>
          )}
          <button onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Как это работает
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={19} />
            <strong>
              Меньше рутины.
              <br />
              Больше креатива.
            </strong>
            <p>От первого брифа до финальной версии — всё под контролем.</p>
            <span>ДЕМО · СИНТЕТИЧЕСКИЕ ДАННЫЕ</span>
          </div>
          <div className="sidebar-profile">
            <Avatar id={user.id} />
            <div>
              <strong>{user.name.split(" ")[0]}</strong>
              <small>{user.label}</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            Рабочее пространство<span>/</span>
            <strong>{page === "board" ? "Доска задач" : "Аналитика"}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">
              <span />
              Демо-режим
            </span>
            <label className="role-select">
              <span>Вы смотрите как</span>
              <select
                aria-label="Переключить пользователя"
                value={user.id}
                disabled={busy}
                onChange={(e) => login(e.target.value)}
              >
                {USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label} · {u.name.split(" ")[0]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <section className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">CREATIVE OPERATIONS</span>
              <h1>
                {page === "board"
                  ? "Хорошие идеи — в работу."
                  : "Команда в цифрах."}
                <span className="heading-star">✦</span>
              </h1>
              <p>
                {page === "board"
                  ? "Весь путь креатива. Прозрачно, спокойно, в одном месте."
                  : "Загрузка, сроки и AI-ресурсы. Данные из вашей демо-команды."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="icon-button refresh"
                onClick={refresh}
                disabled={busy}
                aria-label="Обновить данные"
              >
                <RefreshCw size={18} />
              </button>
              {user.role === "buyer" && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => setCreating(true)}
                >
                  <Plus size={18} />
                  Новая задача
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={refresh}>Обновить</button>
              <button aria-label="Скрыть ошибку" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="stats-row">
            <Stat
              title="Всего задач"
              value={String(state.tasks.length)}
              foot="в рабочем пространстве"
              icon={<LayoutDashboard size={17} />}
            />
            <Stat
              title="В работе"
              value={String(
                state.tasks.filter(
                  (t) => t.status === "progress" || t.status === "revision",
                ).length,
              )}
              foot="создаём и дорабатываем"
              icon={<Zap size={17} />}
              accent
            />
            <Stat
              title="На проверке"
              value={String(
                state.tasks.filter((t) => t.status === "review").length,
              )}
              foot="ждут решения байера"
              icon={<CheckCheck size={17} />}
            />
            <Stat
              title="Просрочено"
              value={String(
                state.tasks.filter((t) => isOverdue(t, now)).length,
              )}
              foot="нуждаются во внимании"
              icon={<Clock3 size={17} />}
              warning
            />
          </div>
          {page === "board" ? (
            <>
              <div className="board-toolbar">
                <div className="tabs">
                  <button
                    className={scope === "all" ? "selected" : ""}
                    onClick={() => setScope("all")}
                  >
                    Все задачи<span>{state.tasks.length}</span>
                  </button>
                  <button
                    className={scope === "mine" ? "selected" : ""}
                    onClick={() => setScope("mine")}
                  >
                    Мои задачи
                  </button>
                  <button
                    className={scope === "overdue" ? "selected" : ""}
                    onClick={() => setScope("overdue")}
                  >
                    Просроченные
                  </button>
                </div>
                <div className="filters">
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Поиск задач"
                      placeholder="Найти задачу…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="Очистить поиск"
                        onClick={() => setQuery("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <label className="priority-filter">
                    <Filter size={15} />
                    <select
                      value={priority}
                      aria-label="Фильтр по приоритету"
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="all">Приоритет</option>
                      <option value="high">Высокий</option>
                      <option value="normal">Обычный</option>
                      <option value="low">Низкий</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="board-scroll">
                <div className="kanban">
                  {STAGES.map((stage) => {
                    const tasks = visible.filter((t) => t.status === stage.id);
                    const dragTask = state.tasks.find((t) => t.id === dragged);
                    const canDrop =
                      dragTask && possibleDrop(dragTask, stage.id);
                    return (
                      <section
                        key={stage.id}
                        aria-label={stage.name}
                        className={`column ${dropHint === stage.id && canDrop ? "drop-active" : ""}`}
                        onDragOver={(e) => {
                          if (canDrop) {
                            e.preventDefault();
                            setDropHint(stage.id);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          drop(stage.id);
                        }}
                      >
                        <div className="column-heading">
                          <span
                            className="stage-dot"
                            style={{ background: stage.color }}
                          />
                          <h2>{stage.name}</h2>
                          <span className="column-count">{tasks.length}</span>
                          {stage.id === "new" && user.role === "buyer" && (
                            <button
                              aria-label="Добавить новую задачу"
                              className="icon-button"
                              onClick={() => setCreating(true)}
                            >
                              <Plus size={15} />
                            </button>
                          )}
                        </div>
                        <div className="card-stack">
                          {tasks.map((t) => (
                            <button
                              key={t.id}
                              className={`task-card ${dragged === t.id ? "dragging" : ""}`}
                              onClick={() => {
                                setSelected(t.id);
                                setAction(null);
                              }}
                              draggable={
                                !busy &&
                                STAGES.some((s) => possibleDrop(t, s.id))
                              }
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", t.id);
                                setDragged(t.id);
                              }}
                              onDragEnd={() => {
                                setDragged(null);
                                setDropHint(null);
                              }}
                            >
                              <div className="card-top">
                                <span
                                  className={`format-tag ${t.format.includes("Видео") || t.format.includes("UGC") ? "video" : ""}`}
                                >
                                  {t.format}
                                </span>
                                <span className="card-number">#{t.number}</span>
                              </div>
                              <h3>{t.title}</h3>
                              <p className="offer-name">{t.offer}</p>
                              <div className="card-tags">
                                <span>{t.geo.split(" · ")[0]}</span>
                                <span>{t.quantity} шт.</span>
                                <span className={`priority ${t.priority}`}>
                                  <span />
                                  {priorityNames[t.priority]}
                                </span>
                              </div>
                              {t.status === "revision" && (
                                <div className="revision-preview">
                                  <RotateCcw size={12} />
                                  Итерация {t.cycle} · ждёт доработки
                                </div>
                              )}
                              <div className="card-footer">
                                <span
                                  className={`deadline ${isOverdue(t, now) ? "late" : ""}`}
                                >
                                  <CalendarDays size={13} />
                                  {date(t.deadline)}
                                  {isOverdue(t, now) && (
                                    <span className="late-dot" />
                                  )}
                                </span>
                                <span className="card-person">
                                  <span>
                                    {t.assigneeId
                                      ? person(t.assigneeId)?.name.split(" ")[0]
                                      : "Свободна"}
                                  </span>
                                  <Avatar id={t.assigneeId} small />
                                </span>
                              </div>
                            </button>
                          ))}
                          {!tasks.length && (
                            <div className="empty-column">
                              <span>
                                {stage.id === "done" ? (
                                  <CheckCheck size={23} />
                                ) : (
                                  <Plus size={22} />
                                )}
                              </span>
                              <p>
                                {query || scope !== "all" || priority !== "all"
                                  ? "Нет задач по фильтрам"
                                  : "Пока пусто"}
                              </p>
                              <small>
                                {canDrop
                                  ? "Перенесите задачу сюда"
                                  : "Здесь появятся задачи"}
                              </small>
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
              <div className="board-footer">
                <span>
                  <span className="green-dot" />
                  Сохранено на сервере · {visible.length} из{" "}
                  {state.tasks.length} задач
                </span>
                <span>Время — МСК · Откройте карточку для действий</span>
              </div>
            </>
          ) : (
            <AnalyticsPanel metrics={metrics} />
          )}
        </section>
        <footer className="app-footer">
          <span>
            saints studio <b>✦</b>
          </span>
          <span>Тестовый прототип · Сергей Юрасов</span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {busy && (
        <div className="working-indicator" role="status">
          <Loader2 size={15} className="spin" />
          Сохраняем…
        </div>
      )}
      {creating && (
        <Modal
          title="Новое техническое задание"
          onClose={() => !busy && setCreating(false)}
          wide
        >
          <>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <CreateForm
              busy={busy}
              onSubmit={async (input) => {
                if (await command({ ...input, action: "create" }))
                  setCreating(false);
              }}
            />
          </>
        </Modal>
      )}
      {currentTask && (
        <Modal
          title={currentTask.title}
          onClose={() => {
            if (!busy) {
              setSelected(null);
              setAction(null);
            }
          }}
          wide
        >
          <>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <TaskDetail
              key={currentTask.id}
              task={currentTask}
              user={user}
              busy={busy}
              action={action}
              setAction={setAction}
              command={command}
              setData={setData}
            />
          </>
        </Modal>
      )}
      {help && (
        <Modal title="От брифа до результата" onClose={() => setHelp(false)}>
          <div className="help-content">
            <p>
              Это прототип, а не рабочая система компании. Вход по роли
              намеренно открыт для проверки. Не загружайте личные или
              конфиденциальные данные.
            </p>
            <ol>
              <li>
                <strong>Байер</strong> создаёт ТЗ с дедлайном и референсами.
              </li>
              <li>
                <strong>Креативщик</strong> берёт свободную задачу, записывает
                AI-расходы и сдаёт ссылку или файлы.
              </li>
              <li>
                <strong>Байер</strong> принимает результат или описывает правки.
              </li>
              <li>
                <strong>Руководитель</strong> видит загрузку, длительность,
                просрочки и расходы.
              </li>
            </ol>
            <p>
              Переключатель ролей — справа вверху. Все пользователи одного
              браузера работают в общей демо-команде. Другой посетитель получит
              отдельную песочницу. Сессия действует 7 дней.
            </p>
            <p>
              Статусы меняются кнопками в карточке или переносом в допустимую
              колонку. Для сдачи и правок доска откроет форму. Время и история
              фиксируются сервером.
            </p>
            <p>
              <strong>AI-кредиты</strong> считаются отдельно по сервисам: они не
              равны рублям и не складываются в общий денежный расход.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  foot,
  icon,
  accent = false,
  warning = false,
}: {
  title: string;
  value: string;
  foot: string;
  icon: ReactNode;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <div className="stat-top">
        <span>{title}</span>
        <span className={warning ? "warn-icon" : ""}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <span className="stat-foot">{foot}</span>
    </div>
  );
}
function CreateForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSubmit({
          title: f.get("title"),
          offer: f.get("offer"),
          geo: f.get("geo"),
          format: f.get("format"),
          quantity: Number(f.get("quantity")),
          description: f.get("description"),
          references: String(f.get("references"))
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          priority: f.get("priority"),
          deadline: new Date(String(f.get("deadline"))).toISOString(),
        });
      }}
    >
      <p className="form-intro">
        Хороший бриф — половина готового креатива. Все поля со звёздочкой
        обязательны.
      </p>
      <label>
        Название задачи *
        <input
          name="title"
          required
          maxLength={100}
          placeholder="Например, 3 UGC-ролика для нового оффера"
        />
      </label>
      <div className="form-grid">
        <label>
          Оффер *
          <input
            name="offer"
            required
            maxLength={100}
            placeholder="Продукт / предложение"
          />
        </label>
        <label>
          GEO *
          <input
            name="geo"
            required
            maxLength={80}
            placeholder="BR · Бразилия"
          />
        </label>
        <label>
          Тип креатива *
          <select name="format">
            <option>Статика</option>
            <option>Видео</option>
            <option>UGC-видео</option>
            <option>Анимация</option>
            <option>Другое</option>
          </select>
        </label>
        <label>
          Количество *
          <input
            name="quantity"
            required
            type="number"
            min={1}
            max={1000}
            defaultValue={1}
          />
        </label>
        <label>
          Приоритет *
          <select name="priority" defaultValue="normal">
            <option value="normal">Обычный</option>
            <option value="high">Высокий</option>
            <option value="low">Низкий</option>
          </select>
        </label>
        <label>
          Дедлайн *<input name="deadline" required type="datetime-local" />
          <small>В часовом поясе вашего устройства; на доске — МСК.</small>
        </label>
      </div>
      <label>
        Описание *
        <textarea
          name="description"
          required
          maxLength={5000}
          rows={4}
          placeholder="Формат, ключевая идея, требования к тексту и визуалу…"
        />
      </label>
      <label>
        Референсы
        <textarea
          name="references"
          rows={2}
          placeholder="HTTPS-ссылки, по одной в строке (до 5)"
        />
      </label>
      <div className="form-actions">
        <span>Автор и время создания сохранятся автоматически</span>
        <button className="button primary" disabled={busy}>
          <Plus size={16} />
          Создать задачу
        </button>
      </div>
    </form>
  );
}
function TaskDetail({
  task,
  user,
  busy,
  action,
  setAction,
  command,
  setData,
}: {
  task: Task;
  user: User;
  busy: boolean;
  action: "submit" | "revise" | "credit" | null;
  setAction: (a: "submit" | "revise" | "credit" | null) => void;
  command: (input: Record<string, unknown>) => Promise<boolean>;
  setData: (v: Payload) => void;
}) {
  const [tab, setTab] = useState("brief");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const owner = user.role === "creative" && task.assigneeId === user.id;
  const working = ["progress", "revision"].includes(task.status);
  const buyer = user.role === "buyer" && task.buyerId === user.id;
  const latestRevise = [...task.history]
    .reverse()
    .find((h) => h.action === "Возвращено на правки");
  async function upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setLocalError("");
    if (files.length >= 5) {
      setLocalError("До 5 файлов за одну сдачу.");
      input.value = "";
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("taskId", task.id);
      const response = await request<{ attachment: Attachment }>("upload", {
        method: "POST",
        body: form,
      });
      setFiles((prev) => [...prev, response.attachment]);
      setData(await request<Payload>("state"));
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setUploading(false);
      input.value = "";
    }
  }
  const act = async (input: Record<string, unknown>) => {
    const ok = await command({ ...input, taskId: task.id });
    if (ok) {
      setFiles([]);
      setLocalError("");
    }
    return ok;
  };
  return (
    <div className="task-detail">
      <div className="task-meta">
        <span>#{task.number}</span>
        <span
          className="status-chip"
          style={{ color: STAGES.find((s) => s.id === task.status)?.color }}
        >
          {STAGES.find((s) => s.id === task.status)?.name}
        </span>
        <span className={`priority ${task.priority}`}>
          <span />
          {priorityNames[task.priority]}
        </span>
        <span>Итерация {task.cycle}</span>
      </div>
      <div className="detail-people">
        <div>
          <span className="muted">Байер</span>
          <span>
            <Avatar id={task.buyerId} small />
            {person(task.buyerId)?.name}
          </span>
        </div>
        <div>
          <span className="muted">Исполнитель</span>
          <span>
            <Avatar id={task.assigneeId} small />
            {person(task.assigneeId)?.name ?? "Пока свободна"}
          </span>
        </div>
        <div>
          <span className="muted">Дедлайн · МСК</span>
          <span className={isOverdue(task) ? "late" : ""}>
            {date(task.deadline, true)}
          </span>
        </div>
      </div>
      {task.status === "revision" && latestRevise && (
        <div className="revision-box">
          <RotateCcw size={17} />
          <div>
            <strong>Что нужно поправить</strong>
            <p>{latestRevise.note}</p>
          </div>
        </div>
      )}
      <div className="detail-actions">
        {user.role === "creative" && task.status === "new" && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => act({ action: "claim" })}
          >
            <Zap size={16} />
            Взять в работу
          </button>
        )}
        {owner && working && (
          <>
            <button
              className="button primary"
              disabled={busy || uploading}
              onClick={() => {
                setAction("submit");
                setLocalError("");
              }}
            >
              <CheckCheck size={16} />
              Сдать на проверку
            </button>
            <button
              className="button secondary"
              disabled={busy || uploading}
              onClick={() => {
                setAction("credit");
                setLocalError("");
              }}
            >
              <Sparkles size={16} />
              Добавить AI-расход
            </button>
          </>
        )}
        {buyer && task.status === "review" && (
          <>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => act({ action: "approve" })}
            >
              <Check size={16} />
              Принять работу
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setAction("revise")}
            >
              <RotateCcw size={16} />
              На правки
            </button>
          </>
        )}
        {task.status === "done" && (
          <span className="done-label">
            <CheckCheck size={16} />
            Работа принята {date(task.completedAt, true)}
          </span>
        )}
        {!owner &&
          !buyer &&
          task.status !== "new" &&
          task.status !== "done" && (
            <span className="muted">
              Действия доступны автору ТЗ и исполнителю на своём этапе.
            </span>
          )}
      </div>
      {action && (
        <form
          className="action-form form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const params =
              action === "credit"
                ? {
                    action,
                    service: f.get("service"),
                    amount: Number(f.get("amount")),
                    note: f.get("note"),
                  }
                : action === "submit"
                  ? {
                      action,
                      url: f.get("url"),
                      note: f.get("note"),
                      fileIds: files.map((v) => v.id),
                    }
                  : { action, note: f.get("note") };
            if (action === "submit" && !f.get("url") && !files.length) {
              setLocalError("Добавьте ссылку или файл с результатом.");
              return;
            }
            await act(params);
          }}
        >
          <div className="action-title">
            <strong>
              {action === "submit"
                ? `Результат · итерация ${task.cycle}`
                : action === "credit"
                  ? `AI-расход · итерация ${task.cycle}`
                  : "Что доработать?"}
            </strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Закрыть форму действия"
              onClick={() => setAction(null)}
            >
              <X size={16} />
            </button>
          </div>
          {action === "submit" && (
            <>
              <label>
                Ссылка на результат
                <input
                  type="url"
                  name="url"
                  placeholder="https://…"
                  maxLength={2000}
                />
              </label>
              <label className="file-upload">
                <Paperclip size={17} />
                <span>
                  {uploading ? "Загружаем…" : "Прикрепить файл до 5 МБ"}
                </span>
                <input
                  type="file"
                  aria-label="Прикрепить результат"
                  disabled={uploading || busy || files.length >= 5}
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.mp4,.zip,.txt"
                  onChange={(e) => upload(e.currentTarget)}
                />
              </label>
              <small className="muted">
                До 5 файлов. PNG, JPG, WebP, PDF, MP4, ZIP, TXT. Только тестовые
                материалы.
              </small>
              {files.map((file) => (
                <span className="attached-file" key={file.id}>
                  <FileText size={14} />
                  {file.name}
                  <button
                    type="button"
                    aria-label={`Убрать ${file.name}`}
                    onClick={() =>
                      setFiles((prev) => prev.filter((v) => v.id !== file.id))
                    }
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </>
          )}
          {action === "credit" && (
            <div className="form-grid">
              <label>
                AI-сервис *
                <input
                  name="service"
                  list="services"
                  required
                  maxLength={60}
                  placeholder="Например, Midjourney"
                />
                <datalist id="services">
                  <option>Midjourney</option>
                  <option>Runway</option>
                  <option>OpenAI</option>
                  <option>Kling</option>
                  <option>ElevenLabs</option>
                </datalist>
              </label>
              <label>
                Потрачено кредитов *
                <input
                  name="amount"
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="1000000"
                  placeholder="25"
                />
              </label>
            </div>
          )}
          <label>
            {action === "revise" ? "Описание правок *" : "Комментарий"}
            <textarea
              name="note"
              required={action === "revise"}
              minLength={action === "revise" ? 5 : undefined}
              maxLength={action === "credit" ? 500 : 2000}
              rows={3}
              placeholder={
                action === "revise"
                  ? "Опишите конкретные изменения…"
                  : "Что сделано / для чего потрачены кредиты…"
              }
            />
          </label>
          {localError && (
            <p className="error" role="alert">
              {localError}
            </p>
          )}
          <div className="form-actions">
            <small>
              {action === "credit"
                ? "Учёт ведётся отдельно по каждому сервису"
                : "Время и автор сохранятся автоматически"}
            </small>
            <button disabled={busy || uploading} className="button primary">
              {action === "submit"
                ? "Отправить на проверку"
                : action === "credit"
                  ? "Записать расход"
                  : "Отправить на правки"}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      )}
      <div className="detail-tabs tabs">
        {[
          ["brief", "Бриф"],
          ["results", `Результаты ${task.results.length}`],
          ["credits", `AI-расходы ${task.credits.length}`],
          ["history", "История"],
        ].map(([id, name]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "brief" && (
        <div className="brief-content">
          <div className="brief-grid">
            <div>
              <small>ОФФЕР</small>
              <strong>{task.offer}</strong>
            </div>
            <div>
              <small>GEO</small>
              <strong>{task.geo}</strong>
            </div>
            <div>
              <small>ФОРМАТ</small>
              <strong>
                {task.format} · {task.quantity} шт.
              </strong>
            </div>
          </div>
          <h3>Описание</h3>
          <p className="prewrap">{task.description}</p>
          {task.references.length > 0 && (
            <>
              <h3>Референсы</h3>
              <div className="reference-links">
                {task.references.map((url, i) => (
                  <a key={url + i} href={url} target="_blank" rel="noreferrer">
                    Референс {i + 1}
                    <ExternalLink size={13} />
                    <small>{new URL(url).hostname}</small>
                  </a>
                ))}
              </div>
            </>
          )}
          <div className="timing-grid">
            {[
              ["Создана", task.createdAt],
              ["Взята в работу", task.takenAt],
              ["Последняя сдача", task.submittedAt],
              ["Завершена", task.completedAt],
            ].map(([name, value]) => (
              <div key={name}>
                <small>{name}</small>
                <span>{date(value, true)}</span>
              </div>
            ))}
          </div>
          <div className="timing-note">
            <Clock3 size={15} />
            <span>
              Работа и правки: <strong>{duration(workMs(task))}</strong> ·{" "}
              {task.takenAt
                ? `От взятия до ${task.completedAt ? "завершения" : "сейчас"}: ${duration(Date.parse(task.completedAt ?? new Date().toISOString()) - Date.parse(task.takenAt))}`
                : "Ожидает исполнителя"}
            </span>
          </div>
          <small className="muted">
            Работа и правки — время в активных статусах. Полный цикл включает
            ожидание проверки. Это календарная длительность, а не табель.
          </small>
        </div>
      )}
      {tab === "results" && (
        <div className="result-list">
          {!task.results.length && (
            <Empty
              text="Результатов пока нет"
              detail="Они появятся после сдачи креативщиком."
            />
          )}
          {[...task.results].reverse().map((r) => (
            <article className="result-item" key={r.id}>
              <div className="result-heading">
                <strong>Итерация {r.cycle}</strong>
                <span>
                  {date(r.at, true)} · {person(r.authorId)?.name}
                </span>
              </div>
              {r.note && <p className="prewrap">{r.note}</p>}
              {r.url && (
                <a
                  className="result-link"
                  href={r.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={15} />
                  Открыть результат<small>{new URL(r.url).hostname}</small>
                </a>
              )}
              {r.files.map((file) => (
                <a
                  className="result-link"
                  key={file.id}
                  href={`/api/files/${file.id}`}
                >
                  <Download size={15} />
                  {file.name}
                  <small>{Math.ceil(file.size / 1024)} КБ</small>
                </a>
              ))}
            </article>
          ))}
        </div>
      )}
      {tab === "credits" && (
        <div className="credit-list">
          <p className="muted">
            Кредиты разных сервисов имеют разную стоимость. Сохраняем исходные
            единицы, без пересчёта в рубли.
          </p>
          {!task.credits.length && (
            <Empty
              text="AI-расходы не записаны"
              detail="Исполнитель может добавить каждое использование отдельно."
            />
          )}
          {task.credits.map((c) => (
            <div className="credit-item" key={c.id}>
              <span className="service-icon">
                <Sparkles size={16} />
              </span>
              <div>
                <strong>{c.service}</strong>
                <small>
                  {person(c.userId)?.name} · итерация {c.cycle} ·{" "}
                  {date(c.at, true)}
                </small>
                {c.note && <p>{c.note}</p>}
              </div>
              <b>
                {fmt(c.amount)}
                <small>кредитов</small>
              </b>
            </div>
          ))}
        </div>
      )}
      {tab === "history" && (
        <div className="timeline">
          {[...task.history].reverse().map((h) => (
            <div key={h.id} className="timeline-item">
              <span className="timeline-dot" />
              <div>
                <strong>{h.action}</strong>
                <small>
                  {person(h.actorId)?.name} · {date(h.at, true)} МСК
                </small>
                {h.note && <p className="prewrap">{h.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function Empty({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="empty-state">
      <FileText size={25} />
      <strong>{text}</strong>
      <p>{detail}</p>
    </div>
  );
}
function AnalyticsPanel({ metrics }: { metrics: Metrics | null }) {
  if (!metrics)
    return (
      <div className="empty-state">
        <Loader2 className="spin" />
        Загружаем аналитику…
      </div>
    );
  const byService = Object.values(
    metrics.creditBreakdown.reduce(
      (a, c) => {
        a[c.service] ??= { service: c.service, amount: 0 };
        a[c.service].amount += c.amount;
        return a;
      },
      {} as Record<string, { service: string; amount: number }>,
    ),
  );
  const max = Math.max(1, ...byService.map((c) => c.amount));
  return (
    <div className="analytics">
      <div className="analytics-overview">
        <div>
          <span className="eyebrow">ВЫПОЛНЕНИЕ</span>
          <h2>
            {metrics.done} <span>из {metrics.total}</span>
          </h2>
          <p>задач завершено</p>
          <div className="progress-track">
            <span
              style={{
                width: `${metrics.total ? (metrics.done / metrics.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        <div>
          <Clock3 size={21} />
          <strong>{duration(metrics.averageWorkMs)}</strong>
          <p>среднее активное время</p>
          <small>В работе + правки, только завершённые задачи</small>
        </div>
        <div>
          <History size={21} />
          <strong>{duration(metrics.averageLeadMs)}</strong>
          <p>средний полный цикл</p>
          <small>От взятия до принятия, включая проверку</small>
        </div>
      </div>
      <div className="analytics-columns">
        <section className="analytics-card">
          <div className="section-title">
            <h2>Загрузка команды</h2>
            <Users size={18} />
          </div>
          <p className="muted">Активные задачи включают ожидание проверки.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Исполнитель</th>
                  <th>Активные</th>
                  <th>В работе / правки</th>
                  <th>Готово</th>
                  <th>Просрочено</th>
                </tr>
              </thead>
              <tbody>
                {metrics.people.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="table-person">
                        <Avatar id={u.id} small />
                        {u.name}
                      </span>
                    </td>
                    <td>
                      <b>{u.active}</b>
                    </td>
                    <td>{u.inWork}</td>
                    <td>{u.done}</td>
                    <td className={u.overdue ? "late" : ""}>{u.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="analytics-card">
          <div className="section-title">
            <h2>AI-ресурсы</h2>
            <Sparkles size={18} />
          </div>
          <p className="muted">
            Кредиты отдельно по сервисам, не денежный расход.
          </p>
          {byService.length ? (
            byService.map((c) => (
              <div className="service-bar" key={c.service}>
                <div>
                  <strong>{c.service}</strong>
                  <span>{fmt(c.amount)} кр.</span>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${(c.amount / max) * 100}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className="muted">Пока нет расходов</p>
          )}
        </section>
      </div>
      <section className="analytics-card">
        <div className="section-title">
          <h2>Расходы по сервисам и исполнителям</h2>
          <span className="chip">С учётом всех итераций</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>AI-сервис</th>
                <th>Исполнитель</th>
                <th>Всего кредитов</th>
                <th>Из них на правки</th>
              </tr>
            </thead>
            <tbody>
              {metrics.creditBreakdown.map((c) => (
                <tr key={`${c.service}-${c.userId}`}>
                  <td>
                    <strong>{c.service}</strong>
                  </td>
                  <td>{person(c.userId)?.name}</td>
                  <td>{fmt(c.amount)}</td>
                  <td>{fmt(c.revisions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!metrics.creditBreakdown.length && (
            <p className="muted">Записей пока нет</p>
          )}
        </div>
      </section>
    </div>
  );
}
