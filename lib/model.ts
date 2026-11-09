export const USERS = [
  {
    id: "buyer",
    name: "Алексей Морозов",
    initials: "АМ",
    role: "buyer",
    label: "Байер",
    color: "#8560d4",
  },
  {
    id: "creative",
    name: "Мила Волкова",
    initials: "МВ",
    role: "creative",
    label: "Креативщик",
    color: "#e08c56",
  },
  {
    id: "creative2",
    name: "Даня Лебедев",
    initials: "ДЛ",
    role: "creative",
    label: "Креативщик",
    color: "#4b9d8b",
  },
  {
    id: "manager",
    name: "Анна Белова",
    initials: "АБ",
    role: "manager",
    label: "Руководитель",
    color: "#527ac5",
  },
] as const;
export type User = (typeof USERS)[number];
export type Status = "new" | "progress" | "review" | "revision" | "done";
export const STAGES: { id: Status; name: string; color: string }[] = [
  { id: "new", name: "Новые", color: "#9298a9" },
  { id: "progress", name: "В работе", color: "#9a80ff" },
  { id: "review", name: "На проверке", color: "#f0b757" },
  { id: "revision", name: "Правки", color: "#ef887c" },
  { id: "done", name: "Готово", color: "#6ab6a0" },
];
export type History = {
  id: string;
  actorId: string;
  at: string;
  action: string;
  from?: Status;
  to?: Status;
  note?: string;
};
export type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
};
export type Result = {
  id: string;
  authorId: string;
  at: string;
  note: string;
  url: string;
  files: Attachment[];
  cycle: number;
};
export type Credit = {
  id: string;
  userId: string;
  service: string;
  amount: number;
  at: string;
  cycle: number;
  note: string;
};
export type Task = {
  id: string;
  number: number;
  title: string;
  offer: string;
  geo: string;
  format: string;
  quantity: number;
  description: string;
  references: string[];
  priority: "low" | "normal" | "high";
  deadline: string;
  buyerId: string;
  assigneeId: string | null;
  status: Status;
  createdAt: string;
  takenAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  cycle: number;
  results: Result[];
  credits: Credit[];
  history: History[];
};
export type State = {
  tasks: Task[];
  nextNumber: number;
  files: (Attachment & { taskId: string; uploaderId: string })[];
};
export class DomainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function text(
  value: unknown,
  name: string,
  max = 2000,
  min = 1,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new DomainError(`${name}: от ${min} до ${max} символов.`);
  return value.trim();
}
export function safeUrl(value: unknown): string {
  const raw = text(value, "Ссылка", 2000);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error();
    return url.href;
  } catch {
    throw new DomainError("Нужна полная HTTPS-ссылка без логина и пароля.");
  }
}
function number(value: unknown, name: string, max = 1000000, integer = false) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new DomainError(
      `${name}: укажите ${integer ? "целое " : ""}число больше 0, не больше ${max}.`,
    );
  return value;
}
export function userById(id: string): User {
  const user = USERS.find((u) => u.id === id);
  if (!user) throw new DomainError("Неизвестный пользователь.", 401);
  return user;
}
export function isOverdue(task: Task, now = Date.now()) {
  return task.status !== "done" && Date.parse(task.deadline) < now;
}
export function workMs(task: Task, now = Date.now()): number {
  let total = 0;
  task.history.forEach((h, i) => {
    if (h.to === "progress" || h.to === "revision")
      total += Math.max(
        0,
        (task.history[i + 1] ? Date.parse(task.history[i + 1].at) : now) -
          Date.parse(h.at),
      );
  });
  return total;
}
export function analytics(state: State, now = Date.now()) {
  const completed = state.tasks.filter((t) => t.status === "done");
  const credits = state.tasks.flatMap((t) => t.credits);
  return {
    total: state.tasks.length,
    active: state.tasks.filter((t) => t.status !== "done").length,
    done: completed.length,
    overdue: state.tasks.filter((t) => isOverdue(t, now)).length,
    averageWorkMs: completed.length
      ? completed.reduce(
          (s, t) => s + workMs(t, Date.parse(t.completedAt!)),
          0,
        ) / completed.length
      : null,
    averageLeadMs: completed.length
      ? completed.reduce(
          (s, t) => s + Date.parse(t.completedAt!) - Date.parse(t.takenAt!),
          0,
        ) / completed.length
      : null,
    people: USERS.filter((u) => u.role === "creative").map((u) => ({
      ...u,
      active: state.tasks.filter(
        (t) => t.assigneeId === u.id && t.status !== "done",
      ).length,
      inWork: state.tasks.filter(
        (t) =>
          t.assigneeId === u.id &&
          (t.status === "progress" || t.status === "revision"),
      ).length,
      done: completed.filter((t) => t.assigneeId === u.id).length,
      overdue: state.tasks.filter(
        (t) => t.assigneeId === u.id && isOverdue(t, now),
      ).length,
    })),
    creditBreakdown: Object.values(
      credits.reduce(
        (acc, c) => {
          const key = `${c.service}|${c.userId}`;
          acc[key] ??= {
            service: c.service,
            userId: c.userId,
            amount: 0,
            revisions: 0,
          };
          acc[key].amount += c.amount;
          if (c.cycle > 1) acc[key].revisions += c.amount;
          return acc;
        },
        {} as Record<
          string,
          { service: string; userId: string; amount: number; revisions: number }
        >,
      ),
    ),
  };
}
export function applyCommand(
  state: State,
  user: User,
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): State {
  const next: State = structuredClone(state);
  const action = input.action;
  if (action === "create") {
    if (user.role !== "buyer")
      throw new DomainError("Создавать ТЗ может только байер.", 403);
    if (next.tasks.length >= 100)
      throw new DomainError("В демо доступно до 100 задач.");
    const deadline = text(input.deadline, "Дедлайн", 40);
    if (
      !Number.isFinite(Date.parse(deadline)) ||
      Date.parse(deadline) <= Date.parse(now)
    )
      throw new DomainError("Дедлайн должен быть в будущем.");
    if (!["low", "normal", "high"].includes(String(input.priority)))
      throw new DomainError("Неизвестный приоритет.");
    if (!Array.isArray(input.references) || input.references.length > 5)
      throw new DomainError("До 5 ссылок на референсы.");
    const id = crypto.randomUUID();
    next.tasks.unshift({
      id,
      number: next.nextNumber++,
      title: text(input.title, "Название", 100),
      offer: text(input.offer, "Оффер", 100),
      geo: text(input.geo, "GEO", 80),
      format: text(input.format, "Тип", 80),
      quantity: number(input.quantity, "Количество", 1000, true),
      description: text(input.description, "Описание", 5000),
      references: input.references.map(safeUrl),
      priority: input.priority as Task["priority"],
      deadline: new Date(deadline).toISOString(),
      buyerId: user.id,
      assigneeId: null,
      status: "new",
      createdAt: now,
      takenAt: null,
      submittedAt: null,
      completedAt: null,
      cycle: 1,
      credits: [],
      results: [],
      history: [
        {
          id: crypto.randomUUID(),
          actorId: user.id,
          at: now,
          action: "Создано ТЗ",
          to: "new",
        },
      ],
    });
    return next;
  }
  const task = next.tasks.find((t) => t.id === input.taskId);
  if (!task) throw new DomainError("Задача не найдена.", 404);
  let to = task.status,
    label = "",
    note: string | undefined;
  if (action === "claim") {
    if (user.role !== "creative")
      throw new DomainError("Взять задачу может только креативщик.", 403);
    if (task.status !== "new" || task.assigneeId)
      throw new DomainError("Эту задачу уже взяли в работу.", 409);
    task.assigneeId = user.id;
    task.takenAt = now;
    to = "progress";
    label = "Взято в работу";
  } else if (action === "credit" || action === "submit") {
    if (user.role !== "creative" || task.assigneeId !== user.id)
      throw new DomainError("Это действие доступно исполнителю задачи.", 403);
    if (task.status !== "progress" && task.status !== "revision")
      throw new DomainError("Задача должна быть в работе или на правках.", 409);
    if (action === "credit") {
      task.credits.push({
        id: crypto.randomUUID(),
        userId: user.id,
        service: text(input.service, "AI-сервис", 60),
        amount: number(input.amount, "Кредиты"),
        note:
          typeof input.note === "string"
            ? text(input.note, "Комментарий", 500, 0)
            : "",
        at: now,
        cycle: task.cycle,
      });
      label = "Добавлен AI-расход";
      note = `${input.service}: ${input.amount} кредитов (итерация ${task.cycle})`;
    } else {
      if (!Array.isArray(input.fileIds) || input.fileIds.length > 5)
        throw new DomainError("Не больше 5 файлов.");
      const files = input.fileIds.map((id) =>
        next.files.find(
          (f) =>
            f.id === id && f.taskId === task.id && f.uploaderId === user.id,
        ),
      );
      if (files.some((f) => !f))
        throw new DomainError("Один из файлов недоступен.");
      const url = input.url ? safeUrl(input.url) : "";
      if (!url && !files.length)
        throw new DomainError("Добавьте ссылку или файл с результатом.");
      const resultNote =
        typeof input.note === "string"
          ? text(input.note, "Комментарий", 2000, 0)
          : "";
      task.results.push({
        id: crypto.randomUUID(),
        authorId: user.id,
        at: now,
        note: resultNote,
        url,
        files: files as Attachment[],
        cycle: task.cycle,
      });
      task.submittedAt = now;
      to = "review";
      label = `Сдан результат · итерация ${task.cycle}`;
    }
  } else if (action === "revise" || action === "approve") {
    if (user.role !== "buyer" || task.buyerId !== user.id)
      throw new DomainError("Решение принимает байер — автор ТЗ.", 403);
    if (task.status !== "review")
      throw new DomainError("Задача ещё не на проверке.", 409);
    if (action === "revise") {
      note = text(input.note, "Описание правок", 2000, 5);
      task.cycle++;
      to = "revision";
      label = "Возвращено на правки";
    } else {
      task.completedAt = now;
      to = "done";
      label = "Работа принята";
    }
  } else throw new DomainError("Неизвестное действие.");
  task.history.push({
    id: crypto.randomUUID(),
    actorId: user.id,
    at: now,
    action: label,
    from: task.status,
    to,
    ...(note ? { note } : {}),
  });
  task.status = to;
  return next;
}
export function seedState(now = Date.now()): State {
  const ago = (h: number) => new Date(now - h * 3600000).toISOString();
  const sample = [
    [
      "Летняя коллекция · 5 статик",
      "Luma / уход за кожей",
      "BR · Бразилия",
      "Статика",
      5,
      "new",
      null,
      "normal",
      22,
      -30,
    ],
    [
      "UGC для фитнес-приложения",
      "Pulse / фитнес",
      "US · США",
      "UGC-видео",
      3,
      "progress",
      "creative",
      "high",
      18,
      -8,
    ],
    [
      "Баннеры для нового оффера",
      "Atlas / путешествия",
      "DE · Германия",
      "Статика",
      4,
      "review",
      "creative2",
      "normal",
      35,
      -12,
    ],
    [
      "Обновить хук в видео",
      "Bloom / обучение",
      "ES · Испания",
      "Видео",
      2,
      "revision",
      "creative",
      "high",
      40,
      3,
    ],
    [
      "Тест новых визуальных концепций",
      "Luma / уход за кожей",
      "FR · Франция",
      "Статика",
      6,
      "done",
      "creative2",
      "low",
      70,
      2,
    ],
    [
      "Нативный ролик · travel",
      "Atlas / путешествия",
      "IT · Италия",
      "Видео",
      1,
      "new",
      null,
      "normal",
      4,
      -48,
    ],
  ] as const;
  const tasks = sample.map((s, i): Task => {
    const [
      title,
      offer,
      geo,
      format,
      quantity,
      status,
      assigneeId,
      priority,
      hours,
      due,
    ] = s;
    const createdAt = ago(hours),
      takenAt = assigneeId ? ago(hours - 2) : null;
    const history: History[] = [
      {
        id: `h${i}a`,
        actorId: "buyer",
        at: createdAt,
        action: "Создано ТЗ",
        to: "new",
      },
    ];
    if (assigneeId)
      history.push({
        id: `h${i}b`,
        actorId: assigneeId,
        at: takenAt!,
        action: "Взято в работу",
        from: "new",
        to: "progress",
      });
    const results: Result[] = [],
      credits: Credit[] = [];
    let submittedAt: string | null = null,
      completedAt: string | null = null;
    if (status === "review" || status === "revision" || status === "done") {
      submittedAt = ago(hours - 6);
      results.push({
        id: `r${i}`,
        authorId: assigneeId!,
        at: submittedAt,
        note: "Демо-результат: подборка визуальных референсов. В реальной работе здесь будут готовые креативы.",
        url: "https://unsplash.com/collections",
        files: [],
        cycle: 1,
      });
      credits.push({
        id: `c${i}`,
        userId: assigneeId!,
        at: ago(hours - 4),
        service: i % 2 ? "Runway" : "Midjourney",
        amount: i % 2 ? 35 : 20,
        cycle: 1,
        note: "Генерация вариантов",
      });
      history.push({
        id: `h${i}c`,
        actorId: assigneeId!,
        at: submittedAt,
        action: "Сдан результат · итерация 1",
        from: "progress",
        to: "review",
      });
      if (status === "revision")
        history.push({
          id: `h${i}d`,
          actorId: "buyer",
          at: ago(hours - 8),
          action: "Возвращено на правки",
          from: "review",
          to: "revision",
          note: "Сделать первый кадр контрастнее, сократить текст до двух строк.",
        });
      if (status === "done") {
        completedAt = ago(hours - 9);
        history.push({
          id: `h${i}e`,
          actorId: "buyer",
          at: completedAt,
          action: "Работа принята",
          from: "review",
          to: "done",
        });
      }
    }
    if (status === "progress")
      credits.push({
        id: `c${i}`,
        userId: assigneeId!,
        service: "Runway",
        amount: 45,
        at: ago(6),
        cycle: 1,
        note: "Черновые видео",
      });
    return {
      id: `demo-${i + 1}`,
      number: 101 + i,
      title,
      offer,
      geo,
      format,
      quantity,
      status,
      assigneeId,
      priority,
      deadline: ago(due),
      buyerId: "buyer",
      createdAt,
      takenAt,
      submittedAt,
      completedAt,
      description:
        "Подготовить понятные, выразительные креативы для тестирования оффера. Формат 1080 × 1920. Главный акцент — продукт и читаемый призыв к действию. Избегать перегруженной композиции. Все данные в этой задаче вымышлены.",
      references: ["https://unsplash.com/"],
      cycle: status === "revision" ? 2 : 1,
      history,
      results,
      credits,
    };
  });
  return { tasks, nextNumber: 107, files: [] };
}
