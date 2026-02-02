const nodemailer = require('nodemailer');
const axios = require('axios');

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
 * Sends a WhatsApp notification via Meta Graph API
 * @param {string} mobile - Recipient mobile number (e.g., "919876543210")
 * @param {string} message - Text message content
 */
exports.sendWhatsAppNotification = async (mobile, message) => {
  if (
    !process.env.WHATSAPP_PHONE_ID ||
    !process.env.WHATSAPP_TOKEN ||
    process.env.WHATSAPP_TOKEN === 'your-access-token'
  ) {
    // Fallback: Log it if credentials are missing
    console.log(`📱 [WHATSAPP MOCK] To: ${mobile} | Msg: ${message}`);
    return false;
  }

  try {
    const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

    // Meta requires plain number without '+' prefix generally, but formats vary.
    // Ensure we strip non-digits.
    let formattedMobile = mobile.replace(/\D/g, '');

    // Auto-fix for India (If 10 digits, prefix 91)
    if (formattedMobile.length === 10) {
      formattedMobile = '91' + formattedMobile;
    }

    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: formattedMobile,
        type: 'text',
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ WhatsApp sent to ${mobile}`);
    return true;
  } catch (error) {
    console.error(`❌ WhatsApp Failed to ${mobile}:`, error.response?.data || error.message);
    return false;
  }
};

/**
 * Sends a Template Message (Required for business-initiated conversations > 24h)
 * @param {string} mobile - Recipient mobile
 * @param {string} templateName - Name of the template in Meta Business Manager
 * @param {string} languageCode - e.g., "en_US"
 * @param {Array} components - Template variable components
 */
exports.sendWhatsAppTemplate = async (
  mobile,
  templateName,
  languageCode = 'en_US',
  components = []
) => {
  if (!process.env.WHATSAPP_PHONE_ID || !process.env.WHATSAPP_TOKEN) return false;

  try {
    const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
    let formattedMobile = mobile.replace(/\D/g, '');

    // Auto-fix for India
    if (formattedMobile.length === 10) formattedMobile = '91' + formattedMobile;

    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: formattedMobile,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ WhatsApp Template '${templateName}' sent to ${mobile}`);
    return true;
  } catch (error) {
    console.error(
      `❌ WhatsApp Template Failed to ${mobile}:`,
      error.response?.data || error.message
    );
    return false;
  }
};

/**
 * Prepares a WhatsApp Link for the Admin to send manually (Secondary fallback)
 */
exports.generateWhatsAppLink = (mobile, text) => {
  const cleanMobile = mobile.replace(/\D/g, ''); // Remove non-numeric
  return `https://wa.me/${cleanMobile}?text=${encodeURIComponent(text)}`;
};
