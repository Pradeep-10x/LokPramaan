import nodemailer from "nodemailer";

const smtpPort = Number(process.env.SMTP_PORT) || 465;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: "JanPramaan — Verify your email",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:#1a73e8;">JanPramaan</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing:8px;text-align:center;color:#333;">${otp}</h1>
        <p style="color:#666;font-size:14px;">This code expires in <strong>10 minutes</strong>.</p>
        <p style="color:#999;font-size:12px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  });
}