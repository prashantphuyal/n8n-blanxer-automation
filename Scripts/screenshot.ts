import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  await page.goto("https://google.com");

  // Type "Blanxer" into the search box and press Enter
  await page.fill('textarea[name="q"]', "Blanxer");
  await page.keyboard.press("Enter");

  // Wait for results to load
  await page.waitForSelector("#search");

  // Take screenshot
  await page.screenshot({ path: "google-blanxer.png", fullPage: true });

  await browser.close();
}

run();
