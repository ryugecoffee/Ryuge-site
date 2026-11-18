"use strict";

// The server's copy of src/lib/subscriptionPreference.js (the Render server does not ship src/): the same rules for
// the 珈琲の定期便 coffee preference, applied again on the server before anything is stored. A test keeps the two
// copies giving the same answers (server/coffee-subscription-backend.test.js).

const PREFERENCE_MAX_LENGTH = 300;

function normalizePreference(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    // Control characters and invisible direction/zero-width marks (kept out of what staff read).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Problems in a comment (empty array = it can be saved). Checked on the normalized text.
function preferenceIssues(text, max = PREFERENCE_MAX_LENGTH) {
  const value = normalizePreference(text);
  const issues = [];
  if ([...value].length > max) issues.push("TOO_LONG");
  const digits = value.replace(/[\s\-\u2010\u2011\u2013\u2014\u30FC\uFF0D]/g, "");
  if (/\d{13,19}/.test(digits)) issues.push("CARD_NUMBER");
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)) issues.push("EMAIL");
  if (/(?:\+?81|0)\d{1,4}[\s\-\u2010\u2011\u2013\u2014\u30FC\uFF0D]?\d{1,4}[\s\-\u2010\u2011\u2013\u2014\u30FC\uFF0D]?\d{3,4}/.test(value) && /\d{10,11}/.test(digits)) issues.push("PHONE");
  if (/https?:\/\/|www\./i.test(value)) issues.push("URL");
  return issues;
}

module.exports = { PREFERENCE_MAX_LENGTH, normalizePreference, preferenceIssues };
