import { Link } from "react-router-dom";

const UI = {
  ja: {
    eyebrow: "Access",
    title: "龍華珈琲へのアクセス",
    accessLabel: "アクセス",
    kitaName: "北鎌倉駅",
    kitaTime: "JR横須賀線　徒歩 15分",
    kamaName: "鎌倉駅",
    kamaTime: "JR横須賀線　徒歩 20分",
    busName: "建長寺バス停",
    busTime: "江ノ電バス　徒歩 5分",
    hoursLabel: "営業時間",
    spring: "春〜秋（3〜11月）",
    winter: "冬（12〜2月）",
    irregular: "※ 不定休。営業日はInstagramにてご確認ください。",
    addrLabel: "住所",
    addr: ["〒247-0062", "神奈川県鎌倉市山ノ内1543", "円応寺内"],
    mapLink: "Google Maps で確認 →",
  },
  en: {
    eyebrow: "Access",
    title: "Getting to Ryuge Coffee",
    accessLabel: "Directions",
    kitaName: "Kita-Kamakura Station",
    kitaTime: "JR Yokosuka Line — 15 min walk",
    kamaName: "Kamakura Station",
    kamaTime: "JR Yokosuka Line — 20 min walk",
    busName: "Kenchoji Bus Stop",
    busTime: "Enoden Bus — 5 min walk",
    hoursLabel: "Hours",
    spring: "Spring–Autumn (Mar–Nov)",
    winter: "Winter (Dec–Feb)",
    irregular: "* Hours may vary. Check Instagram for the latest schedule.",
    addrLabel: "Address",
    addr: ["1543 Yamanouchi, Kamakura", "Kanagawa 247-0062", "Inside Ennoji Temple"],
    mapLink: "View on Google Maps →",
  },
  es: {
    eyebrow: "Acceso",
    title: "Cómo llegar a Ryuge Coffee",
    accessLabel: "Cómo llegar",
    kitaName: "Estación Kita-Kamakura",
    kitaTime: "Línea JR Yokosuka — 15 min a pie",
    kamaName: "Estación Kamakura",
    kamaTime: "Línea JR Yokosuka — 20 min a pie",
    busName: "Parada Kenchoji",
    busTime: "Bus Enoden — 5 min a pie",
    hoursLabel: "Horario",
    spring: "Primavera–Otoño (mar–nov)",
    winter: "Invierno (dic–feb)",
    irregular: "* Horario irregular. Consulta Instagram para más detalles.",
    addrLabel: "Dirección",
    addr: ["1543 Yamanouchi, Kamakura", "Kanagawa 247-0062", "Dentro del Templo Ennoji"],
    mapLink: "Ver en Google Maps →",
  },
};

const routes = (t) => [
  { name: t.kitaName, time: t.kitaTime },
  { name: t.kamaName, time: t.kamaTime },
  { name: t.busName,  time: t.busTime  },
];

const hours = (t) => [
  { season: t.spring, time: "9:00–16:00" },
  { season: t.winter, time: "9:00–15:30" },
];

export default function AccessSection({ lang = "ja" }) {
  const t = UI[lang] || UI.ja;

  return (
    <section style={{ padding: "80px 48px", maxWidth: "960px", margin: "0 auto" }}>

      <p style={{ margin: "0 0 14px", fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
        {t.eyebrow}
      </p>

      <h2 style={{ margin: "0 0 48px", fontSize: "clamp(22px, 2vw, 30px)", fontWeight: 400, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.01em", lineHeight: 1.15 }}>
        {t.title}
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px", alignItems: "start" }}>

        {/* ── 左カラム：地図（後から写真に差し替え可） ── */}
        <div style={{ borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
          <svg viewBox="0 0 360 440" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", display: "block" }}>
            <rect width="360" height="440" fill="rgba(255,255,255,0.02)" />
            <line x1="0" y1="110" x2="360" y2="110" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            <line x1="0" y1="220" x2="360" y2="220" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            <line x1="0" y1="330" x2="360" y2="330" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            <line x1="120" y1="0" x2="120" y2="440" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            <line x1="240" y1="0" x2="240" y2="440" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            <path d="M 148 30 L 148 420" stroke="rgba(255,255,255,0.3)" strokeWidth="3.5" fill="none" />
            <path d="M 148 185 Q 175 182 210 178 Q 250 174 300 168" stroke="rgba(255,255,255,0.2)" strokeWidth="2" fill="none" />
            <path d="M 148 185 Q 160 200 170 220 Q 185 248 195 275 Q 210 310 218 350 Q 224 380 228 415" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" fill="none" strokeDasharray="4,3" />
            <rect x="30" y="22" width="60" height="20" rx="3" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
            <text x="60" y="36" fontSize="10" fill="rgba(255,255,255,0.7)" fontFamily="sans-serif" textAnchor="middle" fontWeight="500">北鎌倉駅</text>
            <circle cx="148" cy="30" r="5" fill="rgba(255,255,255,0.9)" />
            <line x1="90" y1="32" x2="143" y2="32" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="2,2" />
            <circle cx="148" cy="155" r="4" fill="rgba(255,255,255,0.5)" />
            <text x="158" y="151" fontSize="9" fill="rgba(255,255,255,0.45)" fontFamily="sans-serif">建長寺BS</text>
            <rect x="168" y="178" width="72" height="28" rx="4" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
            <text x="204" y="191" fontSize="9" fill="rgba(255,255,255,0.9)" fontFamily="sans-serif" textAnchor="middle" fontWeight="500">龍華珈琲</text>
            <text x="204" y="201" fontSize="8" fill="rgba(255,255,255,0.45)" fontFamily="sans-serif" textAnchor="middle">Ryuge Coffee</text>
            <circle cx="168" cy="185" r="4" fill="rgba(255,255,255,0.9)" />
            <circle cx="228" cy="415" r="6" fill="rgba(255,255,255,0.9)" />
            <rect x="238" y="406" width="54" height="18" rx="3" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
            <text x="265" y="418" fontSize="9" fill="rgba(255,255,255,0.7)" fontFamily="sans-serif" textAnchor="middle" fontWeight="500">鎌倉駅</text>
            <text x="138" y="80" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif" textAnchor="middle" transform="rotate(90,138,80)">横須賀線</text>
            <text x="250" y="160" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif" transform="rotate(-3,250,160)">県道21号</text>
            <text x="18" y="55" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">↑ 円覚寺</text>
            <text x="50" y="200" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">海蔵寺</text>
            <text x="255" y="230" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">鶴岡八幡宮</text>
            <text x="18" y="40" fontSize="7" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">N</text>
            <line x1="22" y1="42" x2="22" y2="55" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
            <polygon points="22,42 19,50 22,48 25,50" fill="rgba(255,255,255,0.3)" />
          </svg>
        </div>

        {/* ── 右カラム：情報 ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>

          {/* アクセス */}
          <div>
            <p style={{ margin: "0 0 14px", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
              {t.accessLabel}
            </p>
            {routes(t).map((row, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "13px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none" }}
              >
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "rgba(255,255,255,0.9)", marginTop: "5px", flexShrink: 0 }} />
                <div>
                  <p style={{ margin: "0 0 3px", fontSize: "13px", color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{row.name}</p>
                  <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.52)" }}>{row.time}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 営業時間 */}
          <div>
            <p style={{ margin: "0 0 14px", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
              {t.hoursLabel}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
              {hours(t).map((h, i) => (
                <div key={i} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.04)", borderRadius: "8px" }}>
                  <p style={{ margin: "0 0 4px", fontSize: "11px", color: "rgba(255,255,255,0.38)" }}>{h.season}</p>
                  <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{h.time}</p>
                </div>
              ))}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "12px", color: "rgba(255,255,255,0.38)", lineHeight: 1.6 }}>
              {t.irregular}
            </p>
          </div>

          {/* 住所 */}
          <div>
            <p style={{ margin: "0 0 14px", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
              {t.addrLabel}
            </p>
            <p style={{ margin: "0 0 10px", fontSize: "13px", color: "rgba(255,255,255,0.52)", lineHeight: 1.9 }}>
              {t.addr.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.addr.length - 1 && <br />}
                </span>
              ))}
            </p>
            <a
              href="https://www.google.com/maps/search/?api=1&query=神奈川県鎌倉市山ノ内1543円応寺"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "11px", letterSpacing: "0.08em", color: "rgba(255,255,255,0.52)", borderBottom: "1px solid rgba(255,255,255,0.16)", paddingBottom: "2px", textDecoration: "none", display: "inline-block" }}
            >
              {t.mapLink}
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}