import { chromium, Page, Locator } from "playwright";
import * as fs from "fs";
import * as path from "path";

// ----- paths & helpers -----
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

async function firstVisible(...locs: Locator[]) {
  for (const l of locs) {
    if (await l.count()) {
      const f = l.first();
      if (await f.isVisible().catch(() => false)) return f;
    }
  }
  return null;
}

// ----- your KPI reader (card label → big bold value) -----
async function valueFromCard(page: Page, label: string): Promise<string> {
  let card = page.locator("div.k-box").filter({ hasText: label }).first();
  if ((await card.count()) === 0)
    card = page.locator(`div:has-text("${label}")`).first();
  await card.waitFor({ state: "visible", timeout: 60_000 });

  // In your UI the big number has both text-2xl and font-bold
  let valueNode = card
    .locator('[class*="text-2xl"][class*="font-bold"]')
    .first();
  if ((await valueNode.count()) === 0) {
    valueNode = card
      .locator(":is(span,div,strong,b,h1,h2,h3,p)")
      .filter({ hasText: /\d/ })
      .first();
  }
  await valueNode.waitFor({ state: "visible", timeout: 60_000 });

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

// ----- set date filter to Today (uses your codegen selectors) -----
async function setDateToToday(page: Page) {
  // 1) open the filter popover (exactly like codegen)
  const openBtn =
    (await firstVisible(
      page.getByRole("button", { name: "Last 7 days" }) // what codegen saw
    )) ||
    // small fallback if label changed
    (await firstVisible(
      page.getByRole("button", {
        name: /Today|Yesterday|Last\s*7\s*days|Last\s*30\s*days/i,
      })
    ));

  if (!openBtn) throw new Error("Could not find date filter button.");
  await openBtn.click();

  // 2) click Today (exactly like codegen)
  const todayItem =
    (await firstVisible(page.getByRole("menuitem", { name: "Today" }))) ||
    (await firstVisible(page.getByRole("option", { name: "Today" }))) ||
    page.getByText(/^Today$/).first();

  await todayItem.click();

  // 3) wait until the button itself shows "Today"
  await page
    .getByRole("button", { name: "Today" })
    .waitFor({ timeout: 15_000 })
    .catch(async () => {
      await page
        .getByText(/^Today$/)
        .first()
        .waitFor({ timeout: 15_000 });
    });

  // 4) wait for data to re-render (some number anywhere on page)
  await page.waitForFunction(() => /\d/.test(document.body.innerText), {
    timeout: 30_000,
  });
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: true, // set true once stable
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
    slowMo: 60,
  });

  const page = await ctx.newPage();

  try {
    await page.goto("https://app.blanxer.com/dashboard/analytics", {
      waitUntil: "domcontentloaded",
    });

    // viewport & basic readiness
    await page.setViewportSize({ width: 1600, height: 2000 });
    await page.getByText(/Sales Overview/i).waitFor({ timeout: 60_000 });

    // >>> change filter to Today
    await setDateToToday(page);

    // optional screenshot
    const shot = path.join(OUT_DIR, `${stamp("analytics-today")}.png`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.screenshot({ path: shot, fullPage: true });
    console.log("📸", shot);

    // read KPIs
    const tRevenue = await valueFromCard(page, "Revenue");
    const tOrders = await valueFromCard(page, "Orders");
    const tGrossProfit = await valueFromCard(page, "Gross Profit");
    const tGrossMargin = await valueFromCard(page, "Gross Margin (%)");

    const metrics = {
      range: "today",
      revenue: parseNumber(tRevenue),
      orders: parseNumber(tOrders),
      grossProfit: parseNumber(tGrossProfit),
      grossMarginPercent: parsePercent(tGrossMargin),
    };

    // timestamped outputs
    const ts = new Date().toISOString();

    // stable "latest"
    const jsonLatest = path.join(OUT_DIR, "analytics-today-latest.json");
    const csvLatest = path.join(OUT_DIR, "analytics-today-latest.csv");
    fs.writeFileSync(jsonLatest, JSON.stringify({ ts, ...metrics }, null, 2));
    fs.writeFileSync(
      csvLatest,
      `ts,range,revenue,orders,grossProfit,grossMarginPercent\n${ts},today,${
        metrics.revenue ?? ""
      },${metrics.orders ?? ""},${metrics.grossProfit ?? ""},${
        metrics.grossMarginPercent ?? ""
      }\n`
    );
    console.log("🟢 latest JSON:", jsonLatest);
    console.log("🟢 latest CSV:", csvLatest);

    // line for n8n
    console.log("N8N_METRICS_JSON=" + JSON.stringify({ ts, ...metrics }));
  } catch (e) {
    console.error("❌", e);
    const err = path.join(OUT_DIR, `${stamp("analytics-today-error")}.png`);
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
