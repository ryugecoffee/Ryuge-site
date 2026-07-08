// AI 豆コンシェルジュ — Claude API を使った好み診断チャット
// 必要な環境変数 (Vercel で設定):
//   ANTHROPIC_API_KEY  … Anthropic の API キー
//   ANTHROPIC_MODEL    … 省略可。デフォルトは claude-sonnet-5

import { PRODUCT_DATA } from "../src/productData.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_MESSAGES = 12; // 会話履歴の上限(コスト管理)
const MAX_CHARS_PER_MESSAGE = 1000;

// ── レート制限(悪用・連投対策) ─────────────────────────────
// サーバーレスのウォームインスタンス単位のメモリ制限。完全ではないが
// スクリプトによる連投をほぼ止められる。最終防壁は Anthropic 側の月額上限。
const RATE_PER_MINUTE = 8;   // 同一IP: 1分あたり
const RATE_PER_DAY = 40;     // 同一IP: 1日あたり
const GLOBAL_PER_DAY = 500;  // サイト全体: 1日あたり
const ipBuckets = new Map();
let globalBucket = { day: "", count: 0 };

function checkRateLimit(ip) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // グローバル上限
  if (globalBucket.day !== today) globalBucket = { day: today, count: 0 };
  if (globalBucket.count >= GLOBAL_PER_DAY) return false;

  // IP別
  if (ipBuckets.size > 5000) ipBuckets.clear(); // メモリ保護
  let b = ipBuckets.get(ip);
  if (!b || b.day !== today) {
    b = { day: today, dayCount: 0, minuteStart: now, minuteCount: 0 };
    ipBuckets.set(ip, b);
  }
  if (now - b.minuteStart > 60_000) {
    b.minuteStart = now;
    b.minuteCount = 0;
  }
  if (b.minuteCount >= RATE_PER_MINUTE || b.dayCount >= RATE_PER_DAY) return false;

  b.minuteCount += 1;
  b.dayCount += 1;
  globalBucket.count += 1;
  return true;
}

// 商品カタログをテキスト化(productData.js が唯一の情報源)
function buildCatalog() {
  const lines = [];
  const push = (p, series) => {
    lines.push(
      `- [${series}] ${p.title?.ja} (${p.title?.en}) / ${p.price} / ${p.size || p.weight || ""}` +
        (p.origin ? ` / 産地: ${p.origin}` : "") +
        (p.process ? ` / プロセス: ${p.process}` : "") +
        (p.flavor ? ` / フレーバー: ${p.flavor}` : "") +
        (p.summary?.ja ? ` / ${p.summary.ja}` : "") +
        (p.isSoldOut ? " / ※売り切れ" : "")
    );
  };
  (PRODUCT_DATA.enma || []).forEach((p) => push(p, "閻魔"));
  (PRODUCT_DATA.woodbox || []).forEach((p) => push(p, "木函"));
  (PRODUCT_DATA.bag || []).forEach((p) => push(p, "袋シリーズ"));
  lines.push("- [定期便 折々] 珈琲袋定期便 ¥2,000/月(珈琲袋×8) / 豆の定期便 ¥1,700/月(閻魔180gランダム) / 禅の仕立て便 ¥3,300/月(珈琲袋×8+ほうじ茶袋×8)");

  // まだ購入不可(comingSoon)の商品は「近日公開」であることを明示した上で別枠で伝える
  (PRODUCT_DATA.oriori || [])
    .filter((p) => p.comingSoon)
    .forEach((p) => {
      lines.push(
        `- [近日公開・現在は販売不可] ${p.title?.ja}(${p.title?.en}) / ${p.weight || ""} / ${p.summary?.ja || ""}`
      );
    });

  return lines.join("\n");
}

const SYSTEM_PROMPT = `あなたは鎌倉の珈琲ブランド「龍華珈琲 (Ryuge Coffee)」の豆コンシェルジュです。

役割: お客様の好み(苦味/酸味、飲み方、普段飲んでいるコーヒー、ミルクの有無など)を1〜2個ずつ質問しながら聞き取り、下記カタログから最適な商品を提案する。

カタログ:
${buildCatalog()}

ルール:
- 回答は簡潔に。3文以内+必要なら質問1つ。長文禁止
- 提案時は商品名と価格を明記し、なぜその人に合うかを一言添える
- 毎日飲む方には定期便もさりげなく案内する
- 売り切れ商品は提案しない
- 「近日公開・現在は販売不可」の商品は、聞かれたら存在と概要だけ伝えてよいが、購入や注文は不可であることを明確に伝える(カートやご案内は不可)
- カタログにない商品は絶対に提案しない。値引きや送料の約束もしない(送料は1個¥200、2個以上と定期便は無料、とだけ案内可)
- 豆は「豆のまま」での販売のみ。挽き(粉)対応は約束しない。粉をご希望の方には、お湯を注ぐだけの「珈琲袋」をおすすめする
- コーヒー・お茶・当店に関係ない話題は丁寧に断り、コーヒーの話に戻す
- お客様の言語(日本語/英語/スペイン語)に合わせて返答する`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Concierge is not configured." });
  }

  // レート制限チェック
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required." });
    }

    // 入力のサニタイズ: role と content のみ許可、長さ制限
    const cleaned = messages
      .slice(-MAX_MESSAGES)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS_PER_MESSAGE) }));

    if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== "user") {
      return res.status(400).json({ error: "Last message must be from user." });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: cleaned,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errText);
      return res.status(502).json({ error: "Concierge is temporarily unavailable." });
    }

    const data = await anthropicRes.json();
    const reply = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("coffee-concierge error:", err);
    return res.status(500).json({ error: "Internal error." });
  }
}
