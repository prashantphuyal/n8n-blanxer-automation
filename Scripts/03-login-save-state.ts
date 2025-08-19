// /scripts/03-login-save-state.ts
import { chromium } from "playwright";
import * as fs from "fs";

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://the-internet.herokuapp.com/login");
  await page.getByLabel("Username").fill("tomsmith");
  await page.getByLabel("Password").fill("SuperSecretPassword!");
  await page.getByRole("button", { name: "Login" }).click();

  // Wait for login success
  await page.getByText("You logged into a secure area!").waitFor();

  // Save cookies/localStorage to a file
  const state = await context.storageState();
  fs.writeFileSync("auth-state.json", JSON.stringify(state));
  await page.screenshot({ path: "secure-page.png", fullPage: true });

  await browser.close();
})();
