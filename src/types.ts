export type View =
  | "Overview"
  | "Today"
  | "Calendar"
  | "To-Dos"
  | "Reminders"
  | "Projects"
  | "Inbox";
export type Period = "Day" | "Week" | "Month" | "Year";
export type ProjectStatus =
  "Active" | "Planned" | "Paused" | "Completed" | "Archived";
export type Priority = "normal" | "high";
export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
}
export interface JobDetails {
  company: string;
  position?: string;
  location?: string;
  category?: "Engineering" | "Tech";
  compensation?: string;
  applicationUrl?: string;
  description?: string;
  fitAssessment?: string;
  fitScore?: number;
  requirementsOrRisks?: string;
  recommendedDate?: string;
  stage?: "Interested" | "Applied" | "Interviewing" | "Closed";
  contact?: {
    name: string;
    title?: string;
    company?: string;
    linkedinUrl?: string;
    linkedinSearch?: string;
    relationship?: string;
    relevance?: string;
    outreachDraft?: string;
  };
}
export interface Task {
  notes?: string;
  jobDetails?: JobDetails;
  plannedDate?: string;
  category?: ActivityCategory;
  id: string;
  title: string;
  projectId?: string;
  dueDate?: string;
  dueTime?: string;
  priority: Priority;
  done: boolean;
  kind: "task" | "reminder";
  originalInput?: string;
  createdAt: string;
  completedAt?: string;
}
export type ActivityCategory = string;
export interface CalendarRecurrence {
  type: "daily" | "weekly" | "weekdays";
  weekdays: number[];
}
export interface CalendarEvent {
  projectId?: string;
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: "event" | "work-session";
  taskId?: string;
  checkIn?: "worked" | "skipped";
  category?: ActivityCategory;
  notes?: string;
  completed?: boolean;
  recurrence?: CalendarRecurrence;
  excludedDates?: string[];
  seriesId?: string;
  originalDate?: string;
}
export interface Note {
  id: string;
  text: string;
  originalInput?: string;
  createdAt: string;
  projectId?: string;
}
export interface CalendarVisibility {
  groups?: Record<string, boolean>;
  projects?: Record<string, boolean>;
}
export interface Preferences {
  calendarVisibility?: CalendarVisibility;
}
export type ChangeSource = "dashboard" | "mcp";
export interface ChangeRecord {
  revision: string;
  at: string;
  source: ChangeSource;
  entity:
    | "tasks"
    | "events"
    | "projects"
    | "notes"
    | "groceries"
    | "preferences"
    | "document";
  itemId: string;
  operation:
    "create" | "update" | "delete" | "complete" | "reopen" | "undo" | "restore";
  fields: string[];
}
export interface ChangeTracking {
  revision: string;
  history: ChangeRecord[];
}
export interface GroceryItem {
  id: string;
  title: string;
  store?: string;
  done: boolean;
  createdAt: string;
}
export interface BrainData {
  groceries: GroceryItem[];
  changeTracking?: ChangeTracking;
  projects: Project[];
  tasks: Task[];
  events: CalendarEvent[];
  notes: Note[];
  preferences: Preferences;
}
