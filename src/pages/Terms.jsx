export default function Terms({ lang = "ja" }) {
  const content = {
    ja: {
      title: "利用規約",
      intro:
        "本サイトは、株式会社龍華が運営する Ryuge Coffee に関する情報提供、商品案内、販売導線の提供を目的として運営されています。",
      sections: [
        {
          heading: "適用範囲",
          body: "本規約は、本サイトの閲覧、利用、問い合わせ、注文その他これに付随する行為に適用されます。",
        },
        {
          heading: "禁止事項",
          body: "法令または公序良俗に反する行為、虚偽情報の送信、サイト運営を妨げる行為、第三者または当方の権利を侵害する行為を禁止します。",
        },
        {
          heading: "掲載情報について",
          body: "本サイトの内容は、予告なく変更・修正・削除される場合があります。掲載情報の正確性には努めますが、完全性を保証するものではありません。",
        },
        {
          heading: "免責事項",
          body: "本サイトの利用により生じた損害について、当方に故意または重大な過失がある場合を除き、責任を負わないものとします。",
        },
        {
          heading: "準拠法",
          body: "本サイトおよび本規約の解釈には、日本法を適用します。",
        },
        {
          heading: "お問い合わせ",
          body: "本サイトおよび本規約に関するお問い合わせは、ryugecoffee@gmail.com までご連絡ください。",
        },
      ],
    },

    en: {
      title: "Terms of Service",
      intro:
        "This website is operated by Kabushikigaisha Ryuge to provide information, product guidance, and purchasing access for Ryuge Coffee.",
      sections: [
        {
          heading: "Scope",
          body: "These terms apply to browsing, using, contacting, ordering from, and otherwise interacting with this website.",
        },
        {
          heading: "Prohibited Conduct",
          body: "Users must not engage in unlawful acts, send false information, interfere with site operations, or infringe the rights of the operator or third parties.",
        },
        {
          heading: "Site Content",
          body: "The content of this website may be changed, revised, or removed without prior notice. We strive for accuracy, but do not guarantee completeness.",
        },
        {
          heading: "Disclaimer",
          body: "We are not liable for damages arising from the use of this website except in cases of willful misconduct or gross negligence.",
        },
        {
          heading: "Governing Law",
          body: "These terms and this website shall be governed by the laws of Japan.",
        },
        {
          heading: "Contact",
          body: "For questions regarding this website or these Terms, please contact us at ryugecoffee@gmail.com.",
        },
      ],
    },

    es: {
      title: "Términos de Servicio",
      intro:
        "Este sitio web es operado por Kabushikigaisha Ryuge para ofrecer información, guía de productos y acceso de compra de Ryuge Coffee.",
      sections: [
        {
          heading: "Alcance",
          body: "Estos términos se aplican a la navegación, uso, contacto, pedidos y cualquier otra interacción con este sitio web.",
        },
        {
          heading: "Conductas Prohibidas",
          body: "No se permite realizar actos ilegales, enviar información falsa, interferir con el funcionamiento del sitio ni vulnerar derechos del operador o de terceros.",
        },
        {
          heading: "Contenido del Sitio",
          body: "El contenido de este sitio puede cambiarse, revisarse o eliminarse sin previo aviso. Procuramos exactitud, pero no garantizamos integridad total.",
        },
        {
          heading: "Exención de Responsabilidad",
          body: "No seremos responsables de daños derivados del uso de este sitio, salvo en casos de dolo o negligencia grave.",
        },
        {
          heading: "Ley Aplicable",
          body: "Estos términos y este sitio web se regirán por las leyes de Japón.",
        },
        {
          heading: "Contacto",
          body: "Para consultas sobre este sitio web o estos términos, contáctenos en ryugecoffee@gmail.com.",
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