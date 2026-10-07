const Event = require('../models/Event');
const Registration = require('../models/Registration');
const Reminder = require('../models/Reminder');

const WINDOWS = [
  { key: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '1h', ms: 1 * 60 * 60 * 1000 }
];

// Time window (in ms) around each reminder mark where we consider a reminder due.
// Example: if "24h before" is due, we look for events starting between
// 24h-15min and 24h+15min from now.
const TOLERANCE_MS = 60 * 60 * 1000;   // 1 hour — test-only

/**
 * Find all upcoming registrations that need a reminder in each window,
 * and create Reminder records (status: 'pending').
 *
 * Idempotent: uses unique index on (registrationId, window).
 */
async function scanAndCreateReminders() {
  const now = new Date();
  let created = 0;
  let scanned = 0;

  for (const window of WINDOWS) {
    const target = new Date(now.getTime() + window.ms);
    const windowStart = new Date(target.getTime() - TOLERANCE_MS);
    const windowEnd = new Date(target.getTime() + TOLERANCE_MS);

    // Find events whose startAt falls in the target window
    const events = await Event.find({
      status: { $in: ['published', 'full'] },
      startAt: { $gte: windowStart, $lte: windowEnd }
    }).select('_id title startAt').lean();

    for (const event of events) {
      scanned += 1;

      // All active registrations for this event
      const regs = await Registration.find({
        eventId: event._id,
        status: 'registered'
      }).select('_id userId').lean();

      if (regs.length === 0) continue;

      const ops = regs.map((r) => ({
        updateOne: {
          filter: { registrationId: r._id, window: window.key },
          update: {
            $setOnInsert: {
              eventId: event._id,
              registrationId: r._id,
              userId: r.userId,
              window: window.key,
              scheduledFor: event.startAt,
              status: 'pending'
            }
          },
          upsert: true
        }
      }));

      const res = await Reminder.bulkWrite(ops, { ordered: false }).catch((err) => {
        console.error(`[reminder] bulkWrite failed for event ${event._id}:`, err.message);
        return { upsertedCount: 0 };
      });

      created += res.upsertedCount || 0;
    }
  }

  console.log(`[reminder] scan done — events scanned: ${scanned}, reminders created: ${created}`);
  return { scanned, created };
}

/**
 * Dispatch all pending reminders that are due now.
 * For now, this just marks them as 'sent' and logs.
 * When Module W (Notifications) exists, replace the TODO with an actual send.
 */
async function dispatchPendingReminders() {
  const now = new Date();
  const pending = await Reminder.find({
    status: 'pending',
    scheduledFor: { $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) }
  }).limit(500);

  let sent = 0;

  for (const reminder of pending) {
    try {
      // TODO: integrate with Notification service (Module W) when available.
      // For now, log and mark as sent.
      console.log(
        `[reminder] → user=${reminder.userId} window=${reminder.window} event=${reminder.eventId}`
      );

      reminder.status = 'sent';
      reminder.sentAt = new Date();
      await reminder.save();
      sent += 1;
    } catch (err) {
      reminder.status = 'failed';
      reminder.error = err.message;
      await reminder.save();
    }
  }

  console.log(`[reminder] dispatch done — sent: ${sent} of ${pending.length}`);
  return { sent, total: pending.length };
}

module.exports = {
  scanAndCreateReminders,
  dispatchPendingReminders,
  WINDOWS
};