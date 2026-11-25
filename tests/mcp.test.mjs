import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function connect(context) {
  const client = new Client({ name: "showcase-test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../server/mcp.mjs", import.meta.url))],
  });
  context.after(() => client.close());
  await client.connect(transport);
  return (name, args = {}) => client.callTool({ name, arguments: args });
}

test("a subprocess exposes fictional projects, tasks, blocks and groceries over MCP", async (context) => {
  const call = await connect(context);
  const projects = await call("list_projects");
  assert.equal(projects.structuredContent.revision, 0);
  assert.equal(
    projects.structuredContent.items[0].name,
    "Neighborhood Field Guide",
  );
  const jobs = await call("list_tasks", {
    project_id: "job-applications",
    query: "Lantern Vale",
  });
  assert.equal(
    jobs.structuredContent.items[0].jobDetails.stage,
    "Interviewing",
  );
  const day = (await call("list_tasks", { query: "field guide map" }))
    .structuredContent.items[0].dueDate;
  const blocks = await call("list_calendar_blocks", { from: day, to: day });
  assert.equal(blocks.structuredContent.items[0].taskId, "guide-map");
  const groceries = await call("list_groceries");
  assert.ok(
    groceries.structuredContent.items.some((item) => item.title === "Pears"),
  );
});

test("MCP writes validate revisions, retry identical requests and reset across processes", async (context) => {
  const call = await connect(context);
  const task = {
    id: "demo-task-test",
    title: "Check the sample index",
    expected_revision: 0,
    request_id: randomUUID(),
  };
  const first = await call("create_task", task);
  assert.equal(first.structuredContent.revision, 1);
  const retry = await call("create_task", task);
  assert.equal(retry.structuredContent.duplicate, true);
  const clash = await call("create_task", { ...task, title: "Different task" });
  assert.equal(clash.isError, true);
  assert.match(clash.structuredContent.error, /different change/);

  const change = {
    id: task.id,
    done: true,
    expected_revision: 0,
    request_id: randomUUID(),
  };
  const stale = await call("set_task_completion", change);
  assert.equal(stale.isError, true);
  assert.match(stale.structuredContent.error, /Revision conflict/);
  const completed = await call("set_task_completion", {
    ...change,
    expected_revision: 1,
    request_id: randomUUID(),
  });
  assert.equal(completed.structuredContent.revision, 2);
  assert.equal(
    (await call("list_tasks", { done: true, query: "sample index" }))
      .structuredContent.items.length,
    1,
  );

  const grocery = await call("add_grocery_item", {
    id: "grocery-granola",
    title: "Granola",
    expected_revision: 2,
    request_id: randomUUID(),
  });
  assert.equal(grocery.structuredContent.revision, 3);
  assert.ok(
    (await call("list_groceries")).structuredContent.items.some(
      (item) => item.title === "Granola",
    ),
  );
  const isolated = await connect(context);
  assert.deepEqual(
    (await isolated("list_tasks", { query: "sample index" })).structuredContent,
    { revision: 0, items: [] },
  );
});
