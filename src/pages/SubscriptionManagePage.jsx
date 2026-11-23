import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PREFERENCE_ISSUE_TEXT, PREFERENCE_MAX_LENGTH, normalizePreference, preferenceIssues } from "../lib/subscriptionPreference";
import { REFUND_BUSINESS_DAYS, TERMS_JA } from "../lib/coffeeSubscriptionTerms";
import { FIRST_PRICE, MONTHLY_PRICES, PREFECTURES, accountApi, dateLabel, errorText, monthLabel, newRequestId, session, shortDate, yen } from "../lib/coffeeSubscriptionAccount";

// 珈琲の定期便: the customer's own page. Sign-in by a link mailed to the subscription's email (15 minutes, once), then
// a 30-minute session in this tab. Every change is checked by the payment server (server/coffee-subscription-account.js):
// what is shown here is only what the server answered.

const STATUS_TEXT = { trialing: "ご契約中（月額のお支払い開始前）", active: "ご契約中", past_due: "お支払いを確認中", unpaid: "お支払いが確認できていません",
  canceled: "終了", incomplete_record: "確認中" };
// Deliveries still to come (the server's records): planned, being prepared, held or being rescheduled.
const UPCOMING = ["planned", "held", "preparing", "needs_review"];
const todayKey = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const endDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const REFUND_STATUS_TEXT = { refunded: "返金済みです。", approved: "返金のお手続き中です。" };

// The next monthly charge and the next delivery, from what the server answered (nothing is guessed in the browser).
function nextCharge(me) {
  if (me.cancellation || me.status === "canceled") return null;
  return me.months.find((m) => !m.skipped && !m.charge && m.billingDate >= todayKey()) || null;
}
function nextDelivery(me) {
  const recorded = me.shipments.filter((s) => UPCOMING.includes(s.status) && (s.plannedDate || s.shipBy))
    .map((s) => ({ date: s.plannedDate || s.shipBy, by: !s.plannedDate, preparing: s.status === "preparing" }))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (recorded) return recorded;
  if (me.cancellation || me.status === "canceled") return null;
  const month = me.months.find((m) => !m.skipped && m.shippingDates.length);
  return month ? { date: month.shippingDates[0], afterPayment: !month.charge } : null;
}
function upcomingShipments(me, beforeMonth = null) {
  return me.shipments.filter((s) => UPCOMING.includes(s.status) && s.kind !== "first" && (!beforeMonth || !s.month || s.month < beforeMonth));
}
const remainingText = (list) => {
  const dated = list.filter((s) => s.plannedDate && s.status !== "needs_review").map((s) => dateLabel(s.plannedDate));
  return `あと${list.length}回お届けいたします${dated.length ? `（${dated.join("・")}発送予定）` : ""}。発送の際は、メールでお知らせいたします。`;
};
const deliveriesText = (list) => (list.length ? `お支払い済みの分として、${remainingText(list)}` : "ございません。");
const CHARGE_TEXT = { paid: "お支払い済み", not_charged: "請求なし", payment_failed: "お支払い未完了" };
const SHIPMENT_TEXT = { planned: "発送予定", needs_review: "確認中", held: "確認中", preparing: "発送準備中", shipped: "発送済み", delivered: "お届け済み", cancelled_before_shipping: "発送取りやめ" };

// One request id per form until it succeeds: pressing twice, or retrying after a network error, is applied once.
function useRequestId() {
  const ref = useRef(newRequestId());
  return { current: () => ref.current, next: () => { ref.current = newRequestId(); } };
}

function SignIn({ notice }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ busy: false, sent: false, message: notice || "" });
  async function submit(event) {
    event.preventDefault();
    setState({ busy: true, sent: false, message: "" });
    const r = await accountApi.login(email);
    if (r.status === 200) setState({ busy: false, sent: true, message: "" });
    else setState({ busy: false, sent: false, message: errorText(r.body?.error) });
  }
  return (
    <form className="subm-card" onSubmit={submit}>
      <h2>ログイン</h2>
      <p className="subm-text">定期便にご登録のメールアドレスを入力してください。ログイン用のリンクをお送りします（15分間有効・1回限り）。</p>
      {state.message && <p className="subm-alert" role="alert">{state.message}</p>}
      {state.sent ? (
        <p className="subm-ok" role="status">ご登録がある場合、ログイン用のリンクをお送りしました。メールをご確認ください。届かない場合は迷惑メールフォルダもご確認ください。</p>
      ) : (
        <>
          <label className="subm-field"><span className="subm-label">メールアドレス</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button type="submit" className="subm-primary" disabled={state.busy}>{state.busy ? "送信しています…" : "ログインリンクを送る"}</button>
        </>
      )}
      <p className="subm-note">{TERMS_JA.emailCancel}</p>
    </form>
  );
}

function PlanSection({ me, act, busy }) {
  const changeable = me.months.filter((m) => m.changeable).map((m) => m.month);
  const [frequency, setFrequency] = useState(me.frequency);
  const [from, setFrom] = useState(changeable[0] || "");
  const ending = Boolean(me.cancellation) || me.status === "canceled";
  return (
    <section className="subm-card" aria-labelledby="plan-h">
      <h2 id="plan-h">今後のお届けとご請求</h2>
      <p className="subm-text">変更・スキップの締切：{dateLabel(me.changeDeadline)}（{monthLabel(me.firstChangeableMonth)}分から反映）</p>
      <div className="subm-months">
        {me.months.length === 0 && <p className="subm-text">今後のご請求はありません。</p>}
        {me.months.map((m) => (
          <div key={m.month} className={`subm-month ${m.skipped ? "skipped" : ""}`}>
            <div className="subm-month-head">
              <strong>{monthLabel(m.month)}</strong>
              <span>{m.skipped ? "スキップ" : `月${m.frequency}回`}</span>
            </div>
            <dl>
              <div><dt>ご請求</dt><dd>{m.skipped ? "なし" : `${yen(m.amount)}（${shortDate(m.billingDate)}）`}{m.charge ? `・${CHARGE_TEXT[m.charge] || m.charge}` : ""}</dd></div>
              <div><dt>発送予定</dt><dd>{m.skipped ? "なし" : m.shippingDates.map(shortDate).join("・")}</dd></div>
            </dl>
            {!ending && m.changeable && (
              <button type="button" className="subm-secondary" disabled={busy}
                onClick={() => act(m.skipped ? "unskip" : "skip", { action: m.skipped ? "unskip" : "skip", month: m.month })}>
                {m.skipped ? "スキップを取り消す" : "この月をスキップ"}
              </button>
            )}
          </div>
        ))}
      </div>
      {!ending && changeable.length > 0 && (
        <form className="subm-inline" onSubmit={(e) => { e.preventDefault(); act("frequency", { action: "frequency", month: from, frequency }); }}>
          <h3>配送回数の変更</h3>
          <div className="subm-inline-fields">
            <label><span className="subm-label">回数</span>
              <select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>月{n}回（{yen(MONTHLY_PRICES[n])}）</option>)}
              </select></label>
            <label><span className="subm-label">反映する月</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {changeable.map((k) => <option key={k} value={k}>{monthLabel(k)}から</option>)}
              </select></label>
            <button type="submit" className="subm-primary" disabled={busy}>変更する</button>
          </div>
          <p className="subm-hint">日割りの精算はありません。変更した月の1日から新しい月額になります。</p>
        </form>
      )}
    </section>
  );
}

function PreferenceSection({ me, act, busy }) {
  const [text, setText] = useState(me.preference || "");
  const issues = preferenceIssues(text);
  return (
    <form className="subm-card" onSubmit={(e) => { e.preventDefault(); act("preference", { text: normalizePreference(text) }); }}>
      <h2>珈琲の好み・ご希望</h2>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="珈琲の好み・ご希望" />
      <small className="subm-hint">任意・{PREFERENCE_MAX_LENGTH}文字以内（{[...normalizePreference(text)].length}）。お名前・ご住所・電話番号・メールアドレス・カード番号などは書かないでください。</small>
      {issues.map((i) => <small key={i} className="subm-error">{PREFERENCE_ISSUE_TEXT.ja?.[i] || i}</small>)}
      <button type="submit" className="subm-primary" disabled={busy || issues.length > 0}>保存する</button>
    </form>
  );
}

function AddressSection({ me, act, busy }) {
  const s = me.shipping || {};
  const [open, setOpen] = useState(false);
  const [a, setA] = useState({ name: s.name || "", postalCode: s.postalCode || "", prefecture: s.prefecture || "", city: s.city || "", line1: s.line1 || "", line2: s.line2 || "", phone: s.phone || "" });
  const field = (key, label, props = {}) => (
    <label className="subm-field"><span className="subm-label">{label}</span>
      <input value={a[key]} onChange={(e) => setA({ ...a, [key]: e.target.value })} {...props} /></label>
  );
  return (
    <section className="subm-card" aria-labelledby="addr-h">
      <h2 id="addr-h">お届け先</h2>
      {me.shipping ? (
        <p className="subm-text pre-line">{`${s.name} 様\n〒${s.postalCode} ${s.prefecture}${s.city}${s.line1}${s.line2 ? ` ${s.line2}` : ""}\n${s.phone || ""}`}</p>
      ) : <p className="subm-text">お届け先が登録されていません。</p>}
      {!open ? (
        <button type="button" className="subm-secondary" onClick={() => setOpen(true)} disabled={me.status === "canceled"}>お届け先を変更する</button>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); act("address", { address: a }, () => setOpen(false)); }}>
          {field("name", "お名前", { autoComplete: "name", required: true })}
          {field("postalCode", "郵便番号（7桁）", { autoComplete: "postal-code", inputMode: "numeric", required: true })}
          <label className="subm-field"><span className="subm-label">都道府県</span>
            <select value={a.prefecture} onChange={(e) => setA({ ...a, prefecture: e.target.value })} required>
              <option value="">選んでください</option>
              {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></label>
          {field("city", "市区町村", { autoComplete: "address-level2", required: true })}
          {field("line1", "番地", { autoComplete: "address-line1", required: true })}
          {field("line2", "建物名・部屋番号（任意）", { autoComplete: "address-line2" })}
          {field("phone", "電話番号", { autoComplete: "tel", inputMode: "tel", required: true })}
          <p className="subm-hint">変更は、まだ発送準備に入っていないお届けから反映されます。発送準備中・発送済みの荷物のお届け先は変わりません。</p>
          <div className="subm-actions">
            <button type="submit" className="subm-primary" disabled={busy}>この内容で変更する</button>
            <button type="button" className="subm-secondary" onClick={() => setOpen(false)}>やめる</button>
          </div>
        </form>
      )}
    </section>
  );
}

// 解約 (2026-11-23): before confirming, four things apart — when the contract ends, the charges after it, the deliveries
// still to come, and the refund; after it, a clear "completed" summary. Every figure is the server's (preview / records).
function CancelSection({ me, reload }) {
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rid = useRequestId();
  const firstShipped = me.shipments.some((s) => s.kind === "first" && ["shipped", "delivered"].includes(s.status));

  if (me.cancellation) {
    const c = me.cancellation;
    const upcoming = upcomingShipments(me, c.firstUnchargedMonth);
    return (
      <section className="subm-card" aria-labelledby="cancel-h">
        <h2 id="cancel-h">解約</h2>
        <div className="subm-done" role="status">
          <h3>{done ? "解約のお手続きが完了いたしました" : "解約のお手続きは完了しています"}</h3>
          {done && <p className="subm-text">ご登録のメールアドレスへ、解約内容のご案内をお送りいたしました。</p>}
          <dl className="subm-summary">
            <div><dt>契約終了日</dt><dd>{c.endsAt ? `${dateLabel(endDay(c.endsAt))}（この日のご請求はございません）` : "—"}</dd></div>
            <div><dt>以後のご請求</dt><dd>ございません。{c.firstUnchargedMonth ? `${monthLabel(c.firstUnchargedMonth)}分以降のご請求はございません。` : ""}</dd></div>
            <div><dt>今後のお届け</dt><dd>{deliveriesText(upcoming)}</dd></div>
            <div><dt>ご返金</dt><dd>{c.refundProposal
              ? `初回分${yen(c.refundProposal.amount)}を全額返金いたします。${REFUND_STATUS_TEXT[c.refundProposal.status] || `返金はお支払い時のカードへ行い、解約受付から${REFUND_BUSINESS_DAYS}営業日以内に手続きいたします。`}`
              : "返金の対象となるお支払いはございません。"}</dd></div>
          </dl>
        </div>
      </section>
    );
  }
  if (me.status === "canceled") return null;
  async function open() {
    setBusy(true); setError("");
    const r = await accountApi.call("GET", "/cancel");
    setBusy(false);
    if (r.status === 200) setPreview(r.body); else setError(errorText(r.body?.error));
  }
  async function confirm() {
    setBusy(true); setError("");
    const r = await accountApi.call("POST", "/cancel", { key: preview.key, requestId: rid.current() });
    setBusy(false);
    if (r.status === 200) { rid.next(); setPreview(null); setDone(r.body); await reload(); return; }
    if (r.body?.error === "CANCEL_CHANGED") { rid.next(); setError(errorText("CANCEL_CHANGED")); open(); return; }
    setError(errorText(r.body?.error));
  }
  const endsText = (p) => (p.action === "CANCEL_AT"
    ? `${dateLabel(endDay(p.endsAt))}（日本時間9時）。この日のご請求はございません。`
    : "本日、ただちに終了いたします。");
  const refundText = (p) => {
    if (p.firstNotShipped) return `初回の200gはまだ発送前のため、発送を取りやめ、初回分${yen(p.refundProposalAmount)}を全額返金いたします。返金はお支払い時のカードへ行い、解約受付から${REFUND_BUSINESS_DAYS}営業日以内に手続きいたします（カードへの反映時期は、カード会社によって異なります）。`;
    if (firstShipped || p.lastPaidMonth) return "初回分は発送済みのため、返金の対象にはなりません。お支払い済みの月額料金についても、日割りでの返金はございません。";
    return "返金の対象となるお支払いはございません。";
  };
  const deliveryText = (p) => {
    const upcoming = upcomingShipments(me, p.firstUnchargedMonth);
    const parts = [];
    if (p.firstNotShipped) parts.push("初回分の発送は取りやめます。");
    if (p.action === "VOID_AND_CANCEL_NOW") parts.push("お支払いが完了していない今月分は発送いたしません。");
    if (p.lastPaidMonth) parts.push(`お支払い済みの${monthLabel(p.lastPaidMonth)}分は、予定どおりお届けいたします。${upcoming.length ? remainingText(upcoming) : ""}`);
    else if (upcoming.length && !p.firstNotShipped) parts.push(`お支払い済みの分として、${remainingText(upcoming)}`);
    else parts.push("以後のお届けはございません。");
    return parts.join("");
  };
  return (
    <section className="subm-card" aria-labelledby="cancel-h">
      <h2 id="cancel-h">解約</h2>
      {error && <p className="subm-alert" role="alert">{error}</p>}
      {!preview ? (
        <>
          <p className="subm-text">いつでもお手続きいただけます。毎月1日のご請求（日本時間9時）より前に解約された場合、その月以降のご請求はございません。最低継続回数・解約手数料・違約金はございません。</p>
          <button type="button" className="subm-secondary danger" onClick={open} disabled={busy}>{busy ? "確認しています…" : "解約の内容を確認する"}</button>
        </>
      ) : (
        <div className="subm-confirm" role="dialog" aria-label="解約内容のご確認">
          <p className="subm-text"><strong>以下の内容で解約いたします。まだ解約は確定していません。</strong></p>
          <dl className="subm-summary">
            <div><dt>契約終了日</dt><dd>{endsText(preview)}</dd></div>
            <div><dt>以後のご請求</dt><dd>ございません。{monthLabel(preview.firstUnchargedMonth)}分以降のご請求はございません。{preview.action === "VOID_AND_CANCEL_NOW" ? "お支払いが完了していない今月分のご請求は取り消します。" : ""}</dd></div>
            <div><dt>今後のお届け</dt><dd>{deliveryText(preview)}</dd></div>
            <div><dt>ご返金</dt><dd>{refundText(preview)}</dd></div>
          </dl>
          <p className="subm-note">解約手数料・違約金はございません。解約後に、確認のメールをお送りいたします。</p>
          <div className="subm-actions">
            <button type="button" className="subm-primary danger" onClick={confirm} disabled={busy}>{busy ? "手続きしています…" : "この内容で解約する"}</button>
            <button type="button" className="subm-secondary" onClick={() => setPreview(null)} disabled={busy}>解約をやめる</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SubscriptionManagePage() {
  const [params] = useSearchParams();
  const [phase, setPhase] = useState(session.get() ? "loading" : "signin");
  const [me, setMe] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const ids = useRef({});

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const reload = useCallback(async () => {
    const r = await accountApi.call("GET", "/me");
    if (r.status === 200) { setMe(r.body); setPhase("ready"); return; }
    if (r.status === 401) { session.clear(); setPhase("signin"); setNotice({ error: errorText(r.body?.error) }); return; }
    setPhase("error"); setNotice({ error: errorText(r.body?.error) });
  }, []);

  // A login link: #login=<token> (kept out of server logs and referrers), exchanged once for a session. Also when the
  // link is opened in a tab already showing this page (only the hash changes then).
  useEffect(() => {
    const fromHash = async () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("login");
      if (!token) return false;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setPhase("loading"); setNotice(null);
      const r = await accountApi.startSession(token);
      if (r.status === 200) { session.set(r.body); reload(); } else { session.clear(); setPhase("signin"); setNotice({ error: errorText(r.body?.error) }); }
      return true;
    };
    fromHash().then((handled) => { if (!handled && session.get()) reload(); });
    const onHash = () => { fromHash(); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [reload]);

  // Every change: one request id per kind of change until it succeeds; the page then shows the server's new state.
  async function act(kind, body, after) {
    if (busy) return;
    ids.current[kind] ||= newRequestId();
    setBusy(true); setNotice(null);
    const path = kind === "preference" ? "/preference" : kind === "address" ? "/address" : "/plan";
    const method = kind === "preference" || kind === "address" ? "PUT" : "POST";
    const r = await accountApi.call(method, path, { ...body, requestId: ids.current[kind] });
    setBusy(false);
    if (r.status === 200) {
      delete ids.current[kind];
      const done = { skip: "スキップを受け付けました。", unskip: "スキップを取り消しました。", frequency: "配送回数の変更を受け付けました。", preference: "ご希望を保存しました。",
        address: `お届け先を変更しました。${r.body.unchanged ? `（発送準備中・発送済みの${r.body.unchanged}件は変わりません）` : ""}` };
      after?.();
      await reload(); // show the server's new state first, then say it is done
      setNotice({ ok: done[kind] });
      return;
    }
    if (r.status !== 0 && r.body?.error !== "REQUEST_IN_PROGRESS") delete ids.current[kind];
    if (r.status === 401) { session.clear(); setPhase("signin"); }
    setNotice({ error: errorText(r.body?.error) });
  }

  async function openPortal() {
    setBusy(true);
    const r = await accountApi.call("POST", "/portal", {});
    setBusy(false);
    if (r.status === 200 && r.body?.url) window.location.assign(r.body.url); else setNotice({ error: errorText(r.body?.error) });
  }

  async function logout() {
    await accountApi.call("POST", "/logout", {});
    session.clear(); setMe(null); setPhase("signin");
  }

  return (
    <div className="legal-page-shell">
      <main className="legal-main">
        <div className="legal-document subm">
          <p className="legal-eyebrow">Coffee Subscription</p>
          <h1>珈琲の定期便 管理ページ</h1>
          {params.get("started") && <p className="subm-ok">お申し込みいただき、誠にありがとうございます。ご登録のメールアドレスでログインいただくと、お届けの予定をご確認・ご変更いただけます。</p>}
          {notice?.ok && <p className="subm-ok" role="status">{notice.ok}</p>}
          {notice?.error && phase !== "signin" && <p className="subm-alert" role="alert">{notice.error}</p>}
          {phase === "signin" && <SignIn notice={notice?.error} />}
          {phase === "loading" && <p className="subm-text">読み込んでいます…</p>}
          {phase === "ready" && me && (
            <>
              <section className="subm-card" aria-labelledby="status-h">
                <h2 id="status-h">ご契約の状況</h2>
                <dl className="subm-facts">
                  <div><dt>状態</dt><dd>{me.cancellation ? "解約のお手続き済み" : STATUS_TEXT[me.status] || me.status}</dd></div>
                  <div><dt>お届け</dt><dd>月{me.frequency}回・各回200g（珈琲豆2種類・各100g）</dd></div>
                  <div><dt>月額料金</dt><dd>{yen(MONTHLY_PRICES[me.frequency])}／月（税込・送料込み）</dd></div>
                  <div><dt>月額のお支払い開始</dt><dd>{monthLabel(me.startMonth)}1日</dd></div>
                  <div><dt>次回のご請求</dt><dd>{(() => { const n = nextCharge(me); return n ? `${dateLabel(n.billingDate)}・${yen(n.amount)}` : "ございません"; })()}</dd></div>
                  <div><dt>次回の発送予定</dt><dd>{(() => { const d = nextDelivery(me); return d ? `${dateLabel(d.date)}${d.by ? "まで" : ""}${d.preparing ? "（発送準備中）" : d.afterPayment ? "（その月のお支払い後）" : ""}` : "ございません"; })()}</dd></div>
                </dl>
                {me.status === "trialing" && !me.cancellation && (
                  <p className="subm-text">初回分（{yen(FIRST_PRICE)}）はお支払い済みです。月額料金のお支払いは {monthLabel(me.startMonth)}1日から始まり、それまでに月額のご請求はございません。決済画面の「トライアル」は、この月額のお支払いが始まるまでの期間を指します。</p>
                )}
                {me.paymentIssue && <p className="subm-alert">お支払いが確認できていません。カード情報をご確認ください。お支払いが確認できるまで、その月の発送は行いません。</p>}
                <div className="subm-actions">
                  <button type="button" className="subm-secondary" onClick={openPortal} disabled={busy || !me.portalAvailable}>カード変更・請求書の確認</button>
                  <button type="button" className="subm-secondary" onClick={logout}>ログアウト</button>
                </div>
              </section>
              <PlanSection me={me} act={act} busy={busy} />
              {me.shipments.length > 0 && (
                <section className="subm-card"><h2>発送の状況</h2>
                  <ul className="subm-list">{me.shipments.map((s) => (
                    <li key={`${s.month}-${s.seq}`}><span>{s.kind === "first" ? "初回" : `${monthLabel(s.month)} ${s.seq}回目`}</span>
                      <span>{s.plannedDate ? shortDate(s.plannedDate) : s.shipBy ? `${shortDate(s.shipBy)}までに` : ""}</span><span>{SHIPMENT_TEXT[s.status] || s.status}</span></li>))}
                  </ul></section>
              )}
              <PreferenceSection key={`p-${me.preference}`} me={me} act={act} busy={busy} />
              <AddressSection key={`a-${JSON.stringify(me.shipping)}`} me={me} act={act} busy={busy} />
              <CancelSection me={me} reload={reload} />
            </>
          )}
          <p className="subm-note"><Link to="/subscription/apply" className="text-link">お申し込み内容（定期購入の条件）</Link>・<Link to="/legal" className="text-link">特定商取引法に基づく表記</Link></p>
        </div>
      </main>
    </div>
  );
}
