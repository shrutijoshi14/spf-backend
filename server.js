const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const borrowerRoutes = require('./routes/borrower.routes');
const loanRoutes = require('./routes/loan.routes');
const paymentRoutes = require('./routes/payment.routes');
const topupRoutes = require('./routes/topup.routes');
const penaltyRoutes = require('./routes/penalty.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();

// 🛡️ 1. Security Headers (Helmet)
app.use(helmet());

// 🛡️ 2. Stricter CORS
// 🛡️ 2. Stricter CORS
const corsOptions = {
  origin: '*', // Allow ALL origins (Public API style)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false, // Disable credentials to allow wildcard origin
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10kb' })); // Limit body size to prevent DoS

// 🛡️ 3. Rate Limiting (Prevent Brute Force)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Request logging middleware (Improved for Production)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400) {
      const logMsg = `❌ [${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)\n`;
      fs.appendFile('debug_requests.log', logMsg, (err) => {
        if (err) console.error('Log write failed', err);
      });
    }
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/borrowers', borrowerRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/topups', topupRoutes);
app.use('/api/penalties', penaltyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/users', require('./routes/user.routes'));

// 🛡️ 4. Global Error Handler (Centralized)
app.use((err, req, res, next) => {
  console.error('🔥 Global Error Catch:', err.stack);

  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' ? 'An internal server error occurred' : err.message;

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

let server;

// Init Settings & Start Server
const startServer = async () => {
  try {
    const settingsService = require('./services/settings.service');
    const notificationService = require('./services/notification.service');
    const automaticPenaltyService = require('./services/automaticPenalty.service');
    const automaticRemindersService = require('./services/automaticReminders.service');
    const dbMigration = require('./services/dbMigration.service');

    // 0. Run Database Migrations (Background - Don't Block Startup)
    dbMigration.runMigrations().catch((err) => console.error('Migration Failed:', err));

    // Run initialization in background (Don't await) to speed up Cold Start
    settingsService.initSettings().catch((err) => console.error('Init Settings Failed:', err));
    notificationService
      .initNotifications()
      .catch((err) => console.error('Init Notifications Failed:', err));

    const cron = require('node-cron');
    console.log('⏰ Initializing Scheduler...');

    cron.schedule('0 12 * * *', async () => {
      console.log('🕛 Running Daily Noon Jobs...');
      await automaticPenaltyService.checkDailyPenalties();
      await automaticRemindersService.checkReminders();
    });

    // Run startup checks
    automaticPenaltyService
      .checkDailyPenalties()
      .catch((e) => console.error('Startup Penalty Check Failed', e));
    automaticRemindersService
      .checkReminders()
      .catch((e) => console.error('Startup Reminder Check Failed', e));

    const PORT = process.env.PORT || 4000;

    // Only listen if running directly (Local)
    if (require.main === module) {
      server = app.listen(PORT, () =>
        console.log(`✅ Production-Ready Server running on port ${PORT}`)
      );
    }
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

// 🛡️ 5. Graceful Shutdown (Handle SIGTERM/SIGINT)
const gracefulShutdown = () => {
  console.log('🛑 SIGTERM/SIGINT received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      console.log('✌️ HTTP server closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
