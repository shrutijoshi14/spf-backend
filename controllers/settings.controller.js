const settingsService = require('../services/settings.service');
const fs = require('fs');
const path = require('path');

const logError = (msg) => {
  fs.appendFileSync(
    path.join(__dirname, '../error.log'),
    new Date().toISOString() + ': ' + msg + '\n'
  );
};

const { Parser } = require('json2csv');
const db = require('../db');

exports.getSettings = async (req, res) => {
  try {
    const settings = await settingsService.getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error(err);
    logError('getSettings Error: ' + err.message + '\n' + err.stack);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const updated = await settingsService.updateSettings(req.body);
    res.json({ success: true, data: updated, message: 'Settings updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

exports.backupDatabase = async (req, res) => {
  try {
    const [users] = await db.query('SELECT * FROM users');
    const [loans] = await db.query('SELECT * FROM loans');
    const [payments] = await db.query('SELECT * FROM payments');
    const [penalties] = await db.query('SELECT * FROM penalties');
    const backupData = {
      timestamp: new Date().toISOString(),
      data: { users, loans, payments, penalties },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=spf_backup_${Date.now()}.json`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    console.error(err);
    logError('Backup Error: ' + err.message);
    res.status(500).json({ success: false, message: 'Backup failed' });
  }
};

exports.exportData = async (req, res) => {
  const { type } = req.params;
  try {
    let query = '';
    let filename = '';

    switch (type) {
      case 'loans':
        query = `SELECT l.loan_id, b.full_name, l.principal_amount, l.interest_rate, l.disbursement_date, l.status
                         FROM loans l JOIN borrowers b ON l.borrower_id = b.borrower_id`;
        filename = 'loans_export.csv';
        break;
      case 'payments':
        query = `SELECT p.payment_id, b.full_name, p.payment_amount, p.payment_date, p.payment_for
                         FROM payments p JOIN loans l ON p.loan_id = l.loan_id JOIN borrowers b ON l.borrower_id = b.borrower_id`;
        filename = 'payments_export.csv';
        break;
      case 'users':
        query = 'SELECT user_id, full_name, email, role, status, created_at FROM users';
        filename = 'users_export.csv';
        break;
      default:
        return res.status(400).json({ message: 'Invalid export type' });
    }

    const [rows] = await db.query(query);
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).end(csv);
  } catch (err) {
    console.error(err);
    logError('Export Error: ' + err.message);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

exports.getPermissions = async (req, res) => {
  try {
    const matrix = await settingsService.getPermissionMatrix();
    res.json({ success: true, data: matrix });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch permission matrix' });
  }
};

exports.updatePermissions = async (req, res) => {
  try {
    const updated = await settingsService.updatePermissionMatrix(req.body);
    res.json({ success: true, data: updated, message: 'Permissions updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update permissions' });
  }
};
