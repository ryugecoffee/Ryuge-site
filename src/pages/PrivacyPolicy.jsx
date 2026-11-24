export default function PrivacyPolicy({ lang = "ja" }) {
  const content = {
    ja: {
      title: "プライバシーポリシー",
      intro:
        "Ryuge Coffee（運営：株式会社龍華）は、お客様の個人情報を適切に取り扱い、安心してご利用いただけるよう努めます。",
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
          heading: "アクセス解析ツールについて",
          body: "本サイトでは、サイトの利用状況を把握し改善するため、Google LLC の Google アナリティクスを利用しています。Google アナリティクスは Cookie 等を使用して、閲覧したページ、ご利用の端末・ブラウザ、おおよその地域、購入の有無などの情報を、個人を特定しない形で収集します。収集された情報は Google のプライバシーポリシーに基づいて管理されます。ブラウザの設定や Google アナリティクス オプトアウト アドオンにより、収集を停止できます。",
        },
        {
          heading: "管理",
          body: "個人情報への不正アクセス、漏えい、滅失、改ざん等を防止するため、適切な管理を行います。",
        },
        {
          heading: "見直し",
          body: "本ポリシーは必要に応じて改定されることがあります。改定後は本サイト上で公表します。",
        },
        {
          heading: "お問い合わせ窓口",
          body: "個人情報の取扱いに関するお問い合わせは、ryugecoffee@gmail.com までご連絡ください。",
        },
      ],
    },

    en: {
      title: "Privacy Policy",
      intro:
        "Ryuge Coffee (operated by Kabushikigaisha Ryuge) is committed to handling personal information appropriately and providing a safe experience for users.",
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
          heading: "Access Analytics",
          body: "This site uses Google Analytics by Google LLC to understand and improve how the site is used. Google Analytics uses cookies and similar technologies to collect, without identifying you personally, information such as the pages you view, your device and browser, your approximate region and whether a purchase was made. The information is handled under Google's Privacy Policy. You can stop the collection through your browser settings or the Google Analytics Opt-out Browser Add-on.",
        },
        {
          heading: "Data Management",
          body: "We take appropriate measures to prevent unauthorized access, leakage, loss, alteration, or misuse of personal information.",
        },
        {
          heading: "Revisions",
          body: "This policy may be updated when necessary. Any revised version will be posted on this website.",
        },
        {
          heading: "Contact",
          body: "For questions regarding this Privacy Policy or personal data handling, please contact us at ryugecoffee@gmail.com.",
        },
      ],
    },

    es: {
      title: "Política de Privacidad",
      intro:
        "Ryuge Coffee (operado por Kabushikigaisha Ryuge) se compromete a tratar adecuadamente la información personal y a ofrecer una experiencia segura a los usuarios.",
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
          heading: "Análisis de Acceso",
          body: "Este sitio utiliza Google Analytics de Google LLC para comprender y mejorar el uso del sitio. Google Analytics utiliza cookies y tecnologías similares para recopilar, sin identificarle personalmente, información como las páginas que visita, su dispositivo y navegador, su región aproximada y si realizó una compra. La información se gestiona conforme a la Política de Privacidad de Google. Puede detener la recopilación desde la configuración de su navegador o con el complemento de inhabilitación de Google Analytics.",
        },
        {
          heading: "Gestión de Datos",
          body: "Tomamos medidas adecuadas para prevenir acceso no autorizado, filtraciones, pérdidas, alteraciones o uso indebido de la información personal.",
        },
        {
          heading: "Revisiones",
          body: "Esta política puede actualizarse cuando sea necesario. La versión revisada se publicará en este sitio web.",
        },
        {
          heading: "Contacto",
          body: "Si tiene consultas sobre esta Política de Privacidad o el tratamiento de datos personales, contáctenos en ryugecoffee@gmail.com.",
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