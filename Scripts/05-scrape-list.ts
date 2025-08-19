// /scripts/05-scrape-list.ts
import { chromium } from "playwright";
import * as fs from "fs";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://news.ycombinator.com/");

  const items = await page.$$eval(".titleline > a", (links) =>
    links.slice(0, 10).map((a) => ({
      title: a.textContent || "",
      url: (a as HTMLAnchorElement).href,
    }))
  );

  fs.writeFileSync("hn-top10.json", JSON.stringify(items, null, 2));
  console.log("Saved hn-top10.json");

  // quick CSV
  const csv =
    "title,url\n" +
    items.map((i) => `"${i.title.replace(/"/g, '""')}",${i.url}`).join("\n");
  fs.writeFileSync("hn-top10.csv", csv);

  await browser.close();
})();
