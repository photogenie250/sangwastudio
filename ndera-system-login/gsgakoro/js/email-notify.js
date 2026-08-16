// ============================================================
// SDMS — Parent email notifications (via EmailJS)
//
// Sends email directly from the browser using EmailJS — no backend
// required. Free tier covers 200 emails/month. See email-config.js
// for one-time setup instructions.
// ============================================================
import emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/+esm';
import {
  EMAILJS_PUBLIC_KEY,
  EMAILJS_SERVICE_ID,
  EMAILJS_MARKS_REMOVED_TEMPLATE_ID,
  EMAILJS_LETTER_TEMPLATE_ID,
} from './email-config.js';

let initialized = false;

function isConfigured(...values) {
  return values.every((v) => v && !v.startsWith('YOUR_'));
}

function ensureInit() {
  if (initialized) return true;
  if (!isConfigured(EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID)) return false;
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  initialized = true;
  return true;
}

// ------------------------------------------------------------
// Sent whenever an incident (marks deduction) is recorded.
// ------------------------------------------------------------
export async function sendMarksRemovedEmail({ parentEmail, studentName, offenseTitle, deduction, newMarks, incidentDate }) {
  if (!parentEmail) return { skipped: true, reason: 'no-parent-email' };
  if (!ensureInit() || !isConfigured(EMAILJS_MARKS_REMOVED_TEMPLATE_ID)) {
    console.info('EmailJS not configured — skipping marks-removed email. See js/email-config.js.');
    return { skipped: true, reason: 'not-configured' };
  }

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_MARKS_REMOVED_TEMPLATE_ID, {
      to_email: parentEmail,
      student_name: studentName,
      offense_title: offenseTitle,
      deduction: String(deduction),
      new_marks: String(newMarks),
      incident_date: incidentDate,
    });
    return { sent: true };
  } catch (err) {
    console.error('EmailJS send failed (marks removed):', err);
    return { sent: false, error: err };
  }
}

// ------------------------------------------------------------
// Sent for the "3+ incidents" parent letter.
// ------------------------------------------------------------
export async function sendParentLetterEmail({ parentEmail, studentName, letterHtml }) {
  if (!parentEmail) return { skipped: true, reason: 'no-parent-email' };
  if (!ensureInit() || !isConfigured(EMAILJS_LETTER_TEMPLATE_ID)) {
    console.info('EmailJS not configured — skipping parent letter email. See js/email-config.js.');
    return { skipped: true, reason: 'not-configured' };
  }

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_LETTER_TEMPLATE_ID, {
      to_email: parentEmail,
      student_name: studentName,
      message_html: letterHtml,
    });
    return { sent: true };
  } catch (err) {
    console.error('EmailJS send failed (letter):', err);
    return { sent: false, error: err };
  }
}
