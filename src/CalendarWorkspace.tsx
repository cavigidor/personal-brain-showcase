import { ArrowLeft, ArrowRight, Bell, Plus } from "lucide-react";
import {
  addDays,
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import {
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import CalendarFilters from "./CalendarFilters";
import CalendarTimeGrid from "./CalendarTimeGrid";
import PlannerAgenda from "./PlannerAgenda";
import TaskCompletion from "./TaskCompletion";
import {
  occurrencesBetween,
  occurrencesOn,
  type CalendarOccurrence,
} from "./calendar-model";
import { activityTitle, taskTitle } from "./job-details";
import {
  calendarVisible,
  unscheduledBacklog,
  unscheduledForDay,
} from "./planner";
import type { BrainData, CalendarVisibility, Period, Task } from "./types";

interface Props {
  data: BrainData;
  today: string;
  focusDate: Date;
  setFocusDate: Dispatch<SetStateAction<Date>>;
  period: Period;
  setPeriod: (period: Period) => void;
  selectDay: (date: Date) => void;
  onVisibilityChange: (value: CalendarVisibility) => void;
  openEditor: (kind: "event" | "reminder", options: { date: string }) => void;
  planTask: (date: string) => void;
  openActivity: (activity: CalendarOccurrence) => void;
  openTask: (task: Task) => void;
  editActivity: (activity: CalendarOccurrence) => void;
  scheduleTask: (task: Task, date: string, time?: string) => void;
  openSlot: (date: string, time: string) => void;
  moveEvent: (activity: CalendarOccurrence, date: string, time: string) => void;
  toggleTask: (task: Task) => void;
  taskRow: (task: Task) => ReactNode;
  checkin: (
    activity: CalendarOccurrence,
    action: "worked" | "skipped" | "finished",
  ) => void;
}

const dateKey = (date: Date) => format(date, "yyyy-MM-dd");

export default function CalendarWorkspace({
  data,
  today,
  focusDate,
  setFocusDate,
  period,
  setPeriod,
  selectDay,
  onVisibilityChange,
  openEditor,
  planTask,
  openActivity,
  openTask,
  editActivity,
  scheduleTask,
  openSlot,
  moveEvent,
  toggleTask,
  taskRow,
  checkin,
}: Props) {
  const movePeriod = (direction: number) =>
    setFocusDate((old) =>
      period === "Day"
        ? addDays(old, direction)
        : period === "Week"
          ? addDays(old, 7 * direction)
          : period === "Month"
            ? addMonths(old, direction)
            : addYears(old, direction),
    );
  const viewDays = useMemo(() => {
    if (period === "Day") return [focusDate];
    if (period === "Week")
      return eachDayOfInterval({
        start: startOfWeek(focusDate, { weekStartsOn: 1 }),
        end: endOfWeek(focusDate, { weekStartsOn: 1 }),
      });
    if (period === "Month")
      return eachDayOfInterval({
        start: startOfWeek(startOfMonth(focusDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(focusDate), { weekStartsOn: 1 }),
      });
    return [];
  }, [focusDate, period]);
  const isVisible = (item: Task | CalendarOccurrence) =>
    calendarVisible(item, data.preferences.calendarVisibility, data.tasks);
  const entriesForDate = (date: string) => ({
    tasks: [
      ...unscheduledForDay(data.tasks, data.events, date),
      ...data.tasks.filter((t) => t.kind === "reminder" && t.dueDate === date),
    ].filter(isVisible),
    events: occurrencesOn(data.events, date).filter(isVisible),
  });
  const periodLabel =
    period === "Day"
      ? format(focusDate, "EEEE, MMM d, yyyy")
      : period === "Week"
        ? `${format(viewDays[0], "MMM d")} – ${format(viewDays[6], "MMM d, yyyy")}`
        : period === "Month"
          ? format(focusDate, "MMMM yyyy")
          : format(focusDate, "yyyy");

  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const openTasks = data.tasks.filter(
    (task) => task.kind === "task" && !task.done && isVisible(task),
  );
  const backlog = unscheduledBacklog(data.tasks, data.events).filter(isVisible);
  return (
    <section className="panel calendar-panel">
      <CalendarFilters
        value={data.preferences.calendarVisibility}
        projects={data.projects}
        onChange={onVisibilityChange}
      />
      <div className="calendar-controls">
        <div className="period-nav">
          <button
            className="icon-action"
            aria-label="Previous period"
            onClick={() => movePeriod(-1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="today-btn"
            onClick={() => setFocusDate(new Date())}
          >
            Today
          </button>
          <button
            className="icon-action"
            aria-label="Next period"
            onClick={() => movePeriod(1)}
          >
            <ArrowRight size={18} />
          </button>
          <h2>{periodLabel}</h2>
        </div>
        <button
          className="button secondary"
          onClick={() => openEditor("event", { date: dateKey(focusDate) })}
        >
          <Plus size={15} /> Schedule block
        </button>
        <div className="segmented">
          {(["Day", "Week", "Month", "Year"] as Period[]).map((p) => (
            <button
              key={p}
              className={period === p ? "selected" : ""}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <details className="calendar-backlog">
        <summary>Schedule a task · {openTasks.length} open</summary>
        <p className="panel-subtitle">
          Drag onto a day, or open a task to schedule a linked session.
        </p>
        {openTasks.map((task) => taskRow(task))}
      </details>
      <details className="calendar-backlog">
        <summary>Undated backlog · {backlog.length}</summary>
        {backlog.map((task) => taskRow(task))}
      </details>
      {period === "Year" ? (
        <div className="year-grid">
          {Array.from({ length: 12 }, (_, i) => {
            const d = addMonths(startOfYear(focusDate), i);
            const first = format(d, "yyyy-MM-dd"),
              last = format(endOfMonth(d), "yyyy-MM-dd");
            const count =
              data.tasks.filter(
                (t) =>
                  (t.plannedDate || t.dueDate)?.startsWith(
                    format(d, "yyyy-MM"),
                  ) && isVisible(t),
              ).length +
              occurrencesBetween(data.events, first, last).filter(isVisible)
                .length;
            return (
              <div className="year-month" key={i}>
                <button
                  className="year-month-open"
                  onClick={() => {
                    setFocusDate(d);
                    setPeriod("Month");
                  }}
                >
                  <strong>{format(d, "MMMM")}</strong>
                  <span>{count} scheduled items</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : period === "Month" ? (
        <div className="calendar-grid mode-month">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div className="cal-weekday" key={d}>
              {d}
            </div>
          ))}
          {viewDays.map((d) => {
            const day = dateKey(d),
              content = entriesForDate(day);
            return (
              <div
                key={day}
                className={
                  "cal-day " +
                  (isSameDay(d, new Date()) ? "cal-today " : "") +
                  (!isSameMonth(d, focusDate) ? "cal-outside" : "")
                }
                onClick={(event) => {
                  if (event.target === event.currentTarget) selectDay(d);
                }}
                onDragOver={(event) => {
                  if (
                    event.dataTransfer.types.includes(
                      "text/personal-brain-task",
                    )
                  )
                    event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const task = data.tasks.find(
                    (t) =>
                      t.id ===
                        event.dataTransfer.getData(
                          "text/personal-brain-task",
                        ) && !t.done,
                  );
                  if (task) scheduleTask(task, day);
                }}
              >
                <button
                  className="cal-date"
                  aria-label={"Open " + day}
                  onClick={() => selectDay(d)}
                >
                  {format(d, "d")}
                </button>
                <div className="cal-items">
                  {content.events.slice(0, 3).map((e) => (
                    <span className="calendar-event-chip" key={e.instanceId}>
                      <button
                        type="button"
                        className={
                          "cal-tag " +
                          (e.category || e.kind)
                            .toLowerCase()
                            .replace(/[^a-z]+/g, "-")
                        }
                        onClick={() => openActivity(e)}
                      >
                        {e.startTime} {activityTitle(data.tasks, e)}
                      </button>
                      {e.taskId && tasksById.get(e.taskId) && (
                        <TaskCompletion
                          task={tasksById.get(e.taskId)!}
                          onToggle={toggleTask}
                        />
                      )}
                    </span>
                  ))}
                  {content.tasks
                    .filter((t) => !t.done)
                    .slice(0, 2)
                    .map((t) => (
                      <span
                        className={"cal-tag " + t.kind + " calendar-task-chip"}
                        key={t.id}
                      >
                        <TaskCompletion task={t} onToggle={toggleTask} />
                        <button
                          type="button"
                          className="calendar-task-title"
                          onClick={() => openTask(t)}
                        >
                          {taskTitle(t)}
                        </button>
                      </span>
                    ))}
                  {Math.max(
                    0,
                    content.tasks.filter((t) => !t.done).length - 2,
                  ) +
                    Math.max(0, content.events.length - 3) >
                    0 && (
                    <button
                      className="text-button"
                      onClick={() => selectDay(d)}
                    >
                      +{" "}
                      {Math.max(
                        0,
                        content.tasks.filter((t) => !t.done).length - 2,
                      ) + Math.max(0, content.events.length - 3)}{" "}
                      more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <CalendarTimeGrid
          days={viewDays.map(dateKey)}
          events={data.events}
          tasks={data.tasks}
          isVisible={isVisible}
          onOpen={openActivity}
          onSlot={openSlot}
          onMove={moveEvent}
          onTaskDrop={scheduleTask}
          onComplete={toggleTask}
        />
      )}
      {(period === "Day" || period === "Week") && (
        <PlannerAgenda
          days={viewDays.map(dateKey)}
          data={data}
          today={today}
          entries={entriesForDate}
          onTask={(_task, activity) => openActivity(activity)}
          onOpen={editActivity}
          onComplete={toggleTask}
          taskRow={taskRow}
          onCheckin={checkin}
          onAddEvent={(date) => openEditor("event", { date })}
          onAdd={planTask}
        />
      )}
      <div className="calendar-footer">
        <button
          className="button secondary"
          onClick={() => openEditor("event", { date: dateKey(focusDate) })}
        >
          <Plus size={15} /> Add event
        </button>
        <button
          className="button secondary"
          onClick={() => openEditor("reminder", { date: dateKey(focusDate) })}
        >
          <Bell size={15} /> Add reminder
        </button>
        <p>
          Plan dates and work sessions stay separate from deadlines. Weekend
          deadlines remain pending through Sunday.
        </p>
      </div>
    </section>
  );
}
