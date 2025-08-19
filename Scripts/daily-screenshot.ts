import "dotenv/config";
import { launchBrowser, safeGoto, snap } from "./helpers";

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const target = process.env.TARGET_URL || "https://blanxer.com";

  try {
    await safeGoto(page, target);
    await snap(page, "daily-screenshot");
  } catch (e) {
    console.error("Failed:", e);
    await snap(page, "daily-screenshot-error");
  } finally {
    await browser.close();
  }
})();
