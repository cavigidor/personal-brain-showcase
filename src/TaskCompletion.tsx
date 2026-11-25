import { Check } from "lucide-react";
import type { Task } from "./types";

export default function TaskCompletion({
  task,
  onToggle,
  label,
  className = "",
}: {
  task: Task;
  onToggle: (task: Task) => void;
  label?: string;
  className?: string;
}) {
  const name = label || `${task.done ? "Reopen" : "Complete"} ${task.title}`;
  return (
    <button
      type="button"
      className={`check-toggle task-completion ${task.done ? "checked" : ""} ${className}`}
      aria-label={name}
      aria-pressed={task.done}
      title={name}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(task);
      }}
    >
      {task.done && <Check size={13} aria-hidden="true" />}
    </button>
  );
}
