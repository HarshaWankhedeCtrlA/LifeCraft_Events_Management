const mongoose = require('mongoose');

const EVENT_MODES = ['online', 'offline', 'hybrid'];
const EVENT_STATUSES = ['draft', 'published', 'full', 'completed', 'cancelled'];

const venueSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true, index: true },
    country: { type: String, trim: true }
  },
  { _id: false }
);

const instructorSchema = new mongoose.Schema(
  {
    userId: { type: String },
    name: { type: String, trim: true },
    bio: { type: String },
    avatarUrl: { type: String }
  },
  { _id: false }
);

const priceSchema = new mongoose.Schema(
  {
    isPaid: { type: Boolean, default: false },
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' }
  },
  { _id: false }
);

// NEW: agenda item (Sr.4 spec — "display agenda")
const agendaItemSchema = new mongoose.Schema(
  {
    time: { type: String, trim: true },        // "10:00 AM" or "10:00"
    title: { type: String, trim: true },
    description: { type: String, trim: true }
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, index: 'text' },
    description: { type: String, required: true, trim: true, index: 'text' },
    mode: { type: String, enum: EVENT_MODES, required: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    tags: [{ type: String, trim: true }],

    // NEW: agenda (Sr.4)
    agenda: { type: [agendaItemSchema], default: [] },

    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },

    venue: { type: venueSchema, default: null },       // required if mode is offline/hybrid
    onlineUrl: { type: String, default: null },        // required if mode is online/hybrid

    instructor: { type: instructorSchema, default: {} },

    price: { type: priceSchema, default: () => ({}) },

    capacity: { type: Number, required: true, min: 1 },
    seatsTaken: { type: Number, default: 0, min: 0 },

    coverImage: { type: String, default: null },

    status: { type: String, enum: EVENT_STATUSES, default: 'draft', index: true },

    createdBy: { type: String, required: true }
  },
  { timestamps: true }
);

// Compound index for the common browse query
eventSchema.index({ status: 1, startAt: 1 });

// Virtual: seats remaining
eventSchema.virtual('seatsRemaining').get(function () {
  return Math.max(0, this.capacity - this.seatsTaken);
});

eventSchema.set('toJSON', { virtuals: true });
eventSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Event', eventSchema);
module.exports.EVENT_MODES = EVENT_MODES;
module.exports.EVENT_STATUSES = EVENT_STATUSES;