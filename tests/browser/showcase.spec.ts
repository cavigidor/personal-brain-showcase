import { expect, test, type Page } from "@playwright/test";

const demoDate = new Date(2026, 4, 20, 8, 30);

async function navigate(page: Page, name: string) {
  const mobile = page.getByRole("button", { name: "Open navigation" });
  if (await mobile.isVisible()) await mobile.click();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(demoDate);
});

test("Today, tasks and groceries work without external connections", async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4174/"))
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Fictional demo data")).toBeVisible();
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveAttribute("content", /connect-src 'none'/);

  await page.getByRole("button", { name: "New task" }).click();
  const editor = page.getByRole("dialog", { name: "Entry editor" });
  await editor
    .getByRole("textbox", { name: "Title" })
    .fill("Check the sample route key");
  await editor.getByRole("button", { name: "Save task" }).click();
  const today = page.getByRole("region", { name: "Today's tasks" });
  const row = today
    .locator(".task-row")
    .filter({ hasText: "Check the sample route key" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Complete task" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();

  await page.getByRole("button", { name: "Grocery List" }).click();
  const grocery = page.getByRole("region", { name: "Grocery List" });
  await grocery
    .getByRole("textbox", { name: "New grocery item" })
    .fill("Oat crackers");
  await grocery.getByRole("button", { name: "Add item" }).click();
  await grocery.getByRole("checkbox", { name: "Oat crackers" }).check();
  await page.reload();
  await page.getByRole("button", { name: "Grocery List" }).click();
  await expect(
    grocery.getByRole("checkbox", { name: "Oat crackers" }),
  ).toBeChecked();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("projects and structured application stages persist", async ({ page }) => {
  await page.goto("/");
  await navigate(page, "Projects");
  await page
    .getByRole("combobox", { name: "Printmaking Workshop status" })
    .selectOption("Active");
  await page
    .locator(".project-card")
    .filter({ hasText: "Job Applications" })
    .getByRole("button", { name: "View tasks" })
    .click();
  await page
    .getByRole("button", { name: "Follow up with Lantern Vale Studio" })
    .click();
  const details = page.getByRole("dialog");
  await details.getByRole("button", { name: "View Job Details" }).click();
  await expect(
    details.getByRole("heading", { name: "Product Engineer" }),
  ).toBeVisible();
  await expect(details.getByText(/Interviewing/)).toBeVisible();
  await details.getByRole("button", { name: "Back to Notes" }).click();
  await details.getByRole("button", { name: "Edit Details" }).click();
  const editor = page.getByRole("dialog", { name: "Entry editor" });
  await editor
    .getByRole("combobox", { name: "Application stage" })
    .selectOption("Closed");
  await editor.getByRole("button", { name: "Save task" }).click();
  await page.reload();
  await expect(
    page
      .locator(".task-row")
      .filter({ hasText: "Follow up with Lantern Vale Studio" }),
  ).toContainText("Closed");
  await navigate(page, "Projects");
  await expect(
    page.getByRole("combobox", { name: "Printmaking Workshop status" }),
  ).toHaveValue("Active");
});

test("editing one recurring work session keeps the series and task deadline", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Calendar");
  const plannerDay = page.getByRole("region", {
    name: "Planner for 2026-05-21",
  });
  await plannerDay.getByRole("button", { name: "Edit / reschedule" }).click();
  await page.getByRole("button", { name: "Edit this occurrence" }).click();
  const editor = page.getByRole("dialog", { name: "Entry editor" });
  await editor.getByLabel("Starts at").fill("11:00");
  await editor.getByLabel("Ends at").fill("12:00");
  await editor.getByRole("button", { name: "Save session" }).click();
  await expect(
    plannerDay.getByText("11:00–12:00", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next period" }).click();
  await expect(
    page
      .getByRole("region", { name: "Planner for 2026-05-28" })
      .getByText("09:30–10:30", { exact: false }),
  ).toBeVisible();

  const dueDate = await page.evaluate(() => {
    const record = JSON.parse(
      localStorage.getItem("personal-brain-showcase-local-v1")!,
    );
    return record.tasks.find(
      (task: { id: string }) => task.id === "workshop-materials",
    ).dueDate;
  });
  expect(dueDate).toBe("2026-05-23");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("backup download, reset and restore use only the dedicated demo storage", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New task" }).click();
  const editor = page.getByRole("dialog", { name: "Entry editor" });
  await editor
    .getByRole("textbox", { name: "Title" })
    .fill("Keep this sample draft");
  await editor.getByRole("button", { name: "Save task" }).click();

  await page.getByRole("button", { name: "Open settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings and data" });
  const downloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Export JSON backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "personal-brain-showcase-2026-05-20.json",
  );
  const path = await download.path();
  expect(path).toBeTruthy();

  await page.evaluate(() =>
    localStorage.setItem("other-planner-fixture", "isolated fixture sentinel"),
  );
  page.once("dialog", (dialog) => dialog.accept());
  await settings.getByRole("button", { name: "Reset sample data" }).click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep this sample draft" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("other-planner-fixture")),
  ).toBe("isolated fixture sentinel");

  await page.getByRole("button", { name: "Open settings" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await settings.locator('input[type="file"]').setInputFiles(path!);
  await expect(
    page.getByRole("button", { name: "Keep this sample draft" }),
  ).toBeVisible();
});
