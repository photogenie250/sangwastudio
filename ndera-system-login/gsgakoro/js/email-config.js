// ============================================================
// SDMS — EmailJS configuration
//
// EmailJS lets this site send email straight from the browser,
// no backend server needed, using your school's Gmail account as
// the sender. The free plan covers 200 emails/month.
//
// SETUP (one-time, ~10 minutes):
//   1. Create a free account at https://www.emailjs.com
//   2. Email Services → Add New Service → Gmail → connect the
//      school's Gmail account. Copy the resulting Service ID below.
//   3. Email Templates → Create Template. Make two templates
//      (the free plan allows 2):
//        a) "Marks removed" — uses {{to_email}}, {{student_name}},
//           {{offense_title}}, {{deduction}}, {{new_marks}},
//           {{incident_date}}
//        b) "Parent letter" — uses {{to_email}}, {{student_name}},
//           {{message_html}} (set the template's content type to
//           HTML and drop {{message_html}} into the body)
//      Copy each Template ID below.
//   4. Account → General → copy your Public Key below.
//
// Until these are filled in, emails are silently skipped (the app
// keeps working normally — incidents still save, letters still
// print) and a note is logged to the browser console.
// ============================================================

export const EMAILJS_PUBLIC_KEY = 'q4nCjcsg3jnwk6LyJ';
export const EMAILJS_SERVICE_ID = 'service_3xguj2g';
export const EMAILJS_MARKS_REMOVED_TEMPLATE_ID = 'template_c678owq';
export const EMAILJS_LETTER_TEMPLATE_ID = 'template_ggzic99';
