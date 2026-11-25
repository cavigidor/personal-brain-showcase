import { activityTitle } from "./job-details";
import { format, parseISO } from "date-fns";
import { useEffect, useRef } from "react";
import TaskCompletion from "./TaskCompletion";
import type { CalendarEvent, Task } from "./types";
import {
  layoutOccurrences,
  minutes,
  occurrencesOn,
  timeFromMinutes,
  type CalendarOccurrence,
} from "./calendar-model";

interface Props {
  days: string[];
  events: CalendarEvent[];
  tasks: Task[];
  isVisible: (event: CalendarOccurrence) => boolean;
  onOpen: (event: CalendarOccurrence) => void;
  onSlot: (date: string, time: string) => void;
  onMove: (event: CalendarOccurrence, date: string, time: string) => void;
  onTaskDrop: (task: Task, date: string, time: string) => void;
  onComplete: (task: Task) => void;
}
const hourHeight = 48;
export default function CalendarTimeGrid({
  days,
  events,
  tasks,
  isVisible,
  onOpen,
  onSlot,
  onMove,
  onTaskDrop,
  onComplete,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const first = days
    .flatMap((day) => occurrencesOn(events, day))
    .reduce(
      (minute, item) => Math.min(minute, minutes(item.startTime)),
      24 * 60,
    );
  useEffect(() => {
    const target = first === 24 * 60 ? 8 * 60 : Math.max(0, first - 60);
    if (scrollRef.current)
      scrollRef.current.scrollTop = Math.max(0, (target / 60) * hourHeight);
  }, [first]);
  const timeAt = (element: HTMLElement, clientY: number) => {
    const rect = element.getBoundingClientRect();
    const raw = Math.floor(((clientY - rect.top) / hourHeight) * 2) * 30;
    return timeFromMinutes(Math.max(0, Math.min(23 * 60, raw)));
  };
  return (
    <div className="time-grid-scroll" ref={scrollRef}>
      <div
        className={
          "time-grid " + (days.length === 7 ? "time-week" : "time-day")
        }
      >
        <div className="time-heading time-corner" />
        {days.map((day) => (
          <div className="time-heading" key={day}>
            {format(
              parseISO(day),
              days.length === 7 ? "EEE d" : "EEEE, MMMM d",
            )}
          </div>
        ))}
        <div className="time-axis">
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} style={{ top: hour * hourHeight }}>
              {timeFromMinutes(hour * 60)}
            </span>
          ))}
        </div>
        {days.map((day) => {
          const items = occurrencesOn(events, day).filter(isVisible),
            layout = layoutOccurrences(items);
          return (
            <div
              key={day}
              className={
                "cal-day time-column" +
                (day === format(new Date(), "yyyy-MM-dd") ? " cal-today" : "")
              }
              aria-label={"Schedule for " + day}
              onClick={(event) => {
                if (event.target === event.currentTarget)
                  onSlot(day, timeAt(event.currentTarget, event.clientY));
              }}
              onDragOver={(event) => {
                if (
                  event.dataTransfer.types.includes(
                    "text/personal-brain-event",
                  ) ||
                  event.dataTransfer.types.includes("text/personal-brain-task")
                )
                  event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const time = timeAt(event.currentTarget, event.clientY);
                const eventKey = event.dataTransfer.getData(
                  "text/personal-brain-event",
                );
                const taskId = event.dataTransfer.getData(
                  "text/personal-brain-task",
                );
                if (eventKey) {
                  const source = events.find(
                    (e) => e.id === eventKey.split("@")[0],
                  );
                  const item = source
                    ? occurrencesOn([source], source.date)[0]
                    : undefined;
                  if (item) onMove(item, day, time);
                } else if (taskId) {
                  const task = tasks.find((t) => t.id === taskId && !t.done);
                  if (task) onTaskDrop(task, day, time);
                }
              }}
            >
              {items.map((item) => {
                const pos = layout.get(item.instanceId)!;
                const task = item.taskId
                  ? tasks.find((task) => task.id === item.taskId)
                  : undefined;
                return (
                  <div
                    key={item.instanceId}
                    className={
                      "time-block category-" +
                      (
                        item.category ||
                        (item.kind === "work-session"
                          ? "Task Work Session"
                          : "Personal")
                      )
                        .toLowerCase()
                        .replace(/[^a-z]+/g, "-") +
                      (item.completed ? " completed" : "")
                    }
                    style={{
                      top: (minutes(item.startTime) / 60) * hourHeight,
                      height: Math.max(
                        24,
                        ((minutes(item.endTime) - minutes(item.startTime)) /
                          60) *
                          hourHeight,
                      ),
                      left: (pos.column / pos.columns) * 100 + "%",
                      width: 100 / pos.columns + "%",
                    }}
                    draggable={!item.recurring}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "text/personal-brain-event",
                        item.instanceId,
                      );
                      event.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <button
                      type="button"
                      className="time-block-open"
                      aria-label={
                        activityTitle(tasks, item) +
                        " " +
                        day +
                        " " +
                        (item.startTime + " to " + item.endTime)
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(item);
                      }}
                    >
                      <strong>{activityTitle(tasks, item)}</strong>
                      <small>{`${item.startTime}–${item.endTime}`}</small>
                    </button>
                    {task && (
                      <TaskCompletion task={task} onToggle={onComplete} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
