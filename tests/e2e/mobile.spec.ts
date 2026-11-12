import { expect, test } from "@playwright/test";
import { row, startSample } from "./helpers";

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
