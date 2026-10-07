// Generates a certificate as HTML. The client can render it in a browser
// and "Print to PDF" to obtain a real PDF, or save the HTML directly.
// If you want a server-side PDF later, swap this for pdfkit.

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildCertificateHtml = ({ userName, eventTitle, instructorName, startAt, endAt, eventId, issuedAt }) => {
  const fmtDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Certificate of Participation</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; font-family: Georgia, serif; background: #f7f7f7; }
    .cert {
      width: 1000px; height: 700px; margin: 40px auto; padding: 60px;
      background: #fff; border: 12px double #b8860b;
      box-sizing: border-box; text-align: center; position: relative;
    }
    .title { font-size: 46px; letter-spacing: 3px; color: #b8860b; margin: 0; }
    .subtitle { font-size: 20px; color: #555; margin: 20px 0 40px; letter-spacing: 2px; }
    .name { font-size: 42px; font-style: italic; color: #1a1a1a; margin: 24px 0; }
    .line { border-top: 1px solid #333; width: 60%; margin: 12px auto; }
    .body-text { font-size: 20px; color: #333; line-height: 1.7; }
    .event-title { font-size: 28px; color: #1a1a1a; font-weight: bold; margin: 24px 0; }
    .footer { position: absolute; bottom: 40px; left: 60px; right: 60px; display: flex; justify-content: space-between; font-size: 14px; color: #666; }
    .signature { border-top: 1px solid #333; width: 220px; padding-top: 6px; margin-top: 60px; display: inline-block; }
  </style>
</head>
<body>
  <div class="cert">
    <div class="title">CERTIFICATE OF PARTICIPATION</div>
    <div class="subtitle">— LifeCraft —</div>

    <div class="body-text">This is to certify that</div>
    <div class="name">${escapeHtml(userName)}</div>
    <div class="line"></div>

    <div class="body-text">has successfully participated in</div>
    <div class="event-title">${escapeHtml(eventTitle)}</div>

    <div class="body-text">held on ${fmtDate(startAt)}${endAt && endAt !== startAt ? ` – ${fmtDate(endAt)}` : ''}</div>

    <div class="signature">${escapeHtml(instructorName || 'LifeCraft Team')}</div>

    <div class="footer">
      <span>Certificate ID: LF-${String(eventId).slice(-8).toUpperCase()}</span>
      <span>Issued: ${fmtDate(issuedAt)}</span>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { buildCertificateHtml };