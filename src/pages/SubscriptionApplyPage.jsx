import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SUBSCRIPTIONS_PAUSED, SUBSCRIPTIONS_PAUSED_TEXT } from "../productData";
import { PREFERENCE_ISSUE_TEXT, PREFERENCE_MAX_LENGTH, normalizePreference, preferenceIssues } from "../lib/subscriptionPreference";
import { FIRST_PRICE, MONTHLY_PRICES, errorText, monthLabel, signUp, startMonthFor, yen } from "../lib/coffeeSubscriptionAccount";
import { FREQUENCIES, LEGAL_TEXT_REVIEWED, TERMS_JA, confirmationRows, paymentSummary } from "../lib/coffeeSubscriptionTerms";

// 珈琲の定期便: the final confirmation screen before payment (特定商取引法 第12条の6, 定期購入). Everything the customer
// agrees to is on this one screen, next to the button: what and how much, the first and the monthly price, when and how
// it is paid (with the date of the first monthly charge), when it is shipped, the term, and how to change or cancel.
// The rows are in src/lib/coffeeSubscriptionTerms.js (provisional wording until LEGAL_TEXT_REVIEWED).
// Sign-ups stay closed while SUBSCRIPTIONS_PAUSED (the server's sign-up switch is also off).
export default function SubscriptionApplyPage() {
  // What the customer chose on the store (deliveries, preference), carried in the page state, never in the URL.
  const carried = useLocation().state || {};
  const [frequency, setFrequency] = useState(() => ([1, 2, 3, 4].includes(carried.frequency) ? carried.frequency : 1));
  const [email, setEmail] = useState("");
  const [preference, setPreference] = useState(() => (typeof carried.preference === "string" ? carried.preference.slice(0, PREFERENCE_MAX_LENGTH) : ""));
  const [agreed, setAgreed] = useState(false);
  const [startMonth, setStartMonth] = useState(() => startMonthFor());
  const [state, setState] = useState({ busy: false, message: "", changed: false });
  const issues = preferenceIssues(preference);
  const rows = useMemo(() => confirmationRows(frequency, startMonth), [frequency, startMonth]);
  const pay = paymentSummary(frequency, startMonth);
  const closed = SUBSCRIPTIONS_PAUSED;

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (closed || !agreed || issues.length || state.busy) return;
    setState({ busy: true, message: "", changed: false });
    const r = await signUp({ frequency, email, preference: normalizePreference(preference) });
    if (r.status !== 200 || !r.body?.url) {
      setState({ busy: false, message: errorText(r.body?.error), changed: false });
      return;
    }
    // The server's start month is the one that counts; if it differs (the date changed meanwhile), show it first.
    if (r.body.startMonth !== startMonth) {
      setStartMonth(r.body.startMonth);
      setAgreed(false);
      setState({ busy: false, message: "日付が変わったため、月額のお支払い開始日が変わりました。お手数ですが、内容をもう一度ご確認ください。", changed: true });
      return;
    }
    window.location.assign(r.body.url);
  }

  return (
    <div className="legal-page-shell">
      <main className="legal-main">
        <form className="legal-document subm" onSubmit={submit}>
          <p className="legal-eyebrow">Coffee Subscription</p>
          <h1>珈琲の定期便 お申し込み内容の確認</h1>
          <p className="legal-lead">定期購入のお申し込みです。以下の内容をご確認のうえ、決済画面へお進みください。決済画面（Stripe）でお届け先とカード情報をご入力いただき、最後のボタンを押した時点でお申し込みが確定いたします。</p>
          {!LEGAL_TEXT_REVIEWED && <p className="subm-note">※ 表示内容は確認中の暫定版です。</p>}
          {closed && <p className="subm-alert" role="status">{SUBSCRIPTIONS_PAUSED_TEXT.ja}</p>}

          <fieldset className="subm-field">
            <legend>配送回数</legend>
            <div className="subm-choices" role="radiogroup" aria-label="配送回数">
              {FREQUENCIES.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={n === frequency} className={`subm-choice ${n === frequency ? "active" : ""}`}
                  onClick={() => { setFrequency(n); setAgreed(false); }}>
                  <span>月{n}回</span><small>{yen(MONTHLY_PRICES[n])}/月</small>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="subm-pay" aria-label="お支払いの概要">
            <div className="subm-pay-item"><span className="subm-pay-label">{pay.today.label}</span><strong>{pay.today.amount}</strong><small>{pay.today.note}</small></div>
            <div className="subm-pay-item"><span className="subm-pay-label">{pay.monthly.label}</span><strong>{pay.monthly.amount}<em>／月</em></strong><small>{pay.monthly.note}</small></div>
            <div className="subm-pay-item"><span className="subm-pay-label">{pay.start.label}</span><strong>{pay.start.value}</strong><small>{pay.start.note}</small></div>
          </div>
          <p className="subm-text">初回のお支払いと、毎月のお支払いは別のものです。最低継続回数・解約手数料はございません。</p>

          <dl className="legal-table subm-terms" aria-label="お申し込み内容">
            {rows.map(([label, value]) => (
              <div className="legal-row" key={label}><dt>{label}</dt><dd className="pre-line">{value}</dd></div>
            ))}
          </dl>

          <label className="subm-field">
            <span className="subm-label">メールアドレス（ご連絡と管理ページのログインに使います）</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={closed} />
          </label>
          <label className="subm-field">
            <span className="subm-label">珈琲の好み・ご希望（任意・{PREFERENCE_MAX_LENGTH}文字以内）</span>
            <textarea rows={3} value={preference} onChange={(e) => setPreference(e.target.value)} disabled={closed}
              placeholder="例：酸味が少なく、苦味のある珈琲が好きです。" />
            <small className="subm-hint">お名前・ご住所・電話番号・メールアドレス・カード番号などは書かないでください。{[...normalizePreference(preference)].length}/{PREFERENCE_MAX_LENGTH}</small>
            {issues.map((i) => <small key={i} className="subm-error">{PREFERENCE_ISSUE_TEXT.ja?.[i] || i}</small>)}
          </label>

          <div className="subm-callout" role="note">
            <strong>決済画面の「無料トライアル」表示について</strong>
            <p>{TERMS_JA.stripeTrialLabel}決済画面の最後のボタンは「決済とトライアルの開始」と表示されます。</p>
          </div>

          <label className="subm-agree">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={closed} />
            <span>定期購入であること、本日の初回分 {yen(FIRST_PRICE)}、{monthLabel(startMonth)}1日から毎月 {yen(MONTHLY_PRICES[frequency])} のお支払い、変更・解約・返金の条件を確認しました。</span>
          </label>
          {state.message && <p className={state.changed ? "subm-alert" : "subm-error"} role="alert">{state.message}</p>}
          <button type="submit" className="subm-primary" disabled={closed || !agreed || issues.length > 0 || state.busy}>
            {closed ? "現在、お申し込みを休止しています" : state.busy ? "決済画面を準備しています…" : "決済画面へ進む（まだ確定しません）"}
          </button>
          <p className="subm-note">お支払いは Stripe の決済画面で承ります。決済画面にも、ご請求の内容が表示されます。</p>
          <p className="subm-note"><Link to="/legal" className="text-link">特定商取引法に基づく表記</Link>・<Link to="/refund" className="text-link">返品・返金について</Link>・<Link to="/subscription/manage" className="text-link">定期便の管理ページ</Link></p>
        </form>
      </main>
    </div>
  );
}
