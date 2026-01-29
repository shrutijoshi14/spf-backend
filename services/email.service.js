const nodemailer = require('nodemailer');

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Check configuration on load
const isPlaceholder = (val) => !val || val.includes('your-email') || val === 'your-app-password';

if (isPlaceholder(process.env.EMAIL_USER) || isPlaceholder(process.env.EMAIL_PASS)) {
  console.log('\n💡 [TIP] Email is not configured yet. Using Development Fallback Mode.');
  console.log('   (Reset links will show in your browser auto-redirect)\n');
}

exports.sendResetEmail = async (to, token) => {
  const resetLink = `http://localhost:5173/reset-password/${token}`;

  // Bypass sending if using placeholders to avoid red error logs
  if (isPlaceholder(process.env.EMAIL_USER) || isPlaceholder(process.env.EMAIL_PASS)) {
    console.log(`\n📧 [DEV MODE] Reset link for ${to}: ${resetLink}\n`);
    throw { code: 'PLACEHOLDER' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"SNP Finance" <${process.env.EMAIL_USER}>`, // sender address
      to: to, // list of receivers
      subject: 'Password Reset Request', // Subject line
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your SNP Finance account.</p>
          <p>Click the link below to reset your password:</p>
          <a href="${resetLink}" style="background-color: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          <p style="margin-top: 20px; font-size: 12px; color: #888;">If you didn't request this, please ignore this email.</p>
          <p style="font-size: 12px; color: #888;">Link expires in 1 hour.</p>
        </div>
      `,
    });

    console.log('Message sent: %s', info.messageId);
    return true;
  } catch (error) {
    if (error.code === 'EAUTH') {
      console.error(
        '❌ Email Auth Failed: Please check EMAIL_USER and EMAIL_PASS in your .env file.'
      );
    } else {
      console.error('❌ Error sending email:', error.message);
    }
    throw new Error('Failed to send email. Check server logs.');
  }
};
