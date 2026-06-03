import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getDiaryEntries, getDiaryEntriesByKeyword } from "../../lib/diary";

const PLACEHOLDER = "/images/placeholder-coffee.jpg";

export default function DiaryPage() {
  const [searchParams] = [new URLSearchParams(useLocation().search)];
  const keyword = searchParams.get("keyword") ?? "";
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allKeywords, setAllKeywords] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = keyword
        ? await getDiaryEntriesByKeyword(keyword)
        : await getDiaryEntries();
      setEntries(data);
      setAllKeywords([...new Set(data.flatMap((e) => e.keywords))].sort());
      setLoading(false);
    })();
  }, [keyword]);

  return (
    <div style={{ minHeight: "100vh", background: "#F9F6F1", color: "#2C2C2C" }}>
      <header style={{ padding: "4rem 1.5rem 2rem", textAlign: "center", borderBottom: "1px solid #D4C5B0" }}>
        <p style={{ fontSize: "0.7rem", letterSpacing: "0.3em", color: "#8B7355", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Ryuge Coffee
        </p>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "3rem", fontWeight: 300 }}>日記</h1>
      </header>

      <div style={{ maxWidth: "1024px", margin: "0 auto", padding: "3rem 1.5rem" }}>
        {allKeywords.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "2.5rem" }}>
            <Link to="/diary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.7rem", letterSpacing: "0.15em", border: `1px solid ${!keyword ? "#2C2C2C" : "#D4C5B0"}`, background: !keyword ? "#2C2C2C" : "transparent", color: !keyword ? "#fff" : "#8B7355", textDecoration: "none" }}>
              すべて
            </Link>
            {allKeywords.map((kw) => (
              <Link key={kw} to={`/diary?keyword=${encodeURIComponent(kw)}`}
                style={{ padding: "0.25rem 0.75rem", fontSize: "0.7rem", letterSpacing: "0.15em", border: `1px solid ${keyword === kw ? "#2C2C2C" : "#D4C5B0"}`, background: keyword === kw ? "#2C2C2C" : "transparent", color: keyword === kw ? "#fff" : "#8B7355", textDecoration: "none" }}>
                {kw}
              </Link>
            ))}
          </div>
        )}

        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "2rem" }}>
            {[...Array(6)].map((_, i) => (
              <div key={i}>
                <div style={{ aspectRatio: "4/3", background: "#E8DFD0", marginBottom: "1rem" }} />
                <div style={{ height: "1rem", background: "#E8DFD0", marginBottom: "0.5rem", width: "75%" }} />
                <div style={{ height: "0.75rem", background: "#E8DFD0", width: "50%" }} />
              </div>
            ))}
          </div>
        )}

        {!loading && entries.length === 0 && (
          <p style={{ textAlign: "center", color: "#8B7355", padding: "5rem 0" }}>まだ日記がありません。</p>
        )}

        {!loading && entries.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "2rem" }}>
            {entries.map((entry) => <DiaryCard key={entry.id} entry={entry} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function DiaryCard({ entry }) {
  const cover = entry.photoUrls[entry.coverPhotoIndex] ?? entry.photoUrls[0] ?? PLACEHOLDER;
  const dateStr = entry.publishedAt.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  return (
    <Link to={`/diary/${entry.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <article>
        <div style={{ aspectRatio: "4/3", overflow: "hidden", marginBottom: "1rem", background: "#E8DFD0" }}>
          <img src={cover} alt={entry.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        {entry.keywords.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            {entry.keywords.slice(0, 3).map((kw) => (
              <span key={kw} style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: "#8B7355", textTransform: "uppercase" }}>{kw}</span>
            ))}
          </div>
        )}
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", fontWeight: 300, marginBottom: "0.25rem" }}>{entry.title}</h2>
        <p style={{ fontSize: "0.7rem", color: "#8B7355", letterSpacing: "0.1em" }}>{dateStr}</p>
      </article>
    </Link>
  );
}
