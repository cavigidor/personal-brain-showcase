import type { taskInventory } from "./planner";

export default function TaskInventory({
  counts,
  projects,
}: {
  counts: ReturnType<typeof taskInventory>;
  projects: number;
}) {
  return (
    <div
      className="task-inventory"
      role="status"
      aria-label="Loaded task counts"
    >
      <p>
        {counts.total} saved tasks · {counts.open} open · {counts.completed}{" "}
        completed · {counts.linked} linked to projects
      </p>
      <p>{counts.scheduled} scheduled open tasks</p>
      <p>
        {counts.dated} dated open tasks · {counts.undated} undated open tasks ·{" "}
        {counts.reminders} reminders · {projects} projects
      </p>
      {counts.total === 0 && <p>No tasks saved yet.</p>}
      <p>
        Counts cover this browser’s loaded document, before filters. Scheduled
        means a linked, non-skipped local work session.
      </p>
    </div>
  );
}
