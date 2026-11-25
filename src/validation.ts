import {
  GROCERY_TITLE_LIMIT,
  GROCERY_STORE_LIMIT,
  groceryKey,
} from "./groceries.ts";
import { validateJobDetails } from "./job-details.ts";
import type { BrainData } from "./types.ts";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
export const validTime = (v: unknown): v is string =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const validDate = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export const TASK_NOTES_MAX_LENGTH = 10000;
const timestamp = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export function validateData(value: unknown): BrainData {
  if (!record(value)) throw new Error("Invalid Brain document");
  for (const key of ["projects", "tasks", "events", "notes"] as const) {
    const rows = value[key];
    if (!Array.isArray(rows)) throw new Error(`Missing ${key}`);
    const ids = new Set();
    for (const row of rows) {
      if (!record(row) || !text(row.id) || ids.has(row.id))
        throw new Error(`Invalid or duplicate ${key} ID`);
      ids.add(row.id);
      if (
        !text(
          row[key === "projects" ? "name" : key === "notes" ? "text" : "title"],
        )
      )
        throw new Error(`Empty ${key} title`);
      if (key !== "events" && !timestamp(row.createdAt))
        throw new Error(`Invalid ${key} creation date`);
      if (row.projectId !== undefined && typeof row.projectId !== "string")
        throw new Error("Invalid project link");
      if (
        (key === "tasks" || key === "events") &&
        row.category !== undefined &&
        (typeof row.category !== "string" ||
          !row.category.trim() ||
          row.category.length > 80)
      )
        throw new Error("Invalid activity category");
      if (
        row.originalInput !== undefined &&
        typeof row.originalInput !== "string"
      )
        throw new Error("Invalid capture history");
      if (
        key === "projects" &&
        !["Active", "Planned", "Paused", "Completed", "Archived"].includes(
          String(row.status),
        )
      )
        throw new Error("Invalid project status");
      if (key === "tasks") {
        if (
          !["task", "reminder"].includes(String(row.kind)) ||
          !["normal", "high"].includes(String(row.priority)) ||
          typeof row.done !== "boolean"
        )
          throw new Error("Invalid task");
        if (
          row.notes !== undefined &&
          (typeof row.notes !== "string" ||
            row.notes.length > TASK_NOTES_MAX_LENGTH)
        )
          throw new Error("Task notes must be text up to 10000 characters");
        if (row.jobDetails !== undefined) validateJobDetails(row.jobDetails);
        if (row.plannedDate !== undefined && !validDate(row.plannedDate))
          throw new Error("Invalid planned date");
        if (row.dueDate !== undefined && !validDate(row.dueDate))
          throw new Error("Invalid due date");
        if (row.dueTime !== undefined && !validTime(row.dueTime))
          throw new Error("Invalid reminder time");
        if (row.completedAt !== undefined && !timestamp(row.completedAt))
          throw new Error("Invalid completion date");
      }
      if (
        key === "events" &&
        (!validDate(row.date) ||
          !validTime(row.startTime) ||
          !validTime(row.endTime) ||
          row.endTime <= row.startTime ||
          !["event", "work-session"].includes(String(row.kind)) ||
          (row.taskId !== undefined && typeof row.taskId !== "string") ||
          (row.checkIn !== undefined &&
            !["worked", "skipped"].includes(String(row.checkIn))))
      )
        throw new Error("Invalid calendar entry or time range");
      if (key === "events") {
        if (row.notes !== undefined && typeof row.notes !== "string")
          throw new Error("Invalid activity notes");
        if (row.completed !== undefined && typeof row.completed !== "boolean")
          throw new Error("Invalid activity completion");
        if (row.seriesId !== undefined && typeof row.seriesId !== "string")
          throw new Error("Invalid recurrence series link");
        if (row.originalDate !== undefined && !validDate(row.originalDate))
          throw new Error("Invalid original occurrence date");
        if (
          row.excludedDates !== undefined &&
          (!Array.isArray(row.excludedDates) ||
            row.excludedDates.length > 3660 ||
            row.excludedDates.some((date) => !validDate(date)))
        )
          throw new Error("Invalid recurrence exceptions");
        if (
          row.recurrence !== undefined &&
          (!record(row.recurrence) ||
            !["daily", "weekly", "weekdays"].includes(
              String(row.recurrence.type),
            ) ||
            !Array.isArray(row.recurrence.weekdays) ||
            row.recurrence.weekdays.some(
              (day) => !Number.isInteger(day) || day < 0 || day > 6,
            ) ||
            (row.recurrence.type === "weekdays" &&
              row.recurrence.weekdays.length === 0))
        )
          throw new Error("Invalid activity recurrence");
      }
    }
  }
  {
    if (!Array.isArray(value.groceries))
      throw new Error("Invalid grocery list");
    const ids = new Set(),
      titles = new Set();
    for (const row of value.groceries) {
      if (
        !record(row) ||
        !text(row.id) ||
        ids.has(row.id) ||
        !text(row.title) ||
        String(row.title).length > GROCERY_TITLE_LIMIT ||
        typeof row.done !== "boolean" ||
        !timestamp(row.createdAt) ||
        (row.store !== undefined &&
          (typeof row.store !== "string" ||
            row.store.length > GROCERY_STORE_LIMIT))
      )
        throw new Error("Invalid grocery item");
      const key = groceryKey(row.title as string);
      if (titles.has(key))
        throw new Error("This grocery item is already on the list");
      ids.add(row.id);
      titles.add(key);
    }
  }
  if (value.changeTracking !== undefined) {
    const tracking = value.changeTracking;
    if (
      !record(tracking) ||
      !text(tracking.revision) ||
      !Array.isArray(tracking.history) ||
      tracking.history.length > 100
    )
      throw new Error("Invalid change tracking");
    for (const change of tracking.history) {
      if (
        !record(change) ||
        !text(change.revision) ||
        !timestamp(change.at) ||
        !["dashboard", "mcp"].includes(String(change.source)) ||
        ![
          "tasks",
          "events",
          "projects",
          "notes",
          "groceries",
          "preferences",
          "document",
        ].includes(String(change.entity)) ||
        !text(change.itemId) ||
        ![
          "create",
          "update",
          "delete",
          "complete",
          "reopen",
          "undo",
          "restore",
        ].includes(String(change.operation)) ||
        !Array.isArray(change.fields) ||
        change.fields.length > 30 ||
        change.fields.some(
          (field) => typeof field !== "string" || field.length > 80,
        )
      )
        throw new Error("Invalid change history");
    }
  }
  const p = value.preferences;
  if (!record(p) || Object.keys(p).some((key) => key !== "calendarVisibility"))
    throw new Error("Invalid preferences");
  if (p.calendarVisibility !== undefined) {
    const v = p.calendarVisibility;
    if (
      !record(v) ||
      Object.keys(v).some((k) => !["groups", "projects"].includes(k))
    )
      throw new Error("Invalid calendar filters");
    for (const key of ["groups", "projects"])
      if (
        v[key] !== undefined &&
        (!record(v[key]) ||
          Object.keys(v[key]).length > 1000 ||
          Object.entries(v[key]).some(
            ([id, on]) => !id || id.length > 200 || typeof on !== "boolean",
          ))
      )
        throw new Error("Invalid calendar filters");
  }
  return value as unknown as BrainData;
}
export function parseBackup(value: unknown): BrainData {
  if (
    !record(value) ||
    value.app !== "personal-brain-showcase" ||
    value.version !== 1
  )
    throw new Error("Unsupported backup format");
  return validateData(value.data);
}
