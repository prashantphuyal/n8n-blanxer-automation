// scripts/blanxer-create-order.ts
import {
  chromium,
  type BrowserContext,
  type Page,
  type Locator,
} from "playwright";
import * as path from "path";
import { assertStockForItem } from "./blanxer-stock-helpers";

type OrderItem = {
  productName: string; // "Butterfly Spiral Crystal Heels"
  size?: string; // e.g. "37" (preferred for your table)
  variant?: string; // optional (for stores that use color/etc.)
  quantity?: number; // if the modal supports qty, else 1
};

type OrderRequest = {
  items: OrderItem[];
  customer: {
    phone: string; // used to search existing customer
    name?: string; // used if new customer
    email?: string; // used if new customer
    city?: string; // "City / District"
    address?: string;
    landmark?: string;
  };
  discount?: number; // flat amount
  deliveryCharge?: number;
  notes?: string; // "Order Note"
  payment: {
    status: "Unpaid" | "Full Paid" | "Partial Paid";
    amount?: number; // required if status === "Partial Paid"
  };
};

const PROFILE_DIR = path.join(process.cwd(), ".pw-chrome-profile");

// -------- helpers --------
function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function openCreateOrderFresh(page: Page) {
  // Always start from Orders and wait until the UI is idle
  await page.goto("https://app.blanxer.com/dashboard/orders", {
    waitUntil: "networkidle",
  });

  // Try direct Create Order first, then the More menu
  const createBtn = page.getByRole("button", { name: /create order/i });
  if (await createBtn.count()) {
    await createBtn.click();
  } else {
    await page.getByRole("button", { name: /more/i }).click();
    await page.getByRole("menuitem", { name: /create order/i }).click();
  }

  // Wait for the dialog
  const dialog = page.getByRole("dialog", { name: /create order/i });
  await dialog.waitFor({ timeout: 15000 });

  // If the "Search by phone" field is NOT visible, the modal has stale state.
  // Close + reopen to ensure a clean start.
  const hasSearch = await dialog
    .getByRole("textbox", { name: /search by phone/i })
    .count();
  if (!hasSearch) {
    await dialog
      .getByRole("button", { name: /cancel|close/i })
      .click()
      .catch(() => {});
    // reopen
    if (await createBtn.count()) {
      await createBtn.click();
    } else {
      await page.getByRole("button", { name: /more/i }).click();
      await page.getByRole("menuitem", { name: /create order/i }).click();
    }
    await page
      .getByRole("dialog", { name: /create order/i })
      .getByRole("textbox", { name: /search by phone/i })
      .waitFor({ timeout: 15000 });
  }
}

//  create customer

function onlyDigits(s: string) {
  return String(s || "").replace(/[^\d]/g, "");
}

// async function waitForSelectionInCustomerBlock(
//   dlg: Locator,
//   phone: string,
//   timeout = 12000
// ) {
//   const re = new RegExp(`\\b${phone}\\b`);
//   await dlg.getByText(re).first().waitFor({ timeout });
// }

// async function clearIfDifferentCustomerSelected(
//   dlg: Locator,
//   wantedPhone: string
// ) {
//   // If a different customer is already selected, click the small "x" beside the name
//   const selectedPhone = await dlg
//     .getByText(/\b\d{8,}\b/)
//     .first()
//     .textContent()
//     .catch(() => "");
//   if (selectedPhone && !selectedPhone.includes(wantedPhone)) {
//     const candidateXs = dlg.locator(
//       'button:has-text("×"), button:has-text("x"), [aria-label*="remove" i], [aria-label*="clear" i]'
//     );
//     if (await candidateXs.count()) {
//       // Avoid clicking the modal's top-right close; prefer the one near the "Customer" area.
//       const nearCustomer = candidateXs.first();
//       await nearCustomer.click().catch(() => {});
//       // Small wait so the UI unbinds previous customer
//       await dlg
//         .getByText(/\b\d{8,}\b/)
//         .first()
//         .waitFor({ state: "detached", timeout: 3000 })
//         .catch(() => {});
//     }
//   }
// }

// click → wait until not disabled/readonly (Mantine often toggles on focus)
async function focusAndEnablePhone(dlg: Locator, page: Page) {
  const phone = dlg.getByRole("textbox", { name: /Search by phone/i }).first();
  await phone.waitFor({ timeout: 15000 });

  for (let i = 0; i < 8; i++) {
    await phone.scrollIntoViewIfNeeded().catch(() => {});
    await phone.click({ force: true });
    const disabled = await phone.isDisabled();
    const aria = await phone.getAttribute("aria-disabled");
    const ro = await phone.getAttribute("readonly");
    if (!disabled && aria !== "true" && ro == null) return phone;
    await page.waitForTimeout(120);
  }
  throw new Error("Phone field never became editable after click.");
}

//   const dlg = page.getByRole("dialog", { name: /Create Order/i });
//   const want = digits(req.customer.phone);

//    // 1) Click to enable, then fill and search
//    const phone = await focusAndEnablePhone(dlg, page);
//    await phone.fill(want);

//   // Ensure the phone box is present
//   const phoneBox = dlg.getByRole("textbox", { name: /Search by phone/i });
//   await phoneBox.waitFor({ timeout: 15000 });

//   // If a different customer is pre-selected, clear it first
//   await clearIfDifferentCustomerSelected(dlg, want);

//   // Type phone & search
//   await phoneBox.fill(want);
//   await dlg.getByRole("button", { name: /Search Customer/i }).click();

//   // Outcomes:
//   //  A) Create Customer dialog appears
//   //  B) Customer auto-selected inline (phone appears under Customer)
//   //  C) A "Select Customer/Use Customer" button shows up (rare)
//   const createDlg = page.getByRole("dialog", { name: /Create Customer/i });
//   const selectBtn = dlg
//     .getByRole("button", { name: /Select Customer|Use Customer|Select/i })
//     .first();

//   // Wait for any outcome or inline selection text
//   const outcome = await Promise.race([
//     createDlg
//       .waitFor({ timeout: 8000 })
//       .then(() => "create")
//       .catch(() => null),
//     selectBtn
//       .waitFor({ timeout: 8000 })
//       .then(() => "select")
//       .catch(() => null),
//     waitForSelectionInCustomerBlock(dlg, want, 8000)
//       .then(() => "inline")
//       .catch(() => null),
//   ]);

//   if (outcome === "create") {
//     // Fill name (and optional email) then create
//     const fullName = req.customer.name || `Customer ${want}`;
//     await createDlg.getByRole("textbox", { name: /Full Name/i }).fill(fullName);
//     const emailBox = createDlg.getByRole("textbox", { name: /Email/i });
//     if (req.customer.email && (await emailBox.count())) {
//       await emailBox.fill(req.customer.email);
//     }
//     await createDlg
//       .getByRole("button", { name: /\+\s*Create Customer/i })
//       .click();
//     await createDlg.waitFor({ state: "detached", timeout: 15000 });
//     // After create, some UIs auto-bind; otherwise a "Select" may appear
//     if (await selectBtn.count()) await selectBtn.click().catch(() => {});
//     await waitForSelectionInCustomerBlock(dlg, want, 15000);
//   } else if (outcome === "select") {
//     await selectBtn.click();
//     await waitForSelectionInCustomerBlock(dlg, want, 10000);
//   } else if (outcome === "inline") {
//     // Already selected; nothing to do
//   } else {
//     // Try one gentle retry (UI debounce)
//     await dlg.getByRole("button", { name: /Search Customer/i }).click();
//     const retried = await Promise.race([
//       createDlg
//         .waitFor({ timeout: 5000 })
//         .then(() => "create")
//         .catch(() => null),
//       selectBtn
//         .waitFor({ timeout: 5000 })
//         .then(() => "select")
//         .catch(() => null),
//       waitForSelectionInCustomerBlock(dlg, want, 5000)
//         .then(() => "inline")
//         .catch(() => null),
//     ]);
//     if (!retried) {
//       // Aid debugging
//       await page
//         .screenshot({
//           path: `outputs/customer-search-stuck-${Date.now()}.png`,
//           fullPage: true,
//         })
//         .catch(() => {});
//       throw new Error(
//         "Customer search did not resolve to create/select/inline."
//       );
//     }
//     if (retried === "create") {
//       const fullName = req.customer.name || `Customer ${want}`;
//       await createDlg
//         .getByRole("textbox", { name: /Full Name/i })
//         .fill(fullName);
//       await createDlg
//         .getByRole("button", { name: /\+\s*Create Customer/i })
//         .click();
//       await createDlg.waitFor({ state: "detached", timeout: 15000 });
//     } else if (retried === "select") {
//       await selectBtn.click();
//     }
//     await waitForSelectionInCustomerBlock(dlg, want, 12000);
//   }

//   // Final safety: ensure the selected phone is visible and no "Select" button remains
//   await waitForSelectionInCustomerBlock(dlg, want, 8000);
//   if (await selectBtn.count()) {
//     await selectBtn.click().catch(() => {});
//   }

//   // Settle UI so nothing intercepts the next click (e.g., Add Products)
//   await page.keyboard.press("Escape").catch(() => {});
//   await page.keyboard.press("Escape").catch(() => {});
// }

//create customer is not there

export async function searchOrCreateCustomer(page: Page, req: OrderRequest) {
  const dlg = page.getByRole("dialog", { name: /Create Order/i });
  await dlg.waitFor({ timeout: 15000 });

  const want = onlyDigits(req.customer.phone);

  // 1) Click to enable, then fill and search
  const phone = await focusAndEnablePhone(dlg, page);
  await phone.fill(want);
  // Make sure the value actually stuck
  const v = await phone.inputValue().catch(() => "");
  if (v !== want) {
    await phone.fill("");
    await page.waitForTimeout(50);
    await phone.fill(want);
  }
  const searchBtn = dlg
    .getByRole("button", { name: /Search Customer/i })
    .first();
  await searchBtn.scrollIntoViewIfNeeded().catch(() => {});
  await searchBtn.click();

  // 2) Wait for one of the outcomes
  const createDlg = page.getByRole("dialog", { name: /Create Customer/i });
  const selectBtn = dlg
    .getByRole("button", { name: /Select Customer|Use Customer|Select/i })
    .first();
  const inlineSelected = dlg
    .getByText(new RegExp(`\\b${escapeRegex(want)}\\b`))
    .first();

  const outcome = await Promise.race([
    createDlg
      .waitFor({ timeout: 8000 })
      .then(() => "create")
      .catch(() => null),
    selectBtn
      .waitFor({ timeout: 8000 })
      .then(() => "select")
      .catch(() => null),
    inlineSelected
      .waitFor({ timeout: 8000 })
      .then(() => "inline")
      .catch(() => null),
  ]);

  // 3) Handle each path
  if (outcome === "create") {
    const fullName = req.customer.name || `Customer ${want}`;
    await createDlg.getByRole("textbox", { name: /Full Name/i }).fill(fullName);
    const emailBox = createDlg.getByRole("textbox", { name: /Email/i });
    if (req.customer.email && (await emailBox.count())) {
      await emailBox.fill(req.customer.email);
    }
    await createDlg
      .getByRole("button", { name: /\+\s*Create Customer/i })
      .click();
    await createDlg.waitFor({ state: "detached", timeout: 15000 });
  } else if (outcome === "select") {
    await selectBtn.click();
  } else if (outcome !== "inline") {
    // gentle retry if nothing fired (debounce)
    await searchBtn.click();
    await Promise.race([
      createDlg.waitFor({ timeout: 5000 }).catch(() => {}),
      selectBtn.waitFor({ timeout: 5000 }).catch(() => {}),
      inlineSelected.waitFor({ timeout: 5000 }).catch(() => {}),
    ]);
  }

  // 4) Final assert: phone should now be shown in the Customer block
  await inlineSelected.waitFor({ timeout: 12000 });
}

async function addProducts(page: Page, items: OrderItem[]) {
  const orderDlg = page.getByRole("dialog", { name: /Create Order/i });
  await orderDlg.getByRole("button", { name: /Add Products/i }).click();

  const picker = page.getByRole("dialog", { name: /Select Products/i });
  await picker.waitFor({ timeout: 15000 });

  // --- helpers ---------------------------------------------------------
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();

  async function selectedCount() {
    const btn = picker.getByRole("button", { name: /Confirm Select/i });
    const txt = (await btn.textContent()) || "";
    const m = txt.match(/\[(\d+)\]/);
    return m ? Number(m[1]) : 0;
  }

  async function ensureChecked(row: import("playwright").Locator) {
    await row.scrollIntoViewIfNeeded();
    const before = await selectedCount();

    // native checkbox → aria checkbox → click first cell → click row
    const nativeCb = row.locator('input[type="checkbox"]').first();
    if (await nativeCb.count()) {
      try {
        await nativeCb.check({ force: true });
      } catch {
        await nativeCb.click({ force: true });
      }
    } else {
      const ariaCb = row.getByRole("checkbox").first();
      if (await ariaCb.count()) {
        try {
          await ariaCb.check({ force: true });
        } catch {
          await ariaCb.click({ force: true });
        }
      } else {
        const firstCell = row
          .getByRole("cell")
          .first()
          .or(row.locator("td").first());
        if (await firstCell.count())
          await firstCell.click({ position: { x: 16, y: 16 } });
        else await row.click({ force: true });
      }
    }

    if ((await selectedCount()) <= before) {
      throw new Error(
        "Row did not toggle selection; selector may need tweaking."
      );
    }
  }

  // Find a row that has a cell whose **exact** text equals the size token
  async function findRowByAnyCellToken(token: string) {
    const rows = picker.getByRole("row");
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const r = rows.nth(i);

      // skip header rows
      if (await r.getByRole("columnheader").count()) continue;

      const cells = r.getByRole("cell").or(r.locator("td"));
      const c = await cells.count();
      if (!c) continue;

      for (let j = 0; j < c; j++) {
        const t = norm(
          (await cells
            .nth(j)
            .innerText()
            .catch(() => "")) || ""
        );
        if (t === token) return r;
      }
    }
    return null;
  }
  // --------------------------------------------------------------------

  for (const it of items) {
    // Narrow to product by name so only its sizes remain
    const search = picker
      .getByRole("textbox", { name: /Search products/i })
      .or(picker.getByPlaceholder(/Search products/i));
    await search.fill("");
    await search.click();
    await search.fill(it.productName);
    await page.waitForTimeout(300);

    // Ensure rows have rendered
    await picker.getByRole("row").first().waitFor({ timeout: 10000 });

    const token = (it.size ?? it.variant ?? "").toString().trim();
    const row = await findRowByAnyCellToken(token);

    if (!row) {
      await page.screenshot({
        path: `outputs/picker-not-found-${Date.now()}.png`,
        fullPage: true,
      });
      const dump = norm(await picker.innerText().catch(() => ""));
      console.log("PICKER_DUMP:", dump.slice(0, 2000));
      throw new Error(
        `Could not find size row "${token}" for "${it.productName}"`
      );
    }

    await ensureChecked(row);

    // Optional per-row quantity if supported
    if (it.quantity && it.quantity !== 1) {
      const qty = row
        .getByRole("spinbutton")
        .or(row.getByRole("textbox", { name: /Qty|Quantity/i }))
        .first();
      if (await qty.count()) await qty.fill(String(it.quantity));
    }
  }

  // Confirm and wait for dialog to close
  await picker.getByRole("button", { name: /Confirm Select/i }).click();
  await picker.waitFor({ state: "detached", timeout: 10000 });
  await orderDlg
    .getByText(items[0].productName, { exact: false })
    .first()
    .waitFor({ timeout: 10000 });
}

async function closeAnyOpenDropdown(page: Page) {
  const openList = page.locator(
    '[role="listbox"]:visible, [role="menu"]:visible'
  );
  if (await openList.count()) {
    // try Escape first
    await page.keyboard.press("Escape").catch(() => {});
    await openList.waitFor({ state: "hidden", timeout: 800 }).catch(() => {});
    // if still visible, click a safe spot inside the dialog to blur
    if (await openList.isVisible().catch(() => false)) {
      const safe = page
        .getByRole("dialog", { name: /Create Order/i })
        .getByText(/Order Note|Products|Customer|City\s*\/\s*District/i)
        .first();
      await safe.click().catch(() => {});
      await openList.waitFor({ state: "hidden", timeout: 800 }).catch(() => {});
    }
  }
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
function jaccard(a: string, b: string) {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size || 1;
  return inter / uni; // 0..1
}

/**
 * Select City/District for the *Create Order* dialog.
 * 1) exact match, 2) fuzzy (≥0.6), 3) DEFAULT_CITY env or "C1 – Unclassified (Automation)".
 * Returns the chosen option text.
 */
export async function selectCityWithFallback(
  page: Page,
  dlg: Locator,
  requested?: string
): Promise<string> {
  const DEFAULT_CITY =
    process.env.DEFAULT_CITY || "C1 – Unclassified (Automation)";

  // Open the field inside the dialog
  const combo = dlg
    .getByRole("combobox", { name: /City\s*\/\s*District/i })
    .or(dlg.getByRole("textbox", { name: /City\s*\/\s*District/i }))
    .first();

  await combo.scrollIntoViewIfNeeded();
  await combo.click();

  // Bind to THIS combobox's popup via aria-controls/aria-owns if present
  let popupId =
    (await combo.getAttribute("aria-controls")) ||
    (await combo.getAttribute("aria-owns")) ||
    null;

  let dropdown = popupId
    ? page.locator(`#${popupId}`)
    : page.locator('[role="listbox"]:visible, [role="menu"]:visible').first();

  // If the id node isn't the actual list (Mantine sometimes puts role on a child),
  // fall back to visible listbox/menu.
  if (
    !(await dropdown.count()) ||
    !(await dropdown.isVisible().catch(() => false))
  ) {
    dropdown = page
      .locator('[role="listbox"]:visible, [role="menu"]:visible')
      .first();
  }
  await dropdown.waitFor({ state: "visible", timeout: 5000 });

  // Collect only visible options INSIDE this dropdown
  const opts = dropdown.locator(
    '[role="option"]:visible, [data-combobox-option]:visible, [data-select-option]:visible'
  );
  const n = await opts.count();
  const items: { text: string; loc: Locator }[] = [];
  for (let i = 0; i < n; i++) {
    const loc = opts.nth(i);
    const text = (await loc.innerText().catch(() => "")).trim();
    if (text) items.push({ text, loc });
  }

  const wanted = (requested || "").trim();

  // 1) exact
  if (wanted) {
    const exact = items.find((it) => norm(it.text) === norm(wanted));
    if (exact) {
      await exact.loc.click();
      return exact.text;
    }

    // 2) fuzzy (word overlap)
    let best: { text: string; score: number; loc: Locator } | null = null;
    for (const it of items) {
      const score = jaccard(wanted, it.text);
      if (!best || score > best.score) best = { ...it, score };
    }
    if (best && best.score >= 0.6) {
      await best.loc.click();
      return best.text;
    }
  }

  // 3) default/fallback
  const def =
    items.find((it) => norm(it.text) === norm(DEFAULT_CITY)) ||
    items.find((it) => norm(it.text).includes(norm(DEFAULT_CITY)));
  if (def) {
    await def.loc.click();
    return def.text;
  }

  // last resort: first visible option
  if (items[0]) {
    await items[0].loc.click();
    return items[0].text;
  }

  throw new Error("Could not choose a City/District (no options visible).");
}

// const chosenCity = await selectCityWithFallback(page, dlg, undefined);

async function fillShippingAndPayment(page: Page, req: OrderRequest) {
  const dlg = page.getByRole("dialog", { name: /Create Order/i });

  // --- City / District with exact → fuzzy → default fallback ---
  const chosenCity = await selectCityWithFallback(page, dlg, req.customer.city);

  // Address + Landmark
  if (req.customer.address) {
    await dlg
      .getByRole("textbox", { name: "Address" })
      .fill(req.customer.address);
  }
  if (req.customer.landmark) {
    await dlg
      .getByRole("textbox", { name: "Landmark" })
      .fill(req.customer.landmark);
  }

  // If we had to fallback to another option, keep the raw city in the note
  if (
    req.customer.city &&
    chosenCity &&
    norm(req.customer.city) !== norm(chosenCity)
  ) {
    const note = dlg.getByRole("textbox", { name: /Order Note/i });
    if (await note.count()) {
      const prev = await note.inputValue().catch(() => "");
      await note.fill(
        `${prev ? prev + " | " : ""}RAW CITY: ${
          req.customer.city
        } → SELECTED: ${chosenCity}`
      );
    }
  }

  // Discounts / Delivery / Notes
  if (typeof req.discount === "number") {
    await dlg
      .getByRole("textbox", { name: "Discount" })
      .fill(String(req.discount));
  }
  if (typeof req.deliveryCharge === "number") {
    await dlg
      .getByRole("textbox", { name: "Delivery Charge" })
      .fill(String(req.deliveryCharge));
  }
  if (req.notes) {
    const note = dlg.getByRole("textbox", { name: /Order Note/i });
    if (await note.count()) await note.fill(req.notes);
  }

  // ----- Payment Status (scoped & dropdown-aware) -----
  // ----- Payment Status (only change if needed) -----
  const status = req.payment.status; // "Unpaid" | "Full Paid" | "Partial Paid"

  const payField = dlg
    .getByRole("textbox", { name: "Payment Status" })
    .or(dlg.getByRole("combobox", { name: /Payment Status/i }))
    .first();

  // read current value (Mantine uses an input-like)
  const currentStatus =
    (await payField.inputValue().catch(() => null)) ??
    ((await payField.textContent().catch(() => "")) || "");

  const cur = currentStatus.trim().toLowerCase();
  const want = status.trim().toLowerCase();

  if (cur !== want) {
    await payField.scrollIntoViewIfNeeded();
    await payField.click();

    // bind to the dropdown rendered for THIS combobox
    let popupId =
      (await payField.getAttribute("aria-controls")) ||
      (await payField.getAttribute("aria-owns")) ||
      null;

    let dropdown = popupId
      ? page.locator(`#${popupId}`)
      : page.locator('[role="listbox"]:visible, [role="menu"]:visible').first();

    // if the id node isn’t visible, fall back to first visible list
    if (!(await dropdown.isVisible().catch(() => false))) {
      dropdown = page
        .locator('[role="listbox"]:visible, [role="menu"]:visible')
        .first();
    }
    await dropdown.waitFor({ state: "visible", timeout: 3000 });

    const option = dropdown
      .getByRole("option", { name: new RegExp(`^\\s*${status}\\s*$`, "i") })
      .or(dropdown.getByText(new RegExp(`^\\s*${status}\\s*$`, "i")))
      .first();

    await option.click();

    // close any leftover dropdown/overlay so it won't block Create Order
    await closeAnyOpenDropdown(page);
  }

  if (status === "Partial Paid") {
    if (req.payment.amount == null)
      throw new Error("Partial Paid requires 'amount'");
    const amt = dlg
      .getByRole("textbox", { name: /Partial Payment Amount/i })
      .or(dlg.getByRole("spinbutton", { name: /Partial Payment Amount/i }))
      .first();
    await amt.fill(String(req.payment.amount));
  }
}
// Grab the order ID after we submit. Uses three strategies:
//  A) URL change to /orders/<id>
//  B) Reload Orders and search by phone/name, pick the newest (max id)
//  C) If list cells don’t have links, parse the first cell text for digits.

async function verifyAndGetOrderId(
  page: Page,
  req: OrderRequest
): Promise<{ orderId: string }> {
  const dlg = page.getByRole("dialog", { name: /Create Order/i });

  // submit and wait for modal to close
  await closeAnyOpenDropdown(page);
  await page.getByRole("button", { name: /Create Order/i }).click();
  await dlg.waitFor({ state: "detached", timeout: 20000 }).catch(() => {});

  // A) direct nav to /orders/<id>
  const nav = await page
    .waitForURL(/\/orders\/(\d+)/, { timeout: 4000 })
    .catch(() => null);
  if (nav) {
    const m = page.url().match(/\/orders\/(\d+)/);
    if (m) return { orderId: m[1] };
  }

  // B) go to orders list and search by phone (or name)
  const needle = (req.customer.phone || req.customer.name || "").trim();
  await page.goto("https://app.blanxer.com/dashboard/orders", {
    waitUntil: "networkidle",
  });

  // The search box shows "Search...." in your UI; use both role & placeholder fallbacks
  const search = page
    .getByRole("textbox", { name: /Search/i })
    .or(page.getByPlaceholder(/Search/i))
    .or(page.locator("input[placeholder^='Search']"))
    .first();

  if (needle) {
    await search.click();
    await search.fill(needle);
    await page.keyboard.press("Enter");
  }

  // Wait until a data row containing the phone (or name) appears
  const table = page.getByRole("table").first();
  const rowWithNeedle = table
    .getByRole("row")
    .filter({
      has: table.getByText(new RegExp(`\\b${escapeRegex(needle)}\\b`)),
    })
    .first();

  // If the phone column isn't searchable in ARIA, fall back to "first data row"
  await Promise.race([
    rowWithNeedle.waitFor({ timeout: 8000 }).catch(() => {}),
    table
      .getByRole("row")
      .nth(1)
      .waitFor({ timeout: 8000 })
      .catch(() => {}),
  ]);

  const row = (await rowWithNeedle.count())
    ? rowWithNeedle
    : table.getByRole("row").nth(1);

  // Prefer a link with digits; else read the first numeric-only cell
  const linkNum = row.getByRole("link", { name: /^\s*\d+\s*$/ }).first();
  let orderId: string | null = null;

  if (await linkNum.count()) {
    const txt = (await linkNum.innerText().catch(() => "")) || "";
    orderId = (txt.match(/\d+/) || [])[0] || null;
    // optional: click into details so we can read totals
    await linkNum.click().catch(() => {});
    await page.waitForURL(/\/orders\/\d+/, { timeout: 6000 }).catch(() => {});
    return { orderId: orderId! };
  }

  // no link → parse first cell that is just digits (your "#" column)
  const cells = row.getByRole("cell");
  const cellCount = await cells.count();
  for (let i = 0; i < cellCount; i++) {
    const txt = (
      (await cells
        .nth(i)
        .innerText()
        .catch(() => "")) || ""
    )
      .trim()
      .replace(/[^\d]/g, "");
    if (txt && /^\d+$/.test(txt)) {
      orderId = txt;
      break;
    }
  }

  if (orderId) {
    // try to click a link with that id if present, to collect totals
    const linkById = row
      .getByRole("link", { name: new RegExp(`^\\s*${orderId}\\s*$`) })
      .first();
    if (await linkById.count()) {
      await linkById.click().catch(() => {});
      await page
        .waitForURL(new RegExp(`/orders/${orderId}\\b`), { timeout: 6000 })
        .catch(() => {});
    }
    return { orderId };
  }

  // evidence for debugging
  await page
    .screenshot({
      path: `outputs/order-id-not-found-${Date.now()}.png`,
      fullPage: true,
    })
    .catch(() => {});
  throw new Error("Could not detect Order ID after creation.");
}

// async function ensureReadyToCreate(page: Page) {
//   const dlg = page.getByRole("dialog", { name: /Create Order/i });

//   // at least one product row or the "1 item" label
//   const hasItemRow = await dlg.getByRole("row").count();
//   const hasItemsBadge = await dlg.getByText(/\b\d+\s*item(s)?\b/i).count();
//   if (!hasItemRow && !hasItemsBadge) {
//     throw new Error("No products selected before submit.");
//   }

//   // City / District should be set (non-empty)
//   const cityField = dlg
//     .getByRole("combobox", { name: /City\s*\/\s*District/i })
//     .or(dlg.getByRole("textbox", { name: /City\s*\/\s*District/i }))
//     .first();

//   const cityVal =
//     (await cityField.inputValue().catch(() => "")) ||
//     (await cityField.textContent().catch(() => "")) ||
//     "";
//   if (!cityVal.trim()) throw new Error("City / District is empty.");
// } opens drawer but not working

// async function verifyAndGetOrderId(
//   page: Page,
//   req: OrderRequest
// ): Promise<{ orderId: string; total: string | null }> {
//   const dlg = page.getByRole("dialog", { name: /Create Order/i });

//   // 1) modal must be ready (items + city)
//   await ensureReadyToCreate(page);

//   // 2) be sure no dropdown is floating
//   await closeAnyOpenDropdown(page);

//   // 3) submit
//   await page.getByRole("button", { name: /Create Order/i }).click();

//   // modal closes or we navigate
//   await dlg.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});

//   // A) direct nav to /orders/<id>
//   const nav = await page
//     .waitForURL(/\/orders\/(\d+)/, { timeout: 4000 })
//     .catch(() => null);
//   if (nav) {
//     const m = page.url().match(/\/orders\/(\d+)/);
//     if (m) return { orderId: m[1], total: await readTotalSafe(page) };
//   }

//   // B) fallback: go to Orders list and search by phone/name
//   const needle = (req.customer.phone || req.customer.name || "").trim();
//   await page.goto("https://app.blanxer.com/dashboard/orders", {
//     waitUntil: "networkidle",
//   });

//   const search = page
//     .getByRole("textbox", { name: /Search/i })
//     .or(page.getByPlaceholder(/Search/i))
//     .first();
//   if (needle) {
//     await search.click();
//     await search.fill(needle);
//     await page.keyboard.press("Enter");
//     await page.waitForTimeout(300);
//   }

//   const table = page.getByRole("table").first();
//   await table.waitFor({ timeout: 10000 });

//   // prefer a row that includes the phone/name; otherwise first data row
//   let row = table
//     .getByRole("row")
//     .filter({ has: table.getByText(new RegExp(escapeRegex(needle), "i")) })
//     .first();
//   if (!(await row.count())) row = table.getByRole("row").nth(1); // row(0) is header

//   // try read ID from the first cell
//   let idText = (
//     (await row
//       .getByRole("cell")
//       .first()
//       .innerText()
//       .catch(() => "")) || ""
//   ).trim();
//   let orderId = (idText.match(/\d{3,}/) || [])[0] || null;

//   // if not visible, open the drawer and parse "#1234"
//   if (!orderId) {
//     const numberLink = row.getByRole("link", { name: /^\s*\d+\s*$/ }).first();
//     if (await numberLink.count()) await numberLink.click();
//     else
//       await row
//         .getByRole("cell")
//         .nth(1)
//         .click({ position: { x: 20, y: 20 } })
//         .catch(() => {});

//     const drawer = page
//       .locator('[role="dialog"], [class*="Drawer-root"]')
//       .last();
//     await drawer.waitFor({ timeout: 8000 }).catch(() => {});

//     const headerText =
//       (await drawer
//         .getByText(/^#\s*\d+$/)
//         .first()
//         .textContent()
//         .catch(() => null)) ||
//       (await drawer
//         .locator("h1,h2,h3")
//         .getByText(/^#\s*\d+$/)
//         .first()
//         .textContent()
//         .catch(() => null));
//     if (headerText) orderId = (headerText.match(/\d+/) || [])[0] || null;

//     const totalText =
//       (await drawer
//         .getByText(/Total\s*[:\-]?\s*(?:रू|Rs)\s*\d[\d,]*/i)
//         .first()
//         .textContent()
//         .catch(() => "")) || "";

//     // close drawer (don’t use Escape)
//     await page
//       .locator(
//         ".mantine-Drawer-overlay, .mantine-Modal-overlay, [class*='Overlay-root'], [data-overlay]"
//       )
//       .first()
//       .click()
//       .catch(() => {});

//     if (!orderId) throw new Error("Could not detect Order ID after creation.");
//     return { orderId, total: totalText || null };
//   }

//   // row had id already; try to also read the "Total Amount" column
//   let totalFromRow = "";
//   try {
//     const headers = table.getByRole("columnheader");
//     const count = await headers.count();
//     let totalCol = -1;
//     for (let i = 0; i < count; i++) {
//       const t = (
//         (await headers
//           .nth(i)
//           .innerText()
//           .catch(() => "")) || ""
//       ).toLowerCase();
//       if (t.includes("total amount")) {
//         totalCol = i;
//         break;
//       }
//     }
//     if (totalCol >= 0)
//       totalFromRow = await row.getByRole("cell").nth(totalCol).innerText();
//   } catch {}

//   return { orderId, total: totalFromRow || null };
// } opens drawer but not working

// async function submitAndRead(page: Page, req: OrderRequest) {
//   const dlg = page.getByRole("dialog", { name: /Create Order/i });

//   // Click create and wait for the modal to go away
//   await closeAnyOpenDropdown(page);
//   await page.getByRole("button", { name: /Create Order/i }).click();
//   await dlg.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});

//   // 1) Best case: app navigates to /orders/<id>
//   const nav = await page
//     .waitForURL(/\/orders\/(\d+)/, { timeout: 4000 })
//     .catch(() => null);
//   if (nav) {
//     const m = page.url().match(/\/orders\/(\d+)/);
//     if (m) return { orderId: m[1], total: await readTotalSafe(page) };
//   }

//   // 2) Fallback: we’re still on the list; refresh and find the new order
//   await page.goto("https://app.blanxer.com/dashboard/orders", {
//     waitUntil: "networkidle",
//   });

//   // Try to narrow by phone (best) or name
//   const needle = req.customer.phone || req.customer.name || "";
//   const search = page
//     .getByRole("textbox", { name: /Search/i })
//     .or(page.getByPlaceholder(/Search/i));
//   if (needle) {
//     await search.fill(needle);
//     await page.keyboard.press("Enter");
//     await page.waitForTimeout(400);
//   }

//   // Wait for at least one data row
//   const table = page.getByRole("table").first();
//   await table.waitFor({ timeout: 10000 });

//   // Prefer a row containing the needle, else take the first data row
//   let row = table
//     .getByRole("row")
//     .filter({ has: table.getByText(new RegExp(escapeRegex(needle), "i")) })
//     .first();

//   // Read the first cell for the order number (common layout)
//   const idCell = row.getByRole("cell").first();
//   const idText = ((await idCell.innerText().catch(() => "")) || "").trim();
//   let orderId = (idText.match(/\d+/) || [])[0] || null;

//   // If the list doesn’t expose the ID, open the row
//   if (!orderId) {
//     const linkNum = row.getByRole("link", { name: /\d+/ }).first();
//     if (await linkNum.count()) {
//       await linkNum.click();
//     } else {
//       await row.click({ position: { x: 20, y: 20 } }).catch(() => {});
//     }
//     await page.waitForURL(/\/orders\/(\d+)/, { timeout: 8000 }).catch(() => {});
//     const m = page.url().match(/\/orders\/(\d+)/);
//     if (m) orderId = m[1];
//   }

//   if (!orderId) throw new Error("Could not detect Order ID after creation.");
//   return { orderId, total: await readTotalSafe(page) };
// }

// async function submitAndRead(page: Page, req: OrderRequest) {
//   const dlg = page.getByRole("dialog", { name: /Create Order/i });

//   // Click create and wait for the modal to go away
//   await closeAnyOpenDropdown(page);
//   await page.getByRole("button", { name: /Create Order/i }).click();
//   await dlg.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});

//   // 1) Best case: app navigates to /orders/<id>
//   const nav = await page
//     .waitForURL(/\/orders\/(\d+)/, { timeout: 4000 })
//     .catch(() => null);
//   if (nav) {
//     const m = page.url().match(/\/orders\/(\d+)/);
//     if (m) return { orderId: m[1], total: await readTotalSafe(page) };
//   }

//   // 2) Fallback: we’re still on the list; refresh and find the new order
//   await page.goto("https://app.blanxer.com/dashboard/orders", {
//     waitUntil: "networkidle",
//   });

//   // Try to narrow by phone (best) or name
//   const needle = req.customer.phone || req.customer.name || "";
//   const search = page
//     .getByRole("textbox", { name: /Search/i })
//     .or(page.getByPlaceholder(/Search/i));
//   if (needle) {
//     await search.fill(needle);
//     await page.keyboard.press("Enter");
//     await page.waitForTimeout(400);
//   }

//   // Wait for at least one data row
//   const table = page.getByRole("table").first();
//   await table.waitFor({ timeout: 10000 });

//   // Prefer a row containing the needle, else take the first data row
//   let row = table
//     .getByRole("row")
//     .filter({ has: table.getByText(new RegExp(escapeRegex(needle), "i")) })
//     .first();

//   // Read the first cell for the order number (common layout)
//   const idCell = row.getByRole("cell").first();
//   const idText = ((await idCell.innerText().catch(() => "")) || "").trim();
//   let orderId = (idText.match(/\d+/) || [])[0] || null;

//   // If the list doesn’t expose the ID, open the row
//   if (!orderId) {
//     const linkNum = row.getByRole("link", { name: /\d+/ }).first();
//     if (await linkNum.count()) {
//       await linkNum.click();
//     } else {
//       await row.click({ position: { x: 20, y: 20 } }).catch(() => {});
//     }
//     await page.waitForURL(/\/orders\/(\d+)/, { timeout: 8000 }).catch(() => {});
//     const m = page.url().match(/\/orders\/(\d+)/);
//     if (m) orderId = m[1];
//   }

//   if (!orderId) throw new Error("Could not detect Order ID after creation.");
//   return { orderId, total: await readTotalSafe(page) };
// }

async function preflightStock(ctx: BrowserContext, items: OrderItem[]) {
  const stockPage = await ctx.newPage();
  try {
    // Land on Products so openProductDetail is always in the right app shell
    await stockPage.goto("https://app.blanxer.com/dashboard/products", {
      waitUntil: "networkidle",
    });

    for (const it of items) {
      const available = await assertStockForItem(
        stockPage,
        it.productName,
        it.size,
        it.variant
      );
      if (it.quantity && it.quantity > available) {
        throw new Error(
          `Requested ${it.quantity} > available ${available} for ${
            it.productName
          }${it.variant ? " (" + it.variant + ")" : ""}${
            it.size ? " " + it.size : ""
          }`
        );
      }
    }
  } finally {
    await stockPage.close().catch(() => {});
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// -------- main --------
// ===== IIFE START =====
(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
    slowMo: 80,
  });
  const page = await ctx.newPage();

  // Sanity poke the app; if redirected to login, pause so you can sign in once
  await page.goto("https://app.blanxer.com/dashboard", {
    waitUntil: "domcontentloaded",
  });
  if (/accounts\.google|login/i.test(page.url())) {
    console.log(
      "⚠️ Not logged in. Please sign in in this window, then press ▶ Resume in the Playwright Inspector."
    );
    await page.pause(); // only during testing
  }

  try {
    // `req` ONLY exists inside this block:
    const req: OrderRequest = JSON.parse(mustEnv("ORDER_JSON"));

    // 1) Stock pre-check
    await preflightStock(ctx, req.items);

    // 2) Create order
    await openCreateOrderFresh(page);
    await searchOrCreateCustomer(page, req);
    await addProducts(page, req.items);
    await fillShippingAndPayment(page, req);
    const result = await verifyAndGetOrderId(page, req);

    console.log(
      "N8N_ORDER_JSON=" +
        JSON.stringify({
          ok: true,
          orderId: result.orderId,
          items: req.items,
          customer: req.customer,
          payment: req.payment,
          notes: req.notes ?? null,
          ts: new Date().toISOString(),
        })
    );
  } catch (err: any) {
    console.error("ORDER_FAILED:", err?.message || err);
    console.log(
      "N8N_ORDER_JSON=" +
        JSON.stringify({ ok: false, error: String(err?.message || err) })
    );
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
})();
// ===== IIFE END =====
