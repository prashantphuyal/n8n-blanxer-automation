import { chromium, Browser, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

// Env helpers
const HEADLESS = process.env.HEADLESS === "false" ? false : true;
const SLOWMO = Number(process.env.SLOWMO || 0);
export const OUTPUT_DIR = process.env.OUTPUT_DIR || "outputs";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: HEADLESS, slowMo: SLOWMO });
}
export async function launchBrowserLive(): Promise<Browser> {
  return chromium.launch({ headless: false, slowMo: 500 });
}

export function ensureDir(dir = OUTPUT_DIR) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function stamp(name: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${name}-${ts}`;
}

export async function safeGoto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
}

export async function snap(page: Page, basename: string) {
  ensureDir();
  const file = path.join(OUTPUT_DIR, `${stamp(basename)}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("📸 Saved", file);
  return file;
}

export async function onFailure(page: Page, label = "error") {
  try {
    await snap(page, label);
  } catch {
    /* ignore */
  }
}
