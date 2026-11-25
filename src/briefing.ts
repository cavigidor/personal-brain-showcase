import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  minutes,
  occurrencesBetween,
  occurrencesOn,
  timeFromMinutes,
  type CalendarOccurrence,
} from "./calendar-model.ts";
import {
  dueTask as isDueTask,
  overdueTask,
  effectiveDeadline,
  deadlineLabel,
  unscheduledTasks,
  taskInventory,
  plannedDate,
} from "./planner.ts";
import type { BrainData, Task } from "./types.ts";

/** Local wall-clock planning, using the 08:00–20:00 suggestion window. */
export const PLANNING_WINDOW = { start: "08:00", end: "20:00" };
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const dueOrder = (a: Task, b: Task) =>
  compare(a.dueDate || "9999", b.dueDate || "9999") ||
  compare(a.dueTime || "99:99", b.dueTime || "99:99") ||
  compare(a.id, b.id);
const countLabel = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;
export const durationLabel = (value: number) =>
  `${Math.floor(value / 60)}h ${value % 60}m`;

export function availableTime(
  schedule: CalendarOccurrence[],
  now: Date,
  window = PLANNING_WINDOW,
) {
  const start = minutes(window.start),
    end = minutes(window.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > 1440 ||
    end <= start
  )
    throw new Error("Invalid planning window");
  // A completed block still represents reserved time. Explicitly skipped sessions do not.
  const intervals = schedule
    .filter((e) => e.checkIn !== "skipped")
    .map((e) => [
      Math.max(start, minutes(e.startTime)),
      Math.min(end, minutes(e.endTime)),
    ])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: number[][] = [];
  for (const [a, b] of intervals) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const from = Math.min(
    end,
    Math.max(start, now.getHours() * 60 + now.getMinutes()),
  );
  const gaps: { start: string; end: string; minutes: number }[] = [];
  let cursor = from;
  for (const [a, b] of merged) {
    if (b <= cursor) continue;
    if (a > cursor)
      gaps.push({
        start: timeFromMinutes(cursor),
        end: timeFromMinutes(a),
        minutes: a - cursor,
      });
    cursor = Math.max(cursor, b);
  }
  if (cursor < end)
    gaps.push({
      start: timeFromMinutes(cursor),
      end: window.end,
      minutes: end - cursor,
    });
  const occupied = merged.reduce((sum, [a, b]) => sum + b - a, 0);
  const remainingFree = gaps.reduce((sum, gap) => sum + gap.minutes, 0);
  return {
    window,
    occupied,
    free: end - start - occupied,
    remainingFree,
    remainingOccupied: end - from - remainingFree,
    gaps,
    ended: from === end,
  };
}

/** Pure, deterministic projection of the existing validated Brain document. Never saves data. */
export function buildBriefing(data: BrainData, now: Date) {
  const date = format(now, "yyyy-MM-dd"),
    time = format(now, "HH:mm");
  const open = data.tasks.filter((t) => !t.done);
  const tasks = open.filter((t) => t.kind === "task");
  const schedule = occurrencesOn(data.events, date);
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const upcomingSessions = occurrencesBetween(
    data.events,
    date,
    format(addDays(now, 6), "yyyy-MM-dd"),
  ).filter(
    (e) =>
      e.kind === "work-session" &&
      !e.completed &&
      e.checkIn !== "skipped" &&
      (e.occurrenceDate > date || e.endTime > time),
  );
  const priorityTasks = tasks.filter(
    (t) =>
      (t.dueDate && t.dueDate <= date) ||
      (t.plannedDate && t.plannedDate <= date) ||
      t.priority === "high" ||
      !t.dueDate ||
      data.projects.some((p) => p.id === t.projectId),
  );
  const unscheduled = unscheduledTasks(tasks, data.events);
  const candidates = new Set(
    [...priorityTasks, ...unscheduled].map((t) => t.id),
  );
  const allCandidates = tasks
    .filter((t) => candidates.has(t.id))
    .map((task) => {
      const overdue = overdueTask(task, date);
      const rank = overdue
        ? task.priority === "high"
          ? 0
          : 1
        : isDueTask(task, date)
          ? task.priority === "high"
            ? 2
            : 3
          : task.priority === "high"
            ? 4
            : 5;
      const reasons = [
        overdue
          ? `Overdue by ${countLabel(differenceInCalendarDays(parseISO(date), parseISO(effectiveDeadline(task)!)), "day")}`
          : isDueTask(task, date)
            ? deadlineLabel(task, date)
            : task.dueDate
              ? `Deadline ${task.dueDate}`
              : "No deadline",
      ];
      if (task.plannedDate) reasons.push(`Planned ${task.plannedDate}`);
      if (task.projectId)
        reasons.push(
          data.projects.find((p) => p.id === task.projectId)?.name ||
            "Linked project",
        );
      if (task.priority === "high") reasons.push("High priority");
      if (!task.dueDate)
        reasons.push(
          schedule.some(
            (e) =>
              e.taskId === task.id && !e.completed && e.checkIn !== "skipped",
          )
            ? "Local work session today"
            : "No local work session today",
        );
      return { task, rank, reason: reasons.join(" · ") };
    })
    .sort((a, b) => a.rank - b.rank || dueOrder(a.task, b.task));
  const priorities = allCandidates.filter((p) =>
    priorityTasks.includes(p.task),
  );
  const scheduledToday = new Set(
    schedule.filter((e) => e.checkIn !== "skipped").map((e) => e.taskId),
  );
  const untimed = new Set(unscheduled.map((t) => t.id));
  const remaining = allCandidates.filter((p) => !scheduledToday.has(p.task.id));
  const taskGroups = {
    dated: remaining.filter(
      (p) => untimed.has(p.task.id) && !!plannedDate(p.task),
    ),
    backlog: remaining.filter(
      (p) => untimed.has(p.task.id) && !plannedDate(p.task),
    ),
    other: remaining.filter((p) => !untimed.has(p.task.id)),
  };
  const reminders = open
    .filter((t) => t.kind === "reminder" && t.dueDate && t.dueDate <= date)
    .sort(dueOrder)
    .map((task) => ({
      task,
      overdue:
        task.dueDate! < date ||
        (task.dueDate === date && !!task.dueTime && task.dueTime < time),
      reason:
        task.dueDate! < date
          ? `Overdue since ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ""}`
          : task.dueTime && task.dueTime < time
            ? `Overdue since ${task.dueTime}`
            : task.dueTime
              ? `Today at ${task.dueTime}`
              : "Today · no time set",
    }));
  const projectFocus = data.projects
    .map((project) => {
      const linked = tasks.filter((t) => t.projectId === project.id);
      const overdue = linked.filter((t) => overdueTask(t, date)).length;
      const dueToday = linked.filter((t) => isDueTask(t, date)).length;
      const high = linked.filter((t) => t.priority === "high").length;
      const sessions = upcomingSessions.filter(
        (e) =>
          (e.projectId || tasksById.get(e.taskId || "")?.projectId) ===
          project.id,
      );
      const reason = overdue
        ? `${countLabel(overdue, "overdue task")}`
        : dueToday
          ? `${countLabel(dueToday, "task")} due today`
          : sessions.length
            ? `${countLabel(sessions.length, "local work session")} in next 7 days`
            : high
              ? `${countLabel(high, "high-priority task")}`
              : `${countLabel(linked.length, "open task")}`;
      return {
        project,
        open: linked.length,
        overdue,
        dueToday,
        high,
        sessions,
        reason,
      };
    })
    .filter((p) => p.overdue || p.dueToday || p.sessions.length || p.open)
    .sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.dueToday - a.dueToday ||
        Number(b.sessions.length > 0) - Number(a.sessions.length > 0) ||
        b.high - a.high ||
        b.open - a.open ||
        compare(a.project.id, b.project.id),
    );
  const nextActivity = schedule.find(
    (e) => !e.completed && e.checkIn !== "skipped" && e.endTime > time,
  );
  const urgentReminder = reminders.find(
    (r) =>
      r.overdue ||
      (r.task.dueTime && minutes(r.task.dueTime) - minutes(time) <= 30),
  );
  const urgentTask = priorities.find((p) => p.rank === 0);
  const dueTask = priorities.find((p) => p.rank <= 3);
  // Start-here rule is deliberately independent of the separate, deduplicated task list.
  const focus = urgentTask
    ? {
        kind: "task" as const,
        id: urgentTask.task.id,
        title: urgentTask.task.title,
        reason: urgentTask.reason,
      }
    : urgentReminder
      ? {
          kind: "reminder" as const,
          id: urgentReminder.task.id,
          title: urgentReminder.task.title,
          reason: urgentReminder.reason,
        }
      : dueTask
        ? {
            kind: "task" as const,
            id: dueTask.task.id,
            title: dueTask.task.title,
            reason: dueTask.reason,
          }
        : nextActivity && minutes(nextActivity.startTime) - minutes(time) <= 30
          ? {
              kind: "activity" as const,
              id: nextActivity.instanceId,
              title: nextActivity.title,
              reason:
                nextActivity.startTime <= time
                  ? `In progress until ${nextActivity.endTime}`
                  : `Scheduled at ${nextActivity.startTime}`,
            }
          : priorities[0]
            ? {
                kind: "task" as const,
                id: priorities[0].task.id,
                title: priorities[0].task.title,
                reason: priorities[0].reason,
              }
            : projectFocus[0]
              ? {
                  kind: "project" as const,
                  id: projectFocus[0].project.id,
                  title: projectFocus[0].project.name,
                  reason: projectFocus[0].reason,
                }
              : null;
  const counts = {
    dueToday: tasks.filter((t) => isDueTask(t, date)).length,
    overdue: tasks.filter((t) => overdueTask(t, date)).length,
    reminders: reminders.filter((r) => r.task.dueDate === date).length,
    overdueReminders: reminders.filter((r) => r.overdue).length,
    activities: schedule.length,
    completed: data.tasks.filter(
      (t) =>
        t.kind === "task" &&
        t.done &&
        t.completedAt &&
        format(parseISO(t.completedAt), "yyyy-MM-dd") === date,
    ).length,
    undated: tasks.filter((t) => !plannedDate(t)).length,
  };
  return {
    tasksById,
    taskGroups,
    inventory: taskInventory(data.tasks, data.events),
    projectCount: data.projects.length,
    date,
    dateLabel: format(now, "EEEE, MMMM d, yyyy"),
    generatedAt: time,
    counts,
    schedule,
    priorities,
    reminders,
    projectFocus,
    focus,
    available: availableTime(schedule, now),
    projectsById: Object.fromEntries(data.projects.map((p) => [p.id, p.name])),
  };
}
export type Briefing = ReturnType<typeof buildBriefing>;
