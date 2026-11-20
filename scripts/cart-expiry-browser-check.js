const { chromium, devices } = require("playwright");
// Browser check of the cart's 30-minute rule (Playwright, simulated clock). Run against a local build:
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node scripts/cart-expiry-browser-check.js /tmp
// It never contacts the payment server or Stripe; it only reads and writes this browser's localStorage.
const BASE = process.env.BASE_URL || "http://localhost:4180";
const MIN = 60 * 1000;
const T0 = new Date("2026-11-20T03:00:00Z").getTime();
const ITEMS = JSON.stringify([{ id: "enma-jimma", name: "ジンマ", price: 1500, image: "", category: "enma", quantity: 2, promo: false }]);
const results = [];
const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

async function setup(browser, { touched, device, path = "/products", items = ITEMS } = {}) {
  const ctx = await browser.newContext({ ...(device ? devices[device] : { viewport: { width: 1280, height: 800 } }), locale: "ja-JP" });
  await ctx.clock.install({ time: T0 });
  // Seed only once per context (not again on reload).
  await ctx.addInitScript(({ items, touched }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("cart-items", items);
    if (touched !== null) localStorage.setItem("cart-touched-at", String(touched)); else localStorage.removeItem("cart-touched-at");
  }, { items, touched: touched === undefined ? T0 : touched });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.push("PAGEERROR " + e.message));
  await page.goto(BASE + path);
  await page.waitForTimeout(300);
  return { ctx, page };
}
const store = (page) => page.evaluate(() => ({ items: localStorage.getItem("cart-items"), touched: localStorage.getItem("cart-touched-at") }));
const count = (page) => page.locator(".cart-indicator").innerText();
const notice = (page) => page.locator(".cart-expiry-notice");

(async () => {
  const browser = await chromium.launch();

  // A. Boundary, 5-minute notice, countdown, extend, close, expiry (desktop)
  {
    const { ctx, page } = await setup(browser, {});
    ok("A0 cart restored", (await count(page)).includes("(2)"));
    await page.clock.fastForward(25 * MIN - 2000);
    ok("A1 no notice before 5 minutes left", (await notice(page).count()) === 0);
    await page.clock.fastForward(3000);
    const t1 = await notice(page).innerText().catch(() => "");
    ok("A2 notice at 5 minutes left, with mm:ss countdown", /あと 4:5\d/.test(t1) && /在庫の確保ではありません/.test(t1), t1.split("\n")[0]);
    await page.screenshot({ path: process.argv[2] + "/notice-desktop.png" });
    await page.getByRole("button", { name: "カートを30分延長する" }).click();
    const s1 = await store(page);
    ok("A3 extend: notice gone, time reset to now, items kept", (await notice(page).count()) === 0 && Math.abs(Number(s1.touched) - (T0 + 25 * MIN + 1000)) < 3000 && s1.items === ITEMS);
    await page.clock.fastForward(26 * MIN);
    ok("A4 after extend: 30 full minutes (notice again only near the new end)", (await notice(page).count()) === 1 && (await count(page)).includes("(2)"));
    await page.getByRole("button", { name: "閉じる" }).click();
    await page.clock.fastForward(2 * MIN);
    ok("A5 closed notice is not shown again in the same cycle", (await notice(page).count()) === 0);
    await page.clock.fastForward(3 * MIN);
    const s2 = await store(page);
    const t2 = await notice(page).innerText().catch(() => "");
    ok("A6 at 30:00 the cart is emptied, storage cleared, reason shown", !(await count(page)).includes("(") && s2.items === null && s2.touched === null && /30分が過ぎたため/.test(t2) && /在庫の確保ではありません/.test(t2));
    await page.getByRole("button", { name: "閉じる" }).click();
    ok("A7 the expiry message closes and stays closed", (await notice(page).count()) === 0);
    await ctx.close();
  }

  // B. 29:59 kept / 30:00 gone, by reload
  {
    const { ctx, page } = await setup(browser, { touched: T0 - (30 * MIN - 2000) });
    ok("B1 reload at 29:58 keeps the cart", (await count(page)).includes("(2)"));
    await ctx.close();
    const r = await setup(browser, { touched: T0 - 30 * MIN });
    const s = await store(r.page);
    ok("B2 reload at 30:00 empties it and says why", !(await count(r.page)).includes("(") && s.items === null && (await notice(r.page).innerText()).includes("30分が過ぎたため"));
    await r.ctx.close();
  }

  // C. A cart saved before the rule: its 30 minutes start at the first visit
  {
    const { ctx, page } = await setup(browser, { touched: null });
    const s = await store(page);
    ok("C1 legacy cart kept, clock started now", (await count(page)).includes("(2)") && Math.abs(Number(s.touched) - T0) < 2000, String(Number(s.touched) - T0) + " ms");
    await ctx.close();
  }

  // D. Coming back to the tab (timers may not have run in the background)
  {
    const { ctx, page } = await setup(browser, {});
    await page.evaluate((t) => localStorage.setItem("cart-touched-at", String(t)), T0 - 40 * MIN);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(200);
    ok("D1 tab return checks the time and empties an old cart", !(await count(page)).includes("("));
    await ctx.close();
  }

  // E. Two tabs: extending in one tab moves the other's clock; emptying in one empties the other
  {
    const { ctx, page } = await setup(browser, {});
    const other = await ctx.newPage();
    await other.goto(BASE + "/products");
    await page.clock.fastForward(26 * MIN);
    ok("E1 both tabs show the notice", (await notice(page).count()) === 1 && (await notice(other).count()) === 1);
    await other.getByRole("button", { name: "カートを30分延長する" }).click();
    await page.waitForTimeout(300);
    ok("E2 extending in tab 2 removes the notice in tab 1 (shared time)", (await notice(page).count()) === 0);
    await page.clock.fastForward(29 * MIN);
    ok("E3 tab 1 keeps the cart until the extended end", (await count(page)).includes("(2)"));
    await page.clock.fastForward(2 * MIN);
    await page.waitForTimeout(300);
    ok("E4 then both tabs are empty", !(await count(page)).includes("(") && !(await count(other)).includes("("));
    await ctx.close();
  }

  // F. Checkout protection: never emptied on /checkout, even with another tab open; leaving restarts the 30 minutes
  {
    const { ctx, page } = await setup(browser, { path: "/checkout" });
    const shop = await ctx.newPage();
    await shop.goto(BASE + "/products");
    await page.clock.runFor(75 * MIN); // time passing minute by minute, as it really does
    await page.waitForTimeout(300);
    const s1 = await store(page);
    ok("F1 75 minutes on /checkout: the cart is still stored (the shop tab did not empty it)", s1.items === ITEMS);
    ok("F2 no notice on /checkout", (await notice(page).count()) === 0);
    await shop.close();
    await page.reload();
    await page.waitForTimeout(300);
    ok("F3 reloading /checkout keeps the cart", (await store(page)).items === ITEMS);
    // Leave by a full page load (the worst case): the last minute on /checkout counts as the last change.
    await page.clock.fastForward(5 * MIN);
    await page.goto(BASE + "/products");
    await page.waitForTimeout(300);
    ok("F4 leaving /checkout keeps the cart", (await count(page)).includes("(2)"));
    await page.clock.fastForward(24 * MIN);
    ok("F5 …for 30 minutes from leaving (still there 24+ minutes later)", (await count(page)).includes("(2)"));
    await page.clock.fastForward(8 * MIN);
    ok("F6 …and emptied after that", !(await count(page)).includes("("));
    await ctx.close();
  }

  // G. Phone: the notice fits, no horizontal scroll, the consult button stays visible
  {
    const { ctx, page } = await setup(browser, { device: "iPhone 13" });
    await page.clock.fastForward(26 * MIN);
    const box = await notice(page).boundingBox();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ok("G1 phone: notice inside the screen, no horizontal scroll", box && box.x >= 0 && box.x + box.width <= 390 && !overflow, JSON.stringify(box));
    await page.screenshot({ path: process.argv[2] + "/notice-phone.png" });
    await ctx.close();
  }

  await browser.close();
  console.log(results.join("\n"));
  process.exitCode = results.some((r) => !r.startsWith("PASS")) ? 1 : 0;
})();
