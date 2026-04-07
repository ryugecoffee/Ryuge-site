export default function LegalNotice() {
  return (
    <section className="legal-document">
      <p className="legal-eyebrow">Legal</p>
      <h1>特定商取引法に基づく表記</h1>
      <p className="legal-lead">
        Ryuge Coffee に関する通信販売上の表示です。
      </p>

      <div className="legal-table">
        <div className="legal-row">
          <dt>販売事業者</dt>
          <dd>株式会社龍華</dd>
        </div>

        <div className="legal-row">
          <dt>運営責任者</dt>
          <dd>今井 龍華</dd>
        </div>

        <div className="legal-row">
          <dt>所在地</dt>
          <dd>※ 事業所住所を記載してください</dd>
        </div>

        <div className="legal-row">
          <dt>電話番号</dt>
          <dd>※ 電話番号を記載してください</dd>
        </div>

        <div className="legal-row">
          <dt>メールアドレス</dt>
          <dd>ryugecoffee@gmail.com</dd>
        </div>

        <div className="legal-row">
          <dt>販売価格</dt>
          <dd>各商品ページに表示された価格（税込）によります。</dd>
        </div>

        <div className="legal-row">
          <dt>商品代金以外の必要料金</dt>
          <dd>送料、決済手数料等が発生する場合があります。詳細は購入手続き時に表示します。</dd>
        </div>

        <div className="legal-row">
          <dt>支払方法</dt>
          <dd>クレジットカード決済、その他当サイトが定める方法</dd>
        </div>

        <div className="legal-row">
          <dt>支払時期</dt>
          <dd>ご注文時に決済が確定します。詳細は各決済事業者の定めによります。</dd>
        </div>

        <div className="legal-row">
          <dt>商品の引渡時期</dt>
          <dd>ご注文確定後、通常〇営業日以内に発送します。予約商品や受注製造品は各商品ページに別途記載します。</dd>
        </div>

        <div className="legal-row">
          <dt>申込みの有効期限</dt>
          <dd>在庫状況によりご注文をキャンセルさせていただく場合があります。</dd>
        </div>

        <div className="legal-row">
          <dt>返品・交換・キャンセル</dt>
          <dd>
            食品のため、お客様都合による返品・交換・キャンセルは原則としてお受けしておりません。
            ただし、商品に不備・誤配送があった場合は、商品到着後〇日以内にご連絡ください。
          </dd>
        </div>

        <div className="legal-row">
          <dt>返品送料</dt>
          <dd>当社不備による返品・交換の場合は当社負担、お客様都合の場合はお客様負担となります。</dd>
        </div>

        <div className="legal-row">
          <dt>販売数量の制限等</dt>
          <dd>限定商品については、販売数量・販売期間を設定する場合があります。詳細は各商品ページに表示します。</dd>
        </div>
      </div>
    </section>
  );
}