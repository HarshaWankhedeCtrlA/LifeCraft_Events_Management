// Minimal RFC-5545 .ics generator.
// Works with Google Calendar, Apple Calendar, Outlook, Yahoo, etc.

const pad = (n) => String(n).padStart(2, '0');

const toIcsDate = (date) => {
  const d = new Date(date);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
};

const escapeText = (str = '') =>
  String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// RFC 5545 requires lines <= 75 chars; fold long lines
const foldLine = (line) => {
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    chunks.push(line.slice(i, i + 75));
    i += 75;
  }
  return chunks.join('\r\n ');
};

const buildEventIcs = (event, {
  organizerEmail = 'noreply@lifecraft.com',
  organizerName = 'LifeCraft'
} = {}) => {
  const uid = `event-${event._id}@lifecraft.com`;
  const dtstamp = toIcsDate(new Date());
  const dtstart = toIcsDate(event.startAt);
  const dtend = toIcsDate(event.endAt);

  let location = '';
  if (event.venue) {
    location = [event.venue.name, event.venue.address, event.venue.city, event.venue.country]
      .filter(Boolean)
      .join(', ');
  } else if (event.onlineUrl) {
    location = event.onlineUrl;
  }

  const descriptionParts = [
    event.description,
    event.instructor?.name ? `Instructor: ${event.instructor.name}` : '',
    event.onlineUrl ? `Join online: ${event.onlineUrl}` : ''
  ].filter(Boolean);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LifeCraft//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(descriptionParts.join('\n\n'))}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    `ORGANIZER;CN=${escapeText(organizerName)}:mailto:${organizerEmail}`,
    `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    `CATEGORIES:${escapeText(event.category || '')}`,
    `URL:${process.env.PUBLIC_APP_URL || 'https://app.lifecraft.com'}/events/${event._id}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);

  return lines.map(foldLine).join('\r\n');
};

module.exports = { buildEventIcs };