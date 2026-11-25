import { APPLICATION_STAGES } from "./application-stages";
import type { JobDetails } from "./types";

export default function JobApplicationFields({
  value,
  onChange,
}: {
  value: JobDetails | undefined;
  onChange: (value: JobDetails | undefined) => void;
}) {
  return (
    <fieldset className="job-fields">
      <legend>Job application</legend>
      <label className="toggle-setting">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? { company: "", position: "", stage: "Interested" }
                : undefined,
            )
          }
        />
        Track this task as a job application
      </label>
      {value && (
        <>
          <label className="field">
            Company
            <input
              required
              maxLength={200}
              value={value.company}
              onChange={(event) =>
                onChange({ ...value, company: event.target.value })
              }
            />
          </label>
          <label className="field">
            Role
            <input
              required
              maxLength={300}
              value={value.position ?? ""}
              onChange={(event) =>
                onChange({ ...value, position: event.target.value })
              }
            />
          </label>
          <label className="field">
            Application stage
            <select
              value={value.stage ?? "Interested"}
              onChange={(event) =>
                onChange({
                  ...value,
                  stage: event.target.value as JobDetails["stage"],
                })
              }
            >
              {APPLICATION_STAGES.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
        </>
      )}
    </fieldset>
  );
}
