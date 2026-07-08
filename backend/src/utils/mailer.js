const nodemailer = require("nodemailer");

let transporter = null;
let usingRealSmtp = false;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    usingRealSmtp = true;
  } else {
    // Dev fallback: no real email is sent, the link is logged to the server
    // console instead. Fully functional for local testing — set SMTP_* in
    // .env to send real emails once you deploy.
    transporter = {
      sendMail: async ({ to, subject, text }) => {
        console.log("\n📧  (No SMTP configured — printing email instead of sending it)");
        console.log(`    To: ${to}`);
        console.log(`    Subject: ${subject}`);
        console.log(`    ${text.split("\n").join("\n    ")}\n`);
      },
    };
    usingRealSmtp = false;
  }
  return transporter;
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  const t = getTransporter();
  await t.sendMail({
    from: process.env.MAIL_FROM || "Team Flow Hub <no-reply@teamflowhub.local>",
    to,
    subject: "Reset your Team Flow Hub password",
    text: `Someone (hopefully you) requested a password reset.\n\nReset it here (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
  });
  if (!usingRealSmtp) {
    console.log(`ℹ️  Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env to actually deliver this instead of printing it.`);
  }
}

module.exports = { sendPasswordResetEmail };
