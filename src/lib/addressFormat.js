// A delivery address, put together once from its parts (2026-11-21). Used by the checkout's completion page, the
// payment server's order mails (server/index.js) and the shop's shipping page, so every place shows the same thing:
//   〒730-0011
//   広島県 広島市中区基町1-2-3
//   ○○マンション101
// Each part has one owner: the prefecture comes from its own field, line 1 is 市区町村・番地, line 2 is 建物名・部屋番号.
// Nothing the customer typed is ever dropped. Text is only left out where the very same text is already shown:
//  - the prefecture is not put in front again when line 1 already starts with it;
//  - line 2 is not repeated when line 1 already ends with exactly the same text (browser autofill often puts the
//    building into line 1 as well); line 1 is then shown without that ending, which stays on its own line.
// International addresses keep their earlier one-line form.

const clean = (v) => String(v ?? "").replace(/[\s\u3000]+/g, " ").trim();
const squash = (v) => clean(v).replace(/ /g, "");

function postalText(postalCode) {
  const digits = String(postalCode ?? "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, "");
  if (digits.length === 7) return `〒${digits.slice(0, 3)}-${digits.slice(3)}`;
  return clean(postalCode) ? `〒${clean(postalCode)}` : "";
}

// Line 1 without a trailing copy of line 2 (compared without spaces); null when line 1 does not end with it.
function withoutTrailing(line1, line2) {
  const target = squash(line2);
  if (!target || squash(line1) === target || !squash(line1).endsWith(target)) return null;
  for (let i = 0; i < line1.length; i += 1) {
    if (squash(line1.slice(i)) === target) return clean(line1.slice(0, i));
  }
  return null;
}

export function domesticAddressLines({ postalCode, prefecture, line1, line2, address } = {}) {
  const pref = clean(prefecture);
  // Older checkouts sent one string (often already starting with the prefecture) instead of the two lines.
  let first = clean(line1 ?? address);
  let second = line1 === undefined ? "" : clean(line2);
  if (second && squash(first) === squash(second)) second = "";
  else if (second) first = withoutTrailing(first, second) ?? first;
  const head = pref && !squash(first).startsWith(squash(pref)) ? pref : "";
  return [postalText(postalCode), [head, first].filter(Boolean).join(" "), second].filter(Boolean);
}

export function internationalAddressText({ address, line1, line2, city, stateProvince, postalCode, countryName, countryCode } = {}) {
  const street = clean(line1) ? [clean(line1), clean(line2)].filter(Boolean).join(", ") : clean(address);
  return [street, clean(city), clean(stateProvince), clean(postalCode), clean(countryName) || clean(countryCode)].filter(Boolean).join(", ");
}

// The address as text: lines joined by "\n" (Japan) or the one international line.
export function addressText(parts = {}) {
  const country = String(parts.countryCode || "JP").toUpperCase();
  return country === "JP" ? domesticAddressLines(parts).join("\n") : internationalAddressText(parts);
}

// A Japanese phone number for delivery: 0 + 9–10 digits (hyphens, spaces and brackets allowed; +81 accepted).
// Returns the number as typed (tidied) or null when it is not one.
export function japanesePhone(value) {
  const raw = String(value ?? "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[ー−‐－]/g, "-").trim();
  const digits = raw.replace(/^\+81[\s-]?/, "0").replace(/[\s()-]/g, "");
  if (!/^0\d{9,10}$/.test(digits)) return null;
  return raw.replace(/\s+/g, "");
}

// What staff see when an order has no phone (older domestic orders were not asked for one): never a made-up number.
export const PHONE_MISSING = { ja: "未登録", en: "Not provided", es: "No registrado" };
