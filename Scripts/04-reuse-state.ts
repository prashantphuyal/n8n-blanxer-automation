// /scripts/04-reuse-state.ts
import { chromium } from "playwright";
import * as fs from "fs";

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync("auth-state.json", "utf8")),
  });
  const page = await context.newPage();

  await page.goto("https://the-internet.herokuapp.com/secure");
  await page.screenshot({ path: "secure-page.png", fullPage: true });
  await browser.close();
})();
