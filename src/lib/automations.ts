import "server-only";
import { db, schema } from "@/db";

export type AutomationDef = {
  key: string;
  label: string;
  /** When it goes out, in plain words. */
  when: string;
  /** What the "days" number means for this message, or null if it has none. */
  delayLabel: string | null;
  /** Marketing messages respect unsubscribe and carry an unsubscribe footer. */
  marketing: boolean;
  delayDays: number;
  subject: string;
  body: string;
  sms: string;
};

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: "order_confirmation", label: "Booking confirmation", when: "Right after a booking is confirmed", delayLabel: null, marketing: false, delayDays: 0,
    subject: "You're booked for {{day}}",
    body: "Hi {{name}},\n\nYour booking with {{business}} is confirmed.\n\nWhen: {{day}}, arrival {{window}}\nWhere: {{address}}\nServices: {{items}}\nTotal: {{total}}\n\nView your booking: {{link}}\n\nNeed to change something? Call us at {{phone}}.",
    sms: "{{business}}: you're booked for {{day}}, arrival {{window}}. Details: {{link}}",
  },
  {
    key: "appointment_reminder", label: "Appointment reminder", when: "Before the job date", delayLabel: "Days before the job", marketing: false, delayDays: 1,
    subject: "Reminder: we'll see you {{day}}",
    body: "Hi {{name}},\n\nA reminder that {{business}} is scheduled at {{address}} on {{day}}, arrival {{window}}.\n\nBooking details: {{link}}\n\nQuestions? Call {{phone}}.",
    sms: "{{business}} reminder: we're scheduled for {{day}}, arrival {{window}}. Questions? {{phone}}",
  },
  {
    key: "visit_received", label: "Virtual visit request received", when: "Right after a virtual visit request", delayLabel: null, marketing: false, delayDays: 0,
    subject: "We got your virtual visit request",
    body: "Hi {{name}},\n\nThanks for reaching out to {{business}}. We'll contact you shortly to confirm a time.\n\nYou can add photos or a short video of your site here, which helps us prepare your estimate:\n{{link}}",
    sms: "",
  },
  {
    key: "quote_sent", label: "Estimate delivery", when: "When you send an estimate", delayLabel: null, marketing: false, delayDays: 0,
    subject: "Your estimate from {{business}}",
    body: "Hi {{name}},\n\nYour estimate is ready: {{title}}\n\nReview and accept it here:\n{{link}}\n\nQuestions? Call {{phone}}.",
    sms: "{{business}}: your estimate is ready. Review it here: {{link}}",
  },
  {
    key: "membership_welcome", label: "Plan welcome", when: "Right after a plan sign-up", delayLabel: null, marketing: false, delayDays: 0,
    subject: "Welcome to the {{plan}} plan",
    body: "Hi {{name}},\n\nThanks for choosing the {{plan}} plan with {{business}}. We'll be in touch to schedule your first visit.\n\nYour plan: {{link}}",
    sms: "",
  },
  {
    key: "review_request", label: "Feedback and review request", when: "After a job is marked completed", delayLabel: "Days after completion", marketing: true, delayDays: 2,
    subject: "How did we do?",
    body: "Hi {{name}},\n\nThanks for choosing {{business}}. How likely are you to recommend us? It takes ten seconds:\n{{link}}",
    sms: "{{business}}: thanks for your business! How did we do? {{link}}",
  },
  {
    key: "rebook_reminder", label: "Rebooking reminder", when: "After a customer's last completed job", delayLabel: "Days after the last job", marketing: true, delayDays: 335,
    subject: "Time for your generator's next service",
    body: "Hi {{name}},\n\nIt's been about a year since we serviced your generator. Regular maintenance keeps it ready for the next outage.\n\nBook your next visit online: {{link}}",
    sms: "{{business}}: your generator is due for service. Book online: {{link}}",
  },
  {
    key: "abandoned_checkout", label: "Unfinished booking follow-up", when: "After a checkout was started but not paid", delayLabel: "Days after the attempt", marketing: true, delayDays: 1,
    subject: "Still need generator service?",
    body: "Hi {{name}},\n\nYou started a booking with {{business}} but didn't finish. Your time wasn't held, but you can pick a new one here:\n{{link}}\n\nPrefer to talk? Call {{phone}}.",
    sms: "",
  },
  {
    key: "winback", label: "Win-back", when: "When a customer has been inactive", delayLabel: "Days of inactivity", marketing: true, delayDays: 540,
    subject: "We'd love to look after your generator again",
    body: "Hi {{name}},\n\nIt's been a while since we heard from you. If your generator is due for service, you can see prices and book online any time:\n{{link}}",
    sms: "",
  },
  {
    key: "loyalty_thanks", label: "Loyalty thank-you", when: "After a customer reaches a number of completed jobs", delayLabel: "Completed jobs needed", marketing: true, delayDays: 3,
    subject: "Thank you from {{business}}",
    body: "Hi {{name}},\n\nYou've trusted {{business}} with your generator several times now, and we appreciate it. If a maintenance plan would make things easier, have a look:\n{{link}}",
    sms: "",
  },
];

export type Automation = AutomationDef & { enabled: boolean };

/** Defaults merged with whatever has been edited in Admin → Messages. */
export async function loadAutomations(): Promise<Map<string, Automation>> {
  const rows = await db().select().from(schema.automations);
  const saved = new Map(rows.map((r) => [r.key, r]));
  return new Map(
    AUTOMATIONS.map((d) => {
      const r = saved.get(d.key);
      return [d.key, r ? { ...d, enabled: r.enabled, delayDays: r.delayDays, subject: r.subject || d.subject, body: r.body || d.body, sms: r.sms } : { ...d, enabled: true }];
    }),
  );
}

export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}
