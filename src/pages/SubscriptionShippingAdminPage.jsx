import { useCallback, useEffect, useRef, useState } from "react";
import {
  BLOCKER_TEXT, HOLD_TEXT, STATUS_TEXT, addDays, adminToken, beanName, dayLabel, errorText, jstToday, newRequestId, shipmentLabel, shippingApi,
} from "../lib/subscriptionShippingAdmin";

// 珈琲の定期便 ④: the shop's shipping page. Pick two different beans → 発送準備 (one bag of each reserved) → 発送済み
// (the bags leave stock). Everything is checked by the payment server; this page shows only what it answered. Names and
// addresses are never listed: one delivery's label is shown on request, only while it is being prepared or once shipped.

// One request id per action until it succeeds: a double click, or a retry after a network error, is applied once.
function useRequestIds() {
  const ids = useRef({});
  return {
    get: (key) => (ids.current[key] ||= newRequestId()),
    done: (key) => { delete ids.current[key]; },
  };
}

function TokenForm({ onSet, message }) {
  const [value, setValue] = useState("");
  return (
    <form className="subm-card" onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSet(value.trim()); }}>
      <h2>発送管理にログイン</h2>
      <p className="subm-text">発送管理用のトークンを入力してください。このタブを閉じると消えます。</p>
      {message && <p className="subm-alert" role="alert">{message}</p>}
      <label className="subm-field"><span className="subm-label">トークン</span>
        <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="subm-primary" type="submit" disabled={!value.trim()}>表示する</button>
    </form>
  );
}

function StockCard({ stock }) {
  return (
    <section className="subm-card" aria-label="在庫">
      <h2>定期便に使える豆の在庫</h2>
      {stock.short && <p className="subm-alert" role="alert">在庫が足りません：準備待ちの発送に必要な {stock.bagsNeeded} 袋に対して、送れるのは {stock.bagsAvailable} 袋（豆の種類 {stock.beanGroupsInStock}）です。入荷・焙煎の予定を確認してください。</p>}
      <dl className="subm-facts">
        <div><dt>準備待ちの発送に必要</dt><dd>{stock.bagsNeeded} 袋</dd></div>
        <div><dt>送れる袋（同じ生豆の商品は合わせて数える）</dt><dd>{stock.bagsAvailable} 袋</dd></div>
      </dl>
      <ul className="subm-list ship-stock">
        {stock.beans.map((b) => <li key={b.sku}><span>{beanName(b.sku)}</span><span>{b.available} 袋</span></li>)}
      </ul>
    </section>
  );
}

function Label({ label, onClose }) {
  const s = label.shipTo;
  return (
    <div className="ship-label" role="region" aria-label="宛名">
      <p className="subm-text">〒{s.postalCode}<br />{s.prefecture}{s.city}{s.line1}{s.line2 ? ` ${s.line2}` : ""}<br />{s.name} 様<br />{s.phone}</p>
      <p className="subm-note">{label.beans.map((b) => beanName(b.sku)).join("・")}（各100g）</p>
      <button className="subm-secondary" type="button" onClick={onClose}>宛名を閉じる</button>
    </div>
  );
}

function Delivery({ d, beans, token, onChanged }) {
  const ids = useRequestIds();
  const usable = beans.filter((b) => b.available > 0);
  const [pick, setPick] = useState({ a: "", b: "" });
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("OUT_OF_STOCK");
  const [label, setLabel] = useState(null);
  const [state, setState] = useState({ busy: false, message: "", ok: "" });
  const blocked = d.blockers.length > 0;

  async function run(key, call, okText) {
    setState({ busy: true, message: "", ok: "" });
    const r = await call(ids.get(key));
    if (r.status === 200) {
      ids.done(key);
      const short = key === "prepare" && r.body.status === "held";
      if (short) setState({ busy: false, ok: "", message: `在庫が足りないため保留にしました（${(r.body.shortSkus || []).map(beanName).join("・")}）。在庫は確保していません。店舗に通知しました。` });
      else if (r.body.review) setState({ busy: false, ok: "", message: "在庫と発送記録が一致しないため、在庫は変更せず要確認にしました。店舗に通知しました。" });
      else setState({ busy: false, message: "", ok: r.body.applied === false ? `${okText}（すでに処理済みでした）` : okText });
      setLabel(null);
      onChanged();
      return;
    }
    if (r.status === 401 || r.status === 403) adminToken.clear();
    const detail = Array.isArray(r.body.detail) ? `（${r.body.detail.map((c) => BLOCKER_TEXT[c] || c).join("、")}）` : "";
    setState({ busy: false, message: errorText(r.body.error) + detail, ok: "" });
  }
  const prepare = () => run("prepare", (requestId) => shippingApi.prepare(token, { shipmentId: d.shipmentId, skus: [pick.a, pick.b], requestId }), "発送準備中にしました。");
  const ship = () => {
    if (!window.confirm(`${d.ref}（${shipmentLabel(d)}）を発送済みにします。在庫が減ります。よろしいですか？`)) return;
    run("ship", (requestId) => shippingApi.ship(token, { shipmentId: d.shipmentId, requestId, trackingNumber: tracking.trim() || null }), "発送済みにしました。");
  };
  const hold = () => run("hold", (requestId) => shippingApi.hold(token, { shipmentId: d.shipmentId, requestId, reason }), "保留にしました。");
  const resume = () => run("resume", (requestId) => shippingApi.resume(token, { shipmentId: d.shipmentId, requestId }), "発送予定に戻しました。");
  async function showLabel() {
    setState({ busy: true, message: "", ok: "" });
    const r = await shippingApi.label(token, d.shipmentId);
    setState({ busy: false, message: r.status === 200 ? "" : errorText(r.body.error), ok: "" });
    if (r.status === 200) setLabel(r.body);
  }
  const repeated = (sku) => d.previousBeans.includes(sku);

  return (
    <li className={`ship-item status-${d.status}${d.overdue ? " overdue" : ""}`} data-shipment={d.shipmentId}>
      <div className="ship-head">
        <strong>{dayLabel(d.date)}{d.byDate ? " まで" : ""}</strong>
        <span className="ship-status">{STATUS_TEXT[d.status] || d.status}</span>
        {d.overdue && <span className="ship-flag">期日超過</span>}
        {d.paidLate && <span className="ship-flag">遅延入金（3営業日以内）</span>}
        {!d.livemode && <span className="ship-flag test">テスト</span>}
      </div>
      <dl className="subm-facts">
        <div><dt>契約</dt><dd>{d.ref}・{shipmentLabel(d)}・{d.grams}g</dd></div>
        <div><dt>都道府県</dt><dd>{d.prefecture || "—"}</dd></div>
        <div><dt>お好み</dt><dd className="ship-pref">{d.preference || "（なし）"}</dd></div>
        <div><dt>前回の豆</dt><dd>{d.previousBeans.length ? d.previousBeans.map(beanName).join("・") : "（初めて）"}</dd></div>
        {d.beans && <div><dt>選んだ豆</dt><dd>{d.beans.map((b) => beanName(b.sku)).join("・")}</dd></div>}
        {d.trackingNumber && <div><dt>追跡番号</dt><dd>{d.trackingNumber}</dd></div>}
        {d.holdReason && <div><dt>保留の理由</dt><dd>{HOLD_TEXT[d.holdReason] || d.holdReason}{d.shortSkus?.length ? `（${d.shortSkus.map(beanName).join("・")}）` : ""}</dd></div>}
        {d.review && <div><dt>要確認</dt><dd>{d.review === "INVENTORY_INCONSISTENCY" ? "在庫と発送記録の不一致" : d.review}</dd></div>}
      </dl>
      {blocked && d.status !== "shipped" && <p className="subm-alert">送れません：{d.blockers.map((c) => BLOCKER_TEXT[c] || c).join("、")}</p>}
      {d.repeatedBeans.length > 0 && <p className="subm-note">前回と同じ豆を選んでいます：{d.repeatedBeans.map(beanName).join("・")}</p>}
      {state.message && <p className="subm-alert" role="alert">{state.message}</p>}
      {state.ok && <p className="subm-ok" role="status">{state.ok}</p>}

      {["planned", "held"].includes(d.status) && !blocked && (
        <div className="ship-actions">
          {["a", "b"].map((k, i) => (
            <label key={k} className="subm-field"><span className="subm-label">豆{i + 1}</span>
              <select value={pick[k]} onChange={(e) => setPick({ ...pick, [k]: e.target.value })}>
                <option value="">選んでください</option>
                {usable.map((b) => <option key={b.sku} value={b.sku}>{beanName(b.sku)}（残り{b.available}）{repeated(b.sku) ? "・前回と同じ" : ""}</option>)}
              </select>
            </label>
          ))}
          <button className="subm-primary" type="button" disabled={state.busy || !pick.a || !pick.b || pick.a === pick.b} onClick={prepare}>発送準備（在庫を確保）</button>
        </div>
      )}
      {d.status === "preparing" && (
        <div className="ship-actions">
          {label ? <Label label={label} onClose={() => setLabel(null)} /> : <button className="subm-secondary" type="button" disabled={state.busy} onClick={showLabel}>宛名を表示</button>}
          <label className="subm-field"><span className="subm-label">追跡番号（任意）</span>
            <input inputMode="numeric" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="1234-5678-9012" />
          </label>
          <button className="subm-primary" type="button" disabled={state.busy || blocked} onClick={ship}>発送済みにする</button>
          <button className="subm-secondary" type="button" disabled={state.busy} onClick={resume}>準備をやめる（在庫を戻す）</button>
        </div>
      )}
      {["planned", "preparing"].includes(d.status) && (
        <div className="ship-actions ship-hold">
          <label className="subm-field"><span className="subm-label">保留の理由</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(HOLD_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="subm-secondary" type="button" disabled={state.busy} onClick={hold}>保留にする</button>
        </div>
      )}
      {["held", "needs_review"].includes(d.status) && (
        <div className="ship-actions">
          <button className="subm-secondary" type="button" disabled={state.busy} onClick={resume}>発送予定に戻す</button>
        </div>
      )}
      {d.status === "shipped" && (
        <div className="ship-actions">
          {label ? <Label label={label} onClose={() => setLabel(null)} /> : <button className="subm-secondary" type="button" disabled={state.busy} onClick={showLabel}>宛名を表示</button>}
        </div>
      )}
    </li>
  );
}

const FILTERS = { todo: "対応が必要", all: "すべて", shipped: "発送済み" };

export default function SubscriptionShippingAdminPage() {
  const [token, setToken] = useState(adminToken.get());
  const [range, setRange] = useState(() => ({ from: jstToday(), to: addDays(jstToday(), 14) }));
  const [filter, setFilter] = useState("todo");
  const [work, setWork] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const apply = useCallback((r) => {
    setLoading(false);
    if (r.status === 200) { setWork(r.body); setMessage(""); return; }
    if (r.status === 403) { adminToken.clear(); setToken(""); }
    setWork(null);
    setMessage(errorText(r.body.error));
  }, []);
  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    shippingApi.work(token, range.from, range.to).then(apply);
  }, [token, range, apply]);
  // First view after the token is entered, for the default range (another range is applied with 更新).
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    shippingApi.work(token, jstToday(), addDays(jstToday(), 14)).then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [token, apply]);

  if (!token) {
    return (
      <div className="legal-page-shell">
        <main className="legal-main">
          <div className="legal-document subm ship-admin">
            <h1>定期便 発送管理</h1>
            <TokenForm message={message} onSet={(v) => { adminToken.set(v); setToken(v); }} />
          </div>
        </main>
      </div>
    );
  }
  const shown = (work?.deliveries || []).filter((d) => filter === "all" || (filter === "shipped" ? d.status === "shipped" : d.status !== "shipped"));
  return (
    <div className="legal-page-shell">
    <main className="legal-main">
    <div className="legal-document subm ship-admin">
      <h1>定期便 発送管理</h1>
      <p className="subm-note">2種類の豆を選んで「発送準備」（在庫を1袋ずつ確保）→ 梱包 →「発送済みにする」（ここで在庫が減ります）。土日祝の発送日は翌営業日に移っています。</p>
      <form className="ship-toolbar" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <label className="subm-field"><span className="subm-label">から</span><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="subm-field"><span className="subm-label">まで</span><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <button className="subm-secondary" type="submit" disabled={loading}>{loading ? "読み込み中…" : "更新"}</button>
        <button className="subm-secondary" type="button" onClick={() => { adminToken.clear(); setToken(""); setWork(null); }}>ログアウト</button>
      </form>
      {message && <p className="subm-alert" role="alert">{message}</p>}
      {work && (
        <>
          <p className="subm-text">発送予定 {work.counts.planned}・準備中 {work.counts.preparing}・保留 {work.counts.held}・要確認 {work.counts.needs_review}・発送済み {work.counts.shipped}</p>
          <StockCard stock={work.stock} />
          <section className="subm-card" aria-label="発送">
            <div className="subm-choices ship-filter">
              {Object.entries(FILTERS).map(([k, v]) => <button key={k} type="button" className={`subm-choice${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{v}</button>)}
            </div>
            {shown.length === 0 ? <p className="subm-text">この期間に対象の発送はありません。</p> : (
              <ul className="ship-list">
                {shown.map((d) => <Delivery key={d.shipmentId} d={d} beans={work.stock.beans} token={token} onChanged={load} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
    </main>
    </div>
  );
}
