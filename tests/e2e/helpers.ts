import { expect, type Page } from "@playwright/test";

/** Fresh browser → onboarding → sample workspace → inbox. */
export async function startSample(page: Page) {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.getByRole("button", { name: "Use sample data" }).click();
  await expect(page).toHaveURL(/\/inbox/);
  await expect(page.locator("[data-conversation-id]").first()).toBeVisible();
}

export const row = (page: Page, id: string) => page.locator(`[data-conversation-id="${id}"]`);

export function mod() {
  return process.platform === "darwin" ? "Meta" : "Control";
}
