// 珈琲の定期便: the store's side of the sign-up confirmation (/subscription/apply) and the customer's page
// (/subscription/manage). The payment server decides everything; this only calls it and keeps the 30-minute session
// in this tab (sessionStorage), never in the URL.
import { PAYMENT_API_BASE } from "./paymentEnv.js";

const SESSION_KEY = "ryuge-coffee-sub-session";
const ACCOUNT = `${PAYMENT_API_BASE}/coffee-subscription/account`;

export const MONTHLY_PRICES = { 1: 3000, 2: 5800, 3: 8550, 4: 11200 };
export const FIRST_PRICE = 3000;
export const SHIPPING_DAYS = { 1: [5], 2: [5, 20], 3: [5, 15, 25], 4: [5, 12, 19, 26] };
export const CHANGE_DEADLINE_DAY = 25;

export const yen = (n) => `${Number(n).toLocaleString("ja-JP")}円`;
export const monthLabel = (key) => { const [y, m] = String(key).split("-").map(Number); return `${y}年${m}月`; };
export const dateLabel = (key) => { const [y, m, d] = String(key).split("-").map(Number); return `${y}年${m}月${d}日`; };
export const shortDate = (key) => { const [, m, d] = String(key).split("-").map(Number); return `${m}/${d}`; };

// The month whose 1st starts the monthly charge (the same rule as the server: 1st–15th → next month, 16th– → the month
// after, in Japan time). Shown on the confirmation screen; the server's own answer is checked before going to payment.
export function startMonthFor(at = Date.now()) {
  const d = new Date(new Date(at).getTime() + 9 * 3600 * 1000);
  const index = d.getUTCFullYear() * 12 + d.getUTCMonth() + (d.getUTCDate() <= 15 ? 1 : 2);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `r-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

export const session = {
  get() { try { const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); return s && Date.parse(s.expiresAt) > Date.now() ? s : null; } catch { return null; } },
  set(value) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); } catch { /* private mode: the page still works until reload */ } },
  clear() { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing kept */ } },
};

async function request(method, url, body, token) {
  let res;
  try {
    res = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
  } catch {
    return { status: 0, body: { error: "NETWORK" } };
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, body: data || (res.status === 404 ? { error: "UNAVAILABLE" } : { error: "FAILED" }) };
}

export const accountApi = {
  login: (email) => request("POST", `${ACCOUNT}/login`, { email }),
  startSession: (token) => request("POST", `${ACCOUNT}/session`, { token }),
  call: (method, path, body) => request(method, `${ACCOUNT}${path}`, body, session.get()?.sessionToken),
};

export const signUp = (input) => request("POST", `${PAYMENT_API_BASE}/coffee-subscription/checkout`, input);

// What the customer reads for each answer of the server.
export const ERROR_TEXT = {
  UNAVAILABLE: "現在、この機能はご利用いただけません。",
  NETWORK: "通信できませんでした。電波の状況をご確認のうえ、もう一度お試しください。",
  FAILED: "処理できませんでした。時間をおいてもう一度お試しください。",
  RATE_LIMITED: "短時間に操作が続いたため、しばらくお待ちください。",
  EMAIL_REQUIRED: "メールアドレスを正しく入力してください。",
  LOGIN_LINK_INVALID: "ログインリンクが正しくありません。もう一度メールを送信してください。",
  LOGIN_LINK_USED: "このログインリンクはすでに使われています。もう一度メールを送信してください。",
  LOGIN_LINK_EXPIRED: "ログインリンクの有効期限（15分）が過ぎました。もう一度メールを送信してください。",
  SIGN_IN_REQUIRED: "ログインしてください。",
  SESSION_EXPIRED: "ログインの有効期限（30分）が過ぎました。もう一度ログインしてください。",
  CHANGE_DEADLINE_PASSED: "この月の変更締切（前月25日）を過ぎています。",
  NOT_SKIPPED: "この月はスキップしていません。",
  INVALID_FREQUENCY: "配送回数は月1〜4回から選んでください。",
  SUBSCRIPTION_ENDING: "解約のお手続き済み、または終了した定期便は変更できません。",
  SUBSCRIPTION_ENDED: "終了した定期便は変更できません。",
  UNDER_REVIEW: "この定期便は確認中のため変更できません。お問い合わせください。",
  REQUEST_IN_PROGRESS: "前の操作を処理中です。少しお待ちください。",
  CANCEL_CHANGED: "解約の条件が変わりました（請求の時刻を過ぎた等）。内容をもう一度ご確認ください。",
  PORTAL_NOT_CONFIGURED: "お支払い方法の変更は準備中です。お問い合わせください。",
  PREFERENCE_TOO_LONG: "ご希望は300文字以内で入力してください。",
  PREFERENCE_EMAIL: "ご希望欄にメールアドレスは書かないでください。",
  PREFERENCE_PHONE: "ご希望欄に電話番号は書かないでください。",
  PREFERENCE_CARD_NUMBER: "ご希望欄にカード番号などは書かないでください。",
  PREFERENCE_URL: "ご希望欄にURLは書かないでください。",
  ADDRESS_NAME: "お名前を入力してください（60文字以内）。",
  ADDRESS_POSTAL_CODE: "郵便番号を7桁で入力してください。",
  ADDRESS_PREFECTURE: "都道府県を選んでください。",
  ADDRESS_CITY: "市区町村を入力してください。",
  ADDRESS_LINE1: "番地を入力してください。",
  ADDRESS_LINE2: "建物名・部屋番号は100文字以内で入力してください。",
  ADDRESS_PHONE: "電話番号を正しく入力してください（日本国内の番号）。",
  ALREADY_SUBSCRIBED: "このメールアドレスでは、すでに定期便をご利用中です。管理ページからご確認ください。",
  SIGNUP_IN_PROGRESS: "お申し込みの準備中です。少し待ってからもう一度お試しください。",
};
export const errorText = (code) => ERROR_TEXT[code] || ERROR_TEXT.FAILED;

export const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
  "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府",
  "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];
