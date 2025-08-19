import { Page } from "playwright";

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function openProductDetail(page: Page, searchTerm: string) {
  // Always land on the Products list first (avoid about:blank/stale pages)
  await page.goto("https://app.blanxer.com/dashboard/products", {
    waitUntil: "networkidle",
  });

  // Search box can be a textbox with label or placeholder
  const searchBox = page
    .getByRole("textbox", { name: /search/i })
    .or(page.getByPlaceholder(/search/i));
  await searchBox.click();
  await searchBox.fill(searchTerm);
  // Give the table a moment to refresh (debounced search UIs)
  await page.waitForTimeout(300);

  // Open the product detail (either by name link or "for N variants" link)
  const byName = page
    .getByRole("link", { name: new RegExp(escapeRegex(searchTerm), "i") })
    .first();
  if (await byName.count()) {
    await byName.click();
  } else {
    await page
      .getByText(/for\s+\d+\s+variants/i)
      .first()
      .click();
  }

  // On the variant table, wait until Quantity/SKU/rows are present
  await page
    .getByRole("cell", { name: /Quantity/i })
    .or(page.getByText(/SKU/i))
    .first()
    .waitFor({ timeout: 15000 });
}

export async function readVariantQty(
  page: Page,
  opts: { size?: string; variant?: string }
): Promise<number | null> {
  let row = page.getByRole("row");
  if (opts.size)
    row = row.filter({
      has: page.getByText(new RegExp(`\\b${escapeRegex(opts.size)}\\b`, "i")),
    });
  if (opts.variant)
    row = row.filter({
      has: page.getByText(
        new RegExp(`\\b${escapeRegex(opts.variant)}\\b`, "i")
      ),
    });
  row = row.filter({ has: page.getByRole("cell") });

  if (!(await row.count())) return null;
  const r = row.first();

  const qty = r
    .getByRole("spinbutton")
    .first()
    .or(r.locator('input[type="number"]'))
    .or(r.getByRole("textbox").first());

  if (!(await qty.count())) return null;

  let val = await qty
    .inputValue()
    .catch(async () =>
      qty
        .evaluate((el: any) => (el?.value ?? el?.textContent) as string)
        .catch(() => null)
    );
  if (!val) return null;

  const n = Number(String(val).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export async function assertStockForItem(
  page: Page,
  productName: string,
  size?: string,
  variant?: string
): Promise<number> {
  await openProductDetail(page, productName);
  const qty = await readVariantQty(page, { size, variant });
  if (qty == null)
    throw new Error(
      `Variant row not found for "${productName}" ${
        variant ? `(${variant})` : ""
      } ${size ?? ""}`
    );
  if (qty <= 0)
    throw new Error(
      `Out of stock for "${productName}" ${variant ? `(${variant})` : ""} ${
        size ?? ""
      }`
    );
  return qty;
}
