import { expect, test } from "@playwright/test";

test("landing page opens the workspace", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Think clearly/i }),
  ).toBeVisible();
  await Promise.all([
    page.waitForURL("**/chat", { timeout: 20_000 }),
    page.getByRole("link", { name: /Get started/i }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: /What are we working on/i }),
  ).toBeVisible({ timeout: 20_000 });
  expect(runtimeErrors).toEqual([]);
});

test("selected chat history is restored after a reload", async ({ page }) => {
  const message = `Persistent history ${Date.now()}`;
  const response = await page.request.post("/api/chat", {
    data: { message: `${message} open google` },
  });
  expect(response.ok()).toBe(true);
  const stream = await response.text();
  const conversationId = stream.match(/"conversation_id": "([^"]+)"/)?.[1];
  expect(conversationId).toBeTruthy();

  try {
    await page.goto("/chat");
    await page.evaluate(({ key, id }) => window.localStorage.setItem(key, id), {
      key: "ai-studio.active-chat",
      id: conversationId!,
    });
    await page.reload();

    await expect(
      page
        .getByRole("main")
        .getByText(`${message} open google`, { exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.delete(`/api/conversations/${conversationId}`);
  }
});

test("storage manager is available in settings", async ({ page }) => {
  await page.goto("/chat");
  const sidebarButton = page.getByRole("button", { name: "Open sidebar" });
  if ((page.viewportSize()?.width ?? 1280) < 768) await sidebarButton.click();
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(
    page.getByRole("heading", { name: "Storage Manager" }),
  ).toBeVisible();
  await expect(page.getByText("Database", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clean & optimize" }),
  ).toBeVisible();
});
