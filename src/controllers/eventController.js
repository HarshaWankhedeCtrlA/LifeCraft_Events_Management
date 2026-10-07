const Event = require('../models/Event');
const { sendSuccess, sendError } = require('../utils/response');
const Registration = require('../models/Registration');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Feedback = require('../models/Feedback');
const { buildCertificateHtml } = require('../utils/certificate');
const reminderJob = require('../services/reminderJob');
const Reminder = require('../models/Reminder');
const { buildEventIcs } = require('../utils/ics');
// ============================================
// SR.1 — BROWSE EVENTS
// Lists upcoming online / offline / hybrid events.
// Regular users see only 'published' (and 'full') events.
// Admins can pass ?includeDrafts=true to see everything.
// ============================================
exports.browseEvents = async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      mode,
      when = 'upcoming',
      sort = 'startAt',
      includeDrafts = 'false'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const skip = (pageNum - 1) * limit;

    // --- Build filter ---
    const filter = {};

    const isAdmin = req.user.role === 'admin';
    if (isAdmin && includeDrafts === 'true') {
      // admin sees everything
    } else {
      filter.status = { $in: ['published', 'full'] };
    }

    if (mode) {
      if (!['online', 'offline', 'hybrid'].includes(mode)) {
        return sendError(res, 'INVALID_MODE', 'mode must be online, offline or hybrid', 400);
      }
      filter.mode = mode;
    }

    const now = new Date();
    if (when === 'upcoming') {
      filter.startAt = { $gte: now };
    } else if (when === 'past') {
      filter.startAt = { $lt: now };
    } else if (when !== 'all') {
      return sendError(res, 'INVALID_WHEN', 'when must be upcoming, past or all', 400);
    }

    // --- Sort ---
    const sortMap = {
      startAt: { startAt: 1 },
      createdAt: { createdAt: -1 },
      popularity: { seatsTaken: -1, startAt: 1 }
    };
    const sortSpec = sortMap[sort] || sortMap.startAt;

    // --- Query ---
    const [items, total] = await Promise.all([
      Event.find(filter)
        .sort(sortSpec)
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      Event.countDocuments(filter)
    ]);

    return sendSuccess(res, {
      items,
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.2 — SEARCH EVENTS
// Keyword search across title/description/tags, plus filters:
//   q          — keyword (partial, case-insensitive)
//   category   — exact match
//   city       — exact match (against venue.city)
//   instructor — partial match (against instructor.name)
//   date       — ISO date (YYYY-MM-DD) — matches events starting that day
//   mode       — online | offline | hybrid
//   when       — upcoming | past | all (default upcoming)
// Pagination: page, pageSize
// ============================================
exports.searchEvents = async (req, res, next) => {
  try {
    const {
      q,
      category,
      city,
      instructor,
      date,
      mode,
      when = 'upcoming',
      page = 1,
      pageSize = 20,
      sort = 'startAt'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const skip = (pageNum - 1) * limit;

    // --- Base filter (visibility) ---
    const filter = { status: { $in: ['published', 'full'] } };

    // --- Keyword search across title, description, tags ---
    if (q && q.trim()) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [
        { title: rx },
        { description: rx },
        { tags: rx }
      ];
    }

    // --- Category (exact match, case-insensitive) ---
    if (category && category.trim()) {
      const escaped = category.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.category = new RegExp(`^${escaped}$`, 'i');
    }

    // --- City (matches venue.city, exact case-insensitive) ---
    if (city && city.trim()) {
      const escaped = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter['venue.city'] = new RegExp(`^${escaped}$`, 'i');
    }

    // --- Instructor (partial match on instructor.name) ---
    if (instructor && instructor.trim()) {
      const escaped = instructor.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter['instructor.name'] = new RegExp(escaped, 'i');
    }

    // --- Date (matches events starting that calendar day) ---
    if (date && date.trim()) {
      const day = new Date(date.trim());
      if (isNaN(day.getTime())) {
        return sendError(res, 'INVALID_DATE', 'date must be a valid ISO date (YYYY-MM-DD)', 400);
      }
      const dayStart = new Date(day);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      filter.startAt = { $gte: dayStart, $lt: dayEnd };
    }

    // --- Mode ---
    if (mode && mode.trim()) {
      if (!['online', 'offline', 'hybrid'].includes(mode)) {
        return sendError(res, 'INVALID_MODE', 'mode must be online, offline or hybrid', 400);
      }
      filter.mode = mode;
    }
    // --- Price type (free / paid) — Sr.3 ---
    const { priceType, duration } = req.query;

    if (priceType && priceType.trim()) {
      const pt = priceType.trim().toLowerCase();
      if (pt === 'free') filter['price.isPaid'] = false;
      else if (pt === 'paid') filter['price.isPaid'] = true;
      else return sendError(res, 'INVALID_PRICE_TYPE', 'priceType must be free or paid', 400);
    }

    // --- Duration bucket (short <2h / half-day 2-6h / full-day >6h) — Sr.3 ---
    if (duration && duration.trim()) {
      const dur = duration.trim().toLowerCase();
      const twoHours = 2 * 60 * 60 * 1000;
      const sixHours = 6 * 60 * 60 * 1000;
      if (dur === 'short') {
        filter.$expr = { $lt: [{ $subtract: ['$endAt', '$startAt'] }, twoHours] };
      } else if (dur === 'half-day') {
        filter.$expr = {
          $and: [
            { $gte: [{ $subtract: ['$endAt', '$startAt'] }, twoHours] },
            { $lt: [{ $subtract: ['$endAt', '$startAt'] }, sixHours] }
          ]
        };
      } else if (dur === 'full-day') {
        filter.$expr = { $gte: [{ $subtract: ['$endAt', '$startAt'] }, sixHours] };
      } else {
        return sendError(res, 'INVALID_DURATION', 'duration must be short, half-day or full-day', 400);
      }
    }
    // --- When (upcoming / past / all) — only if date not already set ---
    if (!date) {
      const now = new Date();
      if (when === 'upcoming') {
        filter.startAt = { $gte: now };
      } else if (when === 'past') {
        filter.startAt = { $lt: now };
      } else if (when !== 'all') {
        return sendError(res, 'INVALID_WHEN', 'when must be upcoming, past or all', 400);
      }
    }

    // --- Sort ---
    const sortMap = {
      startAt: { startAt: 1 },
      createdAt: { createdAt: -1 },
      popularity: { seatsTaken: -1, startAt: 1 }
    };
    const sortSpec = sortMap[sort] || sortMap.startAt;

    // --- Execute ---
    const [items, total] = await Promise.all([
      Event.find(filter)
        .sort(sortSpec)
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true, versionKey: false }),
      Event.countDocuments(filter)
    ]);

    return sendSuccess(res, {
      query: {
        q: q || null,
        category: category || null,
        city: city || null,
        instructor: instructor || null,
        date: date || null,
        mode: mode || null,
        priceType: priceType || null,
         duration: duration || null,
        when: date ? null : when
      },
      items,
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.3 — EVENT FILTERS
// Returns the available filter values across published events, so the
// frontend can render a filter UI without hardcoding anything.
//   - mode (online / offline / hybrid)
//   - priceType (free / paid)
//   - duration (short <2h / half-day 2-6h / full-day >6h)
//   - category
//   - location (city)
// ============================================
exports.getEventFilters = async (req, res, next) => {
  try {
    const baseMatch = { status: { $in: ['published', 'full'] } };

    const [modes, categories, cities, instructors, priceAgg, durationsAgg] = await Promise.all([
      Event.distinct('mode', baseMatch),
      Event.distinct('category', baseMatch),
      Event.distinct('venue.city', { ...baseMatch, 'venue.city': { $ne: null } }),
      Event.distinct('instructor.name', { ...baseMatch, 'instructor.name': { $ne: null } }),

      Event.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$price.isPaid', count: { $sum: 1 } } }
      ]),

      Event.aggregate([
        { $match: baseMatch },
        {
          $addFields: {
            durationMinutes: { $divide: [{ $subtract: ['$endAt', '$startAt'] }, 60000] }
          }
        },
        {
          $addFields: {
            bucket: {
              $switch: {
                branches: [
                  { case: { $lt: ['$durationMinutes', 120] }, then: 'short' },
                  { case: { $lt: ['$durationMinutes', 360] }, then: 'half-day' }
                ],
                default: 'full-day'
              }
            }
          }
        },
        { $group: { _id: '$bucket', count: { $sum: 1 } } }
      ])
    ]);

    const priceCounts = { free: 0, paid: 0 };
    priceAgg.forEach((p) => {
      if (p._id === true) priceCounts.paid = p.count;
      else priceCounts.free = p.count;
    });

    const durationCounts = { short: 0, 'half-day': 0, 'full-day': 0 };
    durationsAgg.forEach((d) => {
      if (durationCounts[d._id] !== undefined) durationCounts[d._id] = d.count;
    });

    return sendSuccess(res, {
      modes,
      priceTypes: [
        { value: 'free', label: 'Free', count: priceCounts.free },
        { value: 'paid', label: 'Paid', count: priceCounts.paid }
      ],
      durations: [
        { value: 'short', label: 'Under 2 hours', count: durationCounts.short },
        { value: 'half-day', label: '2–6 hours', count: durationCounts['half-day'] },
        { value: 'full-day', label: 'Full day', count: durationCounts['full-day'] }
      ],
      categories: categories.sort(),
      locations: cities.sort(),
      instructors: instructors.sort()
    });
  } catch (error) {
    next(error);
  }
};


// ============================================
// SR.4 — EVENT DETAILS
// Displays agenda, instructor, venue, timings, pricing and capacity.
// ============================================
exports.getEventById = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean({ virtuals: true, versionKey: false });

    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && !['published', 'full'].includes(event.status)) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    // --- Enrich with computed fields for the frontend ---
    const capacity = event.capacity ?? 0;
    const seatsTaken = event.seatsTaken ?? 0;
    const seatsRemaining = Math.max(0, capacity - seatsTaken);

    const startMs = new Date(event.startAt).getTime();
    const endMs = new Date(event.endAt).getTime();
    const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));

    let availability = 'available';
    if (seatsRemaining === 0) availability = 'full';
    if (event.status === 'cancelled') availability = 'cancelled';
    if (event.status === 'completed') availability = 'completed';

    return sendSuccess(res, {
      ...event,
      durationMinutes,
      capacity,
      seatsTaken,
      seatsRemaining,
      availability,
      agenda: Array.isArray(event.agenda) ? event.agenda : []
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.5 — REGISTER FOR AN EVENT
// If capacity available -> status: registered, seatsTaken++
// If full -> status: waitlisted
// Idempotent: calling twice returns the existing registration.
// ============================================
exports.registerForEvent = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    if (!['published', 'full'].includes(event.status)) {
      return sendError(res, 'EVENT_NOT_OPEN', 'Event is not open for registration', 400);
    }

    if (new Date(event.startAt).getTime() < Date.now()) {
      return sendError(res, 'EVENT_ALREADY_STARTED', 'Registration is closed for this event', 400);
    }

    // Idempotent: if already actively registered, return existing
    const existing = await Registration.findOne({ eventId, userId });
    if (existing && existing.status !== 'cancelled') {
      return sendSuccess(res, {
        registration: existing,
        message: 'Already registered'
      }, 200);
    }

    // Atomic capacity grab
    const updatedEvent = await Event.findOneAndUpdate(
      { _id: eventId, $expr: { $lt: ['$seatsTaken', '$capacity'] } },
      { $inc: { seatsTaken: 1 } },
      { new: true }
    );

    const status = updatedEvent ? 'registered' : 'waitlisted';

    const registration = await Registration.findOneAndUpdate(
      { eventId, userId },
      {
        $set: {
          status,
          registeredAt: new Date(),
          cancelledAt: null,
          promotedAt: null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Mark event full if capacity reached
    if (updatedEvent && updatedEvent.seatsTaken >= updatedEvent.capacity) {
      await Event.updateOne({ _id: eventId }, { $set: { status: 'full' } });
    }

    return sendSuccess(res, {
      registration,
      position: status === 'waitlisted'
        ? 'Waitlisted — you will be promoted when a seat opens.'
        : null
    }, 201);
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.6 + SR.7 — CANCEL REGISTRATION + WAITLIST PROMOTION
// ============================================
exports.cancelRegistration = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: eventId } = req.params;

    const registration = await Registration.findOne({ eventId, userId });
    if (!registration) {
      return sendError(res, 'REGISTRATION_NOT_FOUND', 'You are not registered for this event', 404);
    }
    if (registration.status === 'cancelled') {
      return sendError(res, 'ALREADY_CANCELLED', 'Registration is already cancelled', 400);
    }

    const wasRegistered = registration.status === 'registered';

    registration.status = 'cancelled';
    registration.cancelledAt = new Date();
    await registration.save();

    let promoted = null;

    if (wasRegistered) {
      await Event.updateOne({ _id: eventId }, { $inc: { seatsTaken: -1 } });

      // Promote oldest waitlisted user
      const nextInLine = await Registration.findOneAndUpdate(
        { eventId, status: 'waitlisted' },
        { $set: { status: 'registered', promotedAt: new Date() } },
        { sort: { registeredAt: 1 }, new: true }
      );

      if (nextInLine) {
        await Event.updateOne({ _id: eventId }, { $inc: { seatsTaken: 1 } });
        promoted = nextInLine;
      } else {
        // No one waiting — reopen if it was full
        await Event.updateOne(
          { _id: eventId, status: 'full' },
          { $set: { status: 'published' } }
        );
      }
    }

    return sendSuccess(res, {
      registration,
      promoted,
      message: wasRegistered
        ? 'Registration cancelled. Seat released.'
        : 'Waitlist entry removed.'
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// LIST MY REGISTRATIONS (bonus)
// ============================================
exports.listMyRegistrations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, pageSize = 20, status } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const skip = (pageNum - 1) * limit;

    const filter = { userId };
    if (status) filter.status = status;

    const [items, total] = await Promise.all([
      Registration.find(filter)
        .sort({ registeredAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('eventId', 'title startAt endAt mode venue coverImage status')
        .lean({ virtuals: true, versionKey: false }),
      Registration.countDocuments(filter)
    ]);

    return sendSuccess(res, {
      items,
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.9 — DIGITAL PASS (QR CODE)
// Returns the QR code for the current user's registration.
// The QR payload contains a check-in token that expires at event end.
// Only the registration owner can fetch their own QR.
// ============================================
exports.getMyQr = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: registrationId } = req.params;

    const registration = await Registration.findById(registrationId).populate('eventId');
    if (!registration) {
      return sendError(res, 'REGISTRATION_NOT_FOUND', 'Registration not found', 404);
    }

    // Ownership check
    if (registration.userId !== userId) {
      return sendError(res, 'FORBIDDEN', 'You can only access your own QR code', 403);
    }

    if (registration.status === 'cancelled') {
      return sendError(res, 'REGISTRATION_CANCELLED', 'This registration was cancelled', 400);
    }
    if (registration.status === 'waitlisted') {
      return sendError(res, 'NOT_CONFIRMED', 'You are on the waitlist — QR available after promotion', 400);
    }
    if (registration.status === 'attended') {
      return sendError(res, 'ALREADY_ATTENDED', 'Attendance already recorded for this registration', 400);
    }

    const event = registration.eventId;
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    // Generate (or reuse) the check-in token
    let token = registration.checkInToken;
    let expiresAt = registration.checkInTokenExpiresAt;
    const now = new Date();

    const expired = !expiresAt || new Date(expiresAt).getTime() < now.getTime();
    if (!token || expired) {
      token = crypto.randomBytes(24).toString('hex');
      // Token valid until 1 hour after event end
      expiresAt = new Date(new Date(event.endAt).getTime() + 60 * 60 * 1000);

      registration.checkInToken = token;
      registration.checkInTokenExpiresAt = expiresAt;
    }

    // Build the payload that goes inside the QR
    const payload = JSON.stringify({
      t: token,
      e: String(event._id),
      r: String(registration._id)
    });

    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400
    });

    registration.qrCode = qrDataUrl;
    await registration.save();

    return sendSuccess(res, {
      registrationId: registration._id,
      eventId: event._id,
      eventTitle: event.title,
      status: registration.status,
      qrDataUrl,               // base64 PNG, put in <img src="...">
      payload,                 // the raw token payload (for debugging)
      expiresAt
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.10 — ATTENDANCE TRACKING (mark)
// Admin scans a QR and posts the token here to mark attendance.
// Accepts either checkInToken (from QR scan) or registrationId (manual).
// ============================================
exports.markAttendance = async (req, res, next) => {
  try {
    const { id: eventId } = req.params;
    const { checkInToken, registrationId } = req.body || {};

    if (!checkInToken && !registrationId) {
      return sendError(res, 'MISSING_INPUT', 'Provide checkInToken or registrationId', 400);
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    const query = { eventId };
    if (checkInToken) {
      query.checkInToken = checkInToken;
    } else {
      query._id = registrationId;
    }

    const registration = await Registration.findOne(query);
    if (!registration) {
      return sendError(res, 'REGISTRATION_NOT_FOUND', 'No matching registration for this event', 404);
    }

    if (registration.status === 'cancelled') {
      return sendError(res, 'REGISTRATION_CANCELLED', 'Registration was cancelled', 400);
    }
    if (registration.status === 'waitlisted') {
      return sendError(res, 'NOT_CONFIRMED', 'User is waitlisted — cannot mark attendance', 400);
    }
    if (registration.status === 'attended') {
      return sendError(res, 'ALREADY_ATTENDED', 'Attendance already recorded', 400);
    }

    // Token expiry check
    if (checkInToken && registration.checkInTokenExpiresAt && new Date(registration.checkInTokenExpiresAt) < new Date()) {
      return sendError(res, 'TOKEN_EXPIRED', 'Check-in token has expired', 400);
    }

    registration.status = 'attended';
    registration.attendanceMarkedAt = new Date();
    await registration.save();

    return sendSuccess(res, {
      registration,
      message: 'Attendance recorded'
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.10 — ATTENDANCE TRACKING (list)
// Admin can see who's registered, waitlisted, attended, etc.
// ============================================
exports.listAttendance = async (req, res, next) => {
  try {
    const { id: eventId } = req.params;
    const { status, page = 1, pageSize = 50 } = req.query;

    const event = await Event.findById(eventId);
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const skip = (pageNum - 1) * limit;

    const filter = { eventId };
    if (status) filter.status = status;

    const [items, total, attendanceCount] = await Promise.all([
      Registration.find(filter)
        .sort({ registeredAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true, versionKey: false }),
      Registration.countDocuments(filter),
      Registration.countDocuments({ eventId, status: 'attended' })
    ]);

    return sendSuccess(res, {
      event: {
        _id: event._id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        capacity: event.capacity,
        seatsTaken: event.seatsTaken
      },
      stats: {
        total: await Registration.countDocuments({ eventId }),
        attended: attendanceCount
      },
      items,
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.11 — CERTIFICATES OF PARTICIPATION
// Only users with status "attended" can download their certificate.
// Returns an HTML certificate the client can print to PDF.
// ============================================
exports.getCertificate = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: registrationId } = req.params;

    const registration = await Registration.findById(registrationId).populate('eventId');
    if (!registration) {
      return sendError(res, 'REGISTRATION_NOT_FOUND', 'Registration not found', 404);
    }
    if (registration.userId !== userId) {
      return sendError(res, 'FORBIDDEN', 'You can only download your own certificate', 403);
    }
    if (registration.status !== 'attended') {
      return sendError(res, 'NOT_ELIGIBLE', 'Certificate is only available after attendance is marked', 400);
    }

    const event = registration.eventId;
    if (!event) return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);

    // Optional: only for completed events (event has ended)
    if (new Date(event.endAt).getTime() > Date.now()) {
      return sendError(res, 'EVENT_NOT_ENDED', 'Certificate becomes available after the event ends', 400);
    }

    const userName = req.user.raw?.name
      || [req.user.raw?.firstName, req.user.raw?.lastName].filter(Boolean).join(' ')
      || req.user.email
      || `User ${userId.slice(-6)}`;

    const html = buildCertificateHtml({
      userName,
      eventTitle: event.title,
      instructorName: event.instructor?.name,
      startAt: event.startAt,
      endAt: event.endAt,
      eventId: event._id,
      issuedAt: new Date()
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${registration._id}.html"`);
    return res.status(200).send(html);
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.12 — POST EVENT FEEDBACK
// Only users with status "attended" can post feedback.
// One feedback per user per event.
// ============================================
exports.submitFeedback = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: eventId } = req.params;
    const { rating, comments, structured } = req.body || {};

    if (rating == null || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return sendError(res, 'INVALID_RATING', 'rating must be a number between 1 and 5', 400);
    }

    const event = await Event.findById(eventId);
    if (!event) return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);

    const registration = await Registration.findOne({ eventId, userId });
    if (!registration) {
      return sendError(res, 'NOT_REGISTERED', 'You must have registered for this event', 403);
    }
    if (registration.status !== 'attended') {
      return sendError(res, 'NOT_ATTENDED', 'Feedback is only allowed after attendance', 403);
    }

    // Upsert feedback (allows editing)
    const feedback = await Feedback.findOneAndUpdate(
      { eventId, userId },
      {
        $set: {
          registrationId: registration._id,
          rating,
          comments: comments || '',
          structured: structured || {}
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return sendSuccess(res, { feedback, message: 'Thank you for your feedback' }, 201);
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.12 — LIST FEEDBACK FOR AN EVENT (admin)
// ============================================
exports.listFeedback = async (req, res, next) => {
  try {
    const { id: eventId } = req.params;
    const { page = 1, pageSize = 50 } = req.query;

    const event = await Event.findById(eventId);
    if (!event) return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const skip = (pageNum - 1) * limit;

    const [items, total, avgAgg] = await Promise.all([
      Feedback.find({ eventId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ versionKey: false }),
      Feedback.countDocuments({ eventId }),
      Feedback.aggregate([
        { $match: { eventId: event._id } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
      ])
    ]);

    const averageRating = avgAgg[0]?.avg ?? null;

    return sendSuccess(res, {
      event: { _id: event._id, title: event.title },
      stats: {
        total,
        averageRating: averageRating != null ? Math.round(averageRating * 10) / 10 : null
      },
      items,
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.13 — SUGGESTED EVENTS
// Recommends upcoming events similar to the ones the user has
// registered for (same category OR overlapping tags).
// Falls back to popular upcoming events if no history.
// ============================================
exports.getSuggestedEvents = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;
    const pageLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    const now = new Date();

    // 1. Look at user's past registrations
    const myRegs = await Registration.find({ userId, status: { $in: ['registered', 'attended'] } })
      .populate('eventId', 'category tags')
      .lean();

    const categories = new Set();
    const tags = new Set();
    const seenEventIds = new Set();
    myRegs.forEach((r) => {
      if (!r.eventId) return;
      seenEventIds.add(String(r.eventId._id));
      if (r.eventId.category) categories.add(r.eventId.category);
      (r.eventId.tags || []).forEach((t) => tags.add(t));
    });

    // 2. Query upcoming events in those categories/tags, excluding seen ones
    const baseFilter = {
      status: { $in: ['published', 'full'] },
      startAt: { $gte: now },
      _id: { $nin: Array.from(seenEventIds) }
    };

    let candidates = [];
    let reason = 'POPULAR';

    if (categories.size > 0 || tags.size > 0) {
      reason = 'BASED_ON_INTERESTS';
      const or = [];
      if (categories.size > 0) or.push({ category: { $in: Array.from(categories) } });
      if (tags.size > 0) or.push({ tags: { $in: Array.from(tags) } });

      candidates = await Event.find({ ...baseFilter, $or: or })
        .sort({ startAt: 1 })
        .limit(pageLimit)
        .lean({ virtuals: true, versionKey: false });
    }

    // 3. Fallback: if no interest-based matches, return popular upcoming
    if (candidates.length === 0) {
      candidates = await Event.find(baseFilter)
        .sort({ seatsTaken: -1, startAt: 1 })
        .limit(pageLimit)
        .lean({ virtuals: true, versionKey: false });
      if (reason !== 'POPULAR') reason = 'POPULAR_FALLBACK';
    }

    // 4. Enrich with computed fields (same shape as /events)
    const items = candidates.map((e) => ({
      ...e,
      seatsRemaining: Math.max(0, (e.capacity ?? 0) - (e.seatsTaken ?? 0)),
      agenda: Array.isArray(e.agenda) ? e.agenda : []
    }));

    return sendSuccess(res, {
      reason,
      basedOn: {
        categories: Array.from(categories),
        tags: Array.from(tags)
      },
      items,
      total: items.length
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.14 — EVENT REMINDERS (admin)
// Manually trigger the reminder scan + dispatch.
// Useful for testing without waiting for the cron to fire.
// ============================================
exports.runReminderJob = async (req, res, next) => {
  try {
    const scanResult = await reminderJob.scanAndCreateReminders();
    const dispatchResult = await reminderJob.dispatchPendingReminders();
    return sendSuccess(res, {
      scan: scanResult,
      dispatch: dispatchResult,
      message: 'Reminder job completed'
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.14 — LIST REMINDERS (admin)
// See all reminder records, filter by status/window/event.
// ============================================
exports.listReminders = async (req, res, next) => {
  try {
    const { eventId, status, window: win, page = 1, pageSize = 50 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const skip = (pageNum - 1) * limit;

    const filter = {};
    if (eventId) filter.eventId = eventId;
    if (status) filter.status = status;
    if (win) filter.window = win;

    const [items, total] = await Promise.all([
      Reminder.find(filter)
        .sort({ scheduledFor: -1 })
        .skip(skip)
        .limit(limit)
        .populate('eventId', 'title startAt')
        .lean({ versionKey: false }),
      Reminder.countDocuments(filter)
    ]);

    return sendSuccess(res, {
      items,
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};
// ============================================
// SR.15 — ADMIN: CREATE EVENT
// Admin-only. Validates required fields and applies defaults.
// ============================================
exports.createEvent = async (req, res, next) => {
  try {
    const {
      title, description, mode, category, tags,
      agenda, startAt, endAt, venue, onlineUrl,
      instructor, price, capacity, coverImage, status
    } = req.body || {};

    // --- Required field validation ---
    const missing = [];
    if (!title) missing.push('title');
    if (!description) missing.push('description');
    if (!mode) missing.push('mode');
    if (!category) missing.push('category');
    if (!startAt) missing.push('startAt');
    if (!endAt) missing.push('endAt');
    if (capacity == null) missing.push('capacity');

    if (missing.length > 0) {
      return sendError(res, 'MISSING_FIELDS', `Missing required: ${missing.join(', ')}`, 400);
    }

    if (!['online', 'offline', 'hybrid'].includes(mode)) {
      return sendError(res, 'INVALID_MODE', 'mode must be online, offline or hybrid', 400);
    }

    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (isNaN(startMs) || isNaN(endMs)) {
      return sendError(res, 'INVALID_DATES', 'startAt and endAt must be valid dates', 400);
    }
    if (endMs <= startMs) {
      return sendError(res, 'INVALID_DATES', 'endAt must be after startAt', 400);
    }
    if (capacity < 1) {
      return sendError(res, 'INVALID_CAPACITY', 'capacity must be at least 1', 400);
    }

    // Mode-specific validation
    if ((mode === 'offline' || mode === 'hybrid') && (!venue || !venue.city)) {
      return sendError(res, 'MISSING_VENUE', 'venue with at least a city is required for offline/hybrid events', 400);
    }
    if ((mode === 'online' || mode === 'hybrid') && !onlineUrl) {
      return sendError(res, 'MISSING_ONLINE_URL', 'onlineUrl is required for online/hybrid events', 400);
    }

    const event = await Event.create({
      title: title.trim(),
      description: description.trim(),
      mode,
      category: category.trim(),
      tags: Array.isArray(tags) ? tags : [],
      agenda: Array.isArray(agenda) ? agenda : [],
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      venue: venue || null,
      onlineUrl: onlineUrl || null,
      instructor: instructor || {},
      price: price || { isPaid: false, amount: 0, currency: 'INR' },
      capacity,
      seatsTaken: 0,
      coverImage: coverImage || null,
      status: ['draft', 'published'].includes(status) ? status : 'draft',
      createdBy: req.user.id
    });

    return sendSuccess(res, { event, message: 'Event created' }, 201);
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.15 — ADMIN: UPDATE EVENT
// Admin-only. Partial update. Prevents shrinking capacity below seatsTaken.
// ============================================
exports.updateEvent = async (req, res, next) => {
  try {
    const { id: eventId } = req.params;
    const updates = req.body || {};

    const event = await Event.findById(eventId);
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    // Whitelist updatable fields
    const allowed = [
      'title', 'description', 'mode', 'category', 'tags', 'agenda',
      'startAt', 'endAt', 'venue', 'onlineUrl', 'instructor',
      'price', 'capacity', 'coverImage'
    ];

    // Guard: capacity can't go below seatsTaken
    if (updates.capacity != null && updates.capacity < event.seatsTaken) {
      return sendError(
        res,
        'INVALID_CAPACITY',
        `capacity cannot be less than seats already taken (${event.seatsTaken})`,
        400
      );
    }

    // Guard: mode change requires corresponding field
    if (updates.mode) {
      if (!['online', 'offline', 'hybrid'].includes(updates.mode)) {
        return sendError(res, 'INVALID_MODE', 'mode must be online, offline or hybrid', 400);
      }
    }

    // Guard: endAt must be after startAt (using new or existing values)
    const newStart = updates.startAt ? new Date(updates.startAt).getTime() : new Date(event.startAt).getTime();
    const newEnd = updates.endAt ? new Date(updates.endAt).getTime() : new Date(event.endAt).getTime();
    if (newEnd <= newStart) {
      return sendError(res, 'INVALID_DATES', 'endAt must be after startAt', 400);
    }

    // Apply updates
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        event[key] = updates[key];
      }
    }
    await event.save();

    return sendSuccess(res, { event, message: 'Event updated' });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.15 — ADMIN: DELETE EVENT
// Admin-only. Refuses to delete events with active registrations.
// ============================================
exports.deleteEvent = async (req, res, next) => {
  try {
    const { id: eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    // Guard: no active registrations
    const activeRegs = await Registration.countDocuments({
      eventId,
      status: { $in: ['registered', 'waitlisted', 'attended'] }
    });
    if (activeRegs > 0) {
      return sendError(
        res,
        'HAS_REGISTRATIONS',
        `Cannot delete — event has ${activeRegs} active registration(s). Cancel the event instead.`,
        400
      );
    }

    await Event.deleteOne({ _id: eventId });
    return sendSuccess(res, { message: 'Event deleted', eventId });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.15 — ADMIN: CHANGE EVENT STATUS
// Lifecycle: draft <-> published <-> cancelled.
// ============================================
exports.changeEventStatus = async (req, res, next) => {
  try {
    const { id: eventId } = req.params;
    const { status } = req.body || {};

    const validStatuses = ['draft', 'published', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return sendError(res, 'INVALID_STATUS', `status must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    const previous = event.status;
    event.status = status;
    await event.save();

    // If event is cancelled, optionally notify registrants (deferred to Module W)
    if (status === 'cancelled' && previous !== 'cancelled') {
      console.log(`[events] Cancelled event ${eventId} — should notify registrants (Module W)`);
    }

    return sendSuccess(res, {
      event,
      previousStatus: previous,
      currentStatus: status,
      message: `Event status changed from ${previous} to ${status}`
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.8 — CALENDAR INTEGRATION (.ics)
// Returns a downloadable .ics file that the client can
// import into Google Calendar, Apple Calendar, Outlook, etc.
// ============================================
exports.downloadEventIcs = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean({ versionKey: false });
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    const roles = req.user.roles || [];
    const isAdmin = req.user.role === 'admin' || roles.includes('admin');
    if (!isAdmin && !['published', 'full'].includes(event.status)) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    const ics = buildEventIcs(event);
    const filename = `event-${event._id}.ics`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(ics);
  } catch (error) {
    next(error);
  }
};

// ============================================
// SR.8 (bonus) — Google Calendar link
// Returns a Google Calendar "add event" URL that opens prefilled.
// ============================================
exports.getGoogleCalendarLink = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean({ versionKey: false });
    if (!event) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    const roles = req.user.roles || [];
    const isAdmin = req.user.role === 'admin' || roles.includes('admin');
    if (!isAdmin && !['published', 'full'].includes(event.status)) {
      return sendError(res, 'EVENT_NOT_FOUND', 'Event not found', 404);
    }

    const fmt = (d) =>
      new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    let location = '';
    if (event.venue) {
      location = [event.venue.name, event.venue.address, event.venue.city]
        .filter(Boolean)
        .join(', ');
    } else if (event.onlineUrl) {
      location = event.onlineUrl;
    }

    const details = [
      event.description,
      event.instructor?.name ? `Instructor: ${event.instructor.name}` : '',
      event.onlineUrl ? `Join online: ${event.onlineUrl}` : ''
    ].filter(Boolean).join('\n\n');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${fmt(event.startAt)}/${fmt(event.endAt)}`,
      details,
      location,
      trp: 'false'
    });

    const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
    return sendSuccess(res, { url });
  } catch (error) {
    next(error);
  }
};