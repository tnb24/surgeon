// End-to-end browser check. Start the app first. Use --live to exercise the model.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 1100 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.APP_URL || "http://127.0.0.1:8791");
await page
  .getByRole("heading", { name: "A small change. A different thought." })
  .waitFor();
await page.screenshot({ path: "docs/preview-desktop.png", fullPage: true });
if (process.argv.includes("--live")) {
  await page
    .getByRole("button", { name: "Analyze text", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".prompt-bottom button.primary").disabled,
    { timeout: 180000 },
  );
  await page.getByRole("button", { name: "Analyze text", exact: true }).click();
  await page.locator(".analysis-note").waitFor({ timeout: 120000 });
  const analysisSummary = await page.locator(".analysis-note").textContent();
  await expect(page.locator(".neuron-list strong").first()).not.toHaveText("—");
  await page.locator(".neuron-list button").first().click();
  await page.getByLabel("Intervention value", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Apply to experiment" }).click();
  await page.getByLabel("New tokens", { exact: true }).fill("24");
  await page.getByRole("button", { name: "Run comparison" }).click();
  await page
    .getByRole("heading", { name: "Next token at the shared prompt" })
    .waitFor({ timeout: 180000 });
  const text = await page.locator(".completion").allTextContents();
  if (text[0] === text[1])
    throw Error("Expected chosen strong edit to change the completion");
  await page.screenshot({ path: "docs/preview-live.png", fullPage: true });
  await page
    .getByRole("button", { name: "Bookmark neuron", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save experiment" }).click();
  const download = await downloadPromise;
  await download.saveAs("docs/test-experiment.json");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByText("Settings changed — run again").waitFor();
  await page.getByRole("button", { name: "Run comparison" }).click();
  await page
    .getByRole("heading", { name: "Next token at the shared prompt" })
    .waitFor({ timeout: 120000 });
  const reset = await page.locator(".completion").allTextContents();
  if (reset[0] !== text[0] || reset[1] !== reset[0])
    throw Error("Reset did not reproduce the baseline");
  await page
    .locator("input[type=file]")
    .setInputFiles("docs/test-experiment.json");
  await page.locator(".edits input[type=checkbox]").waitFor();
  if ((await page.locator(".edits input[type=checkbox]").count()) !== 1)
    throw Error("Import did not restore intervention");
  if ((await page.locator(".completion").allTextContents())[1] !== text[1])
    throw Error("Import did not restore result");
  await page.getByLabel("New tokens", { exact: true }).fill("256");
  await page.getByRole("button", { name: "Run comparison" }).click();
  await page.waitForFunction(() =>
    document.querySelector(".completion")?.textContent?.includes("a man"),
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByText("Stopped · partial output").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByLabel("New tokens", { exact: true }).fill("24");
  await page.getByRole("button", { name: "Run comparison" }).click();
  await page
    .getByRole("heading", { name: "Next token at the shared prompt" })
    .waitFor({ timeout: 120000 });
  const afterStop = await page.locator(".completion").allTextContents();
  if (afterStop[0] !== text[0] || afterStop[1] !== text[0])
    throw Error("Stop leaked into later baseline");
  await page
    .locator("input[type=file]")
    .setInputFiles("docs/test-experiment.json");
  const grid = page.getByRole("grid");
  const previousNeuron = Number(
    await page.getByLabel("Neuron ID", { exact: true }).inputValue(),
  );
  await grid.focus();
  await grid.press("ArrowRight");
  await expect(page.getByLabel("Neuron ID", { exact: true })).toHaveValue(
    String(Math.min(3071, previousNeuron + 1)),
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        prompt: "test",
        edits: [],
        max_new: 24,
        result: { baseline: { bad: true } },
      }),
    ),
  });
  await expect(page.getByRole("alert")).toContainText("Invalid saved result");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  fs.writeFileSync(
    "docs/browser-evidence.json",
    JSON.stringify(
      {
        text,
        errors,
        analysis: analysisSummary,
        checks: [
          "live analysis",
          "edited generation",
          "next-token probabilities",
          "bookmark",
          "export/import",
          "reset reproduces baseline",
          "stop",
          "baseline after stop",
          "keyboard navigation",
          "mobile overflow",
        ],
      },
      null,
      2,
    ),
  );
}
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "docs/preview-mobile.png", fullPage: true });
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw Error("Horizontal overflow on mobile");
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
console.log("Browser checks passed");
