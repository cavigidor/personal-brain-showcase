import { addDays, format, parseISO } from "date-fns";
import { occurrencesOn, type CalendarOccurrence } from "./calendar-model.ts";
import { validDate, validTime } from "./validation.ts";
import type { CalendarEvent, CalendarVisibility, Task } from "./types.ts";

/** Weekend grace changes interpretation only, never the stored deadline. */
export function effectiveDeadline(task: Task): string | undefined {
  if (!task.dueDate) return;
  return task.kind === "task" && parseISO(task.dueDate).getDay() === 6
    ? format(addDays(parseISO(task.dueDate), 1), "yyyy-MM-dd")
    : task.dueDate;
}
export function overdueTask(task: Task, date: string) {
  const deadline = effectiveDeadline(task);
  return !task.done && !!deadline && deadline < date;
}
export function dueTask(task: Task, date: string) {
  const deadline = effectiveDeadline(task);
  return (
    !task.done &&
    !!task.dueDate &&
    task.dueDate <= date &&
    !!deadline &&
    deadline >= date
  );
}
export function deadlineLabel(task: Task, date: string) {
  return overdueTask(task, date)
    ? "Overdue"
    : dueTask(task, date)
      ? task.kind === "task" &&
        [0, 6].includes(parseISO(task.dueDate!).getDay())
        ? "Due this weekend"
        : "Due today"
      : "Deadline";
}
export const FILTER_GROUPS = [
  ["personal", "Personal"],
  ["workout", "Workout"],
  ["projects", "Projects"],
  ["other", "Other / Uncategorized"],
] as const;
export function calendarGroup(
  item: Pick<Task, "projectId" | "category"> | CalendarOccurrence,
  tasks: Task[] = [],
) {
  const task =
    "taskId" in item ? tasks.find((t) => t.id === item.taskId) : undefined;
  const projectId = item.projectId || task?.projectId;
  if (projectId) return { group: "projects", projectId };
  const category = item.category || task?.category;
  return {
    group:
      category === "Workout"
        ? "workout"
        : category === "Personal" || category === "Meeting / Appointment"
          ? "personal"
          : "other",
  };
}
export function calendarVisible(
  item: Pick<Task, "projectId" | "category"> | CalendarOccurrence,
  settings: CalendarVisibility | undefined,
  tasks: Task[] = [],
) {
  const { group, projectId } = calendarGroup(item, tasks);
  return (
    settings?.groups?.[group] !== false &&
    (!projectId || settings?.projects?.[projectId] !== false)
  );
}
export const plannedDate = (task: Task) => task.plannedDate || task.dueDate;
export function unscheduledForDay(
  tasks: Task[],
  events: CalendarEvent[],
  date: string,
) {
  const linked = new Set(
    occurrencesOn(events, date)
      .filter((e) => e.checkIn !== "skipped")
      .map((e) => e.taskId),
  );
  return tasks.filter(
    (t) =>
      t.kind === "task" &&
      !t.done &&
      !linked.has(t.id) &&
      (plannedDate(t) === date || dueTask(t, date)),
  );
}
export function unscheduledTasks(tasks: Task[], events: CalendarEvent[]) {
  const linked = new Set(
    events.filter((e) => e.checkIn !== "skipped").map((e) => e.taskId),
  );
  return tasks.filter((t) => t.kind === "task" && !t.done && !linked.has(t.id));
}
export function unscheduledBacklog(tasks: Task[], events: CalendarEvent[]) {
  return unscheduledTasks(tasks, events).filter((t) => !plannedDate(t));
}
/** Counts only; reminders and imported appointments are never task records. */
export function taskInventory(records: Task[], events: CalendarEvent[] = []) {
  const tasks = records.filter((t) => t.kind === "task");
  const open = tasks.filter((t) => !t.done);
  const linkedSessions = new Set(
    events.filter((e) => e.checkIn !== "skipped").map((e) => e.taskId),
  );
  return {
    scheduled: open.filter((t) => linkedSessions.has(t.id)).length,
    total: tasks.length,
    open: open.length,
    completed: tasks.length - open.length,
    linked: tasks.filter((t) => !!t.projectId).length,
    dated: open.filter((t) => !!plannedDate(t)).length,
    undated: open.filter((t) => !plannedDate(t)).length,
    reminders: records.filter((t) => t.kind === "reminder").length,
  };
}
/** A linked work session requires a plan date and a valid time range. */
export function timedTaskEligible(date: string, start: string, end: string) {
  return validDate(date) && validTime(start) && validTime(end) && end > start;
}
