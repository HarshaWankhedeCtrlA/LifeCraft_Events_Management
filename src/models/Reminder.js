const mongoose = require('mongoose');

const REMINDER_WINDOWS = ['24h', '1h'];   // sent 24 hours and 1 hour before start
const REMINDER_STATUSES = ['pending', 'sent', 'failed', 'skipped'];

const reminderSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true, index: true },
    userId: { type: String, required: true, index: true },
    window: { type: String, enum: REMINDER_WINDOWS, required: true },
    scheduledFor: { type: Date, required: true, index: true },
    status: { type: String, enum: REMINDER_STATUSES, default: 'pending', index: true },
    sentAt: { type: Date, default: null },
    error: { type: String, default: null }
  },
  { timestamps: true }
);

// One reminder per (registration, window)
reminderSchema.index({ registrationId: 1, window: 1 }, { unique: true });

module.exports = mongoose.model('Reminder', reminderSchema);
module.exports.REMINDER_WINDOWS = REMINDER_WINDOWS;