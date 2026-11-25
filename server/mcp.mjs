import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { proposeChanges, resolveProposal } from "../src/actions.ts";
import { occurrencesBetween } from "../src/calendar-model.ts";
import { createDemoData } from "../src/demo-data.ts";
import { taskSearchText } from "../src/job-details.ts";
import { validDate } from "../src/validation.ts";

const server = new McpServer({
  name: "personal-brain-showcase",
  version: "1.0.0",
});
const readOnly = { readOnlyHint: true, openWorldHint: false };
const mutation = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const id = z.string().trim().min(1).max(150);
const title = z.string().trim().min(1).max(200);
const date = z.string().refine(validDate, "Use a valid YYYY-MM-DD date");
const change = {
  expected_revision: z.number().int().nonnegative(),
  request_id: z.uuid(),
};

let data = createDemoData();
let revision = 0;
const receipts = new Map();

function response(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    ...(isError ? { isError } : {}),
  };
}

function applyChange(tool, input, action) {
  const { request_id, expected_revision } = input;
  const fingerprint = JSON.stringify([tool, input]);
  const receipt = receipts.get(request_id);
  if (receipt) {
    return receipt.fingerprint === fingerprint
      ? response({ ...receipt.result, revision, duplicate: true })
      : response(
          {
            error: "This request ID was used for a different change.",
            revision,
          },
          true,
        );
  }
  if (expected_revision !== revision) {
    return response(
      {
        error:
          "Revision conflict. Read the workspace and review your change before retrying.",
        revision,
      },
      true,
    );
  }

  try {
    const next = resolveProposal(
      data,
      proposeChanges(data, [action], "mcp"),
      "approve",
    );
    if (next !== data) revision += 1;
    data = next;
    const result = {
      revision,
      accepted_revision: revision,
      id: input.id,
      duplicate: false,
    };
    receipts.set(request_id, { fingerprint, result });
    if (receipts.size > 1000) receipts.delete(receipts.keys().next().value);
    return response(result);
  } catch (error) {
    return response(
      {
        error:
          error instanceof Error ? error.message : "Change could not be saved.",
        revision,
      },
      true,
    );
  }
}

server.registerTool(
  "list_projects",
  {
    description: "List projects in the current fictional workspace.",
    inputSchema: z.strictObject({}),
    annotations: readOnly,
  },
  () => response({ revision, items: data.projects }),
);

server.registerTool(
  "list_tasks",
  {
    description:
      "Search local tasks by title, notes or job details. Reminders are excluded.",
    inputSchema: z.strictObject({
      query: z.string().trim().max(200).optional(),
      project_id: id.optional(),
      done: z.boolean().optional(),
    }),
    annotations: readOnly,
  },
  ({ query, project_id, done }) =>
    response({
      revision,
      items: data.tasks.filter(
        (task) =>
          task.kind === "task" &&
          (!query ||
            taskSearchText(task).includes(query.toLocaleLowerCase())) &&
          (project_id === undefined || task.projectId === project_id) &&
          (done === undefined || task.done === done),
      ),
    }),
);

server.registerTool(
  "list_calendar_blocks",
  {
    description:
      "List calendar occurrences in an inclusive date range of up to 31 days.",
    inputSchema: z.strictObject({ from: date, to: date }),
    annotations: readOnly,
  },
  ({ from, to }) => {
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0 || days > 30)
      return response(
        { error: "Choose a date range of one to 31 days.", revision },
        true,
      );
    return response({
      revision,
      items: occurrencesBetween(data.events, from, to),
    });
  },
);

server.registerTool(
  "list_groceries",
  {
    description: "List items in the fictional grocery checklist.",
    inputSchema: z.strictObject({}),
    annotations: readOnly,
  },
  () => response({ revision, items: data.groceries }),
);

server.registerTool(
  "create_task",
  {
    description:
      "Add a task to this process’s demo workspace. Plan dates and deadlines are independent.",
    inputSchema: z.strictObject({
      ...change,
      id,
      title,
      project_id: id.optional(),
      planned_date: date.optional(),
      due_date: date.optional(),
    }),
    annotations: mutation,
  },
  (input) =>
    applyChange("create_task", input, {
      entity: "tasks",
      operation: "create",
      value: {
        id: input.id,
        title: input.title,
        projectId: input.project_id,
        plannedDate: input.planned_date,
        dueDate: input.due_date,
        createdAt: new Date().toISOString(),
        kind: "task",
        priority: "normal",
        done: false,
      },
    }),
);

server.registerTool(
  "set_task_completion",
  {
    description: "Complete or reopen a task in this process’s demo workspace.",
    inputSchema: z.strictObject({ ...change, id, done: z.boolean() }),
    annotations: mutation,
  },
  (input) => {
    if (
      !data.tasks.some((task) => task.id === input.id && task.kind === "task")
    ) {
      return response({ error: "Task not found.", revision }, true);
    }
    return applyChange("set_task_completion", input, {
      entity: "tasks",
      operation: input.done ? "complete" : "reopen",
      id: input.id,
    });
  },
);

server.registerTool(
  "add_grocery_item",
  {
    description: "Add an item to this process’s demo grocery checklist.",
    inputSchema: z.strictObject({ ...change, id, title }),
    annotations: mutation,
  },
  (input) =>
    applyChange("add_grocery_item", input, {
      entity: "groceries",
      operation: "create",
      value: {
        id: input.id,
        title: input.title,
        done: false,
        createdAt: new Date().toISOString(),
      },
    }),
);

await server.connect(new StdioServerTransport());
