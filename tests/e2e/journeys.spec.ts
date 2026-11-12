import { expect, test } from "@playwright/test";
import { mod, row, startSample } from "./helpers";

test.beforeEach(async ({ page }) => {
  await startSample(page);
});

test("inbox shows sample-data labeling and unified accounts", async ({ page }) => {
  await expect(page.getByText("You're exploring sample conversations.")).toBeVisible();
  await expect(page.getByText("Sample workspace.")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const p of ["Gmail", "Slack", "WhatsApp", "Telegram", "LinkedIn", "Instagram"]) await expect(nav.getByRole("button", { name: p, exact: true })).toBeVisible();
});

test("open, star and archive a conversation with keyboard, then undo", async ({ page }) => {
  await row(page, "cv_rahul_internship").getByRole("link").click();
  await expect(page.getByRole("heading", { name: /Summer internship opportunity/ })).toBeVisible();
  const conv = page.getByRole("region", { name: "Conversation", exact: true });
  await page.keyboard.press("s");
  await expect(conv.getByRole("button", { name: "Star", exact: true })).toBeVisible(); // was starred → now unstarred
  await page.keyboard.press("s");
  await expect(conv.getByRole("button", { name: "Unstar", exact: true })).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.getByRole("region", { name: /Notifications/ }).getByText("Archived", { exact: true })).toBeVisible();
  await expect(row(page, "cv_rahul_internship")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row(page, "cv_rahul_internship")).toHaveCount(1);
});

test("reply: undo window, then pending → sent only after confirmation", async ({ page }) => {
  await page.goto("/inbox?c=cv_marco_tg");
  const box = page.getByRole("textbox", { name: "Reply" });
  await box.fill("Yes, the Figma file is included.");
  await box.press(`${mod()}+Enter`);
  await expect(page.getByText(/Sending in \ds…/)).toBeVisible();
  await page.getByRole("button", { name: "Send now" }).click();
  const msg = page.getByText("Yes, the Figma file is included.");
  await expect(msg).toBeVisible();
  await expect(page.getByLabel("Sent").last()).toBeVisible({ timeout: 5_000 });
});

test("undo send restores the draft and sends nothing", async ({ page }) => {
  await page.goto("/inbox?c=cv_marco_tg");
  const box = page.getByRole("textbox", { name: "Reply" });
  await box.fill("Wait, don't send this");
  await box.press(`${mod()}+Enter`);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("textbox", { name: "Reply" })).toHaveValue("Wait, don't send this");
  await page.waitForTimeout(800);
  // Nothing reached the thread (the only copy is back in the editor).
  await expect(page.getByRole("region", { name: "Conversation", exact: true }).locator("span", { hasText: "Wait, don't send this" })).toHaveCount(0);
});

test("restricted and reauth accounts never show an enabled Send", async ({ page }) => {
  await page.goto("/inbox?c=cv_ethan_li");
  await expect(page.getByText("Replying isn't available here")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open in LinkedIn/ }).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Reply" })).toHaveCount(0);

  await page.goto("/inbox?c=cv_sofia_thesis");
  await expect(page.getByText("Reconnect to reply")).toBeVisible();
  await expect(page.getByRole("link", { name: "Reconnect" }).first()).toBeVisible();
});

test("universal compose: choose account, autocomplete recipient, send", async ({ page }) => {
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New message" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sending account" }).click();
  await page.getByRole("menuitem", { name: /Work.*northwind/ }).click();
  await dialog.getByRole("textbox", { name: "Recipients" }).fill("dan");
  await dialog.getByRole("option", { name: /Daniel Okafor/ }).click();
  await dialog.getByRole("textbox", { name: "Subject" }).fill("Refill flow estimate");
  await dialog.getByRole("textbox", { name: "Message" }).fill("Hi Daniel, adding refills is about two extra weeks.");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Sent (simulated)")).toBeVisible();
  await expect(page.locator("[data-conversation-id]").filter({ hasText: "Refill flow estimate" })).toBeVisible();
});

test("telegram bot account can't start new conversations", async ({ page }) => {
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New message" });
  await dialog.getByRole("radio", { name: "Telegram" }).click();
  await dialog.getByRole("button", { name: "Sending account" }).click();
  await page.getByRole("menuitem", { name: /Work/ }).click();
  await expect(dialog.getByText(/bots can't start conversations/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
});

test("command palette interprets natural language and opens the result", async ({ page }) => {
  await page.keyboard.press(`${mod()}+k`);
  await page.getByPlaceholder("Search messages, people, or type a command…").fill("whatsapp pdf");
  await expect(page.getByText("Has PDF")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/c=cv_jordan_wa/);
});

test("search page filters by platform", async ({ page }) => {
  await page.goto("/search?q=internship");
  await expect(page.getByText(/^\d+ conversations?$/)).toBeVisible();
  await page.getByRole("button", { name: "Platform" }).click();
  await page.getByRole("menuitemcheckbox", { name: "LinkedIn" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("main").getByRole("link", { name: /Rahul Mehta/ })).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: /Summer internship/ })).toHaveCount(0);
});

test("snooze hides a conversation until later", async ({ page }) => {
  const r = row(page, "cv_aisha_ig");
  await r.hover();
  await r.getByRole("button", { name: "Snooze" }).click();
  await page.getByRole("menuitem", { name: /Tomorrow/ }).click();
  await expect(page.getByText(/Snoozed until/)).toBeVisible();
  await expect(row(page, "cv_aisha_ig")).toHaveCount(0);
});

test("contacts: merge duplicates sharing an email, then unmerge", async ({ page }) => {
  await page.goto("/contacts?id=c_jordan");
  await page.getByRole("button", { name: "Review merge" }).click();
  await expect(page.getByText(/Strong match: both records share jordan.lee@fastmail.com/)).toBeVisible();
  await page.getByRole("button", { name: "Merge contacts" }).click();
  await expect(page.getByRole("heading", { name: "Merged records" })).toBeVisible();
  await page.getByRole("button", { name: "Unmerge" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Unmerge" }).click();
  await expect(page.getByRole("heading", { name: "Merged records" })).toHaveCount(0);
});

test("follow-ups: track a detected suggestion", async ({ page }) => {
  await page.goto("/follow-ups");
  const suggestion = page.locator("section").filter({ hasText: "Suggested follow-ups" });
  await expect(suggestion).toBeVisible();
  const before = await suggestion.getByRole("button", { name: "Track" }).count();
  await suggestion.getByRole("button", { name: "Track" }).first().click();
  await expect(page.getByText("Added to follow-ups")).toBeVisible();
  await expect(suggestion.getByRole("button", { name: "Track" })).toHaveCount(before - 1);
});

test("assistant answers with rules when AI isn't configured", async ({ page }) => {
  await page.goto("/assistant");
  await page.getByRole("button", { name: "Who am I waiting for a response from?" }).click();
  await expect(page.getByText(/You're waiting on/)).toBeVisible();
  await expect(page.getByText("Answered with Orbit's rules (no AI)")).toBeVisible();
});

test("settings: theme, density and accent apply immediately", async ({ page }) => {
  await page.goto("/settings?tab=appearance");
  await page.getByRole("button", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: "Compact" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.getByRole("button", { name: /Moss/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "moss");
});

test("disconnecting an account deletes its data", async ({ page }) => {
  await page.goto("/settings?tab=accounts");
  await page.getByRole("button", { name: "Open Source Collective options" }).click();
  await page.getByRole("menuitem", { name: "Disconnect & delete data" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect & delete data" }).click();
  await expect(page.getByText("Open Source Collective disconnected")).toBeVisible();
  await page.goto("/inbox");
  await expect(row(page, "cv_slack_mei")).toHaveCount(0);
});

test("notification center: open, mark all read", async ({ page }) => {
  await page.getByRole("button", { name: "Notifications" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Leo Fischer in #design-review")).toBeVisible();
  await panel.getByRole("button", { name: "Mark all as read" }).click();
  await expect(panel.getByLabel("Unread")).toHaveCount(0);
});
