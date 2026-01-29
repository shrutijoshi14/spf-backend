const db = require('../db');

exports.initSettings = async () => {
  const connection = await db.getConnection();
  try {
    // Create table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value VARCHAR(255)
      )
    `);

    // Insert defaults if missing
    await connection.query(`
      INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
      ('penalty_amount', '50'),
      ('penalty_enabled', 'true'),
      ('penalty_days', '5')
    `);

    console.log('✅ Settings table initialized');

    // --- RBAC: Permissions Table ---
    await connection.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        permission_code VARCHAR(50) PRIMARY KEY,
        category VARCHAR(50),
        description VARCHAR(100)
      )
    `);

    // --- RBAC: Role Permissions Table ---
    await connection.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role VARCHAR(20),
        permission_code VARCHAR(50),
        PRIMARY KEY (role, permission_code),
        FOREIGN KEY (permission_code) REFERENCES permissions(permission_code) ON DELETE CASCADE
      )
    `);

    // Seed Defaults
    const defaultPermissions = [
      // Borrowers
      ['borrower.view', 'Borrowers', 'View Borrowers'],
      ['borrower.create', 'Borrowers', 'Create Borrowers'],
      ['borrower.edit', 'Borrowers', 'Edit Borrowers'],
      ['borrower.delete', 'Borrowers', 'Delete Borrowers'], // Admin only
      // Loans
      ['loan.view', 'Loans', 'View Loans'],
      ['loan.create', 'Loans', 'Create Loans'],
      ['loan.edit', 'Loans', 'Edit Loans'],
      ['loan.delete', 'Loans', 'Delete Loans'], // Admin only
      ['loan.approve', 'Loans', 'Approve Loans'], // Admin only
      // Payments
      ['payment.view', 'Payments', 'View Payments'],
      ['payment.create', 'Payments', 'Add Payments'],
      ['payment.edit', 'Payments', 'Edit Payments'],
      ['payment.delete', 'Payments', 'Delete Payments'], // Admin only
      // Reports
      ['reports.view', 'Reports', 'View Reports'],
      // Settings
      ['settings.view', 'Settings', 'View Settings'],
      ['settings.edit', 'Settings', 'Edit System Config'], // Admin only
      ['settings.edit', 'Settings', 'Edit System Config'], // Admin only
      // User Management
      ['users.view', 'Users', 'View Users'],
      ['users.manage_role', 'Users', 'Change User Role'],
      ['users.manage_status', 'Users', 'Enable/Disable User'],
      ['users.delete', 'Users', 'Delete Users'],
    ];

    for (const [code, cat, desc] of defaultPermissions) {
      await connection.query(
        'INSERT IGNORE INTO permissions (permission_code, category, description) VALUES (?, ?, ?)',
        [code, cat, desc]
      );
    }

    // Seed Default Role Assigments (If empty)
    const [existingRolePerms] = await connection.query('SELECT 1 FROM role_permissions LIMIT 1');
    if (existingRolePerms.length === 0) {
      // ADMIN Defaults (Everything except arguably nuclear options, but typically everything)
      const adminPerms = defaultPermissions.map((p) => p[0]);
      // STAFF Defaults (View/Create/Edit, no Delete)
      const staffPerms = adminPerms.filter((p) => !p.includes('delete') && !p.includes('settings'));

      for (const p of adminPerms) {
        await connection.query("INSERT IGNORE INTO role_permissions VALUES ('ADMIN', ?)", [p]);
      }
      for (const p of staffPerms) {
        await connection.query("INSERT IGNORE INTO role_permissions VALUES ('STAFF', ?)", [p]);
      }
      console.log('✅ RBAC tables initialized and seeded');
    }
  } catch (err) {
    console.error('❌ Failed to init settings:', err);
  } finally {
    connection.release();
  }
};

exports.getSettings = async () => {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach((row) => {
      settings[row.setting_key] = row.setting_value;
    });
    return settings;
  } finally {
    connection.release();
  }
};

exports.updateSettings = async (updates) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const [key, value] of Object.entries(updates)) {
      await connection.query(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, String(value), String(value)]
      );
    }
    await connection.commit();
    return await exports.getSettings();
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

exports.getPermissionMatrix = async () => {
  const connection = await db.getConnection();
  try {
    const [permissions] = await connection.query(
      'SELECT * FROM permissions ORDER BY category, permission_code'
    );
    const [rolePerms] = await connection.query('SELECT * FROM role_permissions');

    const matrix = permissions.map((p) => ({
      ...p,
      ADMIN: rolePerms.some(
        (rp) => rp.role === 'ADMIN' && rp.permission_code === p.permission_code
      ),
      STAFF: rolePerms.some(
        (rp) => rp.role === 'STAFF' && rp.permission_code === p.permission_code
      ),
    }));

    return matrix;
  } finally {
    connection.release();
  }
};

exports.updatePermissionMatrix = async (updates) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const { role, permission_code, enabled } of updates) {
      if (enabled) {
        await connection.query(
          'INSERT IGNORE INTO role_permissions (role, permission_code) VALUES (?, ?)',
          [role, permission_code]
        );
      } else {
        await connection.query(
          'DELETE FROM role_permissions WHERE role = ? AND permission_code = ?',
          [role, permission_code]
        );
      }
    }
    await connection.commit();
    return await exports.getPermissionMatrix();
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};
