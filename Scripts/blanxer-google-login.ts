import { chromium, Page, Locator } from "playwright";
import * as fs from "fs";
import * as path from "path";

const PROFILE_DIR = path.join(process.cwd(), ".pw-chrome-profile"); // Playwright will create it

async function clickIfVisible(l: Locator) {
  if (await l.isVisible().catch(() => false)) {
    await l.click();
    return true;
  }
  return false;
}

(async () => {
  // Launch your installed Chrome, visible window, with automation flags removed
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome", // real Chrome
    headless: false,
    slowMo: 250,
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = await context.newPage();

  try {
    // FIRST: make Google happy by logging into Accounts in this profile
    await page.goto("https://accounts.google.com/", {
      waitUntil: "domcontentloaded",
    });
    console.log(
      "🔐 If you see the sign-in page, complete it manually. Then click ▶ Resume."
    );
    await page.pause(); // do the Google login once in this Chrome profile

    // NOW go to your site and use “Continue with Google”
    await page.goto("https://www.blanxer.com/", {
      waitUntil: "domcontentloaded",
    });

    // Try to open the login
    const openedLogin =
      (await clickIfVisible(
        page.getByRole("button", { name: /login|sign in/i })
      )) ||
      (await clickIfVisible(
        page.getByRole("link", { name: /login|sign in/i })
      )) ||
      (await clickIfVisible(page.getByText(/login|sign in/i)));

    if (!openedLogin) {
      console.log(
        "⚠️ I couldn’t find a Login control. Open it yourself, then ▶ Resume."
      );
      await page.pause();
    }

    // Click the Google button or do it manually if selectors differ
    const clickedGoogle =
      (await clickIfVisible(
        page.getByRole("button", {
          name: /google|continue with google|sign in with google/i,
        })
      )) ||
      (await clickIfVisible(
        page.getByText(/continue with google|sign in with google/i)
      ));

    if (!clickedGoogle) {
      console.log(
        "⚠️ I couldn’t find the Google button. Click it yourself, complete the flow, then ▶ Resume."
      );
      await page.pause();
    }

    // Wait until you’re back and logged in
    await page.waitForLoadState("networkidle");

    // Save session for future headless runs
    const statePath = path.join(process.cwd(), "blanxer-state.json");
    fs.writeFileSync(
      statePath,
      JSON.stringify(await context.storageState(), null, 2)
    );
    console.log("✅ Saved session:", statePath);
  } finally {
    await context.close();
  }
})();
