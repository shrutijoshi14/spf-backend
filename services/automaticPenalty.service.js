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
    /*
    // --- LEGACY LOGIC START (For Future Reference) ---
    // Previously, we used global settings and a hardcoded 20-day safety buffer.

    const penaltyAmount = Number(settings.penalty_amount) || 50;
    const penaltyDay = Number(settings.penalty_days) || 5;

    // Grace Period Check:
    if (dayOfMonth <= penaltyDay) return { message: 'Grace period' };

    const [activeLoans] = await connection.query("SELECT ... FROM loans WHERE status = 'ACTIVE'");

    for (const loan of activeLoans) {
       const disbursementTime = new Date(loan.disbursement_date).getTime() + IST_OFFSET;
       const currentMonthDueDate = new Date(today.getFullYear(), today.getMonth(), penaltyDay);
       const diffDays = (currentMonthDueDate - disbursementTime) / (1000 * 60 * 60 * 24);

       if (diffDays < 20) continue; // Skip if loan < 20 days old
       ...
    }
    // --- LEGACY LOGIC END ---
    */

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
      // before it becomes eligible for late fee penalties.
      const IST_OFFSET = 5.5 * 60 * 60 * 1000;
      const disbursementTime = new Date(loan.disbursement_date).getTime() + IST_OFFSET;
      const nowTime = today.getTime() + IST_OFFSET;
      const ageInDays = (nowTime - disbursementTime) / (1000 * 60 * 60 * 24);

      if (ageInDays < 30) {
        continue;
      }

      // Grace Period Check: If today is on or before the penalty day, skip
      if (dayOfMonth <= penaltyDay) {
        continue;
      }

      // Query: Check if Interest or EMI payment exists for current month
      const [payments] = await connection.query(
        `SELECT payment_id FROM payments
         WHERE loan_id = ?
         AND payment_date BETWEEN ? AND ?
         AND payment_for IN ('INTEREST', 'EMI')`,
        [loan.loan_id, currentMonthStart, currentMonthEnd]
      );

      if (payments.length > 0) {
        continue;
      }

      // Apply penalties for missed days from penaltyDay + 1 to today
      const startDay = penaltyDay + 1;
      const endDay = dayOfMonth;

      // Maturity Date: The first day a loan is actually liable for interest/penalties
      const maturityDate = new Date(disbursementTime + 30 * 24 * 60 * 60 * 1000);

      for (let d = startDay; d <= endDay; d++) {
        const checkDate = new Date(today.getFullYear(), today.getMonth(), d);

        // Logical Check: Penalty date MUST be after the 30-day maturity period
        if (checkDate <= maturityDate) {
          continue;
        }

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
          await penaltyService.addPenalty({
            loan_id: loan.loan_id,
            amount: penaltyAmount,
            penalty_date: checkDateStr,
            reason: 'Automatic Late Fee (Daily)',
          });

          // 1. Internal Notification
          const notificationService = require('./notification.service');
          await notificationService.createNotification({
            title: '⚠️ Daily Penalty Applied',
            message: `Penalty of ₹${penaltyAmount} applied to ${loan.full_name} (Loan #${loan.loan_id}) for late payment.`,
            type: 'penalty',
          });

          // 2. Notify Borrower (Email & WhatsApp Plugin)
          const messagingService = require('./messaging.service');
          const [borrowerData] = await connection.query(
            'SELECT email, mobile FROM borrowers WHERE borrower_id = ?',
            [loan.borrower_id]
          );
          const borrower = borrowerData[0];

          if (borrower) {
            const subj = `⚠️ Alert: Daily Penalty Applied (#${loan.loan_id})`;
            const msg = `Hello ${loan.full_name},\n\nA late fee penalty of ₹${penaltyAmount} has been added to your loan account today (${checkDateStr}) because the monthly payment is overdue.\n\nPlease clear your dues immediately to stop further daily penalties.`;

            if (borrower.email) {
              await messagingService.sendBorrowerEmail(borrower.email, subj, msg);
            }
            if (borrower.mobile) {
              await messagingService.sendWhatsAppNotification(borrower.mobile, msg);
            }
          }

          penaltyCount++;
        }
      }
    }

    return { success: true, penaltiesApplied: penaltyCount };
  } catch (err) {
    console.error('❌ Auto Penalty Error:', err);
    throw err;
  } finally {
    connection.release();
  }
};
