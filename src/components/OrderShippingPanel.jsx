import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAIL_TEXT, METHOD_TEXT, ORDER_BLOCKER_TEXT, ORDER_HOLD_TEXT, ORDER_METHODS, ORDER_STATUS_TEXT, ORDER_WARNING_TEXT, PAYMENT_TEXT,
  beanName, dayLabel, errorText, newRequestId, shippingApi,
} from "../lib/subscriptionShippingAdmin";
import { PHONE_MISSING, addressText } from "../lib/addressFormat";

// Store orders (one-time purchases) on the shop's shipping page: 新規 → 発送準備中 → 発送済み (or 保留). Stock is not
// touched here (it was settled when the order was paid). 発送済み mails the customer once (the server makes sure).
// Names are shown to signed-in staff; the address only when 宛名を表示 is pressed (each look is recorded).

const VIEWS = { open: "対応が必要", shipped: "発送済み", all: "すべて" };
const yen = (n) => `¥${Number(n || 0).toLocaleString("ja-JP")}`;
const jstTime = (ms) => {
  if (!ms) return "—";
  const d = new Date(ms + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

function useRequestIds() {
  const ids = useRef({});
  return { get: (key) => (ids.current[key] ||= newRequestId()), done: (key) => { delete ids.current[key]; } };
}

function Order({ o, onChanged, onSignedOut }) {
  const ids = useRequestIds();
  const international = o.countryCode && o.countryCode !== "JP";
  const methods = international ? ORDER_METHODS.international : ORDER_METHODS.domestic;
  const [method, setMethod] = useState(international ? "intl_air_packet" : "");
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("ADDRESS_CHECK");
  const [address, setAddress] = useState(null);
  const [state, setState] = useState({ busy: false, message: "", ok: "" });
  const blocked = o.blockers.length > 0;

  async function run(key, call, okText) {
    setState({ busy: true, message: "", ok: "" });
    const r = await call(ids.get(key));
    if (r.status === 200) {
      ids.done(key);
      const mail = r.body.mailStatus ? `（${MAIL_TEXT[r.body.mailStatus] || r.body.mailStatus}）` : "";
      setState({ busy: false, message: "", ok: (r.body.applied === false ? `${okText}（すでに処理済みでした）` : okText) + mail });
      onChanged();
      return;
    }
    if (r.status === 401) { onSignedOut(errorText(r.body.error)); return; }
    const detail = Array.isArray(r.body.detail) ? `（${r.body.detail.map((c) => ORDER_BLOCKER_TEXT[c] || c).join("、")}）` : "";
    setState({ busy: false, message: errorText(r.body.error) + detail, ok: "" });
  }
  const prepare = () => run("prepare", (requestId) => shippingApi.orderPrepare({ orderId: o.orderId, requestId }), "発送準備中にしました。");
  const ship = () => {
    if (!method) { setState({ busy: false, message: "配送方法を選んでください。", ok: "" }); return; }
    const mailNote = o.livemode ? "お客様に発送メールが1回送られます。" : "テスト注文のため、メールは送られません。";
    if (!window.confirm(`${o.ref} を発送済みにします（${METHOD_TEXT[method]}${tracking.trim() ? `・追跡番号 ${tracking.trim()}` : ""}）。${mailNote}在庫は変わりません（決済時に処理済み）。よろしいですか？`)) return;
    run("ship", (requestId) => shippingApi.orderShip({ orderId: o.orderId, requestId, method, trackingNumber: tracking.trim() || null }), "発送済みにしました。");
  };
  const hold = () => run("hold", (requestId) => shippingApi.orderHold({ orderId: o.orderId, requestId, reason }), "保留にしました。");
  const resume = () => run("resume", (requestId) => shippingApi.orderResume({ orderId: o.orderId, requestId }), "新規に戻しました。");
  const resend = () => {
    if (!window.confirm("発送メールをもう一度送ります（前回は送信に失敗しています）。よろしいですか？")) return;
    run("resend", () => shippingApi.orderResendMail({ orderId: o.orderId }), "発送メールを再送しました。");
  };
  async function showAddress() {
    setState({ busy: true, message: "", ok: "" });
    const r = await shippingApi.orderAddress(o.orderId);
    if (r.status === 401) { onSignedOut(errorText(r.body.error)); return; }
    setState({ busy: false, message: r.status === 200 ? "" : errorText(r.body.error), ok: "" });
    if (r.status === 200) setAddress(r.body);
  }

  return (
    <li className={`ship-item status-${o.status === "new" ? "planned" : o.status}${o.late ? " overdue" : ""}`} data-order={o.ref}>
      <div className="ship-head">
        <strong>{o.ref}</strong>
        <span className="ship-status">{ORDER_STATUS_TEXT[o.status] || o.status}</span>
        <span>{jstTime(o.paidAt)} 注文</span>
        {!o.livemode && <span className="ship-flag test">テスト注文</span>}
        {o.late && <span className="ship-flag">発送期限を過ぎています</span>}
      </div>
      <dl className="subm-facts">
        <div><dt>お客様</dt><dd>{o.name || "—"}（{o.prefecture}{o.city}{international ? `・${o.countryCode}` : ""}）</dd></div>
        <div><dt>商品</dt><dd>{o.items.map((i) => `${beanName(i.id)} × ${i.quantity}`).join("、")}</dd></div>
        <div><dt>お支払い</dt><dd>{yen(o.amount)}（送料 {yen(o.shipping)}）・{PAYMENT_TEXT[o.paymentStatus] || o.paymentStatus}{o.amountRefunded ? `（返金 ${yen(o.amountRefunded)}）` : ""}</dd></div>
        {o.status !== "shipped" && <div><dt>発送予定</dt><dd>目標 {dayLabel(o.aimDay)}・期限 {dayLabel(o.shipBy)}（3営業日）</dd></div>}
        {o.status === "held" && <div><dt>保留の理由</dt><dd>{ORDER_HOLD_TEXT[o.holdReason] || o.holdReason}</dd></div>}
        {o.status === "shipped" && <div><dt>発送</dt><dd>{jstTime(o.shippedAt)}・{METHOD_TEXT[o.method] || o.method}{o.trackingNumber ? `・追跡番号 ${o.trackingNumber}` : ""}</dd></div>}
        {o.status === "shipped" && <div><dt>お客様へのメール</dt><dd>{MAIL_TEXT[o.mail] || "—"}</dd></div>}
      </dl>
      {o.blockers.map((c) => <p key={c} className="subm-alert" role="alert">{ORDER_BLOCKER_TEXT[c] || c}</p>)}
      {o.warnings.map((c) => <p key={c} className="subm-note">{ORDER_WARNING_TEXT[c] || c}</p>)}
      {state.message && <p className="subm-alert" role="alert">{state.message}</p>}
      {state.ok && <p className="subm-ok" role="status">{state.ok}</p>}

      {!blocked && (address ? (
        <div className="ship-label" role="region" aria-label="宛名">
          {/* The address put together once (src/lib/addressFormat.js); a missing phone reads 未登録, never made up. */}
          <p className="subm-text" style={{ whiteSpace: "pre-line" }}>{addressText({ countryCode: address.countryCode || "JP", postalCode: address.address.postalCode,
            prefecture: address.address.state, city: address.address.city, stateProvince: address.address.state, countryName: address.address.country,
            line1: [address.countryCode && address.countryCode !== "JP" ? "" : address.address.city, address.address.line1].filter(Boolean).join(""),
            line2: address.address.line2 || "" })}</p>
          <p className="subm-text">{address.name} 様<br />電話番号：{address.phone || PHONE_MISSING.ja}</p>
          <button className="subm-secondary" type="button" onClick={() => setAddress(null)}>宛名を閉じる</button>
        </div>
      ) : o.status !== "shipped" && <button className="subm-secondary" type="button" disabled={state.busy} onClick={showAddress}>宛名を表示</button>)}

      {!blocked && ["new", "preparing"].includes(o.status) && (
        <div className="ship-actions">
          {o.status === "new" && <button className="subm-secondary" type="button" disabled={state.busy} onClick={prepare}>発送準備中にする</button>}
          <label className="subm-field"><span className="subm-label">配送方法</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">選んでください</option>
              {methods.map((m) => <option key={m} value={m}>{METHOD_TEXT[m]}</option>)}
            </select>
          </label>
          <label className="subm-field"><span className="subm-label">追跡番号（任意）</span>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={international ? "RR123456789JP" : "1234-5678-9012"} />
          </label>
          <button className="subm-primary" type="button" disabled={state.busy || !method} onClick={ship}>発送済みにする</button>
          {o.status === "preparing" && <button className="subm-secondary" type="button" disabled={state.busy} onClick={resume}>準備をやめる</button>}
          <label className="subm-field"><span className="subm-label">保留の理由</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(ORDER_HOLD_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="subm-secondary" type="button" disabled={state.busy} onClick={hold}>保留にする</button>
        </div>
      )}
      {!blocked && o.status === "held" && <button className="subm-secondary" type="button" disabled={state.busy} onClick={resume}>新規に戻す</button>}
      {o.status === "shipped" && o.mail === "failed" && <button className="subm-secondary" type="button" disabled={state.busy} onClick={resend}>発送メールを再送</button>}
    </li>
  );
}

export default function OrderShippingPanel({ onSignedOut }) {
  const [view, setView] = useState("open");
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const apply = useCallback((r) => {
    setLoading(false);
    if (r.status === 200) { setData(r.body); setMessage(""); return; }
    if (r.status === 401) { onSignedOut(errorText(r.body.error)); return; }
    setData(null);
    setMessage(errorText(r.body.error));
  }, [onSignedOut]);
  const load = useCallback(() => { setLoading(true); shippingApi.orders(view).then(apply); }, [view, apply]);
  useEffect(() => {
    let alive = true;
    shippingApi.orders(view).then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [view, apply]);

  return (
    <section className="subm-card" aria-label="通常注文">
      <p className="subm-note">決済済みの通常注文です。「発送済みにする」でお客様に発送メールが1回送られます（テスト注文には送られません）。在庫は決済時に処理済みのため、ここでは変わりません。目標はご注文の翌日、期限は3営業日です。</p>
      <div className="subm-choices ship-filter">
        {Object.entries(VIEWS).map(([k, v]) => <button key={k} type="button" className={`subm-choice${view === k ? " active" : ""}`} onClick={() => setView(k)}>{v}</button>)}
        <button className="subm-secondary" type="button" disabled={loading} onClick={load}>{loading ? "読み込み中…" : "更新"}</button>
      </div>
      {message && <p className="subm-alert" role="alert">{message}</p>}
      {data && (
        <>
          <p className="subm-text">新規 {data.counts.new}・準備中 {data.counts.preparing}・保留 {data.counts.held}・発送済み {data.counts.shipped}
            {data.refundedOpen ? `（未発送のまま返金済み ${data.refundedOpen}件は「すべて」に表示）` : ""}</p>
          {data.orders.length === 0 ? <p className="subm-text">対象の注文はありません。</p> : (
            <ul className="ship-list">
              {data.orders.map((o) => <Order key={o.orderId} o={o} onChanged={load} onSignedOut={onSignedOut} />)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
