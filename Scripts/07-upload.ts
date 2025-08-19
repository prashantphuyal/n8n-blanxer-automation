// /scripts/07-upload.ts
import { chromium } from "playwright";
import * as fs from "fs";

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage();
  await page.goto("https://the-internet.herokuapp.com/upload");

  // create a temp file to upload
  const path = "hello.txt";
  fs.writeFileSync(path, "Hello from Playwright!");
  await page.setInputFiles("#file-upload", path);
  await page.click("#file-submit");

  await page.getByText("File Uploaded!").waitFor();
  try {
    await page.screenshot({ path: "Uploaded.png", fullPage: true });
  } catch (err) {
    await page.screenshot({ path: "error.png", fullPage: true });
    console.error("Failed:", err);
  }
  await browser.close();
})();
