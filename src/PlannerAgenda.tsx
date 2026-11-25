import { taskTitle } from "./job-details";
import type { ReactNode } from "react";
import TaskCompletion from "./TaskCompletion";
import { format, parseISO } from "date-fns";
import type { BrainData, Task } from "./types";
import type { CalendarOccurrence } from "./calendar-model";
import { calendarVisible, overdueTask, unscheduledForDay } from "./planner";

export default function PlannerAgenda({
  days,
  data,
  today,
  entries,
  onOpen,
  onTask,
  onComplete,
  taskRow,
  onAdd,
  onCheckin,
  onAddEvent,
}: {
  days: string[];
  data: BrainData;
  today: string;
  entries: (date: string) => { events: CalendarOccurrence[] };
  onOpen: (event: CalendarOccurrence) => void;
  onTask: (task: Task, event: CalendarOccurrence) => void;
  onComplete: (task: Task) => void;
  taskRow: (task: Task) => ReactNode;
  onAdd: (date: string) => void;
  onAddEvent: (date: string) => void;
  onCheckin: (
    event: CalendarOccurrence,
    action: "worked" | "skipped" | "finished",
  ) => void;
}) {
  const visible = (task: Task) =>
    calendarVisible(task, data.preferences.calendarVisibility);
  const scheduledIds = new Set(
    days.flatMap((day) => entries(day).events.map((e) => e.taskId)),
  );
  const overdue = data.tasks.filter(
    (t) =>
      t.kind === "task" &&
      overdueTask(t, today) &&
      !scheduledIds.has(t.id) &&
      !days.some((day) => unscheduledForDay([t], data.events, day).length) &&
      visible(t),
  );
  return (
    <div className="planner-agenda" aria-label="Daily planner">
      {days.map((day) => {
        const events = entries(day).events;
        const reminders = data.tasks
          .filter(
            (t) =>
              t.kind === "reminder" &&
              !t.done &&
              t.dueDate === day &&
              visible(t),
          )
          .sort((a, b) =>
            (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99"),
          );
        const tasks = unscheduledForDay(data.tasks, data.events, day).filter(
          visible,
        );
        return (
          <section
            key={day}
            className="day-details"
            aria-label={"Planner for " + day}
          >
            <div className="section-title">
              {format(parseISO(day), "EEEE, MMM d")}
              <button className="text-button" onClick={() => onAdd(day)}>
                Add task
              </button>
            </div>
            {(days.length === 1 || events.length > 0) && (
              <>
                <h3>Scheduled</h3>
                {events.length ? (
                  events.map((event) => {
                    const task = data.tasks.find(
                      (t) => t.kind === "task" && t.id === event.taskId,
                    );
                    return (
                      <div className="timeline-item" key={event.instanceId}>
                        <div className="time-chip">{event.startTime}</div>
                        <div>
                          <button
                            className="briefing-title-button"
                            onClick={() =>
                              task ? onTask(task, event) : onOpen(event)
                            }
                          >
                            {task ? taskTitle(task) : event.title}
                          </button>
                          <small>
                            {`${event.startTime}–${event.endTime}`} ·{" "}
                            {task
                              ? "Linked task"
                              : event.category || event.kind}
                          </small>
                          <button
                            className="text-button"
                            onClick={() => onOpen(event)}
                          >
                            Edit / reschedule
                          </button>
                          {(event.completed || event.checkIn) && (
                            <small>
                              {event.completed
                                ? "Completed"
                                : event.checkIn === "skipped"
                                  ? "Skipped · does not reserve time"
                                  : "Worked on it"}
                            </small>
                          )}
                          {task && (
                            <TaskCompletion
                              task={task}
                              onToggle={onComplete}
                              className="planner-complete"
                            />
                          )}
                          {event.kind === "work-session" &&
                            !event.checkIn &&
                            !event.recurring &&
                            day <= today && (
                              <div className="checkin-buttons">
                                <button
                                  onClick={() => onCheckin(event, "worked")}
                                >
                                  Worked on it
                                </button>
                                {task && (
                                  <button
                                    onClick={() => onCheckin(event, "finished")}
                                  >
                                    Finished task
                                  </button>
                                )}
                                <button
                                  onClick={() => onCheckin(event, "skipped")}
                                >
                                  Skipped
                                </button>
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="empty">No scheduled items.</p>
                )}
              </>
            )}
            {(days.length === 1 || reminders.length > 0) && (
              <>
                <h3>Reminders</h3>
                {reminders.length ? (
                  reminders.map(taskRow)
                ) : (
                  <p className="empty">No reminders.</p>
                )}
              </>
            )}
            {(days.length === 1 || tasks.length > 0) && (
              <>
                <h3>Unscheduled tasks</h3>
                {tasks.length ? (
                  tasks.map(taskRow)
                ) : (
                  <p className="empty">No unscheduled tasks for this day.</p>
                )}
              </>
            )}
            {days.length > 1 &&
              !events.length &&
              !reminders.length &&
              !tasks.length && <p className="empty">No planned items.</p>}
            <button className="add-link" onClick={() => onAddEvent(day)}>
              Add to this day
            </button>
          </section>
        );
      })}
      {overdue.length > 0 && (
        <section className="day-details">
          <h3>Overdue · still open</h3>
          {overdue.map(taskRow)}
        </section>
      )}
    </div>
  );
}
