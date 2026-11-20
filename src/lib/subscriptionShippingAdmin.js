// 珈琲の定期便 ④: the shop's shipping page (/admin/subscription-shipping). It only calls the payment server
// (server/coffee-subscription-fulfillment.js), which checks the staff member's session on every request. Staff sign in
// by a link mailed to their listed address; the 2-hour session is kept in this tab only (sessionStorage), never in the
// URL or in localStorage, and signing out ends it on the server.
import { PAYMENT_API_BASE } from "./paymentEnv.js";
import { PRODUCT_DATA } from "../productData.js";

const SESSION_KEY = "ryuge-shipping-staff-session";
const BASE = `${PAYMENT_API_BASE}/internal/coffee-subscription/fulfillment`;

export const staffSession = {
  get() { try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); return v && Date.parse(v.expiresAt) > Date.now() ? v : null; } catch { return null; } },
  set(value) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); } catch { /* private mode: kept until reload */ } },
  clear() { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing kept */ } },
};

export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `r-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

async function request(method, path, body) {
  const token = staffSession.get()?.sessionToken;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
  } catch {
    return { status: 0, body: { error: "NETWORK" } };
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, body: data || { error: res.status === 404 ? "UNAVAILABLE" : "FAILED" } };
}

export const shippingApi = {
  login: (email) => request("POST", "/auth/login", { email }),
  startSession: (token) => request("POST", "/auth/session", { token }),
  signOut: () => request("DELETE", "/auth/session"),
  work: (from, to) => request("GET", `/work?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  label: (shipmentId) => request("GET", `/label/${encodeURIComponent(shipmentId)}`),
  prepare: (body) => request("POST", "/prepare", body),
  ship: (body) => request("POST", "/ship", body),
  hold: (body) => request("POST", "/hold", body),
  resume: (body) => request("POST", "/resume", body),
  emailCancelPreview: (body) => request("POST", "/email-cancel/preview", body),
  emailCancel: (body) => request("POST", "/email-cancel", body),
};

// The time the customer's email arrived, entered as Japan time (<input type="datetime-local">), sent with its offset.
export const jstInputToIso = (value) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+09:00` : "");
export const monthLabel = (m) => (m ? `${Number(String(m).slice(0, 4))}年${Number(String(m).slice(5))}月` : "—");

// Product names for bean ids (the store's own titles).
const NAMES = Object.fromEntries(Object.values(PRODUCT_DATA).flat().filter((p) => p && p.id).map((p) => [p.id, p.title?.ja || p.id]));
export const beanName = (sku) => NAMES[sku] || sku;

export const STATUS_TEXT = { planned: "発送予定", preparing: "発送準備中", shipped: "発送済み", held: "保留", needs_review: "要確認（遅延入金）",
  cancelled_before_shipping: "発送取りやめ", delivered: "お届け済み" };
export const METHOD_TEXT = { letterpack_light: "レターパックライト", clickpost: "クリックポスト" };
export const HOLD_TEXT = { OUT_OF_STOCK: "在庫不足", CUSTOMER_REQUEST: "お客様のご依頼", ADDRESS_CHECK: "住所の確認", PAYMENT_CHECK: "決済の確認", OTHER: "その他" };
export const BLOCKER_TEXT = {
  CANCELLED: "発送取りやめ済み", SHIPMENT_NEEDS_REVIEW: "遅延入金の要確認（CEO確認後に「予定に戻す」）", UNKNOWN_SUBSCRIPTION: "契約が見つかりません",
  DUPLICATE_SUBSCRIPTION: "二重契約の疑い（CEO確認待ち）", UNEXPECTED_FIRST_AMOUNT: "初回の金額が想定外（CEO確認待ち）", MONTH_NOT_PAID: "この月の決済が完了していません",
  MONTH_SKIPPED: "スキップされた月です", AFTER_CANCELLATION: "解約後の月です", CONTRACT_ENDED: "契約が終了しています（CEO確認待ち）",
  UNKNOWN_SHIPMENT_KIND: "発送の種類が不明です", UNKNOWN_SHIPMENT: "発送が見つかりません",
};
export const ERROR_TEXT = {
  UNAVAILABLE: "発送管理は現在オフです。",
  EMAIL_REQUIRED: "メールアドレスを正しく入力してください。",
  SIGN_IN_REQUIRED: "ログインしてください。", SESSION_EXPIRED: "ログインの有効期限（2時間）が過ぎたか、ログアウトされました。もう一度ログインしてください。",
  LOGIN_LINK_INVALID: "ログインリンクが正しくありません。もう一度メールを送信してください。",
  LOGIN_LINK_USED: "このログインリンクはすでに使われています。もう一度メールを送信してください。",
  LOGIN_LINK_EXPIRED: "ログインリンクの有効期限（15分）が過ぎました。もう一度メールを送信してください。",
  NETWORK: "通信できませんでした。もう一度お試しください（同じ操作は二重に処理されません）。",
  FAILED: "処理できませんでした。時間をおいてもう一度お試しください。",
  RATE_LIMITED: "操作が続いたため、1分ほど待ってからお試しください。",
  INVALID_BEANS: "豆を2種類選んでください。", SAME_BEANS: "同じ豆（同じ生豆の焙煎違いを含む）は組み合わせられません。",
  NOT_A_SUBSCRIPTION_BEAN: "定期便に使えない商品です。", ALREADY_PREPARING: "すでに発送準備中です。豆を変える場合は「準備をやめる」を押してください。",
  INVALID_STATE: "この発送の状態では、その操作はできません。画面を更新してください。", NOT_SHIPPABLE: "この発送は送れません。",
  INVALID_TRACKING_NUMBER: "追跡番号は数字とハイフンで入力してください。", NOT_PREPARED: "発送準備中か発送済みの発送だけ、宛名を表示できます。",
  REQUEST_ID_CONFLICT: "操作が重なりました。画面を更新してください。", INVALID_RANGE: "期間が正しくありません。",
  // A cancellation asked by email (server/coffee-subscription-email-cancel.js).
  NOT_VERIFIED: "契約が見つからないか、本人確認の内容が一致しません。お客様に登録したメールアドレス・郵便番号・電話番号の下4桁をご確認いただいてください。",
  INVALID_METHOD: "本人確認の方法を選んでください。", DETAILS_REQUIRED: "郵便番号（7桁）と電話番号の下4桁を入力してください。",
  INVALID_RECEIVED_AT: "メールの受信日時を入力してください（40日以内）。", PREVIEW_REQUIRED: "先に「内容を確認」を押してください。",
  CANCEL_CHANGED: "確認した後に条件が変わりました（請求の時刻を過ぎた等）。もう一度「内容を確認」を押してください。",
  REQUEST_TOO_OLD: "先月のご請求より前に届いたご依頼です。この画面では処理できません。CEOが個別に対応します。",
  REQUEST_IN_PROGRESS: "同じ解約を処理中です。少し待って画面を確認してください。", INVALID_REQUEST_ID: "画面を更新してからもう一度お試しください。",
};
export const errorText = (code) => ERROR_TEXT[code] || ERROR_TEXT.FAILED;

export const jstToday = (at = Date.now()) => new Date(at + 9 * 3600e3).toISOString().slice(0, 10);
export const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayLabel = (day) => { if (!day) return "—"; const d = new Date(`${day}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${"日月火水木金土"[d.getUTCDay()]}）`; };
export const shipmentLabel = (d) => (d.kind === "first" ? "初回" : `${Number(String(d.month).slice(5))}月分 ${d.seq}回目`);
