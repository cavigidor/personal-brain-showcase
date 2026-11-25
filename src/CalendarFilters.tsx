import type { CalendarVisibility, Project } from "./types";
import { FILTER_GROUPS } from "./planner";

export default function CalendarFilters({
  value = {},
  projects,
  onChange,
}: {
  value?: CalendarVisibility;
  projects: Project[];
  onChange: (value: CalendarVisibility) => void;
}) {
  const active =
    Object.values(value.groups || {}).includes(false) ||
    Object.values(value.projects || {}).includes(false);
  return (
    <div>
      {active && (
        <p role="status">
          Calendar filters are hiding items; an empty calendar may be filtered.
          Today and To-Dos remain unfiltered by these controls.{" "}
          <button className="text-button" onClick={() => onChange({})}>
            Clear filters
          </button>
        </p>
      )}
      <details className="calendar-filters">
        <summary>Calendar filters</summary>
        <p>
          Hidden items still reserve busy time. These filters only change
          calendar visibility.
        </p>
        <div className="filter-options">
          {FILTER_GROUPS.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={value.groups?.[key] !== false}
                onChange={(e) =>
                  onChange({
                    ...value,
                    groups: { ...value.groups, [key]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <fieldset>
          <legend>Individual projects</legend>
          <div className="filter-options">
            {projects.map((project) => (
              <label key={project.id}>
                <input
                  type="checkbox"
                  checked={value.projects?.[project.id] !== false}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      projects: {
                        ...value.projects,
                        [project.id]: e.target.checked,
                      },
                    })
                  }
                />
                {project.name}
              </label>
            ))}
          </div>
        </fieldset>
      </details>
    </div>
  );
}
