import "dotenv/config";
import {
  launchBrowserLive,
  safeGoto,
  snap,
  ensureDir,
  OUTPUT_DIR,
  stamp,
} from "./helpers";
import * as fs from "fs";
import * as path from "path";

(async () => {
  const browser = await launchBrowserLive();
  const page = await browser.newPage();

  const query = "Blanxer"; // <— change this anytime

  try {
    await safeGoto(page, "https://www.google.com/");
    await page.fill('textarea[name="q"]', query);
    await page.keyboard.press("Enter");
    await page.waitForSelector("#search");

    // Grab top results
    const results = await page.$$eval("#search a[href]", (as) => {
      const items: { title: string; url: string }[] = [];
      for (const a of as.slice(0, 10)) {
        const t = (a.textContent || "").trim();
        const u = (a as HTMLAnchorElement).href;
        if (t && u && !u.startsWith("https://webcache.googleusercontent.com")) {
          items.push({ title: t, url: u });
        }
      }
      return items;
    });

    // Save CSV
    ensureDir();
    const csv =
      "title,url\n" +
      results
        .map((r) => `"${r.title.replace(/"/g, '""')}",${r.url}`)
        .join("\n");
    const file = path.join(OUTPUT_DIR, `${stamp(`google-${query}`)}.csv`);
    fs.writeFileSync(file, csv);
    console.log("📝 Saved", file);

    await snap(page, `google-${query}`);
  } catch (e) {
    console.error("Failed:", e);
    await snap(page, "search-error");
  } finally {
    await browser.close();
  }
})();
