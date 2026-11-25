import { activityTitle, taskTitle } from "./job-details";
import type { ReactNode } from "react";
import { durationLabel, type Briefing } from "./briefing";
import { minutes, type CalendarOccurrence } from "./calendar-model";
import TaskInventory from "./TaskInventory";
import type { Task } from "./types";
import TaskCompletion from "./TaskCompletion";

type Props = {
  briefing: Briefing;
  compact?: boolean;
  onToday: () => void;
  onCalendar: () => void;
  onTask: (task: Task) => void;
  onComplete: (task: Task) => void;
  onTasks: () => void;
  onProjects: () => void;
  onProject: (id: string) => void;
  onActivity: (activity: CalendarOccurrence) => void;
};
function ShortList({
  items,
  limit = 4,
}: {
  items: ReactNode[];
  limit?: number;
}) {
  return (
    <>
      {items.slice(0, limit)}
      {items.length > limit && (
        <details className="briefing-more">
          <summary>Show {items.length - limit} more</summary>
          {items.slice(limit)}
        </details>
      )}
    </>
  );
}
export default function MorningBriefing({
  briefing: b,
  compact,
  onToday,
  onCalendar,
  onTask,
  onComplete,
  onTasks,
  onProjects,
  onProject,
  onActivity,
}: Props) {
  const focusTask =
    b.focus && ["task", "reminder"].includes(b.focus.kind)
      ? b.tasksById.get(b.focus.id)
      : undefined;
  const taskCount =
    b.taskGroups.dated.length +
    b.taskGroups.backlog.length +
    b.taskGroups.other.length;
  const openFocus = () => {
    if (!b.focus) return;
    const task = [
      ...b.priorities.map((p) => p.task),
      ...b.reminders.map((r) => r.task),
    ].find((t) => t.id === b.focus!.id);
    if (b.focus.kind === "task" || b.focus.kind === "reminder") {
      if (task) onTask(task);
    } else if (b.focus.kind === "project") onProject(b.focus.id);
    else {
      const activity = b.schedule.find((e) => e.instanceId === b.focus!.id);
      if (activity) onActivity(activity);
    }
  };
  return (
    <section
      className={`panel morning-briefing ${compact ? "briefing-compact" : ""}`}
      aria-label="Morning Briefing"
    >
      <div className="briefing-heading">
        <div>
          <h2>Morning Briefing</h2>
          <p>
            {b.dateLabel} · Updated {b.generatedAt}
          </p>
        </div>
        {compact ? (
          <button className="button secondary" onClick={onToday}>
            Open morning briefing
          </button>
        ) : (
          <button className="text-button" onClick={onCalendar}>
            Open today’s calendar
          </button>
        )}
      </div>
      <dl className="briefing-stats" aria-label="Today at a glance">
        {[
          ["Tasks due today", b.counts.dueToday],
          ["Overdue tasks", b.counts.overdue],
          ["Reminders today", b.counts.reminders],
          ["Scheduled activities", b.counts.activities],
          ["Completed today", b.counts.completed],
          ["Unscheduled time left", durationLabel(b.available.remainingFree)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="briefing-focus">
        <span className="eyebrow">START HERE · RULE-BASED</span>
        {b.focus ? (
          <>
            <button className="briefing-title-button" onClick={openFocus}>
              {b.tasksById.get(b.focus.id)
                ? taskTitle(b.tasksById.get(b.focus.id)!)
                : b.focus.title}
            </button>
            <p>{b.focus.reason}</p>
            {focusTask && (
              <TaskCompletion task={focusTask} onToggle={onComplete} />
            )}
          </>
        ) : (
          <p>No urgent items in your local Brain. Your day is ready to plan.</p>
        )}
      </div>
      {!compact && (
        <>
          <TaskInventory counts={b.inventory} projects={b.projectCount} />
          <div className="filter-row">
            <button className="text-button" onClick={onTasks}>
              View all tasks
            </button>
            <button className="text-button" onClick={onProjects}>
              Browse all projects
            </button>
          </div>
          <div className="briefing-grid">
            <section aria-label="Today's schedule">
              <h3>
                Today’s schedule <small>{b.schedule.length}</small>
              </h3>
              <p className="briefing-caption">
                Times and durations use your device’s local clock.
              </p>
              <ShortList
                items={b.schedule.map((e) => (
                  <div className="briefing-row" key={e.instanceId}>
                    <div>
                      <button
                        className="briefing-title-button"
                        onClick={() => onActivity(e)}
                      >
                        {activityTitle([...b.tasksById.values()], e)}
                      </button>
                      <p>
                        {`${e.startTime}–${e.endTime}`} ·{" "}
                        {durationLabel(
                          minutes(e.endTime) - minutes(e.startTime),
                        )}{" "}
                        ·{" "}
                        {e.category ||
                          (e.kind === "work-session"
                            ? "Task Work Session"
                            : "Personal")}
                      </p>
                      {e.projectId && (
                        <p>
                          {b.projectsById[e.projectId] ||
                            "Project no longer available"}
                        </p>
                      )}
                      {(e.completed || e.checkIn) && (
                        <p>
                          {e.completed
                            ? "Completed"
                            : e.checkIn === "skipped"
                              ? "Skipped · does not reserve time"
                              : "Worked on it"}
                        </p>
                      )}
                    </div>
                    {e.taskId && b.tasksById.get(e.taskId) && (
                      <TaskCompletion
                        task={b.tasksById.get(e.taskId)!}
                        onToggle={onComplete}
                      />
                    )}
                  </div>
                ))}
              />
              {!b.schedule.length && (
                <p className="briefing-empty">No local activities today.</p>
              )}
            </section>
            <section aria-label="Task priorities">
              <h3>
                Task priorities <small>{taskCount}</small>
              </h3>
              <p className="briefing-caption">
                Due, overdue, high-priority and project tasks, plus unscheduled
                tasks for any date. Weekend deadlines remain pending through
                Sunday. Calendar category and project filters do not hide tasks
                here.
              </p>
              {(
                [
                  [
                    "Dated unscheduled tasks",
                    b.taskGroups.dated,
                    "Deadlines and plan dates without a linked work session. Future dates remain future dates.",
                  ],
                  [
                    "Undated backlog",
                    b.taskGroups.backlog,
                    "No deadline, plan date or linked work session. These tasks have not been assigned to today.",
                  ],
                  [
                    "Tasks with other sessions",
                    b.taskGroups.other,
                    "Relevant tasks with work sessions outside today’s schedule.",
                  ],
                ] as const
              ).map(([label, items, caption]) => (
                <section key={label} aria-label={label}>
                  <h4>
                    {label} · {items.length}
                  </h4>
                  <p className="briefing-caption">{caption}</p>
                  <ShortList
                    items={items.map((p) => (
                      <div className="briefing-row" key={p.task.id}>
                        <div>
                          <button
                            className="briefing-title-button"
                            onClick={() => onTask(p.task)}
                          >
                            {taskTitle(p.task)}
                          </button>
                          <p>{p.reason}</p>
                        </div>
                        <TaskCompletion task={p.task} onToggle={onComplete} />
                      </div>
                    ))}
                  />
                  {!items.length && (
                    <p className="briefing-empty">No tasks in this group.</p>
                  )}
                </section>
              ))}
              {!taskCount && (
                <p className="briefing-empty">
                  {b.inventory.open
                    ? "Open tasks are scheduled today or for another day. View all tasks to inspect them."
                    : "No open tasks. See the loaded task counts above."}
                </p>
              )}
            </section>
            <section aria-label="Briefing reminders">
              <h3>
                Reminders <small>{b.reminders.length}</small>
              </h3>
              <p className="briefing-caption">
                {b.counts.overdueReminders} overdue · Upcoming today shown by
                time.
              </p>
              <ShortList
                items={b.reminders.map((r) => (
                  <div className="briefing-row" key={r.task.id}>
                    <div>
                      <button
                        className="briefing-title-button"
                        onClick={() => onTask(r.task)}
                      >
                        {taskTitle(r.task)}
                      </button>
                      <p>{r.reason}</p>
                    </div>
                    <TaskCompletion task={r.task} onToggle={onComplete} />
                  </div>
                ))}
              />
              {!b.reminders.length && (
                <p className="briefing-empty">
                  No overdue or upcoming reminders today.
                </p>
              )}
            </section>
            <section aria-label="Project focus">
              <h3>
                Project focus <small>{b.projectFocus.length}</small>
              </h3>
              <p className="briefing-caption">
                Overdue tasks first, then today’s deadlines and upcoming work.
              </p>
              <ShortList
                limit={3}
                items={b.projectFocus.map((p) => (
                  <div className="briefing-row" key={p.project.id}>
                    <div>
                      <button
                        className="briefing-title-button"
                        onClick={() => onProject(p.project.id)}
                      >
                        {p.project.name}
                      </button>
                      <p>
                        {p.project.status} · {p.reason}
                      </p>
                      <p>
                        {p.open} open tasks · {p.dueToday} due today ·{" "}
                        {p.overdue} overdue · {p.sessions.length} work sessions
                        in next 7 days
                      </p>
                    </div>
                  </div>
                ))}
              />
              {!b.projectFocus.length && (
                <p className="briefing-empty">No projects needing attention.</p>
              )}
            </section>
          </div>
          <section className="briefing-time" aria-label="Available time">
            <h3>Available personal calendar time</h3>
            <p>
              <strong>{durationLabel(b.available.remainingFree)}</strong>{" "}
              unscheduled time left ·{" "}
              {durationLabel(b.available.remainingOccupied)} scheduled time
              remaining.
            </p>
            <p className="briefing-caption">
              Planning window {b.available.window.start}–
              {b.available.window.end}. Whole day:{" "}
              {durationLabel(b.available.occupied)} scheduled /{" "}
              {durationLabel(b.available.free)} unscheduled. Overlaps count
              once. Completed blocks retain reserved time; skipped sessions do
              not.
            </p>
            {b.available.ended ? (
              <p>The planning window has ended for today.</p>
            ) : b.available.gaps.length ? (
              <div className="briefing-gaps">
                {b.available.gaps.slice(0, 3).map((g) => (
                  <span key={g.start}>
                    {g.start}–{g.end} · {durationLabel(g.minutes)}
                  </span>
                ))}
                {b.available.gaps.length > 3 && (
                  <span>+ {b.available.gaps.length - 3} more gaps</span>
                )}
              </div>
            ) : (
              <p>
                The remaining planning window is fully booked with the included
                calendar blocks.
              </p>
            )}
          </section>
          <details className="briefing-rules">
            <summary>How this briefing is selected</summary>
            <p>
              Start here: overdue high-priority task → overdue or next-30-minute
              reminder → overdue/due-today task → activity in progress or
              starting within 30 minutes → other task → relevant project. Task
              list: overdue high, other overdue, due-today high, other due
              today, other high, then other tasks. Dated tasks without work
              sessions and undated backlog have separate groups, including
              future dates. Dates, times and stable IDs break ties. No data
              changes until you click an action.
            </p>
            <p>
              Project focus ranks overdue count, today’s deadline count,
              presence of upcoming work sessions in the next 7 days,
              high-priority count, open-task count, then stable ID. Projects of
              every status appear when they have open tasks or upcoming
              sessions. Dates use your device’s local clock.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
