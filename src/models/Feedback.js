const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    userId: { type: String, required: true, index: true },
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comments: { type: String, trim: true, default: '' },
    // Structured feedback (optional but useful for analytics)
    structured: {
      contentQuality: { type: Number, min: 1, max: 5, default: null },
      instructor: { type: Number, min: 1, max: 5, default: null },
      organization: { type: Number, min: 1, max: 5, default: null },
      wouldRecommend: { type: Boolean, default: null }
    }
  },
  { timestamps: true }
);

// One feedback per user per event
feedbackSchema.index({ eventId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Feedback', feedbackSchema);