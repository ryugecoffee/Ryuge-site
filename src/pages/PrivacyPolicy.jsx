export default function PrivacyPolicy({ lang = "ja" }) {
  const content = {
    ja: {
      title: "プライバシーポリシー",
      intro:
        "Ryuge Coffee は、お客様の個人情報を適切に取り扱い、安心してご利用いただけるよう努めます。",
      sections: [
        {
          heading: "取得する情報",
          body: "お問い合わせ、注文、各種ご連絡の際に、氏名、メールアドレス、住所、電話番号等の情報を取得する場合があります。",
        },
        {
          heading: "利用目的",
          body: "取得した情報は、商品発送、本人確認、問い合わせ対応、重要なお知らせの送付、サービス改善のために利用します。",
        },
        {
          heading: "第三者提供",
          body: "法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供しません。",
        },
        {
          heading: "管理",
          body: "個人情報への不正アクセス、漏えい、滅失、改ざん等を防止するため、適切な管理を行います。",
        },
        {
          heading: "見直し",
          body: "本ポリシーは必要に応じて改定されることがあります。改定後は本サイト上で公表します。",
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      intro:
        "Ryuge Coffee is committed to handling personal information appropriately and providing a safe experience for users.",
      sections: [
        {
          heading: "Information We Collect",
          body: "We may collect your name, email address, postal address, phone number, and related details when you contact us, place an order, or communicate with us.",
        },
        {
          heading: "Purpose of Use",
          body: "Collected information is used for shipping products, identity confirmation, responding to inquiries, sending important notices, and improving our services.",
        },
        {
          heading: "Third-Party Disclosure",
          body: "We do not provide personal information to third parties without consent, except where required by law.",
        },
        {
          heading: "Data Management",
          body: "We take appropriate measures to prevent unauthorized access, leakage, loss, alteration, or misuse of personal information.",
        },
        {
          heading: "Revisions",
          body: "This policy may be updated when necessary. Any revised version will be posted on this website.",
        },
      ],
    },
    es: {
      title: "Política de Privacidad",
      intro:
        "Ryuge Coffee se compromete a tratar adecuadamente la información personal y a ofrecer una experiencia segura a los usuarios.",
      sections: [
        {
          heading: "Información que Recopilamos",
          body: "Podemos recopilar nombre, correo electrónico, dirección postal, número de teléfono y otros datos relacionados cuando nos contacta, realiza un pedido o se comunica con nosotros.",
        },
        {
          heading: "Finalidad del Uso",
          body: "La información recopilada se utiliza para enviar productos, verificar identidad, responder consultas, enviar avisos importantes y mejorar nuestros servicios.",
        },
        {
          heading: "Divulgación a Terceros",
          body: "No proporcionamos información personal a terceros sin consentimiento, salvo cuando la ley lo exija.",
        },
        {
          heading: "Gestión de Datos",
          body: "Tomamos medidas adecuadas para prevenir acceso no autorizado, filtraciones, pérdidas, alteraciones o uso indebido de la información personal.",
        },
        {
          heading: "Revisiones",
          body: "Esta política puede actualizarse cuando sea necesario. La versión revisada se publicará en este sitio web.",
        },
      ],
    },
  };

  const c = content[lang] || content.ja;

  return (
    <section className="legal-document">
      <h1>{c.title}</h1>
      <p className="legal-lead">{c.intro}</p>

      <div className="legal-stack">
        {c.sections.map((section) => (
          <div key={section.heading} className="legal-block">
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}