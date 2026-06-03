import { useEffect, useState } from "react";
import { getBeans, adjustStock, calcRoastedGrams, calcAvailableCounts, getStockStatus } from "../lib/inventory";

export default function InventoryPage() {
  const [beans, setBeans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(null);
  const [deltaInput, setDeltaInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [adjustType, setAdjustType] = useState("in");

  useEffect(() => { getBeans().then((data) => { setBeans(data); setLoading(false); }); }, []);

  async function handleAdjust(bean) {
    const delta = parseInt(deltaInput, 10);
    if (isNaN(delta) || delta === 0) return;
    const sign = adjustType === "out" ? -1 : 1;
    await adjustStock(bean.id, delta * sign, adjustType, noteInput);
    const updated = await getBeans();
    setBeans(updated);
    setAdjusting(null); setDeltaInput(""); setNoteInput("");
  }

  const statusMap = { ok: { label: "在庫あり", color: "#15803d", bg: "#dcfce7" }, low: { label: "残りわずか", color: "#b45309", bg: "#fef3c7" }, out: { label: "在庫切れ", color: "#dc2626", bg: "#fee2e2" } };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "16rem" }}><div style={{ width: "1.5rem", height: "1.5rem", border: "2px solid #8B7355", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} /></div>;

  return (
    <div style={{ minHeight: "100vh", background: "#F9F6F1", color: "#2C2C2C", paddingBottom: "5rem" }}>
      <header style={{ padding: "2.5rem 1.5rem", borderBottom: "1px solid #D4C5B0" }}>
        <p style={{ fontSize: "0.65rem", letterSpacing: "0.3em", color: "#8B7355", textTransform: "uppercase", marginBottom: "0.25rem" }}>管理</p>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.5rem", fontWeight: 300 }}>在庫管理</h1>
      </header>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "2.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
        {beans.map((bean) => {
          const status = getStockStatus(bean);
          const { label, color, bg } = statusMap[status];
          const roasted = calcRoastedGrams(bean.rawGrams, bean.roastYieldRate);
          const counts = calcAvailableCounts(bean);

          return (
            <div key={bean.id} style={{ border: "1px solid #D4C5B0", background: "#fff", padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", fontWeight: 300 }}>{bean.name}</h2>
                  <p style={{ fontSize: "0.7rem", color: "#8B7355", letterSpacing: "0.1em", marginTop: "0.25rem" }}>{bean.origin} ／ {bean.roastLevel}</p>
                </div>
                <span style={{ fontSize: "0.7rem", padding: "0.25rem 0.75rem", borderRadius: "9999px", background: bg, color, fontWeight: 500 }}>{label}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                {[["生豆在庫", `${bean.rawGrams.toLocaleString()} g`], ["焙煎後換算", `${roasted.toLocaleString()} g`], ["残りわずか閾値", `${bean.lowStockThresholdGrams.toLocaleString()} g`], ["歩留まり", `${(bean.roastYieldRate * 100).toFixed(0)}%`]].map(([l, v]) => (
                  <div key={l}>
                    <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "#8B7355", marginBottom: "0.25rem" }}>{l}</p>
                    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.25rem", fontWeight: 300 }}>{v}</p>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <p style={{ fontSize: "0.6rem", letterSpacing: "0.2em", color: "#8B7355", textTransform: "uppercase", marginBottom: "0.75rem" }}>販売可能数</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
                  {Object.entries(counts).map(([key, count]) => (
                    <div key={key} style={{ background: "#F9F6F1", padding: "0.5rem", textAlign: "center" }}>
                      <p style={{ fontSize: "0.6rem", color: "#8B7355", marginBottom: "0.25rem" }}>{key.replace("_", " ")}</p>
                      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", fontWeight: 300, color: count === 0 ? "#dc2626" : count <= 3 ? "#d97706" : "inherit" }}>{count}</p>
                    </div>
                  ))}
                </div>
              </div>

              {adjusting === bean.id ? (
                <div style={{ borderTop: "1px solid #D4C5B0", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {["in", "out", "adjust"].map((t) => (
                      <button key={t} onClick={() => setAdjustType(t)}
                        style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem", border: `1px solid ${adjustType === t ? "#2C2C2C" : "#D4C5B0"}`, background: adjustType === t ? "#2C2C2C" : "transparent", color: adjustType === t ? "#fff" : "#8B7355", cursor: "pointer" }}>
                        {t === "in" ? "入荷" : t === "out" ? "出荷" : "調整"}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
                    <div>
                      <p style={{ fontSize: "0.6rem", color: "#8B7355", marginBottom: "0.25rem" }}>量 (g)</p>
                      <input type="number" value={deltaInput} onChange={(e) => setDeltaInput(e.target.value)}
                        style={{ border: "1px solid #D4C5B0", padding: "0.5rem 0.75rem", width: "6rem", fontSize: "0.9rem" }} placeholder="1000" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "0.6rem", color: "#8B7355", marginBottom: "0.25rem" }}>メモ</p>
                      <input type="text" value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
                        style={{ border: "1px solid #D4C5B0", padding: "0.5rem 0.75rem", width: "100%", fontSize: "0.9rem", boxSizing: "border-box" }} placeholder="農園名・入荷日など" />
                    </div>
                    <button onClick={() => handleAdjust(bean)} style={{ padding: "0.5rem 1rem", background: "#2C2C2C", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>確定</button>
                    <button onClick={() => setAdjusting(null)} style={{ padding: "0.5rem 1rem", border: "1px solid #D4C5B0", color: "#8B7355", background: "none", cursor: "pointer", fontSize: "0.85rem" }}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAdjusting(bean.id)}
                  style={{ fontSize: "0.7rem", letterSpacing: "0.2em", color: "#8B7355", textTransform: "uppercase", border: "1px solid #D4C5B0", padding: "0.5rem 1rem", background: "none", cursor: "pointer" }}>
                  在庫を調整
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
