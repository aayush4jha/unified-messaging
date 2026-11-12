import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";
import { row, startSample } from "./helpers";

/** A real touch drag (Chromium touch emulation), so pointer events arrive as pointerType "touch". */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function swipeRow(page: Page, id: string, direction: "left" | "right") {
  const box = (await row(page, id).boundingBox())!;
  const y = box.y + box.height / 2;
  await touchDrag(page, { x: direction === "left" ? box.x + box.width - 40 : box.x + 40, y }, { x: direction === "left" ? box.x + 40 : box.x + box.width - 40, y });
}

test("mobile: list → conversation → back, and navigation drawer", async ({ page }) => {
  await startSample(page);
  await row(page, "cv_mom").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Mom", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(row(page, "cv_mom")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("mobile: bottom tab bar navigates, shows unread, hides inside a conversation", async ({ page }) => {
  await startSample(page);
  const tabs = page.getByRole("navigation", { name: "Primary" });
  await expect(tabs.getByRole("link", { name: /Inbox\s*,\s*\d+ unread/ })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search/);
  await tabs.getByRole("link", { name: /Follow-ups/ }).click();
  await expect(page.getByRole("heading", { name: "Follow-ups", exact: true })).toBeVisible();
  await tabs.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.touchscreen.tap(400, 420); // tap outside the drawer
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
  await tabs.getByRole("button", { name: "New message" }).click();
  await expect(page.getByRole("dialog", { name: "New message" })).toBeVisible();
  await page.getByRole("button", { name: /Close/ }).click();

  await tabs.getByRole("link", { name: /Inbox/ }).click();
  await row(page, "cv_mom").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Mom", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
});

test("mobile: swipe left archives with undo, swipe right toggles read without opening", async ({ page }) => {
  await startSample(page);
  await swipeRow(page, "cv_marco_tg", "left");
  await expect(row(page, "cv_marco_tg")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row(page, "cv_marco_tg")).toBeVisible();

  await expect(row(page, "cv_mom").getByText(/unread/)).toHaveCount(1);
  await swipeRow(page, "cv_mom", "right");
  await expect(row(page, "cv_mom").getByText(/unread/)).toHaveCount(0);
  await expect(page).not.toHaveURL(/c=cv_mom/);
});

test("mobile: conversation header keeps star and snooze in the ⋯ menu", async ({ page }) => {
  await startSample(page);
  await page.goto("/inbox?c=cv_rahul_internship");
  const header = page.locator("section[aria-label=Conversation] header");
  await expect(header.getByRole("button", { name: "Star" })).toBeHidden();
  await header.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /^(Star|Unstar)\b/ }).click();
  await header.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("group", { name: "Snooze" }).getByRole("menuitem", { name: /Tomorrow/ }).click();
  await expect(page.getByText(/Snoozed until/)).toBeVisible();
});

test("mobile: Share → Orbit opens a prefilled message", async ({ page }) => {
  await startSample(page);
  await page.goto("/share?title=Launch%20notes&text=Have%20a%20look&url=https%3A%2F%2Fexample.com%2Fnotes");
  const dialog = page.getByRole("dialog", { name: "New message" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /message|body/i }).or(dialog.locator("textarea")).first()).toHaveValue(/Have a look\s+https:\/\/example\.com\/notes/);
  await expect(page).toHaveURL(/\/inbox$/);
});

test("mobile: Settings → Mobile app offers the Android download and push status", async ({ page }) => {
  await startSample(page);
  await page.goto("/settings?tab=mobile");
  await expect(page.getByRole("heading", { name: "Mobile app" })).toBeVisible();
  const apk = await page.request.get("/downloads/android.json");
  if (apk.ok()) await expect(page.getByRole("link", { name: /Download Orbit\.apk/ })).toHaveAttribute("href", "/downloads/orbit.apk");
  else await expect(page.getByText(/tap Install app/)).toBeVisible();
  await expect(page.getByText(/Sign in to your Orbit account to get notifications/)).toBeVisible();
});

for (const [name, path] of [
  ["inbox", "/inbox"],
  ["conversation", "/inbox?c=cv_rahul_internship"],
  ["mobile settings", "/settings?tab=mobile"],
] as const) {
  test(`mobile ${name} has no serious or critical WCAG A/AA violations`, async ({ page }) => {
    await startSample(page);
    await page.goto(path);
    await page.waitForTimeout(600);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`).join("\n")).toEqual([]);
  });
}

test("mobile: /download shows the Android install path", async ({ page }) => {
  await page.goto("/download");
  await expect(page.getByRole("heading", { name: "Every conversation. One app." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Install on your Android phone" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("iPhone visitors get Add to Home Screen steps on /download", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 15"] });
  const page = await ctx.newPage();
  await page.goto("/download");
  await expect(page.getByRole("heading", { name: "Install on your iPhone or iPad" })).toBeVisible();
  await expect(page.getByText("Add to Home Screen").first()).toBeVisible();
  await ctx.close();
});
