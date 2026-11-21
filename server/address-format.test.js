"use strict";

// 2026-11-21: addresses put together once (src/lib/addressFormat.js): no prefecture or building twice, nothing dropped.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "addressFormat.js")).href);

test("Japan: 〒 / prefecture + line 1 / building — each part once", async () => {
  const a = await load();
  const base = { postalCode: "7300011", prefecture: "広島県", line1: "広島市中区基町1-2-3", line2: "リュウゲマンション101" };
  assert.deepEqual(a.domesticAddressLines(base), ["〒730-0011", "広島県 広島市中区基町1-2-3", "リュウゲマンション101"]);
  // The reported mail: the prefecture in the field and again in line 1 → once.
  assert.deepEqual(a.domesticAddressLines({ ...base, line1: "広島県広島市中区基町1-2-3" })[1], "広島県広島市中区基町1-2-3");
  // Autofill put the building into line 1 as well → shown once, on its own line, nothing else removed.
  assert.deepEqual(a.domesticAddressLines({ ...base, line1: "広島市中区基町1-2-3 リュウゲマンション101" }),
    ["〒730-0011", "広島県 広島市中区基町1-2-3", "リュウゲマンション101"]);
  assert.deepEqual(a.domesticAddressLines({ ...base, line1: "広島市中区基町1-2-3リュウゲマンション　101", line2: "リュウゲマンション 101" }).slice(1),
    ["広島県 広島市中区基町1-2-3", "リュウゲマンション 101"]);
  // The same text typed twice → once.
  assert.deepEqual(a.domesticAddressLines({ ...base, line1: "リュウゲマンション101" }).slice(1), ["広島県 リュウゲマンション101"]);
  // A building name that only appears inside line 1 (not at its end) is never cut out of it.
  assert.deepEqual(a.domesticAddressLines({ ...base, line1: "広島市中区101番地", line2: "101" }).slice(1), ["広島県 広島市中区101番地", "101"]);
  // No building, no postal code: just what there is.
  assert.deepEqual(a.domesticAddressLines({ prefecture: "東京都", line1: "千代田区1-1" }), ["東京都 千代田区1-1"]);
  // Older checkouts sent one string that already started with the prefecture.
  assert.equal(a.addressText({ postalCode: "7300011", prefecture: "広島県", address: "広島県 広島市中区基町1-2-3 リュウゲマンション101" }),
    "〒730-0011\n広島県 広島市中区基町1-2-3 リュウゲマンション101");
  // Every character the customer typed is still there.
  for (const parts of [base, { ...base, line1: "広島市中区基町1-2-3 リュウゲマンション101" }]) {
    const text = a.addressText(parts).replace(/\s/g, "");
    for (const piece of ["7300011".slice(0, 3), "広島県", "広島市中区基町1-2-3", "リュウゲマンション101"]) assert.ok(text.includes(piece), piece);
  }
});

test("international addresses keep their one-line form", async () => {
  const a = await load();
  assert.equal(a.addressText({ countryCode: "TW", line1: "No. 1, Sec. 1", line2: "Apt 2", city: "Taipei", stateProvince: "", postalCode: "100", countryName: "Taiwan" }),
    "No. 1, Sec. 1, Apt 2, Taipei, 100, Taiwan");
  assert.equal(a.addressText({ countryCode: "SG", address: "1 Orchard Rd", city: "Singapore", postalCode: "238801", countryName: "Singapore" }), "1 Orchard Rd, Singapore, 238801, Singapore");
});

test("Japanese phone numbers for delivery: 0 + 9–10 digits; +81 and full-width accepted; nothing invented", async () => {
  const a = await load();
  for (const ok of ["090-1234-5678", "09012345678", "03-1234-5678", "(082) 123-4567", "+81 90-1234-5678", "０９０−１２３４−５６７８"]) assert.ok(a.japanesePhone(ok), ok);
  for (const bad of ["", "1234", "90-1234-5678", "090-1234-56789", "abc", "0120-12-34x"]) assert.equal(a.japanesePhone(bad), null, bad);
  assert.deepEqual(a.PHONE_MISSING, { ja: "未登録", en: "Not provided", es: "No registrado" });
});
