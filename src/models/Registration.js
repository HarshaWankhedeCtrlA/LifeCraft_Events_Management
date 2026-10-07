const mongoose = require('mongoose');

const REG_STATUSES = ['registered', 'waitlisted', 'cancelled', 'attended', 'no-show'];

const registrationSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    userId: { type: String, required: true, index: true },  // sub from JWT
    status: { type: String, enum: REG_STATUSES, default: 'registered', index: true },
    qrCode: { type: String, default: null },
        checkInToken: { type: String, default: null, index: true },
    checkInTokenExpiresAt: { type: Date, default: null },
    registeredAt: { type: Date, default: Date.now },
    cancelledAt: { type: Date, default: null },
    promotedAt: { type: Date, default: null },
    attendanceMarkedAt: { type: Date, default: null },
    notes: { type: String, default: null },
    
  },
  { timestamps: true }
);

registrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Registration', registrationSchema);
module.exports.REG_STATUSES = REG_STATUSES;