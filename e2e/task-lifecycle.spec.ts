import { test, expect } from "@playwright/test";

// E2E: ticket lifecycle from /tasks/new through to appearing on the board.
// This is the smallest scenario that exercises the full vertical: page render
// → server action → DB write → redirect → re-render with fresh data. The
// directive's "Monitor lifecycle" and "release_approval lifecycle" scenarios
// build on this same infrastructure.

test.describe("Task lifecycle", () => {
  test("Given /tasks/new, when the user submits a new task, then it appears on the kanban", async ({ page }) => {
    const title = `E2E task ${Date.now()}`;

    await page.goto("/tasks/new");
    await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();

    await page.getByLabel("Title").fill(title);
    await page
      .getByLabel("Description")
      .fill("Created from Playwright E2E spec — please ignore.");
    await page.getByLabel("Priority").selectOption("high");
    await page.getByRole("button", { name: "Create task" }).click();

    // Server action redirects to /tasks; the new task should land in Backlog.
    await expect(page).toHaveURL(/\/tasks$/);
    const backlogSection = page.locator("text=Backlog").locator("..").locator("..");
    await expect(backlogSection.getByText(title)).toBeVisible();
  });

  test("Given a release_approval ticket, then the Approve & deploy button is visible to the user", async ({ page }) => {
    // The seed plants a Release: dark mode toggle release_approval in
    // status `ready_for_release`. The kanban should show its Approve button.
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

    const releaseCard = page
      .locator("li", { has: page.getByText("Release: dark mode toggle") })
      .first();
    await expect(releaseCard).toBeVisible();
    await expect(
      releaseCard.getByRole("button", { name: /Approve.*deploy/i }),
    ).toBeVisible();
  });
});
