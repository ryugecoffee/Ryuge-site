import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createDiaryEntry, updateDiaryEntry, getDiaryEntry } from "../../lib/diary";
import { uploadDiaryPhoto, deleteDiaryPhoto } from "../../lib/diaryStorage";

export default function DiaryAdminPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [keywords, setKeywords] = useState("");
  const [photoUrls, setPhotoUrls] = useState([]);
  const [coverPhotoIndex, setCoverPhotoIndex] = useState(0);
  const [publishedAt, setPublishedAt] = useState(new Date().toISOString().slice(0, 10));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftId, setDraftId] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    getDiaryEntry(id).then((entry) => {
      if (!entry) return;
      setTitle(entry.title);
      setBody(entry.body);
      setKeywords(entry.keywords.join(", "));
      setPhotoUrls(entry.photoUrls);
      setCoverPhotoIndex(entry.coverPhotoIndex);
      setPublishedAt(entry.publishedAt.toISOString().slice(0, 10));
      setDraftId(entry.id);
    });
  }, [id]);

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      let entryId = draftId;
      if (!entryId) {
        entryId = await createDiaryEntry({ title: title || "（下書き）", body: "", keywords: [], photoUrls: [], published: false });
        setDraftId(entryId);
      }
      const urls = await Promise.all(files.map((f) => uploadDiaryPhoto(entryId, f)));
      setPhotoUrls((prev) => [...prev, ...urls]);
    } catch { setError("写真のアップロードに失敗しました。"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handlePhotoDelete(index) {
    try { await deleteDiaryPhoto(photoUrls[index]); } catch {}
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index));
    if (coverPhotoIndex >= index && coverPhotoIndex > 0) setCoverPhotoIndex((v) => v - 1);
  }

  async function handleSave(publish) {
    if (!title.trim()) { setError("タイトルを入力してください。"); return; }
    setSaving(true); setError("");
    const kwArray = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const payload = { title: title.trim(), body: body.trim(), keywords: kwArray, photoUrls, coverPhotoIndex, publishedAt: new Date(publishedAt), published: publish };
    try {
      if (draftId) { await updateDiaryEntry(draftId, payload); navigate(`/diary/${draftId}`); }
      else { const newId = await createDiaryEntry(payload); navigate(`/diary/${newId}`); }
    } catch { setError("保存に失敗しました。"); }
    finally { setSaving(false); }
  }

  const s = { input: { width: "100%", border: "1px solid #D4C5B0", background: "#fff", padding: "0.75rem 1rem", fontFamily: "inherit", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }, label: { display: "block", fontSize: "0.65rem", letterSpacing: "0.2em", color: "#8B7355", textTransform: "uppercase", marginBottom: "0.5rem" } };

  return (
    <div style={{ minHeight: "100vh", background: "#F9F6F1", color: "#2C2C2C", paddingBottom: "5rem" }}>
      <header style={{ padding: "2rem 1.5rem", borderBottom: "1px solid #D4C5B0" }}>
        <p style={s.label}>管理</p>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", fontWeight: 300 }}>{isEdit ? "日記を編集" : "新しい日記"}</h1>
      </header>

      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "2.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
        {error && <p style={{ color: "#dc2626", fontSize: "0.85rem" }}>{error}</p>}

        <div><label style={s.label}>タイトル</label><input style={{ ...s.input, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.25rem" }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="日記のタイトル" /></div>
        <div><label style={s.label}>キーワード（カンマ区切り）</label><input style={s.input} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="焙煎, エチオピア, 農園訪問" /></div>

        <div>
          <label style={s.label}>写真</label>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotoUpload} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ border: "1px dashed #D4C5B0", padding: "1rem 1.5rem", fontSize: "0.85rem", color: "#8B7355", background: "none", cursor: "pointer" }}>
            {uploading ? "アップロード中..." : "+ 写真を追加"}
          </button>
          {photoUrls.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginTop: "1rem" }}>
              {photoUrls.map((url, i) => (
                <div key={url} style={{ position: "relative" }}>
                  <img src={url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
                  <button onClick={() => setCoverPhotoIndex(i)}
                    style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0.25rem", fontSize: "0.6rem", background: coverPhotoIndex === i ? "#2C2C2C" : "rgba(0,0,0,0.4)", color: "#fff", border: "none", cursor: "pointer" }}>
                    {coverPhotoIndex === i ? "カバー" : "カバーに設定"}
                  </button>
                  <button onClick={() => handlePhotoDelete(i)}
                    style={{ position: "absolute", top: "0.25rem", right: "0.25rem", width: "1.5rem", height: "1.5rem", background: "rgba(255,255,255,0.8)", border: "none", cursor: "pointer", fontSize: "0.75rem" }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div><label style={s.label}>本文</label><textarea style={{ ...s.input, lineHeight: 2, resize: "none" }} rows={16} value={body} onChange={(e) => setBody(e.target.value)} placeholder="今日は鎌倉の農園を訪れました..." /></div>
        <div><label style={s.label}>公開日</label><input type="date" style={{ ...s.input, width: "auto" }} value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} /></div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <button onClick={() => handleSave(false)} disabled={saving}
            style={{ padding: "0.75rem 1.5rem", border: "1px solid #D4C5B0", fontSize: "0.8rem", letterSpacing: "0.1em", color: "#8B7355", background: "none", cursor: "pointer" }}>
            下書き保存
          </button>
          <button onClick={() => handleSave(true)} disabled={saving}
            style={{ padding: "0.75rem 1.5rem", background: "#2C2C2C", color: "#fff", fontSize: "0.8rem", letterSpacing: "0.1em", border: "none", cursor: "pointer" }}>
            {saving ? "保存中..." : "公開する"}
          </button>
        </div>
      </div>
    </div>
  );
}
