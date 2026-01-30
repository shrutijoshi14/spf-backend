const db = require('../db');
const penaltyService = require('./penalty.service');
const settingsService = require('./settings.service');

/**
 * Checks and applies daily penalties for overdue loans.
 * Logic:
 * 1. Checks if penalties are enabled and if today is past the configured penalty day.
 * 2. Fetches all active loans.
 * 3. For each loan, checks if it's eligible (older than 20 days relative to penalty day).
 * 4. Checks if Interest/EMI has been paid for the current month.
 * 5. If unpaid, applies daily penalties for each missed day from the penalty start day up to today.
 */
exports.checkDailyPenalties = async () => {
  const today = new Date();
  const dayOfMonth = today.getDate();

  // Fetch Settings (Only to check if enabled)
  const settings = await settingsService.getSettings();
  const isEnabled = String(settings.penalty_enabled).toLowerCase() === 'true';

  if (!isEnabled) {
    return { message: 'Automated penalties disabled.' };
  }

  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  const connection = await db.getConnection();
  try {
    // ----------------------------------------------------------------
    // PART 1: APPLY NEW PENALTIES
    // ----------------------------------------------------------------

    // Query: Fetch all Active Loans with their specific penalty rules and borrower names
    const [activeLoans] = await connection.query(
      `SELECT l.loan_id, l.borrower_id, l.interest_rate, l.outstanding_amount, l.disbursement_date,
              l.penalty_settings_amount, l.penalty_settings_day, b.full_name
       FROM loans l
       JOIN borrowers b ON l.borrower_id = b.borrower_id
       WHERE l.status = 'ACTIVE'`
    );

    let penaltyCount = 0;

    for (const loan of activeLoans) {
      const penaltyAmount =
        Number(loan.penalty_settings_amount) || Number(settings.penalty_amount) || 50;
      const penaltyDay = Number(loan.penalty_settings_day) || Number(settings.penalty_days) || 5;

      // 1-Month Rule: A loan must have completed at least 30 days of borrowing
      const IST_OFFSET = 5.5 * 60 * 60 * 1000;
      const disbursementTime = new Date(loan.disbursement_date).getTime() + IST_OFFSET;
      const nowTime = today.getTime() + IST_OFFSET;
      const ageInDays = (nowTime - disbursementTime) / (1000 * 60 * 60 * 24);

      if (ageInDays < 30) continue;
      if (dayOfMonth <= penaltyDay) continue; // Grace Period Check

      // Query: Check if Interest or EMI payment exists for current month
      const [payments] = await connection.query(
        `SELECT payment_id FROM payments
         WHERE loan_id = ?
         AND payment_date BETWEEN ? AND ?
         AND payment_for IN ('INTEREST', 'EMI')`,
        [loan.loan_id, currentMonthStart, currentMonthEnd]
      );

      if (payments.length > 0) continue;

      // Apply penalties for missed days from penaltyDay + 1 to today
      const startDay = penaltyDay + 1;
      const endDay = dayOfMonth;

      // Maturity Date: The first day a loan is actually liable
      const maturityDate = new Date(disbursementTime + 30 * 24 * 60 * 60 * 1000);

      for (let d = startDay; d <= endDay; d++) {
        const checkDate = new Date(today.getFullYear(), today.getMonth(), d);

        if (checkDate <= maturityDate) continue;

        const year = checkDate.getFullYear();
        const month = String(checkDate.getMonth() + 1).padStart(2, '0');
        const day = String(checkDate.getDate()).padStart(2, '0');
        const checkDateStr = `${year}-${month}-${day}`;

        // Check for duplicates
        const [existingPenalty] = await connection.query(
          `SELECT penalty_id FROM penalties
             WHERE loan_id = ?
             AND penalty_date = ?
             AND reason = 'Automatic Late Fee (Daily)'`,
          [loan.loan_id, checkDateStr]
        );

        if (existingPenalty.length === 0) {
          // Initialize is_notification_sent to FALSE (0)
          await penaltyService.addPenalty({
            loan_id: loan.loan_id,
            amount: penaltyAmount,
            penalty_date: checkDateStr,
            reason: 'Automatic Late Fee (Daily)',
          });
          penaltyCount++;
        }
      }
    }

    // ----------------------------------------------------------------
    // PART 2: RETRY FAILED NOTIFICATIONS (The "Guarantee" Logic)
    // ----------------------------------------------------------------

    console.log('🔄 Checking for pending penalty notifications...');

    // Fetch penalties that are NOT yet notified (is_notification_sent = 0)
    // Joined with borrower info to send the message
    const [pendingNotifications] = await connection.query(`
      SELECT p.penalty_id, p.loan_id, p.penalty_amount, p.penalty_date,
             b.full_name, b.email, b.mobile
      FROM penalties p
      JOIN loans l ON p.loan_id = l.loan_id
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      WHERE p.is_notification_sent = 0
    `);

    let notifiedCount = 0;
    const notificationService = require('./notification.service');
    const messagingService = require('./messaging.service');

    for (const penalty of pendingNotifications) {
      try {
        const penaltyDateStr = new Date(penalty.penalty_date).toISOString().split('T')[0];
        const subj = `⚠️ Alert: Daily Penalty Applied (#${penalty.loan_id})`;
        const msg = `Hello ${penalty.full_name},\n\nA late fee penalty of ₹${penalty.penalty_amount} was applied to your loan account for date ${penaltyDateStr} because the monthly payment is overdue.\n\nPlease clear your dues immediately to stop further daily penalties.`;

        // 1. Internal Notification (System Dashboard)
        await notificationService.createNotification({
          title: '⚠️ Daily Penalty Applied',
          message: `Penalty of ₹${penalty.penalty_amount} applied to ${penalty.full_name} (Loan #${penalty.loan_id}). Notified successfully.`,
          type: 'penalty',
        });

        // 2. Notify Borrower (Email)
        if (penalty.email) {
          await messagingService.sendBorrowerEmail(penalty.email, subj, msg);
        }

        // 3. Notify Borrower (WhatsApp)
        if (penalty.mobile) {
          await messagingService.sendWhatsAppNotification(penalty.mobile, msg);
        }

        // ✅ MARK AS SENT
        await connection.query(
          'UPDATE penalties SET is_notification_sent = 1 WHERE penalty_id = ?',
          [penalty.penalty_id]
        );
        notifiedCount++;
      } catch (notifyErr) {
        console.error(`❌ Failed to notify penalty #${penalty.penalty_id}:`, notifyErr.message);
        // We do NOT update 'is_notification_sent'. It remains 0.
        // It will be retried automatically next time this script runs.
      }
    }

    return {
      success: true,
      penaltiesApplied: penaltyCount,
      notificationsSent: notifiedCount,
    };
  } catch (err) {
    console.error('❌ Auto Penalty Error:', err);
    throw err;
  } finally {
    connection.release();
  }
};
