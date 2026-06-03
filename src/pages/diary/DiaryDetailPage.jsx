import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getDiaryEntry } from "../../lib/diary";

export default function DiaryDetailPage() {
  const { id } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    if (!id) return;
    getDiaryEntry(id).then((data) => {
      setEntry(data);
      setActivePhoto(data?.coverPhotoIndex ?? 0);
      setLoading(false);
    });
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#F9F6F1", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "2rem", height: "2rem", border: "2px solid #8B7355", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
    </div>
  );

  if (!entry) return (
    <div style={{ minHeight: "100vh", background: "#F9F6F1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
      <p style={{ color: "#8B7355" }}>日記が見つかりません。</p>
      <Link to="/diary" style={{ fontSize: "0.75rem", letterSpacing: "0.2em", color: "#2C2C2C" }}>一覧に戻る</Link>
    </div>
  );

  const dateStr = entry.publishedAt.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ minHeight: "100vh", background: "#F9F6F1", color: "#2C2C2C" }}>
      <nav style={{ padding: "1.5rem", borderBottom: "1px solid #D4C5B0" }}>
        <Link to="/diary" style={{ fontSize: "0.7rem", letterSpacing: "0.3em", color: "#8B7355", textTransform: "uppercase", textDecoration: "none" }}>← 日記一覧</Link>
      </nav>

      <article style={{ maxWidth: "720px", margin: "0 auto", padding: "4rem 1.5rem" }}>
        {entry.keywords.length > 0 && (
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {entry.keywords.map((kw) => (
              <Link key={kw} to={`/diary?keyword=${encodeURIComponent(kw)}`}
                style={{ fontSize: "0.65rem", letterSpacing: "0.3em", color: "#8B7355", textTransform: "uppercase", textDecoration: "none" }}>{kw}</Link>
            ))}
          </div>
        )}

        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "3rem", fontWeight: 300, lineHeight: 1.2, marginBottom: "1rem" }}>{entry.title}</h1>
        <p style={{ fontSize: "0.7rem", color: "#8B7355", letterSpacing: "0.2em", marginBottom: "3rem" }}>{dateStr}</p>

        {entry.photoUrls.length > 0 && (
          <div style={{ marginBottom: "2rem" }}>
            <div style={{ aspectRatio: "16/10", overflow: "hidden", background: "#E8DFD0", marginBottom: "0.75rem" }}>
              <img src={entry.photoUrls[activePhoto]} alt={entry.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            {entry.photoUrls.length > 1 && (
              <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto" }}>
                {entry.photoUrls.map((url, i) => (
                  <button key={i} onClick={() => setActivePhoto(i)}
                    style={{ flexShrink: 0, width: "4rem", height: "4rem", overflow: "hidden", border: `2px solid ${activePhoto === i ? "#2C2C2C" : "transparent"}`, opacity: activePhoto === i ? 1 : 0.6, cursor: "pointer", padding: 0, background: "none" }}>
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "1rem", lineHeight: 2, whiteSpace: "pre-wrap", letterSpacing: "0.02em" }}>
          {entry.body}
        </div>

        <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid #D4C5B0", textAlign: "center" }}>
          <Link to="/diary" style={{ fontSize: "0.7rem", letterSpacing: "0.3em", color: "#8B7355", textTransform: "uppercase", textDecoration: "none" }}>日記一覧に戻る</Link>
        </div>
      </article>
    </div>
  );
}
