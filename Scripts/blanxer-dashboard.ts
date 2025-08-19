import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

// Where the Chrome session lives (keep this folder between runs)
const PROFILE_DIR = path.join(process.cwd(), ".pw-chrome-profile");

// Simple timestamp helper
const stamp = (name: string) =>
  `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`;

(async () => {
  // Launch your installed Chrome with the persistent profile
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false, // set to true later if you want; headed is clearer
    slowMo: 200, // slow it a bit so you can watch
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = await ctx.newPage();
  const outDir = "outputs";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    // Go straight to the logged-in dashboard (your session in the profile keeps you signed in)
    await page.goto("https://app.blanxer.com/dashboard", {
      waitUntil: "networkidle",
    });

    // Screenshot
    const shot = path.join(outDir, `${stamp("dashboard")}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log("📸 Saved:", shot);
  } catch (e) {
    console.error("Run failed:", e);
    const errShot = path.join(outDir, `${stamp("dashboard-error")}.png`);
    await page.screenshot({ path: errShot, fullPage: true }).catch(() => {});
    console.log("📸 Error shot:", errShot);
  } finally {
    await ctx.close();
  }
})();
