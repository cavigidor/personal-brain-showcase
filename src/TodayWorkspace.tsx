import { useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { CalendarOccurrence } from "./calendar-model";
import type { Task } from "./types";
import { activityTitle } from "./job-details";
import TaskCompletion from "./TaskCompletion";

type Props = {
  date: string;
  tasks: Task[];
  overdue: Task[];
  reminders: Task[];
  schedule: CalendarOccurrence[];
  tasksById: Map<string, Task>;
  onComplete: (task: Task) => void;
  renderTask: (task: Task) => ReactNode;
  onActivity: (activity: CalendarOccurrence) => void;
  onCalendar: () => void;
  onGroceries: () => void;
};

export default function TodayWorkspace({
  date,
  tasks,
  overdue,
  reminders,
  schedule,
  tasksById,
  onComplete,
  renderTask,
  onActivity,
  onCalendar,
  onGroceries,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  return (
    <div className="today-workspace">
      <section aria-label="Today's tasks" className="today-section">
        <div className="today-section-heading">
          <h2>Tasks</h2>
          <button className="text-button" onClick={onGroceries}>
            Grocery List <ArrowRight size={14} />
          </button>
        </div>
        {tasks.length ? (
          tasks.map((task) => renderTask(task))
        ) : (
          <p className="today-empty">No tasks planned for today.</p>
        )}
        {overdue.length > 0 && (
          <details className="today-overdue">
            <summary>
              <ChevronDown size={14} /> Overdue <span>{overdue.length}</span>
            </summary>
            {overdue.map((task) => renderTask(task))}
          </details>
        )}
      </section>
      <section aria-label="Upcoming schedule" className="today-section">
        <div className="today-section-heading">
          <h2>Upcoming</h2>
          <button className="text-button" onClick={onCalendar}>
            Calendar <ArrowRight size={14} />
          </button>
        </div>
        {schedule.length ? (
          <>
            {(showAll ? schedule : schedule.slice(0, 5)).map((item) => (
              <div className="today-activity-row" key={item.instanceId}>
                <button
                  className="today-activity"
                  onClick={() => onActivity(item)}
                >
                  <span className="today-activity-time">
                    <span>
                      {item.occurrenceDate === date
                        ? "Today"
                        : format(parseISO(item.occurrenceDate), "EEE, MMM d")}
                    </span>
                    <span>{`${item.startTime}–${item.endTime}`}</span>
                  </span>
                  <span className="today-activity-title">
                    {activityTitle([...tasksById.values()], item)}
                  </span>
                  <ArrowRight className="today-activity-arrow" size={15} />
                </button>
                {item.taskId && tasksById.get(item.taskId) && (
                  <TaskCompletion
                    task={tasksById.get(item.taskId)!}
                    onToggle={onComplete}
                  />
                )}
              </div>
            ))}
            {schedule.length > 5 && (
              <button
                className="text-button today-show-more"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show less" : "Show all upcoming"}
              </button>
            )}
          </>
        ) : (
          <p className="today-empty">Nothing coming up.</p>
        )}
      </section>
      {reminders.length > 0 && (
        <section aria-label="Today's reminders" className="today-section">
          <h2>Reminders</h2>
          {reminders.map((task) => renderTask(task))}
        </section>
      )}
    </div>
  );
}
