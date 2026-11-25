import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Archive,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  MoreHorizontal,
  Menu,
  Plus,
  Search,
  Settings2,
  ListPlus,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { addDays, addHours, format, parseISO } from "date-fns";
import {
  applyDashboardActions,
  restoreSnapshot,
  type BrainAction,
} from "./actions";
import {
  downloadBackup,
  initialData,
  loadData,
  saveData,
  STORAGE_KEY,
} from "./store";
import { parseBackup, validDate, validTime } from "./validation";
import type {
  ActivityCategory,
  BrainData,
  CalendarEvent,
  JobDetails,
  Period,
  Priority,
  ProjectStatus,
  Task,
  View,
} from "./types";
import CalendarWorkspace from "./CalendarWorkspace";
import TaskDetailsDialog from "./TaskDetailsDialog";
import {
  activityTitle,
  taskTitle,
  taskSecondary,
  taskSearchText,
} from "./job-details";
import JobApplicationFields from "./JobApplicationFields";
import TaskInventory from "./TaskInventory";
import {
  dueTask,
  overdueTask,
  timedTaskEligible,
  plannedDate,
  taskInventory,
} from "./planner";
import MorningBriefing from "./MorningBriefing";
import TodayWorkspace from "./TodayWorkspace";
import TaskCompletion from "./TaskCompletion";
import GroceryList from "./GroceryList";
import { buildBriefing } from "./briefing";
import { useLocalClock } from "./useLocalClock";
import {
  CATEGORIES,
  freeSlots,
  minutes,
  occurrencesBetween,
  occurrencesOn,
  timeFromMinutes,
  type CalendarOccurrence,
} from "./calendar-model";

const NAV: { label: View; title: string; icon: typeof LayoutDashboard }[] = [
  { label: "Today", title: "Today", icon: Target },
  { label: "To-Dos", title: "Tasks", icon: ListTodo },
  { label: "Calendar", title: "Calendar", icon: CalendarDays },
  { label: "Projects", title: "Projects", icon: FolderKanban },
];
const SECONDARY_NAV: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Reminders", icon: Bell },
  { label: "Inbox", icon: Inbox },
];
const uid = () => crypto.randomUUID();
const dateKey = (date: Date) => format(date, "yyyy-MM-dd");
const nowDate = () => dateKey(new Date());
const tomorrowDate = () => dateKey(addDays(new Date(), 1));
const prettyDate = (date?: string) =>
  date ? format(parseISO(date), "MMM d") : "No date";
const byDueDate = (a: Task, b: Task) =>
  (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
  (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99");
const normalize = (input: string) => input.toLocaleLowerCase();
type EditorKind =
  "task" | "reminder" | "event" | "work-session" | "note" | "project";

const guess = (raw: string, data: BrainData) => {
  const lower = normalize(raw);
  const kind: EditorKind = /remind|remember|alert|notify/i.test(lower)
    ? "reminder"
    : /idea|thought|note to self/i.test(lower)
      ? "note"
      : "task";
  const project = data.projects.find((p) => lower.includes(normalize(p.name)));
  let date = "";
  if (/\btomorrow\b/i.test(raw)) date = tomorrowDate();
  else if (/\btoday\b/i.test(raw)) date = nowDate();
  return { kind, projectId: project?.id ?? "", date };
};

export default function App() {
  const [loaded] = useState(() => {
    try {
      return { data: loadData(), error: "" };
    } catch (error) {
      return {
        data: initialData(),
        error: `Saved data could not be loaded: ${String(error)}. The original is preserved. Restore a valid backup or export the original before resetting.`,
      };
    }
  });
  const [data, setData] = useState<BrainData>(loaded.data);
  const [storageError, setStorageError] = useState(loaded.error);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [taskOccurrence, setTaskOccurrence] =
    useState<CalendarOccurrence | null>(null);
  const closeTask = useCallback(() => {
    setSelectedTaskId(undefined);
    setTaskOccurrence(null);
  }, []);
  const selectedTask = data.tasks.find((t) => t.id === selectedTaskId);
  useEffect(() => {
    if (selectedTaskId && !selectedTask) closeTask();
  }, [selectedTaskId, selectedTask, closeTask]);
  const [editingId, setEditingId] = useState<string>();
  const [captureOriginal, setCaptureOriginal] = useState("");
  const [editorError, setEditorError] = useState("");
  const [view, setView] = useState<View>("Today");
  const [taskFilter, setTaskFilter] = useState("all");
  const [period, setPeriod] = useState<Period>("Week");
  const [focusDate, setFocusDate] = useState<Date>(new Date());
  const [selectedProject, setSelectedProject] = useState("all");
  const [query, setQuery] = useState("");
  const [quickText, setQuickText] = useState("");
  const [editor, setEditor] = useState<EditorKind | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDate, setEditingDate] = useState("");
  const [editingPlanDate, setEditingPlanDate] = useState("");
  const [editingTimed, setEditingTimed] = useState(false);
  const [slotEntry, setSlotEntry] = useState(false);
  const [editingTime, setEditingTime] = useState("09:00");
  const [editingEnd, setEditingEnd] = useState("10:00");
  const [editingProject, setEditingProject] = useState("");
  const [editingJob, setEditingJob] = useState<JobDetails>();
  const [editingPriority, setEditingPriority] = useState<Priority>("normal");
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>();
  const [editingCategory, setEditingCategory] =
    useState<ActivityCategory>("Personal");
  const [editingNotes, setEditingNotes] = useState("");
  const [editingRepeat, setEditingRepeat] = useState<
    "none" | "daily" | "weekly" | "weekdays"
  >("none");
  const [editingWeekdays, setEditingWeekdays] = useState<number[]>([]);
  const [editingCompleted, setEditingCompleted] = useState(false);
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState<string>();
  const [selectedOccurrence, setSelectedOccurrence] =
    useState<CalendarOccurrence | null>(null);
  const [suggestions, setSuggestions] = useState<
    { start: string; end: string }[]
  >([]);
  const savingRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [undoState, setUndoState] = useState<{
    data: BrainData;
    restorePreferences: boolean;
  } | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const overlayOpen =
    !!selectedTaskId ||
    !!editor ||
    !!selectedOccurrence ||
    settingsOpen ||
    mobileMenu;
  const editorOpen = !!editor;
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorBaseline = useRef("");
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (loaded.error) return;
    try {
      saveData(data);
      setStorageError("");
    } catch (error) {
      setStorageError(
        `Changes are only in memory: ${String(error)} Export a backup before closing.`,
      );
    }
  }, [data, loaded.error]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!overlayOpen) searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setEditor(null);
        setSelectedOccurrence(null);
        setSettingsOpen(false);
        setMobileMenu(false);
        closeTask();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [overlayOpen, closeTask]);
  useEffect(() => {
    if (!overlayOpen || selectedTaskId) return;
    const previous =
      lastTriggerRef.current || (document.activeElement as HTMLElement | null);
    const panel = document.querySelector<HTMLElement>(
      editorOpen || selectedOccurrence || settingsOpen ? ".modal" : ".sidebar",
    );
    const controls = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),summary,input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      ).filter(
        (e) =>
          e.getClientRects().length &&
          getComputedStyle(e).visibility !== "hidden",
      );
    const initial = editorOpen
      ? panel?.querySelector<HTMLElement>("input[required],textarea[required]")
      : controls()[0];
    initial?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = controls(),
        first = list[0],
        last = list[list.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", trap);
      if (
        previous?.isConnected &&
        getComputedStyle(previous).visibility !== "hidden" &&
        !previous.closest("[inert]")
      )
        previous.focus();
      else
        (document.querySelector<HTMLElement>(".hamburger")?.getClientRects()
          .length
          ? document.querySelector<HTMLElement>(".hamburger")
          : document.querySelector<HTMLElement>(".headline .button")
        )?.focus();
    };
  }, [
    overlayOpen,
    editorOpen,
    selectedOccurrence,
    settingsOpen,
    mobileMenu,
    selectedTaskId,
  ]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width:781px)");
    const closeDrawer = () => {
      if (desktop.matches) setMobileMenu(false);
    };
    desktop.addEventListener("change", closeDrawer);
    return () => desktop.removeEventListener("change", closeDrawer);
  }, []);
  const publish = (
    next: BrainData,
    message: string,
    restorePreferences = false,
  ) => {
    setUndoState({ data: dataRef.current, restorePreferences });
    dataRef.current = next;
    setData(next);
    setToast(message);
  };
  const mutate = (actions: BrainAction[], message = "Saved") =>
    publish(applyDashboardActions(dataRef.current, actions), message);
  const updatePreferences = (patch: Partial<BrainData["preferences"]>) => {
    const next = applyDashboardActions(dataRef.current, [
      { entity: "preferences", operation: "update", patch },
    ]);
    dataRef.current = next;
    setData(next);
  };
  const undo = () => {
    if (undoState) {
      const current = dataRef.current;
      const next = restoreSnapshot(
        current,
        {
          ...undoState.data,
          preferences: undoState.restorePreferences
            ? undoState.data.preferences
            : current.preferences,
        },
        "undo",
      );
      dataRef.current = next;
      setData(next);
      setUndoState(null);
      setToast("Change undone");
    }
  };
  const editorIsCurrent = () => {
    if (editorBaseline.current === JSON.stringify(dataRef.current)) return true;
    setEditorError(
      "Your Brain changed. Close this form and review the latest information before saving.",
    );
    return false;
  };
  const projectsById = useMemo(
    () => Object.fromEntries(data.projects.map((p) => [p.id, p.name])),
    [data.projects],
  );
  const activeTasks = data.tasks.filter((t) => !t.done);
  const now = useLocalClock();
  const today = dateKey(now);
  const todayTasks = activeTasks.filter(
    (t) =>
      t.kind === "task" &&
      (t.plannedDate === today || dueTask(t, today) || overdueTask(t, today)),
  );
  const inventory = taskInventory(data.tasks, data.events);
  const taskFiltersActive =
    taskFilter !== "all" || selectedProject !== "all" || !!query;
  const clearTaskFilters = () => {
    setTaskFilter("all");
    setSelectedProject("all");
    setQuery("");
  };
  const dueReminders = activeTasks
    .filter((t) => t.kind === "reminder")
    .sort(byDueDate);
  const filteredTasks = data.tasks.filter(
    (t) =>
      t.kind === "task" &&
      (taskFilter === "all" ||
        (taskFilter === "undated" && !plannedDate(t)) ||
        (taskFilter === "high" && t.priority === "high") ||
        (taskFilter === "overdue" && overdueTask(t, today))) &&
      (selectedProject === "all" || t.projectId === selectedProject) &&
      (!query || taskSearchText(t).includes(normalize(query))),
  );
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalize(query);
    return [
      ...data.tasks
        .filter((t) => taskSearchText(t).includes(q))
        .map((t) => ({
          task: t,
          type: t.kind,
          label: taskTitle(t),
          subtitle: projectsById[t.projectId || ""] || prettyDate(t.dueDate),
        })),
      ...data.notes
        .filter((n) => normalize(n.text).includes(q))
        .map((n) => ({
          task: undefined,
          type: "note",
          label: n.text,
          subtitle: format(parseISO(n.createdAt), "MMM d"),
        })),
      ...data.projects
        .filter((p) => normalize(p.name).includes(q))
        .map((p) => ({
          task: undefined,
          type: "project",
          label: p.name,
          subtitle: p.status,
        })),
    ].slice(0, 10);
  }, [query, data, projectsById]);
  const openEditor = (
    kind: EditorKind,
    options?: {
      title?: string;
      date?: string;
      projectId?: string;
      taskId?: string;
    },
  ) => {
    editorBaseline.current = JSON.stringify(dataRef.current);
    setEditingPlanDate("");
    setEditingTimed(false);
    setSlotEntry(false);
    setEditor(kind);
    setEditingTitle(options?.title || "");
    setEditingDate(options?.date || "");
    setEditingProject(options?.projectId || "");
    setEditingTaskId(options?.taskId);
    setEditingTime("09:00");
    setEditingEnd("10:00");
    setEditingPriority("normal");
    setEditingJob(undefined);
    setEditingId(undefined);
    setCaptureOriginal("");
    setEditorError("");
    setEditingCategory(
      kind === "work-session" ? "Task Work Session" : "Personal",
    );
    setEditingNotes("");
    setEditingRepeat("none");
    setEditingWeekdays([]);
    setEditingCompleted(false);
    setEditingOccurrenceDate(undefined);
    setSuggestions([]);
    savingRef.current = false;
  };
  const onQuickCapture = (event: FormEvent) => {
    event.preventDefault();
    if (!quickText.trim()) return;
    const inferred = guess(quickText, data);
    openEditor(inferred.kind, {
      title: quickText.trim(),
      date: inferred.date,
      projectId: inferred.projectId,
    });
    setCaptureOriginal(quickText.trim());
  };
  const saveEditor = (event: FormEvent) => {
    event.preventDefault();
    const title = editingTitle.trim();
    if (!title || !editor) return;
    if (
      ["event", "work-session"].includes(editor) &&
      (!validDate(editingDate) ||
        !validTime(editingTime) ||
        !validTime(editingEnd) ||
        editingEnd <= editingTime)
    ) {
      setEditorError("Choose a date and an end time after the start time.");
      return;
    }
    if (
      editor === "task" &&
      editingTimed &&
      !timedTaskEligible(editingPlanDate, editingTime, editingEnd)
    ) {
      setEditorError(
        "Choose a plan date and an end time after the start time.",
      );
      return;
    }
    if (editor === "task" && editingPlanDate && !validDate(editingPlanDate)) {
      setEditorError("Choose a valid plan date.");
      return;
    }
    if (editor === "task" && editingDate && !validDate(editingDate)) {
      setEditorError("Choose a valid date or leave it empty.");
      return;
    }
    if (
      editor === "reminder" &&
      (!validDate(editingDate) || !validTime(editingTime))
    ) {
      setEditorError("Choose a reminder date and time.");
      return;
    }
    if (!editorIsCurrent() || savingRef.current) return;
    savingRef.current = true;
    try {
      const id = editingId || uid();
      const createdAt = new Date().toISOString();
      if (editor === "task" || editor === "reminder") {
        const patch = {
          title,
          kind: editor,
          plannedDate:
            editor === "task" ? editingPlanDate || undefined : undefined,
          category: editingCategory || undefined,
          priority: editingPriority,
          originalInput: captureOriginal || undefined,
          projectId: editingProject || undefined,
          dueDate: editingDate || undefined,
          jobDetails:
            editor === "task" && editingJob
              ? {
                  ...editingJob,
                  company: editingJob.company.trim(),
                  position: editingJob.position?.trim(),
                }
              : undefined,
          dueTime:
            editor === "reminder"
              ? editingTime
              : editingDate
                ? dataRef.current.tasks.find((t) => t.id === editingId)?.dueTime
                : undefined,
        };
        const actions: BrainAction[] = [
          editingId
            ? { entity: "tasks", operation: "update", id, patch }
            : {
                entity: "tasks",
                operation: "create",
                value: { id, ...patch, done: false, createdAt },
              },
        ];
        if (editor === "task" && editingTimed) {
          // Scheduling an existing linked task opens its session editor instead.
          if (dataRef.current.events.some((e) => e.taskId === id))
            throw new Error(
              "This task already has work sessions. Use Schedule a linked work session to review them.",
            );
          actions.push({
            entity: "events",
            operation: "create",
            value: {
              id: uid(),
              title,
              kind: "work-session",
              taskId: id,
              projectId: editingProject || undefined,
              category: editingCategory,
              date: editingPlanDate,
              startTime: editingTime,
              endTime: editingEnd,
            },
          });
        }
        mutate(
          actions,
          editingId
            ? "Entry updated"
            : editor === "task"
              ? "Task added"
              : "Reminder added",
        );
        if (editor === "task" && view === "To-Dos") clearTaskFilters();
      } else if (editor === "project") {
        mutate(
          [
            editingId
              ? {
                  entity: "projects",
                  operation: "update",
                  id,
                  patch: { name: title },
                }
              : {
                  entity: "projects",
                  operation: "create",
                  value: { id, name: title, status: "Active", createdAt },
                },
          ],
          editingId ? "Project renamed" : "Project added as Active",
        );
      } else if (editor === "note") {
        mutate(
          [
            editingId
              ? {
                  entity: "notes",
                  operation: "update",
                  id,
                  patch: {
                    text: title,
                    projectId: editingProject || undefined,
                  },
                }
              : {
                  entity: "notes",
                  operation: "create",
                  value: {
                    id,
                    text: title,
                    createdAt,
                    originalInput: captureOriginal || undefined,
                    projectId: editingProject || undefined,
                  },
                },
          ],
          "Thought saved",
        );
      } else {
        const recurrence =
          editingRepeat === "none"
            ? undefined
            : {
                type: editingRepeat,
                weekdays: editingRepeat === "weekdays" ? editingWeekdays : [],
              };
        if (editingRepeat === "weekdays" && !editingWeekdays.length) {
          setEditorError("Choose at least one weekday.");
          savingRef.current = false;
          return;
        }
        const patch = {
          title,
          date: editingDate || today,
          startTime: editingTime,
          endTime: editingEnd,
          kind: editor,
          taskId: editingTaskId,
          projectId: editingProject || undefined,
          category: editingCategory,
          notes: editingNotes,
          completed: editingCompleted,
          recurrence,
        };
        if (editingId && editingOccurrenceDate) {
          const series = dataRef.current.events.find((e) => e.id === editingId);
          if (!series?.recurrence)
            throw new Error("Recurring series no longer exists");
          mutate(
            [
              {
                entity: "events",
                operation: "update",
                id: series.id,
                patch: {
                  excludedDates: [
                    ...new Set([
                      ...(series.excludedDates || []),
                      editingOccurrenceDate,
                    ]),
                  ],
                },
              },
              {
                entity: "events",
                operation: "create",
                value: {
                  ...series,
                  ...patch,
                  id: uid(),
                  recurrence: undefined,
                  excludedDates: undefined,
                  seriesId: series.id,
                  originalDate: editingOccurrenceDate,
                },
              },
            ],
            "Occurrence updated",
          );
        } else {
          mutate(
            [
              editingId
                ? { entity: "events", operation: "update", id, patch }
                : {
                    entity: "events",
                    operation: "create",
                    value: { id, ...patch },
                  },
            ],
            "Calendar block saved",
          );
        }
      }
      if (captureOriginal) setQuickText("");
      setEditor(null);
    } catch (error) {
      savingRef.current = false;
      setEditorError(
        error instanceof Error ? error.message : "Could not save this change.",
      );
    }
  };
  const toggleTask = (task: Task) =>
    mutate(
      [
        {
          entity: "tasks",
          operation: task.done ? "reopen" : "complete",
          id: task.id,
        },
      ],
      task.done ? "Task reopened" : "Task completed",
    );
  const snoozeReminder = (task: Task) => {
    const initial =
      task.dueDate && task.dueTime
        ? new Date(`${task.dueDate}T${task.dueTime}:00`)
        : new Date();
    const next = addHours(initial > new Date() ? initial : new Date(), 1);
    mutate(
      [
        {
          entity: "tasks",
          operation: "update",
          id: task.id,
          patch: { dueDate: dateKey(next), dueTime: format(next, "HH:mm") },
        },
      ],
      "Reminder snoozed one hour",
    );
  };
  const updateProjectStatus = (id: string, status: ProjectStatus) =>
    mutate(
      [{ entity: "projects", operation: "update", id, patch: { status } }],
      "Project status updated",
    );
  const checkin = (
    event: CalendarEvent,
    action: "worked" | "skipped" | "finished",
  ) => {
    const actions: BrainAction[] = [
      {
        entity: "events",
        operation: "update",
        id: event.id,
        patch: { checkIn: action === "finished" ? "worked" : action },
      },
    ];
    if (
      action === "finished" &&
      event.taskId &&
      dataRef.current.tasks.some((t) => t.id === event.taskId)
    )
      actions.push({
        entity: "tasks",
        operation: "complete",
        id: event.taskId,
      });
    mutate(
      actions,
      action === "finished" ? "Task completed" : `Session marked ${action}`,
    );
  };
  const selectDay = (d: Date) => {
    setFocusDate(d);
    setPeriod("Day");
    setView("Calendar");
  };
  const briefing = useMemo(() => buildBriefing(data, now), [data, now]);
  const comingUp = useMemo(
    () =>
      occurrencesBetween(
        data.events,
        today,
        dateKey(addDays(parseISO(today), 30)),
      ),
    [data.events, today],
  );
  const dailySessionIds = new Set(
    briefing.schedule
      .filter((e) => e.checkIn !== "skipped")
      .map((e) => e.taskId),
  );
  const dailyTasks = activeTasks
    .filter(
      (t) =>
        t.kind === "task" &&
        (t.plannedDate === today ||
          dueTask(t, today) ||
          dailySessionIds.has(t.id)),
    )
    .sort(byDueDate);
  const upcomingSchedule = comingUp.filter(
    (e) =>
      !e.completed &&
      e.checkIn !== "skipped" &&
      (e.occurrenceDate > today ||
        minutes(e.endTime) > now.getHours() * 60 + now.getMinutes()),
  );
  useEffect(() => {
    setSuggestions([]);
  }, [editingDate, editingEnd, editingTime, data.events]);
  useEffect(() => {
    setSelectedOccurrence((old) =>
      old
        ? occurrencesOn(data.events, old.occurrenceDate).find(
            (e) => e.id === old.id,
          ) || null
        : old,
    );
  }, [data.events]);
  const filterProject = (id: string) => {
    setTaskFilter("all");
    setSelectedProject(id);
    setView("To-Dos");
    setQuery("");
  };
  const loadBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const d = parseBackup(JSON.parse(await file.text()));
      if (
        window.confirm(
          "Replace this Brain with the validated backup? Export your current copy first.",
        )
      ) {
        if (loaded.error) {
          saveData(restoreSnapshot(dataRef.current, d, "restore"));
          window.location.reload();
          return;
        }
        publish(
          restoreSnapshot(dataRef.current, d, "restore"),
          "Backup restored",
          true,
        );
        setSettingsOpen(false);
      }
    } catch {
      window.alert("Could not read a valid Personal Brain backup.");
    }
    event.target.value = "";
  };

  const editTask = (t: Task) => {
    openEditor(t.kind, {
      title: t.title,
      date: t.dueDate,
      projectId: t.projectId,
    });
    setEditingId(t.id);
    setEditingPlanDate(t.plannedDate || "");
    setEditingCategory(t.category || "");
    setEditingPriority(t.priority);
    setEditingJob(t.jobDetails);
    setEditingTime(t.dueTime || "09:00");
    setCaptureOriginal(t.originalInput || "");
  };
  const openTask = (t: Task) => {
    setTaskOccurrence(null);
    setSelectedTaskId(t.id);
  };
  const openActivity = (activity: CalendarOccurrence) => {
    const task = dataRef.current.tasks.find((t) => t.id === activity.taskId);
    if (task) {
      setTaskOccurrence(activity);
      setSelectedTaskId(task.id);
    } else setSelectedOccurrence(activity);
  };
  const editEvent = (e: CalendarEvent, occurrenceDate?: string) => {
    openEditor(e.kind, {
      title: e.title,
      date: occurrenceDate || e.date,
      taskId: e.taskId,
      projectId: e.projectId,
    });
    setEditingId(e.id);
    setEditingTime(e.startTime);
    setEditingEnd(e.endTime);
    setEditingCategory(
      e.category ||
        (e.kind === "work-session" ? "Task Work Session" : "Personal"),
    );
    setEditingNotes(e.notes || "");
    setEditingRepeat(occurrenceDate ? "none" : e.recurrence?.type || "none");
    setEditingWeekdays(e.recurrence?.weekdays || []);
    setEditingCompleted(!!e.completed);
    setEditingOccurrenceDate(occurrenceDate);
    setSelectedOccurrence(null);
  };
  const moveEvent = (item: CalendarOccurrence, date: string, time: string) => {
    if (item.recurring) return;
    const duration = minutes(item.endTime) - minutes(item.startTime),
      start = minutes(time);
    if (start + duration > 24 * 60) return;
    mutate(
      [
        {
          entity: "events",
          operation: "update",
          id: item.id,
          patch: {
            date,
            startTime: time,
            endTime: timeFromMinutes(start + duration),
          },
        },
      ],
      "Block moved",
    );
  };
  const openSlot = (date: string, time: string) => {
    openEditor("event", { date });
    setSlotEntry(true);
    setEditingPlanDate(date);
    setEditingTime(time);
    setEditingEnd(timeFromMinutes(Math.min(minutes(time) + 60, 23 * 60 + 59)));
  };
  const scheduleTask = (task: Task, date = today, time?: string) => {
    const sessions = dataRef.current.events.filter((e) => e.taskId === task.id);
    if (sessions.length) {
      if (sessions.length === 1) {
        editEvent(sessions[0]);
        if (time) {
          setEditingDate(date);
          setEditingTime(time);
          setEditingEnd(timeFromMinutes(Math.min(minutes(time) + 60, 1439)));
        }
        return;
      }
      setFocusDate(parseISO(sessions[0].date));
      setView("Calendar");
      setPeriod("Week");
      setToast(
        "This task has multiple work sessions. Open the session you want to reschedule.",
      );
      return;
    }
    openEditor("work-session", {
      title: taskTitle(task),
      date,
      taskId: task.id,
      projectId: task.projectId,
    });
    setEditingCategory(task.category || "Task Work Session");
    if (time) {
      setEditingTime(time);
      setEditingEnd(timeFromMinutes(Math.min(minutes(time) + 60, 1439)));
    }
  };
  const deleteOccurrence = (item: CalendarOccurrence, wholeSeries = false) => {
    if (
      !window.confirm(
        wholeSeries
          ? "Delete the entire recurring series?"
          : "Delete this calendar block? You can undo this change.",
      )
    )
      return;
    try {
      if (item.recurring && !wholeSeries) {
        const series = dataRef.current.events.find((e) => e.id === item.id)!;
        mutate(
          [
            {
              entity: "events",
              operation: "update",
              id: series.id,
              patch: {
                excludedDates: [
                  ...new Set([
                    ...(series.excludedDates || []),
                    item.occurrenceDate,
                  ]),
                ],
              },
            },
          ],
          "Occurrence deleted",
        );
      } else
        mutate(
          [
            {
              entity: "events",
              operation: wholeSeries ? "delete-series" : "delete",
              id: item.id,
            },
          ],
          "Calendar block deleted",
        );
      setSelectedOccurrence(null);
    } catch (error) {
      setToast(String(error));
    }
  };
  const completeOccurrence = (item: CalendarOccurrence) => {
    try {
      if (item.recurring) {
        const series = dataRef.current.events.find((e) => e.id === item.id)!;
        mutate(
          [
            {
              entity: "events",
              operation: "update",
              id: series.id,
              patch: {
                excludedDates: [
                  ...new Set([
                    ...(series.excludedDates || []),
                    item.occurrenceDate,
                  ]),
                ],
              },
            },
            {
              entity: "events",
              operation: "create",
              value: {
                ...series,
                id: uid(),
                date: item.occurrenceDate,
                recurrence: undefined,
                excludedDates: undefined,
                seriesId: series.id,
                originalDate: item.occurrenceDate,
                completed: true,
              },
            },
          ],
          "Occurrence completed",
        );
      } else
        mutate(
          [
            {
              entity: "events",
              operation: "update",
              id: item.id,
              patch: { completed: !item.completed },
            },
          ],
          item.completed ? "Block reopened" : "Block completed",
        );
      setSelectedOccurrence(null);
    } catch (error) {
      setToast(String(error));
    }
  };
  const openGroceries = () => {
    setQuery("");
    setView("To-Dos");
    requestAnimationFrame(() => {
      const list = document.getElementById(
        "grocery-list",
      ) as HTMLDetailsElement | null;
      if (list) {
        list.open = true;
        list.scrollIntoView({ block: "start" });
        list.querySelector("summary")?.focus({ preventScroll: true });
      }
    });
  };
  const taskRow = (t: Task, showProject = true) => (
    <div
      className="task-row"
      key={t.id}
      onClick={(event) => {
        if (
          !(event.target as HTMLElement).closest(
            "button,a,input,select,textarea",
          )
        )
          openTask(t);
      }}
      draggable={t.kind === "task" && !t.done}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/personal-brain-task", t.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <TaskCompletion
        task={t}
        onToggle={toggleTask}
        label={t.done ? "Reopen task" : "Complete task"}
      />
      <div className="task-detail">
        <button
          className={`task-title task-title-button ${t.done ? "struck" : ""}`}
          onClick={() => openTask(t)}
        >
          {taskTitle(t)}
        </button>
        {(taskSecondary(t) ||
          (showProject && projectsById[t.projectId || ""]) ||
          t.plannedDate ||
          t.dueDate) && (
          <div className="task-meta">
            {taskSecondary(t) ||
              (showProject && projectsById[t.projectId || ""]) ||
              (t.plannedDate
                ? `Planned ${prettyDate(t.plannedDate)}`
                : `Due ${prettyDate(t.dueDate)}`)}
          </div>
        )}
      </div>
    </div>
  );

  if (loaded.error)
    return (
      <main className="storage-recovery-screen">
        <section className="storage-recovery-card">
          <h1>Recover saved data</h1>
          <p role="alert">{storageError}</p>
          <button
            className="button secondary"
            onClick={() => {
              const raw = localStorage.getItem(STORAGE_KEY) || "";
              const a = document.createElement("a");
              const url = URL.createObjectURL(
                new Blob([raw], { type: "text/plain" }),
              );
              a.href = url;
              a.download = "personal-brain-showcase-recovery.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export original data
          </button>
          <label className="field">
            Restore a validated backup
            <input
              type="file"
              accept="application/json"
              onChange={loadBackup}
            />
          </label>
        </section>
      </main>
    );
  return (
    <div
      className={`shell ${view === "Today" ? "view-today" : ""}`}
      onFocusCapture={(event) => {
        if (!overlayOpen) lastTriggerRef.current = event.target as HTMLElement;
      }}
      onClickCapture={(event) => {
        const trigger = (event.target as HTMLElement).closest<HTMLElement>(
          "button,summary",
        );
        if (trigger && !overlayOpen && event.detail > 0)
          lastTriggerRef.current = trigger;
      }}
    >
      <aside
        inert={
          editorOpen || settingsOpen || !!selectedOccurrence || !!selectedTaskId
        }
        role={mobileMenu ? "dialog" : undefined}
        aria-modal={mobileMenu ? true : undefined}
        aria-label="Navigation"
        className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}
      >
        <div className="brand">
          <div className="brand-mark">✳</div>
          <strong>Personal Brain</strong>
          <button
            aria-label="Close navigation"
            className="menu-close icon-action"
            onClick={() => setMobileMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Primary navigation" className="sidebar-group">
          {NAV.map(({ label, title, icon: Icon }) => (
            <button
              key={label}
              aria-current={view === label ? "page" : undefined}
              className={`nav-item ${view === label ? "active" : ""}`}
              onClick={() => {
                setView(label);
                setMobileMenu(false);
                setQuery("");
                setSelectedProject("all");
                setTaskFilter("all");
              }}
            >
              <Icon size={18} />
              <span>{title}</span>
            </button>
          ))}
        </nav>
        <details className="secondary-navigation">
          <summary>
            <MoreHorizontal size={18} /> More
          </summary>
          <nav aria-label="Secondary navigation">
            {SECONDARY_NAV.map(({ label, icon: Icon }) => (
              <button
                key={label}
                aria-current={view === label ? "page" : undefined}
                className={`nav-item ${view === label ? "active" : ""}`}
                onClick={() => {
                  setView(label);
                  setMobileMenu(false);
                  setQuery("");
                  setSelectedProject("all");
                  setTaskFilter("all");
                }}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
        </details>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => {
              setSettingsOpen(true);
              setMobileMenu(false);
            }}
          >
            <Settings2 size={18} /> Settings & Backup
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <div className="mobile-scrim" onClick={() => setMobileMenu(false)} />
      )}
      <main className="main" inert={overlayOpen}>
        <header className="topbar">
          <div className="top-left">
            <button
              aria-label="Open navigation"
              className="hamburger icon-action"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              {view === "To-Dos" ? "Tasks" : view}
            </div>
          </div>
          <div className="top-right">
            <div className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                aria-label="Search workspace"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="icon-action"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              className="icon-action"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>
        <div className="content">
          <div className="local-mode-notice">
            Fictional demo data · Saved in this browser
          </div>
          {storageError && (
            <div className="form-notice" role="alert">
              {storageError}
              <button
                className="text-button"
                onClick={() => downloadBackup(data)}
              >
                Export current copy
              </button>
            </div>
          )}
          <div className="headline">
            <div>
              <div className="eyebrow">{format(now, "EEEE, MMMM d")}</div>
              <h1>
                {view === "Overview"
                  ? "Overview"
                  : view === "Today"
                    ? "Today"
                    : view === "To-Dos"
                      ? "Tasks"
                      : view === "Inbox"
                        ? "Notes"
                        : view === "Projects"
                          ? "Projects"
                          : view === "Reminders"
                            ? "Reminders"
                            : "Calendar"}
              </h1>
              {view === "Calendar" && (
                <p>Plans, deadlines, reminders and linked work sessions.</p>
              )}
            </div>
            <button
              className="button primary"
              onClick={() => {
                openEditor("task");
                if (view === "Today") setEditingPlanDate(today);
              }}
            >
              <Plus size={17} /> New task
            </button>
          </div>
          {(view === "Overview" || view === "Inbox") && (
            <form className="quick-capture" onSubmit={onQuickCapture}>
              <ListPlus size={19} />
              <input
                placeholder="Add a task, reminder, idea, or thought..."
                aria-label="Quick Capture"
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
              />
              <button type="submit">
                Organize <ArrowRight size={16} />
              </button>
            </form>
          )}
          {view === "Overview" && (
            <div className="summary-strip" aria-label="Your day at a glance">
              <button onClick={() => setView("Today")}>
                <strong>{todayTasks.length}</strong> Due, overdue or planned
              </button>
              <button
                onClick={() => {
                  setView("To-Dos");
                  setTaskFilter("undated");
                  setSelectedProject("all");
                  setQuery("");
                }}
              >
                <strong>{inventory.undated}</strong> Undated
              </button>
              <button onClick={() => selectDay(new Date())}>
                <strong>{briefing.schedule.length}</strong> Today’s sessions &
                events
              </button>
            </div>
          )}
          {query && view !== "To-Dos" ? (
            <section className="panel">
              <div className="section-title">
                Search results <span>{matches.length}</span>
              </div>
              <p className="panel-subtitle">
                Search is replacing the current view. Clear filters to return to
                your full list.
              </p>
              <button className="button secondary" onClick={clearTaskFilters}>
                Clear filters
              </button>
              {matches.length ? (
                matches.map((m, i) => (
                  <div className="result-row" key={`${m.type}-${i}`}>
                    <span className="result-type">{m.type}</span>
                    <div>
                      {m.task ? (
                        <button
                          className="task-title task-title-button"
                          onClick={() => openTask(m.task!)}
                        >
                          {m.label}
                        </button>
                      ) : (
                        m.label
                      )}
                      <small>{m.subtitle}</small>
                    </div>
                    {m.task && (
                      <TaskCompletion task={m.task} onToggle={toggleTask} />
                    )}
                  </div>
                ))
              ) : (
                <div className="empty">No matches yet.</div>
              )}
            </section>
          ) : (
            <>
              {view === "Today" && (
                <TodayWorkspace
                  onGroceries={openGroceries}
                  date={today}
                  tasks={dailyTasks}
                  overdue={activeTasks
                    .filter(
                      (t) =>
                        t.kind === "task" &&
                        overdueTask(t, today) &&
                        !dailyTasks.some((d) => d.id === t.id),
                    )
                    .sort(byDueDate)}
                  reminders={dueReminders.filter(
                    (t) => t.dueDate && t.dueDate <= today,
                  )}
                  schedule={upcomingSchedule}
                  tasksById={briefing.tasksById}
                  onComplete={toggleTask}
                  renderTask={taskRow}
                  onCalendar={() => selectDay(parseISO(today))}
                  onActivity={openActivity}
                />
              )}
              {(view === "Overview" || view === "Today") && (
                <details
                  className="full-briefing"
                  open={view === "Overview" ? true : undefined}
                >
                  <summary>Daily briefing</summary>
                  <MorningBriefing
                    briefing={briefing}
                    compact={view === "Overview"}
                    onToday={() => {
                      setQuery("");
                      setView("Today");
                      requestAnimationFrame(() => {
                        const details =
                          document.querySelector<HTMLDetailsElement>(
                            ".full-briefing",
                          );
                        if (details) details.open = true;
                      });
                    }}
                    onCalendar={() => selectDay(parseISO(today))}
                    onTask={openTask}
                    onComplete={toggleTask}
                    onTasks={() => {
                      clearTaskFilters();
                      setView("To-Dos");
                    }}
                    onProjects={() => {
                      setQuery("");
                      setView("Projects");
                    }}
                    onProject={filterProject}
                    onActivity={(activity) => {
                      setFocusDate(parseISO(activity.occurrenceDate));
                      setPeriod("Day");
                      openActivity(activity);
                    }}
                  />
                </details>
              )}
              {view === "Overview" && (
                <div className="dashboard-grid">
                  <section className="panel wide">
                    <div className="section-title">
                      <span>
                        <ListTodo size={18} /> Today & overdue
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setView("Today")}
                      >
                        Open today <ArrowRight size={14} />
                      </button>
                    </div>
                    {todayTasks.length ? (
                      todayTasks.slice(0, 6).map((t) => taskRow(t))
                    ) : (
                      <div className="empty">
                        <CheckCircle2 size={24} />
                        Nothing due right now. Add a task or schedule a
                        reminder.
                      </div>
                    )}
                    <button
                      className="panel-footer"
                      onClick={() => {
                        setView("To-Dos");
                        setTaskFilter("all");
                        setSelectedProject("all");
                        setQuery("");
                      }}
                    >
                      View all to-dos <ArrowRight size={14} />
                    </button>
                  </section>
                  <section className="panel">
                    <div className="section-title">
                      <span>
                        <Bell size={18} /> Next reminders
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setView("Reminders")}
                      >
                        See all
                      </button>
                    </div>
                    {dueReminders.length ? (
                      dueReminders.slice(0, 4).map((t) => taskRow(t, false))
                    ) : (
                      <div className="empty">No reminders scheduled.</div>
                    )}
                    <button
                      className="add-link"
                      onClick={() => openEditor("reminder")}
                    >
                      <Plus size={16} /> New reminder
                    </button>
                  </section>
                  <section className="panel">
                    <div className="section-title">
                      <span>
                        <CalendarDays size={18} /> Coming up
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setView("Calendar");
                          setPeriod("Week");
                        }}
                      >
                        Week view
                      </button>
                    </div>
                    {comingUp.slice(0, 4).map((e) => (
                      <div className="timeline-item" key={e.instanceId}>
                        {e.taskId && briefing.tasksById.get(e.taskId) && (
                          <TaskCompletion
                            task={briefing.tasksById.get(e.taskId)!}
                            onToggle={toggleTask}
                          />
                        )}
                        <div className="date-chip">
                          {format(parseISO(e.occurrenceDate), "d")}
                          <small>
                            {format(parseISO(e.occurrenceDate), "MMM")}
                          </small>
                        </div>
                        <div>
                          <button
                            className="briefing-title-button"
                            onClick={() => openActivity(e)}
                          >
                            {e.title}
                          </button>
                          <small>
                            {`${e.startTime}–${e.endTime}`} ·{" "}
                            {e.kind === "work-session"
                              ? "Work session"
                              : "Event"}
                          </small>
                        </div>
                      </div>
                    ))}
                    {comingUp.length === 0 && (
                      <div className="empty">No upcoming calendar events.</div>
                    )}
                    <button
                      className="add-link"
                      onClick={() => openEditor("event", { date: today })}
                    >
                      <Plus size={16} /> New calendar event
                    </button>
                  </section>
                  <section className="panel">
                    <div className="section-title">
                      <span>
                        <FolderKanban size={18} /> Projects
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setView("Projects")}
                      >
                        All projects
                      </button>
                    </div>
                    <div className="project-mini-list">
                      {data.projects
                        .filter((p) => p.status === "Active")
                        .slice(0, 6)
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() => filterProject(p.id)}
                          >
                            <span className="project-dot" />
                            {p.name}
                            <span className="project-count">
                              {
                                activeTasks.filter(
                                  (t) =>
                                    t.kind === "task" && t.projectId === p.id,
                                ).length
                              }{" "}
                              open
                            </span>
                          </button>
                        ))}
                    </div>
                  </section>
                  <section className="panel">
                    <div className="section-title">
                      <span>
                        <Inbox size={18} /> Captured thoughts
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setView("Inbox")}
                      >
                        Inbox
                      </button>
                    </div>
                    {data.notes.slice(0, 4).map((n) => (
                      <div className="note-preview" key={n.id}>
                        <Lightbulb size={16} />
                        <div>
                          {n.text}
                          <small>
                            {projectsById[n.projectId || ""] || "Unfiled"} ·{" "}
                            {prettyDate(n.createdAt.slice(0, 10))}
                          </small>
                        </div>
                      </div>
                    ))}
                    {data.notes.length === 0 && (
                      <div className="empty">
                        Your thoughts will appear here.
                      </div>
                    )}
                    <button
                      className="add-link"
                      onClick={() => openEditor("note")}
                    >
                      <Plus size={16} /> Capture a thought
                    </button>
                  </section>
                </div>
              )}
              {view === "To-Dos" && (
                <>
                  <GroceryList items={data.groceries} onChange={mutate} />
                  <div className="panel">
                    <div className="section-title">
                      <span>
                        <ListTodo size={18} /> Task list
                      </span>
                      <button
                        className="text-button"
                        onClick={() => openEditor("task")}
                      >
                        <Plus size={15} /> Add task
                      </button>
                    </div>
                    <div className="filter-row">
                      <select
                        aria-label="Task filter"
                        value={taskFilter}
                        onChange={(e) => setTaskFilter(e.target.value)}
                      >
                        <option value="all">All tasks</option>
                        <option value="undated">Undated</option>
                        <option value="high">High priority</option>
                        <option value="overdue">Overdue</option>
                      </select>
                      <button
                        className={`filter-pill ${selectedProject === "all" ? "on" : ""}`}
                        onClick={() => setSelectedProject("all")}
                      >
                        All projects
                      </button>
                      {data.projects.map((p) => (
                        <button
                          className={`filter-pill ${selectedProject === p.id ? "on" : ""}`}
                          key={p.id}
                          onClick={() => setSelectedProject(p.id)}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <TaskInventory
                      counts={inventory}
                      projects={data.projects.length}
                    />
                    <p className="panel-subtitle">
                      Calendar category filters do not hide tasks here.
                      Reminders have their own view.
                    </p>
                    {taskFiltersActive && (
                      <div className="filter-row" role="status">
                        <span>
                          Task filters active ·{" "}
                          {filteredTasks.filter((t) => !t.done).length} of{" "}
                          {inventory.open} open tasks shown
                        </span>
                        <button
                          className="button secondary"
                          onClick={clearTaskFilters}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                    <div className="subheading">
                      Open tasks · {filteredTasks.filter((t) => !t.done).length}
                    </div>
                    {filteredTasks
                      .filter((t) => !t.done)
                      .sort(byDueDate)
                      .map((t) => taskRow(t))}
                    {filteredTasks.filter((t) => !t.done).length === 0 && (
                      <div className="empty">
                        {taskFiltersActive && inventory.open
                          ? "No open tasks match these filters. Clear filters to show all open tasks."
                          : inventory.total
                            ? "All saved tasks are completed."
                            : "No tasks have been saved. Use Add task to create one."}
                      </div>
                    )}
                    <div className="subheading">
                      Completed · {filteredTasks.filter((t) => t.done).length}
                    </div>
                    {filteredTasks.filter((t) => t.done).map((t) => taskRow(t))}
                  </div>
                </>
              )}
              {view === "Reminders" && (
                <div className="panel">
                  <div className="section-title">
                    <span>
                      <Bell size={18} /> Reminders
                    </span>
                    <button
                      className="text-button"
                      onClick={() => openEditor("reminder")}
                    >
                      <Plus size={15} /> Add reminder
                    </button>
                  </div>
                  <p className="panel-subtitle">
                    Complete or snooze reminders in your workspace.
                  </p>
                  <div className="subheading">Upcoming and overdue</div>
                  {data.tasks
                    .filter((t) => t.kind === "reminder" && !t.done)
                    .sort(byDueDate)
                    .map((t) => taskRow(t))}
                  {data.tasks.filter((t) => t.kind === "reminder" && !t.done)
                    .length === 0 && (
                    <div className="empty">No active reminders.</div>
                  )}
                  <div className="subheading">Completed</div>
                  {data.tasks
                    .filter((t) => t.kind === "reminder" && t.done)
                    .map((t) => taskRow(t))}
                </div>
              )}
              {view === "Projects" && (
                <div className="panel">
                  <div className="section-title">
                    <span>
                      <FolderKanban size={18} /> All projects
                    </span>
                    <button
                      className="text-button"
                      onClick={() => openEditor("project")}
                    >
                      <Plus size={15} /> Add project
                    </button>
                  </div>
                  <p className="panel-subtitle">
                    New projects begin Active. Statuses change only when you set
                    them; inactivity never changes status.
                  </p>
                  <div className="project-grid">
                    {!data.projects.length && (
                      <p className="empty">
                        No projects yet. Create a project to get started.
                      </p>
                    )}
                    {data.projects.map((p) => (
                      <div className="project-card" key={p.id}>
                        <div className="project-card-top">
                          <div className="project-icon">
                            <FolderKanban size={19} />
                          </div>
                          <select
                            aria-label={`${p.name} status`}
                            value={p.status}
                            onChange={(e) =>
                              updateProjectStatus(
                                p.id,
                                e.target.value as ProjectStatus,
                              )
                            }
                          >
                            {(
                              [
                                "Active",
                                "Planned",
                                "Paused",
                                "Completed",
                                "Archived",
                              ] as const
                            ).map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <h3>{p.name}</h3>
                        <button
                          className="text-button"
                          onClick={() => {
                            openEditor("project", { title: p.name });
                            setEditingId(p.id);
                          }}
                        >
                          Rename
                        </button>
                        <p>
                          {
                            data.tasks.filter(
                              (t) =>
                                t.kind === "task" &&
                                t.projectId === p.id &&
                                !t.done,
                            ).length
                          }{" "}
                          open tasks ·{" "}
                          {
                            data.tasks.filter(
                              (t) =>
                                t.kind === "task" &&
                                t.projectId === p.id &&
                                dueTask(t, today),
                            ).length
                          }{" "}
                          due ·{" "}
                          {
                            data.tasks.filter(
                              (t) =>
                                t.kind === "task" &&
                                t.projectId === p.id &&
                                overdueTask(t, today),
                            ).length
                          }{" "}
                          overdue
                        </p>
                        <button
                          className="text-button"
                          onClick={() => filterProject(p.id)}
                        >
                          View tasks <ArrowRight size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {view === "Inbox" && (
                <div className="panel">
                  <div className="section-title">
                    <span>
                      <Inbox size={18} /> Thoughts & notes
                    </span>
                    <button
                      className="text-button"
                      onClick={() => openEditor("note")}
                    >
                      <Plus size={15} /> Capture
                    </button>
                  </div>
                  {data.notes.map((n) => (
                    <div className="note-full" key={n.id}>
                      <Lightbulb size={18} />
                      <div>
                        <p>{n.text}</p>
                        <button
                          className="text-button"
                          onClick={() => {
                            openEditor("note", {
                              title: n.text,
                              projectId: n.projectId,
                            });
                            setEditingId(n.id);
                            setCaptureOriginal(n.originalInput || "");
                          }}
                        >
                          Edit note
                        </button>
                        <small>
                          {projectsById[n.projectId || ""] || "Unfiled"} ·{" "}
                          {format(parseISO(n.createdAt), "MMM d, yyyy h:mm a")}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!data.notes.length && (
                    <div className="empty">
                      Your note inbox is empty. Capture your first thought
                      above.
                    </div>
                  )}
                </div>
              )}
              {view === "Calendar" && (
                <CalendarWorkspace
                  data={data}
                  today={today}
                  focusDate={focusDate}
                  setFocusDate={setFocusDate}
                  period={period}
                  setPeriod={setPeriod}
                  selectDay={selectDay}
                  onVisibilityChange={(calendarVisibility) =>
                    updatePreferences({ calendarVisibility })
                  }
                  openEditor={openEditor}
                  planTask={(date) => {
                    openEditor("task");
                    setEditingPlanDate(date);
                  }}
                  openActivity={openActivity}
                  openTask={openTask}
                  editActivity={(activity) =>
                    activity.recurring
                      ? setSelectedOccurrence(activity)
                      : editEvent(activity)
                  }
                  scheduleTask={scheduleTask}
                  openSlot={openSlot}
                  moveEvent={moveEvent}
                  toggleTask={toggleTask}
                  taskRow={taskRow}
                  checkin={checkin}
                />
              )}
            </>
          )}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status" inert={overlayOpen}>
          <CheckCircle2 size={17} />
          {toast}
          {undoState && <button onClick={undo}>Undo</button>}
          <button
            className="icon-action"
            aria-label="Dismiss"
            onClick={() => {
              setToast("");
              setUndoState(null);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {selectedOccurrence && (
        <div
          className="modal-shade"
          role="presentation"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setSelectedOccurrence(null);
          }}
        >
          <div
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Calendar block details"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {selectedOccurrence.category ||
                    (selectedOccurrence.kind === "work-session"
                      ? "Task Work Session"
                      : "Personal")}
                </span>
                <h2>{selectedOccurrence.title}</h2>
              </div>
              <button
                className="icon-action"
                aria-label="Close details"
                onClick={() => setSelectedOccurrence(null)}
              >
                <X size={19} />
              </button>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Date</dt>
                <dd>{selectedOccurrence.occurrenceDate}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>
                  {selectedOccurrence.startTime}–{selectedOccurrence.endTime} (
                  {minutes(selectedOccurrence.endTime) -
                    minutes(selectedOccurrence.startTime)}{" "}
                  minutes)
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {selectedOccurrence.checkIn === "worked"
                    ? "Worked on it"
                    : selectedOccurrence.checkIn === "skipped"
                      ? "Skipped"
                      : selectedOccurrence.completed
                        ? "Completed"
                        : "Planned"}
                </dd>
              </div>
              <div>
                <dt>Repeats</dt>
                <dd>
                  {selectedOccurrence.recurrence?.type === "daily"
                    ? "Every day"
                    : selectedOccurrence.recurrence?.type === "weekly"
                      ? "Every week"
                      : selectedOccurrence.recurrence?.type === "weekdays"
                        ? "Selected weekdays: " +
                          selectedOccurrence.recurrence.weekdays
                            .map(
                              (day) =>
                                [
                                  "Sun",
                                  "Mon",
                                  "Tue",
                                  "Wed",
                                  "Thu",
                                  "Fri",
                                  "Sat",
                                ][day],
                            )
                            .join(", ")
                        : "No"}
                </dd>
              </div>
              {selectedOccurrence.notes && (
                <div>
                  <dt>Notes</dt>
                  <dd>{selectedOccurrence.notes}</dd>
                </div>
              )}
            </dl>
            {selectedOccurrence.projectId && (
              <button
                className="text-button"
                onClick={() => {
                  filterProject(selectedOccurrence.projectId!);
                  setSelectedOccurrence(null);
                }}
              >
                Project:{" "}
                {projectsById[selectedOccurrence.projectId] || "Unavailable"}{" "}
                <ArrowRight size={14} />
              </button>
            )}
            {selectedOccurrence.taskId && (
              <button
                className="text-button"
                onClick={() => {
                  const task = data.tasks.find(
                    (task) => task.id === selectedOccurrence.taskId,
                  );
                  setSelectedOccurrence(null);
                  if (task) openTask(task);
                }}
              >
                Task:{" "}
                {data.tasks.find((t) => t.id === selectedOccurrence.taskId)
                  ?.title || "Unavailable"}{" "}
                <ArrowRight size={14} />
              </button>
            )}
            {selectedOccurrence.taskId &&
              data.tasks.find((t) => t.id === selectedOccurrence.taskId) && (
                <div className="detail-task-status">
                  <TaskCompletion
                    task={data.tasks.find(
                      (t) => t.id === selectedOccurrence.taskId,
                    )!}
                    label={
                      data.tasks.find(
                        (t) => t.id === selectedOccurrence.taskId,
                      )!.done
                        ? "Reopen task"
                        : "Complete task"
                    }
                    onToggle={toggleTask}
                  />
                  <span>
                    {data.tasks.find((t) => t.id === selectedOccurrence.taskId)!
                      .done
                      ? "Task completed"
                      : "Task incomplete"}
                  </span>
                </div>
              )}
            {selectedOccurrence.kind === "work-session" &&
              !selectedOccurrence.recurring && (
                <div className="checkin-buttons">
                  <button onClick={() => checkin(selectedOccurrence, "worked")}>
                    Worked on it
                  </button>
                  <button
                    onClick={() => checkin(selectedOccurrence, "skipped")}
                  >
                    Skipped
                  </button>
                </div>
              )}
            <div className="modal-actions detail-actions">
              {selectedOccurrence.recurring ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() =>
                      editEvent(
                        selectedOccurrence,
                        selectedOccurrence.occurrenceDate,
                      )
                    }
                  >
                    Edit this occurrence
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => editEvent(selectedOccurrence)}
                  >
                    Edit series
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => completeOccurrence(selectedOccurrence)}
                  >
                    Complete occurrence
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => deleteOccurrence(selectedOccurrence)}
                  >
                    Delete occurrence
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => deleteOccurrence(selectedOccurrence, true)}
                  >
                    Delete series
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button secondary"
                    onClick={() => editEvent(selectedOccurrence)}
                  >
                    Edit / reschedule
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => completeOccurrence(selectedOccurrence)}
                  >
                    {selectedOccurrence.completed ? "Reopen" : "Mark completed"}
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => deleteOccurrence(selectedOccurrence)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {editor && (
        <div
          className="modal-shade"
          role="presentation"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setEditor(null);
          }}
        >
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Entry editor"
            onSubmit={saveEditor}
          >
            <div className="modal-head">
              <div>
                <h2>
                  {editor === "work-session"
                    ? "Schedule work session"
                    : `${editingId ? "Edit" : "Add"} ${editor}`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close editor"
                className="icon-action"
                onClick={() => setEditor(null)}
              >
                <X size={19} />
              </button>
            </div>
            {slotEntry && !editingId && (
              <label className="field">
                Schedule as
                <select
                  value={editor}
                  onChange={(e) => {
                    const kind = e.target.value as EditorKind;
                    setEditor(kind);
                    setEditingTimed(kind === "task");
                    if (kind === "task") {
                      setEditingPlanDate(editingDate || editingPlanDate);
                      setEditingDate("");
                    } else setEditingDate(editingPlanDate);
                  }}
                >
                  <option value="event">Activity</option>
                  <option value="task">Task</option>
                </select>
              </label>
            )}
            {editorError && (
              <p role="alert" className="form-notice">
                {editorError}
              </p>
            )}
            {captureOriginal && (
              <>
                <div className="form-notice">
                  Original capture: {captureOriginal}
                </div>
                <label className="field">
                  Save as
                  <select
                    value={editor}
                    onChange={(e) => setEditor(e.target.value as EditorKind)}
                    disabled={!!editingId}
                  >
                    <option value="task">Task</option>
                    <option value="reminder">Reminder</option>
                    <option value="note">Note</option>
                  </select>
                </label>
              </>
            )}
            <label className="field">
              {editor === "note"
                ? "Thought or note"
                : editor === "project"
                  ? "Project name"
                  : "Title"}
              {editor === "note" ? (
                <textarea
                  required
                  rows={4}
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  placeholder="Write anything..."
                />
              ) : (
                <input
                  required
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  placeholder="What do you want to remember?"
                />
              )}
            </label>
            {editor !== "project" && (
              <label className="field">
                Project (optional)
                <select
                  value={editingProject}
                  onChange={(e) => setEditingProject(e.target.value)}
                >
                  <option value="">Unfiled / no project</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["task", "reminder", "event", "work-session"].includes(editor) && (
              <div className="field-grid">
                <label className="field">
                  {editor === "task" ? "Due date (optional)" : "Date"}
                  <input
                    type="date"
                    value={editingDate}
                    onInput={(e) => setEditingDate(e.currentTarget.value)}
                  />
                </label>
                {editor !== "task" && (
                  <label className="field">
                    {editor === "reminder" ? "Reminder time" : "Starts at"}
                    <input
                      type="time"
                      value={editingTime}
                      onInput={(e) => setEditingTime(e.currentTarget.value)}
                    />
                  </label>
                )}
              </div>
            )}
            {(editor === "event" || editor === "work-session") && (
              <label className="field">
                Ends at
                <input
                  type="time"
                  value={editingEnd}
                  onInput={(e) => setEditingEnd(e.currentTarget.value)}
                />
              </label>
            )}
            {(editor === "event" || editor === "work-session") && (
              <>
                <p className="form-notice">
                  Duration:{" "}
                  {Math.max(0, minutes(editingEnd) - minutes(editingTime))}{" "}
                  minutes. Times use this device’s local clock; overnight blocks
                  are not supported.
                </p>
                <label className="field">
                  Activity category
                  <select
                    value={editingCategory}
                    onChange={(e) =>
                      setEditingCategory(e.target.value as ActivityCategory)
                    }
                  >
                    {[...new Set([...CATEGORIES, editingCategory])].map(
                      (category) => (
                        <option key={category}>{category}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="field">
                  Linked task (optional)
                  <select
                    value={editingTaskId || ""}
                    onChange={(e) =>
                      setEditingTaskId(e.target.value || undefined)
                    }
                  >
                    <option value="">No linked task</option>
                    {data.tasks
                      .filter((task) => task.kind === "task")
                      .map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Notes (optional)
                  <textarea
                    rows={3}
                    value={editingNotes}
                    onChange={(e) => setEditingNotes(e.target.value)}
                  />
                </label>
                <label className="field">
                  Repeat
                  <select
                    value={editingRepeat}
                    onChange={(e) =>
                      setEditingRepeat(e.target.value as typeof editingRepeat)
                    }
                    disabled={!!editingOccurrenceDate}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                    <option value="weekdays">Selected weekdays</option>
                  </select>
                </label>
                {editingRepeat === "weekdays" && (
                  <fieldset className="weekday-choice">
                    <legend>Repeat on</legend>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (day, index) => (
                        <label key={day}>
                          <input
                            type="checkbox"
                            checked={editingWeekdays.includes(index)}
                            onChange={(event) =>
                              setEditingWeekdays((old) =>
                                event.target.checked
                                  ? [...old, index]
                                  : old.filter((value) => value !== index),
                              )
                            }
                          />
                          {day}
                        </label>
                      ),
                    )}
                  </fieldset>
                )}
                <label className="toggle-setting">
                  <input
                    type="checkbox"
                    checked={editingCompleted}
                    onChange={(e) => setEditingCompleted(e.target.checked)}
                  />
                  Completed
                </label>
                <div className="slot-finder">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      const duration =
                        minutes(editingEnd) - minutes(editingTime);
                      setSuggestions(
                        validDate(editingDate) && duration > 0
                          ? freeSlots(data.events, editingDate, duration)
                          : [],
                      );
                    }}
                  >
                    Find available time
                  </button>
                  <p>
                    Suggestions use blocks in this planner. Save to apply a
                    time.
                  </p>
                  {suggestions.map((slot) => (
                    <button
                      type="button"
                      key={slot.start}
                      className="slot-option"
                      onClick={() => {
                        setEditingTime(slot.start);
                        setEditingEnd(slot.end);
                        setSuggestions([]);
                      }}
                    >
                      {slot.start}–{slot.end}
                    </button>
                  ))}
                  {suggestions.length === 0 && (
                    <small>
                      Choose a date and valid duration, then find slots.
                    </small>
                  )}
                </div>
              </>
            )}
            {editor === "task" && (
              <>
                <label className="field">
                  Plan for (optional)
                  <input
                    type="date"
                    value={editingPlanDate}
                    onInput={(e) => setEditingPlanDate(e.currentTarget.value)}
                  />
                </label>
                <label className="field">
                  Task category
                  <select
                    value={editingCategory}
                    onChange={(e) => setEditingCategory(e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {[...new Set([...CATEGORIES, editingCategory])]
                      .filter(Boolean)
                      .map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                  </select>
                </label>
                {editingId &&
                data.events.some((e) => e.taskId === editingId) ? (
                  <p className="form-notice">
                    This task has linked work sessions. Open its details to
                    reschedule; the deadline stays separate.
                  </p>
                ) : (
                  <>
                    <label className="toggle-setting">
                      <input
                        type="checkbox"
                        checked={editingTimed}
                        onChange={(e) => setEditingTimed(e.target.checked)}
                      />
                      Schedule task time
                    </label>
                    {editingTimed && (
                      <>
                        <div className="field-grid">
                          <label className="field">
                            Task starts at
                            <input
                              type="time"
                              value={editingTime}
                              onInput={(e) =>
                                setEditingTime(e.currentTarget.value)
                              }
                            />
                          </label>
                          <label className="field">
                            Task ends at
                            <input
                              type="time"
                              value={editingEnd}
                              onInput={(e) =>
                                setEditingEnd(e.currentTarget.value)
                              }
                            />
                          </label>
                        </div>
                        <label className="field">
                          Duration (minutes)
                          <input
                            type="number"
                            min="1"
                            max="1439"
                            value={Math.max(
                              0,
                              minutes(editingEnd) - minutes(editingTime),
                            )}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (n > 0 && minutes(editingTime) + n < 1440)
                                setEditingEnd(
                                  timeFromMinutes(minutes(editingTime) + n),
                                );
                            }}
                          />
                        </label>
                        <p className="form-notice">
                          Saving creates a linked work session.
                        </p>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {editor === "task" && (
              <label className="field">
                Priority
                <select
                  value={editingPriority}
                  onChange={(e) =>
                    setEditingPriority(e.target.value as Priority)
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </label>
            )}
            {editor === "task" && (
              <JobApplicationFields
                value={editingJob}
                onChange={setEditingJob}
              />
            )}
            {editingId && (editor === "task" || editor === "reminder") && (
              <section className="editor-task-actions">
                {editor === "task" ? (
                  <>
                    <h3>Scheduled items</h3>
                    {data.events
                      .filter((event) => event.taskId === editingId)
                      .map((session) => (
                        <button
                          type="button"
                          className="task-session text-button"
                          key={session.id}
                          onClick={() => {
                            setEditor(null);
                            const occurrence =
                              taskOccurrence?.id === session.id
                                ? taskOccurrence
                                : occurrencesOn([session], session.date)[0];
                            if (occurrence) setSelectedOccurrence(occurrence);
                            else editEvent(session);
                          }}
                        >
                          {activityTitle(data.tasks, session)} ·{" "}
                          {taskOccurrence?.id === session.id
                            ? taskOccurrence.occurrenceDate
                            : session.date}{" "}
                          · {session.startTime}–{session.endTime}
                          {session.recurrence ? " · Repeats" : ""}
                        </button>
                      ))}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        const task = data.tasks.find(
                          (task) => task.id === editingId,
                        );
                        if (task) {
                          setEditor(null);
                          scheduleTask(task);
                        }
                      }}
                    >
                      {data.events.some((event) => event.taskId === editingId)
                        ? "Manage schedule"
                        : "Schedule work session"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      const task = data.tasks.find(
                        (task) => task.id === editingId,
                      );
                      if (task) {
                        setEditor(null);
                        snoozeReminder(task);
                      }
                    }}
                  >
                    Snooze 1 hour
                  </button>
                )}
              </section>
            )}
            <div className="modal-actions">
              {((editingId && (editor === "task" || editor === "reminder")) ||
                editingTaskId) &&
                data.tasks.find(
                  (t) => t.id === (editingTaskId || editingId),
                ) && (
                  <TaskCompletion
                    task={data.tasks.find(
                      (t) => t.id === (editingTaskId || editingId),
                    )!}
                    label={
                      data.tasks.find(
                        (t) => t.id === (editingTaskId || editingId),
                      )!.done
                        ? "Reopen task"
                        : "Complete task"
                    }
                    onToggle={(task) => {
                      if (editorIsCurrent()) {
                        toggleTask(task);
                        setEditor(null);
                      }
                    }}
                  />
                )}
              {editingId && (
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => {
                    if (!editorIsCurrent()) return;
                    const deletingSeries =
                      !editingOccurrenceDate &&
                      (editor === "event" || editor === "work-session") &&
                      !!dataRef.current.events.find((e) => e.id === editingId)
                        ?.recurrence;
                    if (
                      !window.confirm(
                        editingOccurrenceDate
                          ? "Delete only this occurrence? You can undo this change."
                          : deletingSeries
                            ? "Delete entire recurring series and its edited occurrences? You can undo this change."
                            : "Delete this entry? You can undo this change before leaving the page.",
                      )
                    )
                      return;
                    try {
                      if (editingOccurrenceDate) {
                        const series = dataRef.current.events.find(
                          (e) => e.id === editingId,
                        );
                        if (!series?.recurrence)
                          throw new Error("Recurring series no longer exists");
                        mutate(
                          [
                            {
                              entity: "events",
                              operation: "update",
                              id: editingId,
                              patch: {
                                excludedDates: [
                                  ...new Set([
                                    ...(series.excludedDates || []),
                                    editingOccurrenceDate,
                                  ]),
                                ],
                              },
                            },
                          ],
                          "Occurrence deleted",
                        );
                      } else
                        mutate(
                          deletingSeries
                            ? [
                                {
                                  entity: "events",
                                  operation: "delete-series",
                                  id: editingId,
                                },
                              ]
                            : [
                                {
                                  entity:
                                    editor === "task" || editor === "reminder"
                                      ? "tasks"
                                      : editor === "note"
                                        ? "notes"
                                        : "events",
                                  operation: "delete",
                                  id: editingId,
                                },
                              ],
                          "Entry deleted",
                        );
                      setEditor(null);
                    } catch (error) {
                      setEditorError(
                        error instanceof Error
                          ? error.message
                          : "Could not delete this entry.",
                      );
                    }
                  }}
                  disabled={editor === "project"}
                >
                  {editingOccurrenceDate
                    ? "Delete occurrence"
                    : data.events.find((e) => e.id === editingId)?.recurrence
                      ? "Delete series"
                      : "Delete"}
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                <Check size={16} /> Save{" "}
                {editor === "work-session" ? "session" : editor}
              </button>
            </div>
          </form>
        </div>
      )}
      {selectedTask && (
        <TaskDetailsDialog
          key={selectedTask.id}
          task={selectedTask}
          returnFocus={lastTriggerRef.current}
          onClose={closeTask}
          onEdit={() => {
            setSelectedTaskId(undefined);
            editTask(selectedTask);
          }}
          onSaveNotes={(notes, original) => {
            const current = dataRef.current.tasks.find(
              (task) => task.id === selectedTask.id,
            );
            if (!current) throw new Error("This task no longer exists.");
            if ((current.notes ?? "") !== original)
              throw new Error(
                "Notes changed elsewhere. Close and reopen this popup before saving.",
              );
            mutate(
              [
                {
                  entity: "tasks",
                  operation: "update",
                  id: current.id,
                  patch: { notes },
                },
              ],
              "Notes saved",
            );
            closeTask();
          }}
        />
      )}
      {settingsOpen && (
        <div
          className="modal-shade"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Settings and data"
          >
            <div className="modal-head">
              <div>
                <h2>Settings & data</h2>
              </div>
              <button
                aria-label="Close settings"
                className="icon-action"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="settings-section">
              <strong>Local data backup</strong>
              <p>Export or restore a JSON copy of this browser’s workspace.</p>
              <div className="settings-actions">
                <button
                  className="button secondary"
                  onClick={() => downloadBackup(data)}
                >
                  <Download size={16} /> Export JSON backup
                </button>
                <button
                  className="button secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Archive size={16} /> Restore backup
                </button>
                <input
                  hidden
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  onChange={loadBackup}
                />
              </div>
            </div>
            <div className="settings-section">
              <strong>Demo data</strong>
              <p>
                Restore the sample projects and remove any edits saved in this
                browser.
              </p>
              <button
                className="danger-link"
                onClick={() => {
                  if (
                    window.confirm(
                      "Replace this workspace with fresh sample data?",
                    )
                  ) {
                    localStorage.removeItem(STORAGE_KEY);
                    window.location.reload();
                  }
                }}
              >
                <Trash2 size={15} /> Reset sample data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
