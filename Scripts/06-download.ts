// /scripts/06-download.ts
import { chromium } from "playwright";
import * as path from "path";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(
    "https://file-examples.com/index.php/sample-documents-download/sample-pdf-download/"
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: /Download sample pdf file/i })
      .first()
      .click(),
  ]);
  const filePath = path.join(process.cwd(), "sample.pdf");
  await download.saveAs(filePath);
  console.log("Saved:", filePath);
  await browser.close();
})();
