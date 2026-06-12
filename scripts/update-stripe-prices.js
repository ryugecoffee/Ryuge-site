#!/usr/bin/env node
/**
 * Stripeの定期便Priceを正しい金額で作り直すスクリプト
 *
 * 実行前に環境変数を設定:
 *   export STRIPE_SECRET_KEY=sk_...
 *
 * 実行:
 *   node scripts/update-stripe-prices.js
 */

import Stripe from "stripe";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("ERROR: STRIPE_SECRET_KEY が設定されていません");
  process.exit(1);
}

const isLive = STRIPE_SECRET_KEY.startsWith("sk_live_");
const isTest = STRIPE_SECRET_KEY.startsWith("sk_test_");

if (!isLive && !isTest) {
  console.error("ERROR: 無効なキー形式です");
  process.exit(1);
}

console.log("===========================================");
console.log(`モード: ${isLive ? "🔴 本番 (sk_live_)" : "🟢 テスト (sk_test_)"}`);
console.log("===========================================");

if (isLive) {
  console.log("\n⚠️  本番キーが検出されました。");
  console.log("続行するには 10 秒以内に Ctrl+C で中断できます...\n");
}

const PLANS = [
  {
    id: "coffee-bag",
    name: "珈琲袋定期便 (Light Subscription)",
    oldPriceId: "price_1TLpGbDYsXRGgHqsBPy4QAA0",
    correctAmount: 2000,
    envKey: "STRIPE_PRICE_COFFEE_BAG",
  },
  {
    id: "mame",
    name: "豆の定期便 (Basic Subscription)",
    oldPriceId: "price_1TLpIuDYsXRGgHqsNzUrutvM",
    correctAmount: 1700,
    envKey: "STRIPE_PRICE_MAME",
  },
  {
    id: "zen",
    name: "禅の仕立て便 (Premium Subscription)",
    oldPriceId: "price_1TLpJiDYsXRGgHqsaLcdr7U8",
    correctAmount: 3300,
    envKey: "STRIPE_PRICE_ZEN",
  },
];

async function main() {
  if (isLive) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

  const newEnvLines = [];
  const results = [];

  for (const plan of PLANS) {
    console.log(`\n--- ${plan.name} ---`);

    // 既存Priceの確認
    let oldPrice;
    try {
      oldPrice = await stripe.prices.retrieve(plan.oldPriceId);
      console.log(`  既存Price: ${plan.oldPriceId}`);
      console.log(`  既存金額:  ¥${oldPrice.unit_amount} / ${oldPrice.currency.toUpperCase()}`);
      console.log(`  正しい金額: ¥${plan.correctAmount}`);
    } catch (err) {
      console.error(`  ERROR: 既存Price取得失敗 - ${err.message}`);
      process.exit(1);
    }

    if (oldPrice.unit_amount === plan.correctAmount) {
      console.log(`  ✓ 既存Priceの金額は既に正しいです。スキップします。`);
      newEnvLines.push(`${plan.envKey}=${plan.oldPriceId}`);
      results.push({ plan: plan.id, newPriceId: plan.oldPriceId, skipped: true });
      continue;
    }

    const productId = oldPrice.product;
    console.log(`  Product ID: ${productId}`);

    // 新Priceを作成
    let newPrice;
    try {
      newPrice = await stripe.prices.create({
        product: productId,
        unit_amount: plan.correctAmount,
        currency: "jpy",
        recurring: { interval: "month" },
        metadata: { plan_id: plan.id, created_by: "update-stripe-prices-script" },
      });
      console.log(`  ✓ 新Price作成: ${newPrice.id} (¥${newPrice.unit_amount}/月)`);
    } catch (err) {
      console.error(`  ERROR: Price作成失敗 - ${err.message}`);
      process.exit(1);
    }

    // 旧Priceをアーカイブ
    try {
      await stripe.prices.update(plan.oldPriceId, { active: false });
      console.log(`  ✓ 旧Priceアーカイブ完了: ${plan.oldPriceId}`);
    } catch (err) {
      console.error(`  WARNING: アーカイブ失敗 - ${err.message}`);
    }

    newEnvLines.push(`${plan.envKey}=${newPrice.id}`);
    results.push({ plan: plan.id, newPriceId: newPrice.id, skipped: false });
  }

  // .env.new に出力
  const outputPath = path.join(__dirname, "..", ".env.new");
  fs.writeFileSync(outputPath, newEnvLines.join("\n") + "\n", "utf8");

  console.log("\n===========================================");
  console.log("完了！新しいPrice ID:");
  results.forEach((r) => {
    console.log(`  ${r.plan}: ${r.newPriceId}${r.skipped ? " (スキップ)" : ""}`);
  });
  console.log(`\n.env.new に出力しました: ${outputPath}`);
  console.log("\n次のステップ:");
  console.log("  1. .env.new の内容を Render の環境変数に設定する");
  console.log("  2. api/create-subscription-checkout.js のPrice IDを更新する");
  console.log("===========================================");
}

main().catch((err) => {
  console.error("予期せぬエラー:", err);
  process.exit(1);
});
