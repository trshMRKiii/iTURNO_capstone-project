import nodemailer from "nodemailer";

// Reuses the exact same Gmail SMTP account as the LAN backend (backend/backend/settings.py's
// EMAIL_* settings) — set the same EMAIL_HOST_USER / EMAIL_HOST_PASSWORD / DEFAULT_FROM_EMAIL
// values in Vercel's project env vars. No separate email provider to configure.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.EMAIL_HOST_USER;
  const pass = process.env.EMAIL_HOST_PASSWORD;
  if (!user || !pass) {
    throw new Error("EMAIL_HOST_USER / EMAIL_HOST_PASSWORD are not configured");
  }

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
  return transporter;
}

// Mirrors backend/api/templates/emails/password_reset.html so the remote and
// LAN reset emails look the same.
function passwordResetHtml(userName, resetLink) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Reset your password</title>
</head>
<body style="margin:0; padding:0; background-color:#eef1f6; font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f6; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(26,39,68,0.12);">
          <tr>
            <td style="background:linear-gradient(135deg, #1a2744 0%, #243258 100%); background-color:#1a2744; padding:28px 32px; text-align:center;">
              <div style="font-size:18px; font-weight:700; color:#ffffff; letter-spacing:0.3px;">North Central Terminal</div>
              <div style="font-size:12px; color:#c7cfe0; margin-top:4px;">City Government of San Fernando</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px; font-size:20px; color:#1a2744;">Reset your password</h1>
              <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#333333;">
                Hi ${userName},
              </p>
              <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#333333;">
                We received a request to reset the password for your iTURNO account. Click the button below to choose a new password. This link will expire soon for your security.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:8px; background:linear-gradient(135deg, #1a2744 0%, #243258 100%); background-color:#1a2744;">
                    <a href="${resetLink}" target="_blank"
                       style="display:inline-block; padding:12px 32px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px; font-size:12px; line-height:1.6; color:#777777;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px; font-size:12px; line-height:1.6; word-break:break-all;">
                <a href="${resetLink}" style="color:#1a2744;">${resetLink}</a>
              </p>
              <p style="margin:0; font-size:12px; line-height:1.6; color:#999999;">
                If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; background-color:#f5f6f9; text-align:center;">
              <p style="margin:0; font-size:11px; color:#999999;">
                This is an automated message from iTURNO. Please don't reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(toEmail, userName, resetLink) {
  const from = process.env.DEFAULT_FROM_EMAIL || process.env.EMAIL_HOST_USER;
  await getTransporter().sendMail({
    from,
    to: toEmail,
    subject: "Reset your iTURNO password",
    text:
      `Hi ${userName},\n\n` +
      "We received a request to reset your password. Click the link below to choose a new one:\n\n" +
      `${resetLink}\n\n` +
      "If you didn't request this, you can safely ignore this email.",
    html: passwordResetHtml(userName, resetLink),
  });
}
