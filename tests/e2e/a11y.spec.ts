import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { startSample } from "./helpers";

const PAGES = [
  ["inbox", "/inbox"],
  ["email thread", "/inbox?c=cv_rahul_internship"],
  ["chat", "/inbox?c=cv_jordan_wa"],
  ["slack channel", "/inbox?c=cv_slack_design_review"],
  ["search", "/search?q=internship"],
  ["contacts", "/contacts?id=c_rahul"],
  ["follow-ups", "/follow-ups"],
  ["analytics", "/analytics"],
  ["assistant", "/assistant"],
  ["settings", "/settings?tab=accounts"],
] as const;

for (const theme of ["light", "dark"] as const) {
  test.describe(`accessibility (${theme})`, () => {
    test.use({ colorScheme: theme });
    for (const [name, path] of PAGES) {
      test(`${name} has no serious or critical WCAG A/AA violations`, async ({ page }) => {
        await startSample(page);
        await page.goto(path);
        await page.waitForTimeout(600);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
        expect(serious, report).toEqual([]);
      });
    }
  });
}

test("onboarding has no serious or critical WCAG violations", async ({ page }) => {
  await page.goto("/onboarding");
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});
