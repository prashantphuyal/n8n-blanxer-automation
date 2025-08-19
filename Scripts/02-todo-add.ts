import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  await page.goto("https://demo.playwright.dev/todomvc");

  // Preferred locators: by placeholder/role/label
  await page
    .getByPlaceholder("What needs to be done?")
    .fill("I need to Learn this Playwright asap");
  await page.keyboard.press("Enter");

  // Simple check the item exists
  const firstItem = page.locator(".todo-list li").first();
  console.log("Item text:", await firstItem.textContent());

  await page.screenshot({ path: "todo-added.png", fullPage: true });
  await browser.close();
})();
