/**
 * 一回限りのデータ削除スクリプト（卸・diary 機能の廃止に伴う後始末）
 *
 * 削除対象:
 *   - Firestore コレクション: wholesaleUsers / wholesaleOrders / diary_entries
 *   - Storage: diary/ 配下の全ファイル
 *
 * Firebase Admin SDK はセキュリティルールをバイパスするため、
 * ルールを `if false` にしていても本スクリプトでの削除は可能です。
 *
 * ─────────────────────────────────────────────
 * 【事前準備】
 *   firebase-admin は server/node_modules にインストール済みです。
 *   そのため本スクリプトは server/ 配下（CommonJS）に置いてあり、
 *   プロジェクトルートの .env を読み込みます。
 *
 *   .env に以下が必要です（server/index.js と同じもの）:
 *     FIREBASE_PROJECT_ID=...
 *     FIREBASE_CLIENT_EMAIL=...
 *     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *
 *   Storage を削除する場合はバケット名も指定してください（未指定なら
 *   <PROJECT_ID>.appspot.com を仮定します。新形式の場合は明示してください）:
 *     FIREBASE_STORAGE_BUCKET=your-project.appspot.com
 *
 * ─────────────────────────────────────────────
 * 【実行手順】
 *   1) まず dry-run（件数の確認のみ。何も削除しません）:
 *        node server/cleanup-unused-data.js
 *
 *   2) 内容を確認したら、実削除（取り消し不可）:
 *        node server/cleanup-unused-data.js --confirm
 *
 *   オプション:
 *     --confirm         実際に削除する（無いと dry-run）
 *     --skip-storage    Storage(diary/) の処理をスキップ（Firestore のみ）
 *     --skip-firestore  Firestore の処理をスキップ（Storage のみ）
 *
 *   ※ 念のため事前に Firebase コンソールでエクスポート/バックアップを取得することを推奨します。
 * ─────────────────────────────────────────────
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const admin = require("firebase-admin");

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const SKIP_STORAGE = args.includes("--skip-storage");
const SKIP_FIRESTORE = args.includes("--skip-firestore");

const COLLECTIONS = ["wholesaleUsers", "wholesaleOrders", "diary_entries"];
const STORAGE_PREFIX = "diary/";
const BATCH_SIZE = 400; // Firestore のバッチ上限(500)より安全側

const projectId = process.env.FIREBASE_PROJECT_ID;
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : undefined);

if (!projectId || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error(
    "[FATAL] FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY が .env に設定されていません。"
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/\\r/g, ""),
  }),
  storageBucket,
});

const db = admin.firestore();

/** コレクションをページングしながらバッチ削除する */
async function deleteCollection(collectionName) {
  const colRef = db.collection(collectionName);

  // 件数確認（aggregate count）
  const countSnap = await colRef.count().get();
  const total = countSnap.data().count;

  if (total === 0) {
    console.log(`  - ${collectionName}: 0 件（対象なし）`);
    return 0;
  }

  if (!CONFIRM) {
    console.log(`  - ${collectionName}: ${total} 件（dry-run のため削除しません）`);
    return total;
  }

  let deleted = 0;
  // 毎回先頭から limit 件取得し、空になるまで繰り返す
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await colRef.limit(BATCH_SIZE).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deleted += snap.size;
    console.log(`    ...${collectionName}: ${deleted}/${total} 件削除`);

    if (snap.size < BATCH_SIZE) break;
  }

  console.log(`  - ${collectionName}: ${deleted} 件 削除完了`);
  return deleted;
}

/** Storage の指定プレフィックス配下を削除する */
async function deleteStoragePrefix(prefix) {
  const bucket = admin.storage().bucket();
  let files;
  try {
    [files] = await bucket.getFiles({ prefix });
  } catch (e) {
    console.error(`  [Storage] バケット '${bucket.name}' へのアクセスに失敗しました: ${e.message}`);
    console.error(
      "  バケット名が正しいか確認してください（環境変数 FIREBASE_STORAGE_BUCKET で上書き可能）。"
    );
    return 0;
  }

  if (files.length === 0) {
    console.log(`  - storage://${bucket.name}/${prefix}: 0 件（対象なし）`);
    return 0;
  }

  if (!CONFIRM) {
    console.log(
      `  - storage://${bucket.name}/${prefix}: ${files.length} 件（dry-run のため削除しません）`
    );
    return files.length;
  }

  let deleted = 0;
  for (const file of files) {
    await file.delete();
    deleted += 1;
    if (deleted % 20 === 0 || deleted === files.length) {
      console.log(`    ...storage: ${deleted}/${files.length} 件削除`);
    }
  }
  console.log(`  - storage://${bucket.name}/${prefix}: ${deleted} 件 削除完了`);
  return deleted;
}

async function main() {
  console.log("==================================================");
  console.log(` プロジェクト: ${projectId}`);
  console.log(` モード: ${CONFIRM ? "★実削除（--confirm）" : "dry-run（確認のみ）"}`);
  console.log("==================================================");

  if (!SKIP_FIRESTORE) {
    console.log("\n[Firestore]");
    for (const col of COLLECTIONS) {
      await deleteCollection(col);
    }
  } else {
    console.log("\n[Firestore] --skip-firestore のためスキップ");
  }

  if (!SKIP_STORAGE) {
    console.log("\n[Storage]");
    await deleteStoragePrefix(STORAGE_PREFIX);
  } else {
    console.log("\n[Storage] --skip-storage のためスキップ");
  }

  console.log("\n--------------------------------------------------");
  if (CONFIRM) {
    console.log("完了しました。");
  } else {
    console.log("dry-run 終了。実際に削除するには --confirm を付けて再実行してください:");
    console.log("  node server/cleanup-unused-data.js --confirm");
  }
  console.log("--------------------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ERROR]", err);
    process.exit(1);
  });
