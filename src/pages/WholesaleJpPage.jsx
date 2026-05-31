import { Link } from "react-router-dom";

export default function WholesaleJpPage() {
  return (
    <div className="legal-page-shell">
      <main className="legal-main">
        <div className="legal-document">
          <p className="legal-eyebrow">Wholesale / Corporate</p>
          <h1>卸・法人のお取引について</h1>
          <p className="legal-lead">
            ご興味のある方はメールにてお問い合わせください。
          </p>

          <div className="legal-sections">
            <section>
              <h2>お問い合わせ先</h2>
              <p>
                <a
                  href="mailto:ryugecoffee@gmail.com"
                  style={{ color: "rgba(255,255,255,0.82)", textDecoration: "underline" }}
                >
                  ryugecoffee@gmail.com
                </a>
              </p>
            </section>
          </div>

          <Link
            to="/"
            className="text-link"
            style={{ marginTop: "48px", display: "inline-block" }}
          >
            ← トップへ戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
