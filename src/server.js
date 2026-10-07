require('dotenv').config();

const cron = require('node-cron');
const app = require('./app');
const connectDatabase = require('./config/database');
const { scanAndCreateReminders, dispatchPendingReminders } = require('./services/reminderJob');

const port = Number(process.env.PORT) || 5004;
let server;

async function startServer() {
  await connectDatabase(process.env.MONGO_URI);

  server = app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });

  // Sr.14 — Reminder cron. Runs every 15 minutes.
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('[cron] reminder scan starting');
      await scanAndCreateReminders();
      await dispatchPendingReminders();
    } catch (err) {
      console.error('[cron] reminder job failed:', err);
    }
  });

  console.log('[cron] reminder job scheduled — every 15 minutes');
}

function shutDown(signal) {
  console.log(`${signal} received; shutting down`);
  if (!server) { process.exit(0); return; }
  server.close(async (error) => {
    if (error) {
      console.error('Error while closing the HTTP server:', error);
      process.exitCode = 1;
    }
    try { await require('mongoose').disconnect(); }
    catch (disconnectError) {
      console.error('Error while disconnecting from MongoDB:', disconnectError);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));

startServer().catch((error) => {
  console.error('Failed to start the API:', error);
  process.exitCode = 1;
});