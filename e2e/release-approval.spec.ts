import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * E2E: ticket → release_approval lifecycle (pozadavky #7 scénář 3, #9 item 3).
 *
 * Simulates what claude-code-action does after opening a PR: it POSTs to
 * /api/tickets with action="request_release" pointing at the originating
 * task. We don't go through GitHub — the REST call IS the contract.
 *
 *   Given the user has filed a task through /tasks/new
 *   When the agent (REST POST request_release) creates a release_approval
 *   Then the release_approval card with "Approve & deploy" is on the board
 *        and the originating task has moved to In progress
 *        (status = ready_for_release per src/lib/release.ts)
 */

const TICKETS_TOKEN = "e2e-token"; // matches playwright.config.ts webServer env

test.describe("Ticket → release_approval lifecycle", () => {
  test("Given an open task, when the agent requests release approval, then a release_approval with Approve & deploy appears on the board", async ({
    page,
    baseURL,
  }) => {
    const stamp = Date.now();
    const taskTitle = `E2E: ship feature ${stamp}`;
    const releaseTitle = `Release: ${taskTitle}`;

    // 1. User creates the originating task through the UI.
    await page.goto("/tasks/new");
    await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();
    await page.getByPlaceholder(/Export audit log/i).fill(taskTitle);
    await page
      .getByPlaceholder(/What needs to happen/i)
      .fill("E2E spec — simulates the multi-agent loop end-to-end.");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page).toHaveURL(/\/tasks$/);

    // 2. Resolve the task id from the kanban card's link.
    const taskCard = page
      .locator("li", { has: page.getByText(taskTitle) })
      .first();
    await expect(taskCard).toBeVisible();
    const href = await taskCard
      .locator("a", { hasText: taskTitle })
      .getAttribute("href");
    expect(href).toMatch(/^\/tasks\//);
    const taskId = href!.split("/").pop()!;

    // 3. Simulate the agent: POST /api/tickets request_release.
    const api = await pwRequest.newContext();
    const res = await api.post(`${baseURL}/api/tickets`, {
      headers: {
        Authorization: `Bearer ${TICKETS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: {
        action: "request_release",
        title: releaseTitle,
        summary:
          "PR ready for human approval — spec satisfied, CI green, preview live.",
        prUrl: "https://github.com/sabootergmail/pulsewatch/pull/9999",
        prNumber: 9999,
        previewUrl: "https://pulsewatch-preview-9999.vercel.app",
        relatedTaskId: taskId,
      },
    });
    expect(res.status()).toBe(200);

    // 4. The release_approval card is on the board with the approve button.
    await page.goto("/tasks");
    const releaseCard = page
      .locator("li", { has: page.getByText(releaseTitle) })
      .first();
    await expect(releaseCard).toBeVisible();
    await expect(
      releaseCard.getByRole("button", { name: /Approve.*deploy/i }),
    ).toBeVisible();

    // 5. The originating task moved to "In progress" (ready_for_release maps
    //    to the in_progress column in TasksPage).
    const movedCard = page
      .locator("li", { has: page.getByText(taskTitle) })
      .first();
    await expect(movedCard).toBeVisible();
    // The Delegate-to-Claude button (only on backlog) should be gone now.
    await expect(
      movedCard.getByRole("button", { name: /Delegate to Claude/i }),
    ).toHaveCount(0);
  });

  test("Given /api/tickets with no Bearer token, when request_release is called, then it 401s", async ({
    baseURL,
  }) => {
    const api = await pwRequest.newContext();
    const res = await api.post(`${baseURL}/api/tickets`, {
      headers: { "Content-Type": "application/json" },
      data: { action: "list" },
    });
    expect(res.status()).toBe(401);
  });
});
