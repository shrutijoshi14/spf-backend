require('dotenv').config({ path: '../.env' });
const db = require('../db');
const settingsService = require('../services/settings.service');

async function migrate() {
  const connection = await db.getConnection();
  try {
    console.log('🔄 Starting Migration: Per-Loan Penalty Settings...');

    // 1. Fetch Current Global Settings (to use as default for existing loans)
    const settings = await settingsService.getSettings();
    const globalAmount = settings.penalty_amount || 50;
    const globalDay = settings.penalty_days || 5;

    console.log(`ℹ️ Current Global Settings - Amount: ${globalAmount}, Day: ${globalDay}`);

    // 2. Check if columns exist
    const [columns] = await connection.query(
      "SHOW COLUMNS FROM loans LIKE 'penalty_settings_amount'"
    );

    if (columns.length === 0) {
      console.log('🛠️ Adding columns to `loans` table...');
      // Add columns. We set DEFAULT to the current global values to easily backfill,
      // but strictly we might want to be explicit.
      await connection.query(`
        ALTER TABLE loans
        ADD COLUMN penalty_settings_amount DECIMAL(10,2) DEFAULT ${globalAmount},
        ADD COLUMN penalty_settings_day INT DEFAULT ${globalDay}
      `);
      console.log('✅ Columns added successfully.');
    } else {
      console.log('✅ Columns already exist. Skipping ALTER TABLE.');
    }

    // 3. Ensure all existing rows have values (Backfill)
    // The DEFAULT in ALTER TABLE handles new rows (or existing ones if MySQL version supports it nicely during alter),
    // but let's be safe and run an explicit update for any NULLs just in case.
    const [result] = await connection.query(
      `
      UPDATE loans
      SET penalty_settings_amount = ?, penalty_settings_day = ?
      WHERE penalty_settings_amount IS NULL OR penalty_settings_day IS NULL
    `,
      [globalAmount, globalDay]
    );

    console.log(`📦 Backfilled ${result.changedRows} existing loans with current global settings.`);

    console.log('🎉 Migration Complete!');
  } catch (err) {
    console.error('❌ Migration Failed:', err);
  } finally {
    connection.release();
    process.exit();
  }
}

migrate();
