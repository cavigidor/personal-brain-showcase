import type {
  BrainData,
  CalendarEvent,
  ChangeRecord,
  ChangeSource,
  GroceryItem,
  Note,
  Preferences,
  Project,
  Task,
} from "./types.ts";
import { assertUniqueJob } from "./job-details.ts";
import { validateData } from "./validation.ts";

type EditableTask = Omit<Task, "id" | "createdAt" | "done" | "completedAt">;
type Entities = {
  tasks: Task;
  events: CalendarEvent;
  projects: Project;
  notes: Note;
  groceries: GroceryItem;
};
type Updates = {
  groceries: Partial<Pick<GroceryItem, "title" | "store" | "done">>;
  tasks: Partial<EditableTask>;
  events: Partial<Omit<CalendarEvent, "id">>;
  projects: Partial<Pick<Project, "name" | "status">>;
  notes: Partial<Omit<Note, "id" | "createdAt">>;
};
export type BrainAction =
  | {
      [K in keyof Entities]:
        | { entity: K; operation: "create"; value: Entities[K] }
        | { entity: K; operation: "update"; id: string; patch: Updates[K] };
    }[keyof Entities]
  | {
      entity: "tasks" | "events" | "notes" | "projects" | "groceries";
      operation: "delete";
      id: string;
    }
  | { entity: "events"; operation: "delete-series"; id: string }
  | { entity: "tasks"; operation: "complete" | "reopen"; id: string }
  | { entity: "preferences"; operation: "update"; patch: Partial<Preferences> };
export interface Proposal {
  readonly id: string;
  readonly source: ChangeSource;
  readonly actions: readonly BrainAction[];
  /** Ephemeral review data only. Never included in persisted history. */
  readonly changes: readonly {
    entity: ChangeRecord["entity"];
    itemId: string;
    before: unknown;
    after: unknown;
  }[];
}
const pending = new WeakMap<
  Proposal,
  {
    baseline: string;
    actions: BrainAction[];
    source: ChangeSource;
    resolved: boolean;
  }
>();
const fields = {
  groceries: ["id", "title", "store", "done", "createdAt"],
  tasks: [
    "notes",
    "jobDetails",
    "plannedDate",
    "category",
    "id",
    "title",
    "projectId",
    "dueDate",
    "dueTime",
    "priority",
    "done",
    "kind",
    "originalInput",
    "createdAt",
    "completedAt",
  ],
  events: [
    "id",
    "title",
    "projectId",
    "date",
    "startTime",
    "endTime",
    "kind",
    "taskId",
    "checkIn",
    "category",
    "notes",
    "completed",
    "recurrence",
    "excludedDates",
    "seriesId",
    "originalDate",
  ],
  projects: ["id", "name", "status", "createdAt"],
  notes: ["id", "text", "originalInput", "createdAt", "projectId"],
  preferences: ["calendarVisibility"],
};
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid action object");
}
function keys(value: unknown, allowed: readonly string[]) {
  object(value);
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("Unsupported action field");
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function apply(data: BrainData, action: BrainAction, at: string): BrainData {
  object(action);
  const { entity, operation } = action;
  if (!Object.hasOwn(fields, entity)) throw new Error("Unknown action entity");
  const allowed = fields[entity];
  if (entity === "preferences") {
    if (operation !== "update")
      throw new Error("Unsupported preferences action");
    keys(action, ["entity", "operation", "patch"]);
    keys(action.patch, allowed);
    return validateData({
      ...data,
      preferences: { ...data.preferences, ...action.patch },
    });
  }

  if (
    ![
      "create",
      "update",
      "delete",
      "delete-series",
      "complete",
      "reopen",
    ].includes(operation)
  )
    throw new Error("Unknown operation");
  keys(
    action,
    operation === "create"
      ? ["entity", "operation", "value"]
      : operation === "update"
        ? ["entity", "operation", "id", "patch"]
        : ["entity", "operation", "id"],
  );
  const rows = data[entity] ?? [];
  const id = operation === "create" ? action.value?.id : action.id;
  if (typeof id !== "string" || !id.trim()) throw new Error("Missing item ID");
  const previous = rows.find((row) => row.id === id);
  if (operation === "create" ? !!previous : !previous)
    throw new Error(
      operation === "create"
        ? "Item ID already exists"
        : "Item no longer exists",
    );
  if (operation === "delete-series") {
    if (entity !== "events" || !(previous as CalendarEvent).recurrence)
      throw new Error("Recurring series no longer exists");
    return validateData({
      ...data,
      events: data.events.filter(
        (event) => event.id !== id && event.seriesId !== id,
      ),
    });
  }
  if (operation === "delete") {
    if (entity === "projects") {
      const next = {
        ...data,
        projects: data.projects.filter((row) => row.id !== id),
      };
      next.tasks = data.tasks.map((row) =>
        row.projectId === id ? { ...row, projectId: undefined } : row,
      );
      next.events = data.events.map((row) =>
        row.projectId === id ? { ...row, projectId: undefined } : row,
      );
      next.notes = data.notes.map((row) =>
        row.projectId === id ? { ...row, projectId: undefined } : row,
      );
      return validateData(next);
    }
    return validateData({
      ...data,
      [entity]: rows.filter((row) => row.id !== id),
      ...(entity === "tasks"
        ? {
            events: data.events.map((event) =>
              event.taskId === id ? { ...event, taskId: undefined } : event,
            ),
          }
        : {}),
    });
  }
  if (operation === "complete" || operation === "reopen") {
    if (entity !== "tasks")
      throw new Error("Only tasks can be completed or reopened");
    return validateData({
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              done: operation === "complete",
              completedAt:
                operation === "complete" ? task.completedAt || at : undefined,
            }
          : task,
      ),
    });
  }
  if (operation !== "create" && operation !== "update")
    throw new Error("Unknown operation");
  const incoming = operation === "create" ? action.value : action.patch;
  const immutable =
    entity === "tasks"
      ? ["id", "createdAt", "done", "completedAt"]
      : ["id", "createdAt"];
  keys(
    incoming,
    operation === "create"
      ? allowed
      : allowed.filter((key) => !immutable.includes(key)),
  );
  // Check newly supplied relationships; retain old imported dangling links on unrelated edits.
  for (const [link, collection] of [
    ["projectId", "projects"],
    ["taskId", "tasks"],
  ] as const) {
    if (
      link in incoming &&
      incoming[link as keyof typeof incoming] !== undefined
    ) {
      const target = incoming[link as keyof typeof incoming];
      if (
        !data[collection].some((row) => row.id === target) &&
        (operation === "create" ||
          target !== (previous as unknown as Record<string, unknown>)[link])
      )
        throw new Error(`Linked ${collection} item does not exist`);
    }
  }
  const value =
    operation === "create" ? incoming : { ...previous, ...incoming };

  if (
    entity === "tasks" &&
    (operation === "create" ||
      "jobDetails" in incoming ||
      "projectId" in incoming)
  )
    assertUniqueJob(data.tasks, value as Task);
  const updated =
    operation === "create"
      ? entity === "tasks" || entity === "notes"
        ? [value, ...rows]
        : [...rows, value]
      : rows.map((row) => (row.id === id ? value : row));
  return validateData({ ...data, [entity]: updated });
}
function describe(before: BrainData, after: BrainData): Proposal["changes"] {
  const changes: Proposal["changes"][number][] = [];
  for (const entity of [
    "projects",
    "tasks",
    "events",
    "notes",
    "groceries",
  ] as const) {
    const old = new Map(
      (before[entity] ?? []).map((row) => [row.id, row] as const),
    );
    const next = new Map(
      (after[entity] ?? []).map((row) => [row.id, row] as const),
    );
    for (const itemId of new Set([...old.keys(), ...next.keys()])) {
      if (JSON.stringify(old.get(itemId)) !== JSON.stringify(next.get(itemId)))
        changes.push({
          entity,
          itemId,
          before: old.get(itemId),
          after: next.get(itemId),
        });
    }
  }
  if (JSON.stringify(before.preferences) !== JSON.stringify(after.preferences))
    changes.push({
      entity: "preferences",
      itemId: "preferences",
      before: before.preferences,
      after: after.preferences,
    });
  return changes;
}
function track(
  current: BrainData,
  next: BrainData,
  source: ChangeSource,
  records: Omit<ChangeRecord, "revision" | "at" | "source">[],
): BrainData {
  const revision = crypto.randomUUID(),
    at = new Date().toISOString();
  return validateData({
    ...next,
    changeTracking: {
      revision,
      history: [
        ...(current.changeTracking?.history || []),
        ...records.map((record) => ({ ...record, revision, at, source })),
      ].slice(-100),
    },
  });
}
/** Pure in-memory proposal: no storage, fetch, or notification calls. */
export function proposeChanges(
  current: BrainData,
  actions: readonly BrainAction[],
  source: ChangeSource,
): Proposal {
  validateData(current);
  if (source !== "dashboard" && source !== "mcp")
    throw new Error("Unknown change source");
  if (!Array.isArray(actions) || !actions.length || actions.length > 50)
    throw new Error("Propose between 1 and 50 actions");
  const copy = structuredClone(actions) as BrainAction[];
  const after = copy.reduce(
    (data, action) => apply(data, action, new Date().toISOString()),
    structuredClone(current),
  );
  const proposal = freeze(
    structuredClone({
      id: crypto.randomUUID(),
      source,
      actions: copy,
      changes: describe(current, after),
    }),
  );
  pending.set(proposal, {
    baseline: JSON.stringify(current),
    actions: copy,
    source,
    resolved: false,
  });
  return proposal;
}
/** Only an explicit decision on the original proposal can resolve it, once. Host UI owns consent. */
export function resolveProposal(
  current: BrainData,
  proposal: Proposal,
  decision: "approve" | "reject",
): BrainData {
  const entry = pending.get(proposal);
  if (!entry || entry.resolved)
    throw new Error("Proposal is unknown or already resolved");
  if (decision !== "approve" && decision !== "reject")
    throw new Error("Explicit approval or rejection is required");
  if (decision === "reject") {
    entry.resolved = true;
    return current;
  }
  if (JSON.stringify(current) !== entry.baseline) {
    entry.resolved = true;
    throw new Error(
      "Your Brain changed. Review a fresh proposal before saving.",
    );
  }
  const next = entry.actions.reduce(
    (data, action) => apply(data, action, new Date().toISOString()),
    structuredClone(current),
  );
  const records = describe(current, next).map((change) => {
    const action = [...entry.actions]
      .reverse()
      .find(
        (action) =>
          action.entity === change.entity &&
          ("id" in action
            ? action.id === change.itemId
            : "value" in action
              ? action.value.id === change.itemId
              : true),
      );
    return {
      entity: change.entity,
      itemId: change.itemId,
      operation: (!change.before
        ? "create"
        : !change.after
          ? "delete"
          : action?.operation === "complete" || action?.operation === "reopen"
            ? action.operation
            : "update") as ChangeRecord["operation"],
      fields: [
        ...new Set([
          ...Object.keys(change.before || {}),
          ...Object.keys(change.after || {}),
        ]),
      ].filter(
        (key) =>
          fields[change.entity as keyof typeof fields].includes(key) &&
          JSON.stringify(
            (change.before as Record<string, unknown> | undefined)?.[key],
          ) !==
            JSON.stringify(
              (change.after as Record<string, unknown> | undefined)?.[key],
            ),
      ),
    };
  });
  const result = records.length
    ? track(current, next, entry.source, records)
    : current;
  entry.resolved = true;
  return result;
}
/** Dashboard Save/click is approval; external adapters must use propose + explicit resolve. */
export function applyDashboardActions(
  current: BrainData,
  actions: readonly BrainAction[],
): BrainData {
  return resolveProposal(
    current,
    proposeChanges(current, actions, "dashboard"),
    "approve",
  );
}
/** Local, user-confirmed restore/Undo rotates revision and keeps the current bounded history. */
export function restoreSnapshot(
  current: BrainData,
  snapshot: BrainData,
  operation: "undo" | "restore",
): BrainData {
  if (operation !== "undo" && operation !== "restore")
    throw new Error("Invalid restore action");
  validateData(current);
  validateData(snapshot);
  const restored = structuredClone(snapshot);
  return track(current, restored, "dashboard", [
    {
      entity: "document",
      itemId: "document",
      operation,
      fields: [
        "projects",
        "tasks",
        "events",
        "notes",
        "groceries",
        "preferences",
      ],
    },
  ]);
}
