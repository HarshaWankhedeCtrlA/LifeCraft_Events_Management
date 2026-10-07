const express = require('express');
const router = express.Router();

const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/eventController');

// Sr.3 — Filters (BEFORE /:id)
router.get('/filters', authenticate, ctrl.getEventFilters);

// Sr.2 — Search (BEFORE /:id)
router.get('/search', authenticate, ctrl.searchEvents);

// Sr.13 — Suggested Events (BEFORE /:id)
router.get('/suggested', authenticate, ctrl.getSuggestedEvents);

// Sr.14 — Reminders (admin only)
router.post('/admin/reminders/run', authenticate, requireAdmin, ctrl.runReminderJob);
router.get('/admin/reminders', authenticate, requireAdmin, ctrl.listReminders);

// Sr.15 — Admin CRUD (admin only)
router.post('/', authenticate, requireAdmin, ctrl.createEvent);
router.put('/:id', authenticate, requireAdmin, ctrl.updateEvent);
router.delete('/:id', authenticate, requireAdmin, ctrl.deleteEvent);
router.put('/:id/status', authenticate, requireAdmin, ctrl.changeEventStatus);

// Sr.8 — Calendar Integration
router.get('/:id/calendar.ics', authenticate, ctrl.downloadEventIcs);
router.get('/:id/google-calendar', authenticate, ctrl.getGoogleCalendarLink);

// Sr.1 — Browse
router.get('/', authenticate, ctrl.browseEvents);

// Sr.5 — Register
router.post('/:id/register', authenticate, ctrl.registerForEvent);

// Sr.6 — Cancel
router.post('/:id/cancel', authenticate, ctrl.cancelRegistration);

// Sr.10 — Attendance (admin only)
router.post('/:id/attendance', authenticate, requireAdmin, ctrl.markAttendance);
router.get('/:id/attendance', authenticate, requireAdmin, ctrl.listAttendance);

// Sr.12 — Feedback
router.post('/:id/feedback', authenticate, ctrl.submitFeedback);
router.get('/:id/feedback', authenticate, requireAdmin, ctrl.listFeedback);

// Sr.4 — Details (LAST GET)
router.get('/:id', authenticate, ctrl.getEventById);

module.exports = router;