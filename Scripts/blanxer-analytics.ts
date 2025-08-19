import { chromium, Page, Locator } from "playwright";
import * as fs from "fs";
import * as path from "path";

// --- paths & small helpers ---
const PROFILE_DIR = path.join(process.cwd(), ".pw-chrome-profile");
const OUT_DIR = "outputs";
const stamp = (s: string) =>
  `${s}-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const parseNumber = (t: string) => {
  const cleaned = t.replace(/[₹रुRs]/g, "");
  const m = cleaned.match(/-?\d[\d,]*(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, "")) : null;
};
const parsePercent = (t: string) => {
  const m = t.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
};

// Find a card by its label text, then read the big bold value inside it
async function valueFromCard(page: Page, label: string): Promise<string> {
  let card = page.locator("div.k-box").filter({ hasText: label }).first();
  if ((await card.count()) === 0) {
    card = page.locator(`div:has-text("${label}")`).first();
  }
  await card.waitFor({ state: "visible", timeout: 60_000 });

  // In your DOM, the big KPI number uses both text-2xl and font-bold
  let valueNode = card
    .locator('[class*="text-2xl"][class*="font-bold"]')
    .first();
  if ((await valueNode.count()) === 0) {
    // Fallback: any node in the card that contains digits
    valueNode = card
      .locator(":is(span,div,strong,b,h1,h2,h3,p)")
      .filter({ hasText: /\d/ })
      .first();
  }
  await valueNode.waitFor({ state: "visible", timeout: 60_000 });

  // Wait until the node actually shows digits (handles late render)
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    const txt = (await valueNode.innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .trim();
    if (/\d/.test(txt)) return txt;
    await page.waitForTimeout(150);
  }
  throw new Error(`Timed out waiting for number in "${label}" card`);
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Reuse your logged-in Chrome profile
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false, // set true later for silent runs
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
    slowMo: 60,
  });
  const page = await ctx.newPage();

  try {
    await page.goto("https://app.blanxer.com/dashboard/analytics", {
      waitUntil: "domcontentloaded",
    });

    // Read KPI values
    const tRevenue = await valueFromCard(page, "Revenue");
    const tOrders = await valueFromCard(page, "Orders");
    const tGrossProfit = await valueFromCard(page, "Gross Profit");
    const tGrossMargin = await valueFromCard(page, "Gross Margin (%)");

    const metrics = {
      revenue: parseNumber(tRevenue),
      orders: parseNumber(tOrders),
      grossProfit: parseNumber(tGrossProfit),
      grossMarginPercent: parsePercent(tGrossMargin),
    };

    // ---  Save timestamped files ---
    const ts = new Date().toISOString();
    // ---  Save stable “latest” files (overwritten each run) ---
    const jsonLatest = path.join(OUT_DIR, "analytics-latest.json");
    const csvLatest = path.join(OUT_DIR, "analytics-latest.csv");
    fs.writeFileSync(jsonLatest, JSON.stringify({ ts, ...metrics }, null, 2));
    fs.writeFileSync(
      csvLatest,
      `ts,revenue,orders,grossProfit,grossMarginPercent\n${ts},${
        metrics.revenue ?? ""
      },${metrics.orders ?? ""},${metrics.grossProfit ?? ""},${
        metrics.grossMarginPercent ?? ""
      }\n`
    );
    console.log("🟢 latest JSON:", jsonLatest);
    console.log("🟢 latest CSV:", csvLatest);

    // ---  Print a single JSON line for n8n to parse from stdout  ---
    console.log("N8N_METRICS_JSON=" + JSON.stringify({ ts, ...metrics }));
  } catch (e) {
    console.error("❌", e);
    const err = path.join(OUT_DIR, `${stamp("analytics-error")}.png`);
    await page.screenshot({ path: err, fullPage: true }).catch(() => {});
    console.log("📸 error", err);
  } finally {
    for (const p of ctx.pages()) {
      try {
        await p.close();
      } catch {}
    }
    await ctx.close();
    console.log("✅ Done");
  }
})();
