const db = require('../db');
const notificationService = require('./notification.service');

const isSameDay = (d1, d2) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

const settingsService = require('./settings.service');
const messagingService = require('./messaging.service');

exports.checkReminders = async () => {
  console.log('🔔 Checking for payment reminders...');

  const settings = await settingsService.getSettings();
  const connection = await db.getConnection();
  try {
    const [loans] = await connection.query(
      `SELECT
         l.loan_id, l.borrower_id, b.full_name as borrower_name, b.email, b.mobile,
         l.principal_amount, l.interest_rate, l.penalty_settings_day
       FROM loans l
       JOIN borrowers b ON l.borrower_id = b.borrower_id
       WHERE l.status = 'ACTIVE'`
    );

    const today = new Date();
    let sentCount = 0;

    for (const loan of loans) {
      const loanPenaltyDay = Number(loan.penalty_settings_day) || 5;

      // Calculate Due Date for THIS month
      const dueDateThisMonth = new Date(today.getFullYear(), today.getMonth(), loanPenaltyDay);

      // Calculate Reminder Date (3 days before)
      const daysBefore = 3;
      const reminderDate = new Date(dueDateThisMonth);
      reminderDate.setDate(dueDateThisMonth.getDate() - daysBefore);

      const isReminderDay = isSameDay(today, reminderDate);
      const isDueDate = isSameDay(today, dueDateThisMonth);

      if (!isReminderDay && !isDueDate) continue;

      // Check for monthly INTEREST/EMI payment
      const [payments] = await connection.query(
        `SELECT payment_id FROM payments
         WHERE loan_id = ?
         AND payment_date BETWEEN ? AND ?
         AND payment_for IN ('INTEREST', 'EMI')`,
        [
          loan.loan_id,
          new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
          new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
        ]
      );

      if (payments.length > 0) continue; // Skip if already paid

      // FETCH UNPAID PENALTIES
      const [penalties] = await connection.query(
        'SELECT COALESCE(SUM(penalty_amount), 0) as total FROM penalties WHERE loan_id = ? AND is_paid = 0',
        [loan.loan_id]
      );
      const unpaidPenalties = Number(penalties[0].total);

      // CALCULATE MONTHLY INTEREST DUE
      const monthlyInterest = Number(loan.principal_amount) * (Number(loan.interest_rate) / 100);
      const totalDueNow = monthlyInterest + unpaidPenalties;

      let subject = '';
      let message = '';

      if (isReminderDay) {
        subject = `📢 Reminder: Loan Payment Due (#${loan.loan_id})`;
        message =
          `Hello ${loan.borrower_name},\n\n` +
          `This is a friendly reminder that your monthly interest payment is due on ${dueDateThisMonth.toDateString()}.\n\n` +
          `Monthly Interest: ₹${monthlyInterest.toFixed(2)}\n` +
          (unpaidPenalties > 0 ? `Unpaid Penalties: ₹${unpaidPenalties.toFixed(2)}\n` : '') +
          `Total Payable Now: ₹${totalDueNow.toFixed(2)}\n\n` +
          `Please ensure payment to avoid further daily penalties.`;
      } else if (isDueDate) {
        subject = `⚠️ URGENT: Loan Payment Due Today (#${loan.loan_id})`;
        message =
          `Hello ${loan.borrower_name},\n\n` +
          `Your loan payment of ₹${totalDueNow.toFixed(2)} is due TODAY (${dueDateThisMonth.toDateString()}).\n\n` +
          `Please settle this by the end of the day to avoid automatic daily penalties.`;
      }

      // 1. Log Internal Notification
      await notificationService.createNotification({
        title: subject,
        message: `Automatic reminder sent to ${loan.borrower_name} for ₹${totalDueNow.toFixed(2)}`,
        type: 'reminder',
      });

      // 2. Send Email
      if (loan.email) {
        await messagingService.sendBorrowerEmail(loan.email, subject, message);
      }

      // 3. Send WhatsApp via Template (Required for one-way / business-initiated)
      if (loan.mobile) {
        // Template Name: 'payment_reminder' (You must create this in Meta Dashboard)
        // Variables: {{1}}=Name, {{2}}=Amount, {{3}}=Date
        await messagingService.sendWhatsAppTemplate(loan.mobile, 'payment_reminder', 'en_US', [
          { type: 'text', text: loan.borrower_name },
          { type: 'text', text: `₹${totalDueNow.toFixed(2)}` },
          { type: 'text', text: dueDateThisMonth.toDateString() },
        ]);
      }

      sentCount++;
    }

    console.log(`✅ [${new Date().toISOString()}] Automated reminders processed: ${sentCount}`);
    return { success: true, count: sentCount };
  } catch (err) {
    console.error('❌ Reminder Service Error:', err);
  } finally {
    if (connection) connection.release();
  }
};
