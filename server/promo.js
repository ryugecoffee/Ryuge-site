"use strict";

// Promotional beans: at most 2 bags per customer across orders (CEO, 2026-11-17).
// A customer is recognised by the e-mail address and by the delivery address; either one reaching the limit refuses
// the order, so a second order (or a new e-mail address to the same home) does not get around it. Only SHA-256 hashes
// are stored (promoLedger/{hash} = { held, bought }); held bags count until the payment is settled or released, in the
// same Firestore transaction as the stock (server/inventory.js), so two orders at the same moment cannot both pass.
const crypto = require("node:crypto");

const nfkc = (value) => String(value || "").normalize("NFKC").trim().toLowerCase();

function normalizeEmail(email) {
  const value = nfkc(email);
  const match = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(value);
  if (!match) return "";
  let [, local, domain] = match;
  local = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return local ? `${local}@${domain}` : "";
}

function normalizeAddress(countryCode, postalCode, address) {
  const postal = nfkc(postalCode).replace(/[^0-9a-z]/g, "");
  const street = nfkc(address).replace(/[\s\-‐‑‒–—―ー－、，,。.・#'"/]/g, "");
  if (!postal || street.length < 4) return "";
  return `${nfkc(countryCode) || "jp"}|${postal}|${street}`;
}

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

function promoKeys({ email, countryCode, postalCode, address }) {
  const keys = [];
  const mail = normalizeEmail(email);
  if (mail) keys.push(hash(`promo-email:${mail}`));
  const home = normalizeAddress(countryCode, postalCode, address);
  if (home) keys.push(hash(`promo-address:${home}`));
  return keys;
}

module.exports = { normalizeEmail, normalizeAddress, promoKeys };
