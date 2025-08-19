import { test, expect } from "@playwright/test";
import fs from "fs";

test("Login to Blanxer with Google (manual first time) and save session", async ({
  page,
  context,
}) => {
  // Go visible for OAuth; also set channel:'chrome' in config (below) for best results.
  await page.goto("https://www.blanxer.com/", {
    waitUntil: "domcontentloaded",
  });

  // Open login – adjust if your UI differs
  await page.getByRole("button", { name: /login/i }).click();

  // Some sites open a popup, some redirect in same tab. Rather than guessing selectors,
  // we'll PAUSE and you complete Google login manually, then click ▶ Resume in the Inspector.
  await page.pause(); // <- Click "Continue with Google", finish sign-in/2FA, wait until you're back.

  // When you resume, wait for the app to settle and confirm you're in.
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot({ fullPage: true }); // optional snapshot

  // Save cookies + localStorage for future runs
  await context.storageState({ path: "blanxer-state.json" });
  console.log("✅ Saved session to blanxer-state.json");
});
