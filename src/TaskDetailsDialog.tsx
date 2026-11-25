import { useEffect, useId, useRef, useState } from "react";
import { X, ExternalLink, Copy } from "lucide-react";
import type { Task } from "./types";
import { TASK_NOTES_MAX_LENGTH } from "./validation";
import { jobDetailsFor, taskTitle, safeJobUrl } from "./job-details";

type Props = {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
  onSaveNotes: (notes: string, original: string) => void;
  returnFocus: HTMLElement | null;
};

export default function TaskDetailsDialog({
  task,
  onClose,
  onEdit,
  onSaveNotes,
  returnFocus,
}: Props) {
  const d = jobDetailsFor(task);
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useId();
  const [showJob, setShowJob] = useState(false);
  const [notes, setNotes] = useState(() => ({
    value: task.notes ?? "",
    baseline: task.notes ?? "",
  }));
  const [notesError, setNotesError] = useState("");
  const conflict = notes.baseline !== (task.notes ?? "");
  useEffect(() => {
    const next = task.notes ?? "";
    setNotes((old) =>
      old.baseline === next
        ? old
        : old.value === old.baseline || old.value === next
          ? { value: next, baseline: next }
          : old,
    );
  }, [task.notes]);
  const [draft, setDraft] = useState(d?.contact?.outreachDraft || "");
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    setDraft(d?.contact?.outreachDraft || "");
    setFeedback("");
  }, [d?.contact?.outreachDraft]);
  useEffect(() => {
    const el = dialog.current!,
      trigger = returnFocus || (document.activeElement as HTMLElement | null);
    el.showModal();
    const close = () => onClose();
    el.addEventListener("cancel", close);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.removeEventListener("cancel", close);
      el.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [onClose, returnFocus]);
  useEffect(() => {
    const el = dialog.current;
    el?.querySelector<HTMLElement>(
      showJob ? "[data-close]" : "textarea",
    )?.focus();
    if (el) el.scrollTop = 0;
  }, [showJob]);
  const application = safeJobUrl(d?.applicationUrl),
    profile = safeJobUrl(d?.contact?.linkedinUrl, true);
  const field = (label: string, value?: string) =>
    value ? (
      <div
        className={`job-field ${["Summary", "Why this fits", "Requirements & potential gaps", "Relationship to this job / team", "Why this person"].includes(label) ? "job-field-wide" : ""}`}
      >
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ) : null;
  return (
    <dialog
      ref={dialog}
      className={`modal task-details-dialog ${showJob ? "job-dialog" : "task-notes-dialog"}`}
      aria-labelledby={heading}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],textarea:not(:disabled),input:not(:disabled),summary",
          ),
        ).filter((el) => el.getClientRects().length);
        if (!controls.length) return;
        e.preventDefault();
        const index = controls.indexOf(document.activeElement as HTMLElement);
        controls[
          index < 0
            ? e.shiftKey
              ? controls.length - 1
              : 0
            : (index + (e.shiftKey ? -1 : 1) + controls.length) %
              controls.length
        ]?.focus();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={heading}>
            {showJob && d ? d.position || d.contact?.name : taskTitle(task)}
          </h2>
          {showJob && d && (
            <p className="job-subtitle">
              {[d.company, d.location, d.compensation]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <button
          data-close
          className="icon-action"
          aria-label={showJob ? "Close job details" : "Close notes"}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {!showJob && (
        <form
          className="task-notes-form"
          onSubmit={(event) => {
            event.preventDefault();
            setNotesError("");
            try {
              onSaveNotes(notes.value, notes.baseline);
            } catch (error) {
              setNotesError(
                error instanceof Error
                  ? error.message
                  : "Notes could not be saved.",
              );
            }
          }}
        >
          <label className="field">
            Notes / Comments (optional)
            <textarea
              rows={5}
              maxLength={TASK_NOTES_MAX_LENGTH}
              value={notes.value}
              onChange={(event) => {
                setNotes((old) => ({ ...old, value: event.target.value }));
                setNotesError("");
              }}
            />
          </label>
          {(conflict || notesError) && (
            <p className="form-notice" role="alert">
              {conflict
                ? "Notes changed elsewhere. Copy your draft, then close and reopen this popup to review the saved notes."
                : notesError}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onEdit}>
              Edit Details
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={conflict}
            >
              Save Notes
            </button>
          </div>
          {d && (
            <button
              type="button"
              className="text-button view-job-details"
              onClick={() => setShowJob(true)}
            >
              View Job Details
            </button>
          )}
        </form>
      )}
      {showJob && d && (
        <>
          <button className="text-button" onClick={() => setShowJob(false)}>
            Back to Notes
          </button>
          {(d.stage || d.recommendedDate || d.fitScore !== undefined) && (
            <p className="job-recommendation">
              {[
                d.stage,
                d.recommendedDate && `Recommended ${d.recommendedDate}`,
                d.fitScore !== undefined && `Fit ${d.fitScore}/100`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <section aria-label="Position" className="job-section">
            <h3>Position</h3>
            {d.position ? (
              <>
                <dl>
                  {field("Job title", d.position)}
                  {field("Company", d.company)}
                  {field("Location", d.location)}
                  {field("Compensation", d.compensation)}
                  {field("Summary", d.description)}
                  {field("Why this fits", d.fitAssessment)}
                  {field(
                    "Requirements & potential gaps",
                    d.requirementsOrRisks,
                  )}
                </dl>
                {application ? (
                  <a
                    className="button primary"
                    href={application}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Job Application <ExternalLink size={15} />
                  </a>
                ) : (
                  <p className="job-unavailable">
                    Application link unavailable.
                  </p>
                )}
              </>
            ) : (
              <p className="job-unavailable">
                This task tracks outreach to a contact.
              </p>
            )}
          </section>
          <section aria-label="Person to Contact" className="job-section">
            <h3>Person to Contact</h3>
            {d.contact ? (
              <>
                <dl>
                  {field("Full name", d.contact.name)}
                  {field("Current position", d.contact.title)}
                  {field("Company", d.contact.company || d.company)}
                  {field(
                    "Relationship to this job / team",
                    d.contact.relationship,
                  )}
                  {field("Why this person", d.contact.relevance)}
                </dl>
                {profile ? (
                  <a
                    className="button secondary"
                    href={profile}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open LinkedIn Profile <ExternalLink size={15} />
                  </a>
                ) : (
                  <p className="job-unavailable">
                    Profile link unavailable.
                    {d.contact.linkedinSearch && (
                      <> Search LinkedIn for “{d.contact.linkedinSearch}”.</>
                    )}
                  </p>
                )}
              </>
            ) : (
              <p className="job-unavailable">Contact not available.</p>
            )}
          </section>
          <section
            aria-label="Personalized Outreach Message"
            className="job-section"
          >
            <h3>Personalized Outreach Message</h3>
            {d.contact?.outreachDraft ? (
              <>
                <label className="field">
                  Outreach message
                  <textarea
                    rows={7}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setFeedback("");
                    }}
                  />
                </label>
                <p className="job-unavailable">
                  Edits here are temporary. Copy the draft to use your edits.
                </p>
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(draft);
                      setFeedback("Message copied");
                    } catch {
                      setFeedback(
                        "Copy failed. Select the message and copy it manually.",
                      );
                    }
                  }}
                >
                  <Copy size={15} />
                  Copy Message
                </button>
                <p role="status" aria-live="polite">
                  {feedback}
                </p>
              </>
            ) : (
              <p className="job-unavailable">Outreach draft not available.</p>
            )}
          </section>
        </>
      )}
    </dialog>
  );
}
