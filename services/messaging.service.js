const nodemailer = require('nodemailer');

/**
 * Messaging Service: Centralized logic for Borrower Notifications
 */

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a professional email to a borrower
 */
exports.sendBorrowerEmail = async (to, subject, text, html) => {
  if (!process.env.EMAIL_USER || !to) {
    console.warn('⚠️ Email not sent: EMAIL_USER or recipient missing');
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"SPF Loans" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`📧 Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    return false;
  }
};

/**
 * Sends a WhatsApp notification (Placeholder/Webhook)
 * Since WhatsApp requires a paid API (Meta/Twilio/MSG91),
 * this function acts as a bridge for future API integration.
 */
exports.sendWhatsAppNotification = async (mobile, message) => {
  // 💡 LOGIC: If the user provides a WhatsApp API key in the future,
  // we would call that API here. For now, we log it.
  console.log(`📱 [WHATSAPP OVERRIDE] Sent to ${mobile}: ${message}`);

  // Optional: Integration with a free webhook/provider could go here
  return true;
};

/**
 * Prepares a WhatsApp Link for the Admin to send manually (Secondary fallback)
 */
exports.generateWhatsAppLink = (mobile, text) => {
  const cleanMobile = mobile.replace(/\D/g, ''); // Remove non-numeric
  return `https://wa.me/${cleanMobile}?text=${encodeURIComponent(text)}`;
};
