import { APPLICATION_STAGES } from "./application-stages.ts";
import type { JobDetails, Task } from "./types.ts";

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const limits = {
  company: 200,
  position: 300,
  location: 300,
  compensation: 500,
  applicationUrl: 2048,
  description: 12000,
  fitAssessment: 8000,
  requirementsOrRisks: 8000,
  recommendedDate: 10,
};
const contactLimits = {
  name: 200,
  title: 300,
  company: 200,
  linkedinUrl: 2048,
  linkedinSearch: 500,
  relationship: 2000,
  relevance: 4000,
  outreachDraft: 12000,
};
export function safeJobUrl(
  value: unknown,
  linkedin = false,
): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    value !== value.trim()
  )
    return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return;
    if (
      linkedin &&
      (!["linkedin.com", "www.linkedin.com"].includes(url.hostname) ||
        !/^\/in\/[^/]+\/?$/.test(url.pathname))
    )
      return;
    return url.href;
  } catch {
    return;
  }
}
export function validateJobDetails(
  value: unknown,
): asserts value is JobDetails {
  if (!record(value)) throw new Error("Invalid job details");
  const strings = (
    obj: Record<string, unknown>,
    fields: Record<string, number>,
    extras: string[] = [],
  ) => {
    if (
      Object.keys(obj).some(
        (k) => !Object.hasOwn(fields, k) && !extras.includes(k),
      )
    )
      throw new Error("Unsupported job details field");
    for (const [key, max] of Object.entries(fields))
      if (
        obj[key] !== undefined &&
        (typeof obj[key] !== "string" ||
          !(obj[key] as string).trim() ||
          (obj[key] as string).length > max)
      )
        throw new Error("Invalid job details " + key);
  };
  strings(value, limits, ["category", "fitScore", "contact", "stage"]);
  if (typeof value.company !== "string" || !value.company.trim())
    throw new Error("Job company required");
  if (
    value.stage !== undefined &&
    !APPLICATION_STAGES.some((stage) => stage === value.stage)
  )
    throw new Error("Invalid application stage");
  if (
    value.category !== undefined &&
    !["Engineering", "Tech"].includes(String(value.category))
  )
    throw new Error("Invalid job category");
  if (
    value.fitScore !== undefined &&
    (typeof value.fitScore !== "number" ||
      !Number.isFinite(value.fitScore) ||
      value.fitScore < 0 ||
      value.fitScore > 100)
  )
    throw new Error("Invalid fit score (0–100)");
  if (
    value.recommendedDate !== undefined &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.recommendedDate)) ||
      !Number.isFinite(Date.parse(String(value.recommendedDate))) ||
      new Date(String(value.recommendedDate)).toISOString().slice(0, 10) !==
        value.recommendedDate)
  )
    throw new Error("Invalid recommendation date");
  if (
    value.applicationUrl !== undefined &&
    (!value.position || !safeJobUrl(value.applicationUrl))
  )
    throw new Error("Invalid job application URL or missing position");
  if (value.contact !== undefined) {
    if (!record(value.contact)) throw new Error("Invalid job contact");
    strings(value.contact, contactLimits);
    if (typeof value.contact.name !== "string" || !value.contact.name.trim())
      throw new Error("Contact name required");
    if (
      value.contact.linkedinUrl !== undefined &&
      !safeJobUrl(value.contact.linkedinUrl, true)
    )
      throw new Error("Invalid LinkedIn profile URL");
  }
  if (!value.position && !value.contact)
    throw new Error("Position or known contact required");
  if (JSON.stringify(value).length > 60000)
    throw new Error("Job details exceed size limit");
}

export const jobDetailsFor = (task: Task) => task.jobDetails;
export const jobTitle = (details: JobDetails) =>
  details.position
    ? `Apply to ${details.position} — ${details.company}`
    : `Reach out to ${details.contact!.name} — ${details.company}`;
export const taskTitle = (task: Task) => {
  const details = jobDetailsFor(task);
  return details
    ? task.jobDetails &&
      task.title.length <= 500 &&
      !/https?:\/\/|\b(?:LinkedIn|Draft|Apply):/.test(task.title)
      ? task.title
      : jobTitle(details)
    : task.title;
};
export const taskSecondary = (task: Task) => {
  const details = jobDetailsFor(task);
  return (
    details?.stage ||
    (details?.position && details.contact
      ? `Reach out to ${details.contact.name}`
      : undefined)
  );
};
export const taskSearchText = (task: Task) =>
  [task.title, task.notes || "", JSON.stringify(jobDetailsFor(task) || {})]
    .join(" ")
    .toLocaleLowerCase();
const normalized = (s: string) =>
  s.trim().toLocaleLowerCase().replace(/\s+/g, " ");
const applicationKey = (s?: string) => {
  if (!s) return;
  const u = new URL(s);
  for (const k of [...u.searchParams.keys()])
    if (/^(utm_|ref$|source$)/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.origin + u.pathname.replace(/\/$/, "") + u.search;
};
/** Role identity ignores contact and recommendation date, including already completed goals. */
export function assertUniqueJob(tasks: Task[], incoming: Task) {
  const job = incoming.jobDetails;
  if (!job?.position) return;
  if (
    tasks.some((t) => {
      const other = jobDetailsFor(t);
      return (
        t.id !== incoming.id &&
        t.projectId === incoming.projectId &&
        other?.position &&
        ((normalized(job.company) === normalized(other.company) &&
          normalized(job.position!) === normalized(other.position)) ||
          (!!job.applicationUrl &&
            applicationKey(job.applicationUrl) ===
              applicationKey(other.applicationUrl)))
      );
    })
  )
    throw new Error(
      "This job already has a task, including completed recommendations",
    );
}

/** Linked calendar sessions present the compact job title without rewriting historical block text. */
export function activityTitle(
  tasks: Task[],
  activity: { title: string; taskId?: string },
) {
  const task = tasks.find((t) => t.id === activity.taskId);
  return task && jobDetailsFor(task) ? taskTitle(task) : activity.title;
}
