import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({
        error: "EMAIL_USER または EMAIL_PASS が未設定です。",
      });
    }

    const {
      cartItems = [],
      companyName = "",
      contactName = "",
      email = "",
      phone = "",
      postalCode = "",
      address = "",
      note = "",
      paymentMethod = "後払い（請求書払い）",
    } = req.body || {};

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: "商品が入っていません。" });
    }

    if (!companyName || !contactName || !email || !phone || !address) {
      return res.status(400).json({ error: "必須項目が不足しています。" });
    }

    const subtotal = cartItems.reduce((sum, item) => {
      return sum + Number(item.wholesalePrice || 0) * Number(item.quantity || 0);
    }, 0);

    const totalAmount = Math.floor(subtotal * 1.1);

    const itemLines = cartItems
      .map((item) => {
        const name = item.name || "商品";
        const quantity = Number(item.quantity || 0);
        const lineTotal = Number(item.wholesalePrice || 0) * quantity;
        return `・${name} × ${quantity}（¥${lineTotal.toLocaleString()}）`;
      })
      .join("\n");

    const text = `
【発注内容】
${itemLines}

合計：¥${totalAmount.toLocaleString()}（税込）

【お届け先】
貴社名・店舗名：${companyName}
担当者名：${contactName}
メール：${email}
電話番号：${phone}
郵便番号：${postalCode || "なし"}
住所：${address}
備考：${note || "なし"}

お支払い方法：${paymentMethod}
    `.trim();

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER.trim(),
        pass: process.env.EMAIL_PASS.replace(/\s+/g, ""),
      },
    });

    await transporter.verify();

    await transporter.sendMail({
      from: process.env.EMAIL_USER.trim(),
      to: "ryugecoffee@gmail.com",
      replyTo: email.trim(),
      subject: `【卸発注】${companyName}`,
      text,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("wholesale-order error:", error);

    return res.status(500).json({
      error: error?.message || "メール送信に失敗しました。",
    });
  }
}