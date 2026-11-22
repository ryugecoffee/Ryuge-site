# Factory（Jennifer・ChatGPT）からの注文管理と自動通知

2026-11-22。Factory から店舗の売上・発送を照会し、CEO の承認で発送準備・発送済みを登録します。店舗からは新規決済や異常を Factory に通知します。

## 1. Factory → 店舗（照会・発送）

署名付き Factory API（`server/factory-refund-api.js`、返金と同じ入口）に、次の操作を追加しました。

| 操作 | 内容 | 必要な設定 |
| --- | --- | --- |
| `store.overview` | 期間（最大92日、日本時間）の売上（通常注文・定期便の初回・月額）、未発送・期限切れの件数 | `FACTORY_STORE_READ_ENABLED=true` |
| `fulfillment.list` | 発送対象の一覧（`open` 未発送 / `soon` 今日・明日が期限 / `late` 期限切れ / `shipped` 発送済み）。通常注文・定期便をまとめて表示 | `FACTORY_STORE_READ_ENABLED=true` |
| `fulfillment.prepare` | 発送準備（通常注文は状態のみ。定期便は豆2種類を1袋ずつ確保） | `FACTORY_STORE_SHIP_ENABLED=true` と CEO の承認 |
| `fulfillment.ship` | 発送済み（配送方法・追跡番号）。お客様への発送メールは1回だけ | `FACTORY_STORE_SHIP_ENABLED=true` と CEO の承認 |

- **照会と発送は別のスイッチ**です。照会を ON にしても発送はできません。どちらも未設定なら 403 になり、何も記録されません。
- **発送準備・発送済みには CEO の承認記録が必須**です（承認者が `FACTORY_CEO_USER_ID` と一致し、承認から15分以内）。足りなければ、ワンタイム番号の記録より前に拒否します。
- **1つの承認につき1回だけ実行**します（承認IDをリクエストIDとして使用）。同じ承認を再送しても最初の結果が返り、メールは再送されません。同じ承認で別の内容を送ると `REQUEST_ID_CONFLICT` で拒否します。
- 処理そのものは店舗の発送ページ（#39）と同じコードです。通常注文では在庫は動かず（決済時に処理済み）、定期便は従来どおりの在庫手順です。実行者は `factory-ceo:<CEOのID>` として記録されます。
- **Factory に返す情報には個人情報を含めません。** 注文番号、金額、商品名、都道府県のみで、氏名・メール・電話・番地は返しません。
- 2026-11-21 より前の注文は対象外です（`EARLIER_ORDER`、従来どおり）。

## 2. 店舗 → Factory（自動通知）

| 種類 | いつ | 区分 |
| --- | --- | --- |
| `order.paid` | 通常注文の決済成功（Stripe の再送でも1回だけ） | 記録 |
| `subscription.paid` | 定期便の決済成功（初回・月額。請求書ごとに1回） | 記録 |
| `payment.failed` | 定期便の決済失敗（再試行ごとに1回） | 要対応 |
| `deadline.soon` / `deadline.overdue` | 発送期限が今日・明日／期限切れ（30分ごとの確認。1件につき各1回） | 要対応 |
| `stock.low` | 注文後に在庫が3袋以下（商品・残数ごとに1回） | 要対応 |
| `stock.short` | 定期便の発送準備で在庫不足、または在庫と記録の不一致 | 要対応 |
| `mail.failed` | 発送メールの送信失敗（発送済みの状態はそのまま） | 要対応 |
| `webhook.failed` | 店舗が処理できなかった Stripe イベント（Stripe が再送します） | 要対応 |

- **同じ出来事は1回だけ通知**します。通知IDは内容から決まり（例：`order.paid:pi_…`）、店舗側（Firestore `factoryNotices`）でも Factory 側でも重複を防ぎます。
- **先に店舗側に保存してから送信**するため、Factory が応答しなくても失われません。未送信分は間隔をあけて最大12回まで再送し、その後は `failed` として残ります。
- **署名付き**です：`X-Ryuge-Timestamp`（ミリ秒13桁）と `X-Ryuge-Signature` = HMAC-SHA256(`FACTORY_NOTIFY_HMAC_SECRET`, `"POST\n" + パス + "\n" + 時刻 + "\n" + 本文`)。この鍵は他の鍵とは別にします。
- **個人情報は通知に含めません。** 許可した項目（注文番号、金額、商品名、都道府県、期限など）以外はすべて送信前に除外します。
- 通知の失敗が決済・Webhook・発送を止めることはありません。

## 3. 本番の設定（CEO の承認後）

Render（決済サーバー）に設定します。値はチャットに貼らないでください。

| 変数 | 用途 |
| --- | --- |
| `FACTORY_STORE_READ_ENABLED=true` | 照会を ON |
| `FACTORY_STORE_SHIP_ENABLED=true` | 発送準備・発送済みを ON（照会とは別に判断） |
| `FACTORY_NOTIFY_URL` | Factory の受信先（https） |
| `FACTORY_NOTIFY_HMAC_SECRET` | 通知の署名鍵（32バイト以上。Factory 側と同じ値） |

既存の `FACTORY_REFUND_API_ENABLED`・`FACTORY_REFUND_HMAC_SECRET`・`FACTORY_CEO_USER_ID` が前提です。`FACTORY_REFUND_OPS_ENABLED` は不要です（返金とは無関係）。どれも未設定なら、この機能は何もしません。
