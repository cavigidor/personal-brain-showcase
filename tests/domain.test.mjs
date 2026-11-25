import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDashboardActions,
  proposeChanges,
  resolveProposal,
  restoreSnapshot,
} from "../src/actions.ts";
import { availableTime, buildBriefing } from "../src/briefing.ts";
import { layoutOccurrences, occurrencesOn } from "../src/calendar-model.ts";
import { createDemoData } from "../src/demo-data.ts";
import { overdueTask, taskInventory } from "../src/planner.ts";
import { parseBackup, validateData } from "../src/validation.ts";

const now = new Date(2026, 4, 20, 9);
const build = () => createDemoData(now);

test("first launch has validated fictional records anchored to the current day", () => {
  const data = validateData(build());
  assert.equal(
    data.tasks.find((task) => task.id === "guide-map").dueDate,
    "2026-05-20",
  );
  assert.equal(
    data.events.find((event) => event.id === "workshop-session").date,
    "2026-05-21",
  );
  assert.deepEqual(taskInventory(data.tasks, data.events), {
    scheduled: 2,
    total: 7,
    open: 6,
    completed: 1,
    linked: 7,
    dated: 5,
    undated: 1,
    reminders: 1,
  });
});

test("moving a linked work session preserves the original task deadline", () => {
  const data = build();
  const result = applyDashboardActions(data, [
    {
      entity: "events",
      operation: "update",
      id: "guide-session",
      patch: { date: "2026-05-22" },
    },
  ]);
  assert.equal(
    result.events.find((event) => event.id === "guide-session").date,
    "2026-05-22",
  );
  assert.equal(
    result.tasks.find((task) => task.id === "guide-map").dueDate,
    "2026-05-20",
  );
  assert.notEqual(
    result.changeTracking.revision,
    restoreSnapshot(result, data, "undo").changeTracking.revision,
  );
});

test("recurrence expands by date and leaves excluded occurrences out of the series", () => {
  const series = build().events.find(
    (event) => event.id === "workshop-session",
  );
  assert.equal(
    occurrencesOn([series], "2026-05-28")[0].instanceId,
    "workshop-session@2026-05-28",
  );
  assert.equal(occurrencesOn([series], "2026-05-27").length, 0);
  assert.equal(
    occurrencesOn([{ ...series, excludedDates: ["2026-05-28"] }], "2026-05-28")
      .length,
    0,
  );
});

test("overlapping blocks use separate columns and count reserved time once", () => {
  const block = build().events[0];
  const events = [
    block,
    { ...block, id: "overlap", startTime: "10:30", endTime: "11:30" },
    {
      ...block,
      id: "skipped",
      startTime: "11:30",
      endTime: "12:00",
      checkIn: "skipped",
    },
  ];
  const schedule = occurrencesOn(events, "2026-05-20");
  assert.equal(
    layoutOccurrences(schedule).get("overlap@2026-05-20").columns,
    2,
  );
  assert.equal(
    layoutOccurrences(schedule).get("skipped@2026-05-20").columns,
    1,
  );
  assert.equal(availableTime(schedule, now).occupied, 90);
});

test("briefing is deterministic and excludes unrelated tasks from its schedule", () => {
  const data = build();
  const old = JSON.stringify(data);
  const briefing = buildBriefing(data, now);
  assert.equal(briefing.focus.id, "guide-caption");
  assert.deepEqual(
    briefing.schedule.map((event) => event.id),
    ["guide-session", "studio-session"],
  );
  assert.equal(JSON.stringify(data), old);
});

test("weekend grace does not rewrite the stored deadline", () => {
  const task = { ...build().tasks[0], dueDate: "2026-05-23" };
  assert.equal(overdueTask(task, "2026-05-24"), false);
  assert.equal(overdueTask(task, "2026-05-25"), true);
  assert.equal(task.dueDate, "2026-05-23");
});

test("batches reject invalid operations atomically and proposals reject stale snapshots", () => {
  const data = build();
  const complete = { entity: "tasks", operation: "complete", id: "guide-map" };
  const invalid = {
    entity: "events",
    operation: "update",
    id: "guide-session",
    patch: { endTime: "09:00" },
  };
  assert.throws(
    () => applyDashboardActions(data, [complete, invalid]),
    /time range/,
  );
  assert.equal(data.tasks[0].done, false);

  const proposal = proposeChanges(data, [complete], "mcp");
  assert.equal(proposal.changes.length, 1);
  assert.throws(
    () =>
      resolveProposal(
        applyDashboardActions(data, [complete]),
        proposal,
        "approve",
      ),
    /changed/,
  );
  assert.throws(
    () => resolveProposal(data, proposal, "approve"),
    /already resolved/,
  );
});

test("job and grocery validation reject duplicates, including completed task records", () => {
  const data = build();
  const job = data.tasks.find((task) => task.id === "job-studio");
  const completed = applyDashboardActions(data, [
    { entity: "tasks", operation: "complete", id: job.id },
  ]);
  assert.throws(
    () =>
      applyDashboardActions(completed, [
        {
          entity: "tasks",
          operation: "create",
          value: { ...job, id: "new-id" },
        },
      ]),
    /already has a task/,
  );
  assert.throws(
    () =>
      applyDashboardActions(data, [
        {
          entity: "groceries",
          operation: "create",
          value: { ...data.groceries[0], id: "new-item", title: "  PEARS " },
        },
      ]),
    /already on the list/,
  );
});

test("backups require the dedicated showcase format and valid document data", () => {
  const data = build();
  assert.deepEqual(
    parseBackup({ app: "personal-brain-showcase", version: 1, data }),
    data,
  );
  assert.throws(
    () => parseBackup({ app: "other-planner", version: 1, data }),
    /Unsupported backup/,
  );
  assert.throws(
    () =>
      parseBackup({
        app: "personal-brain-showcase",
        version: 1,
        data: { ...data, events: null },
      }),
    /Missing events/,
  );
});
