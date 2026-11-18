// The free-text coffee preference a subscriber may leave (珈琲の好み・ご希望). Pure functions, shared by the page now
// and by the server when sign-ups reopen, so the browser and the server apply the same rules.
//  - optional: an empty comment is fine;
//  - at most MAX characters, control characters removed, at most two blank lines in a row;
//  - personal or payment details (card numbers, email addresses, phone numbers) and links are refused, so they are
//    never stored next to the subscription or shown to the people preparing shipments.

export const PREFERENCE_MAX_LENGTH = 300;

export function normalizePreference(text) {
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
export function preferenceIssues(text, max = PREFERENCE_MAX_LENGTH) {
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

export const PREFERENCE_ISSUE_TEXT = {
  ja: {
    TOO_LONG: `${PREFERENCE_MAX_LENGTH}文字以内でご記入ください。`,
    CARD_NUMBER: "カード番号のような数字が含まれています。決済情報は書かないでください。",
    EMAIL: "メールアドレスが含まれています。個人情報は書かないでください。",
    PHONE: "電話番号のような数字が含まれています。個人情報は書かないでください。",
    URL: "リンク（URL）は書かないでください。",
  },
  en: {
    TOO_LONG: `Please keep it within ${PREFERENCE_MAX_LENGTH} characters.`,
    CARD_NUMBER: "This looks like a card number. Please do not write payment details.",
    EMAIL: "This contains an email address. Please do not write personal details.",
    PHONE: "This looks like a phone number. Please do not write personal details.",
    URL: "Please do not include links.",
  },
  es: {
    TOO_LONG: `Máximo ${PREFERENCE_MAX_LENGTH} caracteres.`,
    CARD_NUMBER: "Parece un número de tarjeta. No escribas datos de pago.",
    EMAIL: "Contiene un correo electrónico. No escribas datos personales.",
    PHONE: "Parece un número de teléfono. No escribas datos personales.",
    URL: "No incluyas enlaces.",
  },
};
