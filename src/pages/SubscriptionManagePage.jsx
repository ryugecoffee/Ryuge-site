import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PREFERENCE_ISSUE_TEXT, PREFERENCE_MAX_LENGTH, normalizePreference, preferenceIssues } from "../lib/subscriptionPreference";
import { MONTHLY_PRICES, PREFECTURES, accountApi, dateLabel, errorText, monthLabel, newRequestId, session, shortDate, yen } from "../lib/coffeeSubscriptionAccount";

// 珈琲の定期便: the customer's own page. Sign-in by a link mailed to the subscription's email (15 minutes, once), then
// a 30-minute session in this tab. Every change is checked by the payment server (server/coffee-subscription-account.js):
// what is shown here is only what the server answered.

const STATUS_TEXT = { trialing: "お申し込み済み（月額のお支払い開始前）", active: "ご利用中", past_due: "お支払いを確認中", unpaid: "お支払いが確認できていません",
  canceled: "終了", incomplete_record: "確認中" };
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

function CancelSection({ me, reload, setNotice }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const rid = useRequestId();
  if (me.cancellation) {
    return (
      <section className="subm-card"><h2>解約</h2>
        <p className="subm-text">解約を受け付けました。{me.cancellation.firstUnchargedMonth ? `${monthLabel(me.cancellation.firstUnchargedMonth)}以降のご請求はありません。` : ""}</p>
        {me.cancellation.refundProposal && <p className="subm-text">初回の200gは発送を取りやめました。初回分（{yen(me.cancellation.refundProposal.amount)}）は全額、お支払いのカードへ返金します（解約から7営業日以内に手続きします）。</p>}
      </section>
    );
  }
  if (me.status === "canceled") return null;
  async function open() {
    setBusy(true);
    const r = await accountApi.call("GET", "/cancel");
    setBusy(false);
    if (r.status === 200) setPreview(r.body); else setNotice({ error: errorText(r.body?.error) });
  }
  async function confirm() {
    setBusy(true);
    const r = await accountApi.call("POST", "/cancel", { key: preview.key, requestId: rid.current() });
    setBusy(false);
    if (r.status === 200) { rid.next(); setPreview(null); await reload(); setNotice({ ok: "解約を受け付けました。確認のメールをお送りしました。" }); return; }
    if (r.body?.error === "CANCEL_CHANGED") { rid.next(); setNotice({ error: errorText("CANCEL_CHANGED") }); open(); return; }
    setNotice({ error: errorText(r.body?.error) });
  }
  const endText = (p) => (p.action === "CANCEL_AT" ? `${dateLabel(new Date(p.endsAt + 9 * 3600e3).toISOString().slice(0, 10))}で終了します。` : "すぐに終了します。");
  return (
    <section className="subm-card" aria-labelledby="cancel-h">
      <h2 id="cancel-h">解約</h2>
      {!preview ? (
        <>
          <p className="subm-text">いつでも解約できます。毎月1日のご請求（日本時間9時）より前であれば、その月以降のご請求はありません。解約手数料・違約金はありません。</p>
          <button type="button" className="subm-secondary danger" onClick={open} disabled={busy}>解約の内容を確認する</button>
        </>
      ) : (
        <div className="subm-confirm" role="dialog" aria-label="解約の確認">
          <p className="subm-text"><strong>{endText(preview)}</strong></p>
          <p className="subm-text">{monthLabel(preview.firstUnchargedMonth)}以降のご請求はありません。{preview.lastPaidMonth ? `お支払い済みの${monthLabel(preview.lastPaidMonth)}分のお届けは、予定どおり発送します。` : ""}</p>
          {preview.action === "VOID_AND_CANCEL_NOW" && <p className="subm-text">お支払いが完了していない今月分のご請求は取り消します（今月分は発送しません）。</p>}
          {preview.firstNotShipped && <p className="subm-text">初回の200gはまだ発送前のため発送を取りやめ、初回分（{yen(preview.refundProposalAmount)}）を全額、お支払いのカードへ返金します（解約から7営業日以内に手続きします）。</p>}
          <div className="subm-actions">
            <button type="button" className="subm-primary danger" onClick={confirm} disabled={busy}>{busy ? "手続きしています…" : "解約する"}</button>
            <button type="button" className="subm-secondary" onClick={() => setPreview(null)} disabled={busy}>やめる</button>
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
          {params.get("started") && <p className="subm-ok">お申し込みありがとうございます。ご登録のメールアドレスでログインすると、お届けの予定を確認・変更できます。</p>}
          {notice?.ok && <p className="subm-ok" role="status">{notice.ok}</p>}
          {notice?.error && phase !== "signin" && <p className="subm-alert" role="alert">{notice.error}</p>}
          {phase === "signin" && <SignIn notice={notice?.error} />}
          {phase === "loading" && <p className="subm-text">読み込んでいます…</p>}
          {phase === "ready" && me && (
            <>
              <section className="subm-card" aria-labelledby="status-h">
                <h2 id="status-h">ご契約の状況</h2>
                <dl className="subm-facts">
                  <div><dt>状態</dt><dd>{STATUS_TEXT[me.status] || me.status}</dd></div>
                  <div><dt>配送回数</dt><dd>月{me.frequency}回（{yen(MONTHLY_PRICES[me.frequency])}/月・税込・送料込み）</dd></div>
                  <div><dt>月額のお支払い開始</dt><dd>{monthLabel(me.startMonth)}1日</dd></div>
                </dl>
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
              <CancelSection me={me} reload={reload} setNotice={setNotice} />
            </>
          )}
          <p className="subm-note"><Link to="/subscription/apply" className="text-link">お申し込み内容（定期購入の条件）</Link>・<Link to="/legal" className="text-link">特定商取引法に基づく表記</Link></p>
        </div>
      </main>
    </div>
  );
}
