const path = require("path");
const fs = require("fs");

const docxPath = path.join("C:/Users/Nicolas/AppData/Roaming/npm/node_modules", "docx");
const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, HeadingLevel, BorderStyle,
} = require(docxPath);

const ARIAL = "Arial";

function run(text, opts = {}) {
  return new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color,
    size: opts.size ?? 22,
    font: ARIAL,
    break: opts.break,
  });
}

function title(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [run(text, { bold: true, size: 44 })],
  });
}

function subtitle(text) {
  return new Paragraph({
    spacing: { after: 360 },
    children: [run(text, { size: 22, color: "6B7280" })],
  });
}

function intro(text) {
  return new Paragraph({
    spacing: { after: 360 },
    children: [run(text, { size: 22 })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    children: [run(text, { bold: true, size: 30, color: "111827" })],
  });
}

// Email block:
// • Heading (mail name)
// • Cuándo line in gray italic
// • Subject:  ...
// • Body:     ...   (full body text, possibly multi-paragraph via | as separator)
// • CTA:      ...   (if present)
// • Blank "Cambios:" line for annotation
// • Divider
function emailBlock({ name, cuando, subject, body, cta }) {
  const blocks = [];

  blocks.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 80 },
    children: [run(name, { bold: true, size: 26, color: "111827" })],
  }));

  blocks.push(new Paragraph({
    spacing: { after: 200 },
    children: [
      run("Cuándo sale: ", { italics: true, size: 20, color: "6B7280" }),
      run(cuando, { italics: true, size: 20, color: "6B7280" }),
    ],
  }));

  blocks.push(new Paragraph({
    spacing: { after: 120 },
    children: [
      run("Subject  ", { bold: true, size: 20, color: "374151" }),
      run(subject, { size: 22 }),
    ],
  }));

  // body can be a string with "|" to indicate paragraph break
  const paras = Array.isArray(body) ? body : body.split("|").map(s => s.trim());
  paras.forEach((line, idx) => {
    blocks.push(new Paragraph({
      spacing: { after: idx === paras.length - 1 ? 200 : 100 },
      children: [
        ...(idx === 0 ? [run("Body  ", { bold: true, size: 20, color: "374151" })] : [run("       ", { size: 20 })]),
        run(line, { size: 22 }),
      ],
    }));
  });

  if (cta) {
    blocks.push(new Paragraph({
      spacing: { after: 240 },
      children: [
        run("CTA  ", { bold: true, size: 20, color: "374151" }),
        run(cta, { size: 22, bold: true }),
      ],
    }));
  }

  blocks.push(new Paragraph({
    spacing: { after: 480 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F4ED8", space: 4 } },
    children: [run("Cambios: ", { italics: true, size: 20, color: "6B7280" })],
  }));

  return blocks;
}

// ────────────────────────────────────────────────────────────────
// Los 25 emails que envía la app
// ────────────────────────────────────────────────────────────────

const emails = {
  signup: [
    {
      name: "1. Verify email",
      cuando: "Apenas un nuevo agency owner se registra. Antes de poder usar el dashboard tiene que confirmar el mail.",
      subject: "Verify your email — Recruiting ATS",
      body: "Hi {firstName}, | Thanks for signing up. Click the button to confirm this is your email. | This link expires in 24 hours.",
      cta: "Verify Email",
    },
    {
      name: "2. Welcome owner",
      cuando: "Justo después del signup, en paralelo con el de verificación. Confirma que el workspace existe y los lleva al dashboard.",
      subject: "Welcome to Recruiting ATS",
      body: "You're in, {firstName}. | {organizationName} is live on Recruiting ATS. Take a look around — we'll send you a short getting-started note in a bit. | Your free trial runs until {trialEndsAt}. We won't charge until it ends — cancel any time before then and you won't be billed. | Reply to this email if anything's confusing or missing — we read every message.",
      cta: "Open Dashboard",
    },
    {
      name: "3. Getting started (T+1h)",
      cuando: "Programado 1 hora después del signup. La guía de \"qué hacer primero\" cuando el user ya pudo dar una vuelta.",
      subject: "Getting started on Recruiting ATS",
      body: "{firstName}, here's the fastest path to your first placement. | Now that you've had a chance to look around {organizationName}, three things worth doing this week: | 1. Add your first client — set fee structure + payment terms once, reuse for every search. | 2. Post your first job — upload the JD and the parser fills the form for you. | 3. Invite a teammate — collaborate on the same pipeline + share notes. | Reply to this email if anything's confusing or missing — we read every message and ship fast.",
      cta: "Open Dashboard",
    },
    {
      name: "4. Reset password",
      cuando: "Cuando el user clickea \"Forgot password\" en el login del agency.",
      subject: "Reset your Recruiting ATS password",
      body: "Hi {firstName}, | We received a request to reset your Recruiting ATS password. Click the button below to choose a new one. This link expires in 1 hour. | If you didn't request this, ignore — your password stays unchanged.",
      cta: "Reset Password",
    },
  ],
  invites: [
    {
      name: "5. Team invite (agency)",
      cuando: "Un admin invita a un nuevo teammate al workspace. El teammate clickea el link para setear su password.",
      subject: "{inviterName} invited you to {organizationName}",
      body: "Hi {firstName}, | {inviterName} invited you to collaborate on Recruiting ATS. | Recruiting ATS is where {organizationName} runs their searches — accept to join the team there. | This link expires in 7 days.",
      cta: "Accept Invitation",
    },
    {
      name: "6. Teammate welcome",
      cuando: "Después de que un teammate invitado completa el set-password (o el accept por OAuth). Cierra el loop con \"tu cuenta está activa\".",
      subject: "Your Recruiting ATS account is ready — {organizationName}",
      body: "Hi {firstName}, | Your Recruiting ATS account at {organizationName} is now active and your email has been confirmed. You can sign in any time at the link below. | From the dashboard you'll see the searches you're assigned to, candidates in flight, and your team's recent activity.",
      cta: "Open Dashboard",
    },
    {
      name: "7. Invite accepted (al inviter)",
      cuando: "Se envía al admin que originalmente invitó a un teammate, en el momento que ese teammate acepta. Loop de growth.",
      subject: "{newMemberName} joined {organizationName}",
      body: "🎉 {newMemberName} accepted your invite. | Hi {firstName}, | {newMemberName} ({newMemberEmail}) just joined {organizationName} on Recruiting ATS. | They can now see the searches they're assigned to and collaborate with you on candidates and clients. | Want to keep growing the team? Send another invite from My Team.",
      cta: "Open My Team",
    },
    {
      name: "8. Job assigned",
      cuando: "Un admin o teammate suma a un recruiter a un Job desde el panel de Assignments.",
      subject: "{assignerName} added you to {jobTitle}",
      body: "Hi {firstName}, | {assignerName} just added you to the search for {jobTitle} ({role} · {clientName}). | Open the job to see the pipeline and start sourcing.",
      cta: "Open Job",
    },
  ],
  client: [
    {
      name: "9. Client portal share (1ra vez)",
      cuando: "El agency hace click en \"Invite Client to Portal\" en un Job. El cliente recibe este mail + el de set password.",
      subject: "{firmName} shared candidates with you for {jobTitle}",
      body: "Hi {clientName}, | {recruiterName} from {firmName} has shared a candidate shortlist with you on Recruiting ATS. | {jobTitle} — {candidateCount} candidates have been shared for your review. | Sign in to your client portal to review profiles, rate candidates, and leave feedback.",
      cta: "Review Candidates",
    },
    {
      name: "10. Set password (client portal, 1ra vez)",
      cuando: "Cliente que nunca estuvo en el portal. Le llega junto con el mail 9 para que cree la cuenta.",
      subject: "Set up your Recruiting ATS client portal account",
      body: "Hi {clientName}, | {firmName} has shared candidates with you on Recruiting ATS. To review them, you'll need to set a password for your account. | Click below to set your password and access your portal.",
      cta: "Set Password & Sign In",
    },
    {
      name: "11. Client team invite",
      cuando: "Un admin del cliente invita a un colega de la misma empresa al portal.",
      subject: "{inviterName} invited you to {companyName}'s hiring team",
      body: "Hi {memberName}, | {inviterName} has invited you to join {companyName}'s hiring team on Recruiting ATS. Role: {title}. | With your account, you can: view and post job openings, track recruiting firm activity, review shared candidates, and manage your team's hiring pipeline. | Click below to set your password and get started.",
      cta: "Set Password & Get Started",
    },
    {
      name: "12. Client portal welcome",
      cuando: "Confirmación después de que un contacto del cliente termina el set-password. Espejo del mail 6 del lado agency.",
      subject: "Your Recruiting ATS client portal account is ready",
      body: "Hi {firstName}, | Your client portal account for {clientName} is now active. Your email has been confirmed and you can sign in any time at the link below. | Use the portal to review candidates shared by your recruiter, leave feedback, and track the searches you're hiring on.",
      cta: "Open Portal",
    },
    {
      name: "13. Client job access granted",
      cuando: "Teammate del cliente que YA tiene cuenta en el portal y lo sumaron a un Job específico.",
      subject: "{inviterName} added you to {jobTitle}",
      body: "Hi {memberName}, | {inviterName} just gave you access to {jobTitle} on {companyName}'s portal. | You can now review shared candidates, post notes for the team, and follow the pipeline.",
      cta: "Open Search",
    },
    {
      name: "14. Engagement accepted",
      cuando: "Un cliente invitó a una firm a una búsqueda; este mail sale cuando la firm clickea Accept.",
      subject: "{firmName} accepted {jobTitle}",
      body: "Hi {firstName}, | {firmName} just accepted your invitation to work on {jobTitle}. They can now start sharing candidates and chatting with your team.",
      cta: "Open Search",
    },
    {
      name: "15. New candidate shared",
      cuando: "El recruiter marca una submission como shared con el cliente. El mail va a cada ClientJobMember.",
      subject: "New candidate shared: {candidateName} for {jobTitle}",
      body: "Hi {firstName}, | {recruiterName} from {firmName} just shared a new candidate with {clientName}: | {candidateName} for {jobTitle}. | (opcional) Note from {recruiterName}: {note} | Sign in to the client portal to view the full profile, download their resume, and leave feedback.",
      cta: "View Candidate",
    },
  ],
  chat: [
    {
      name: "16. New chat message",
      cuando: "Hay un mensaje nuevo en el thread de un candidato (interno o shared) y el destinatario no lo está mirando.",
      subject: "New message on {candidateName} — {jobTitle}",
      body: "Hi {firstName}, | {fromName} (recruiter / cliente / equipo) left a new message in {shared chat / internal channel} for {candidateName} ({jobTitle}): | [preview del mensaje, truncado a 240 chars]",
      cta: "View Conversation",
    },
    {
      name: "17. @ mention",
      cuando: "Alguien hizo @-mention al destinatario en un comentario.",
      subject: "{mentionedBy} mentioned you — {candidateName}",
      body: "Hi {firstName}, | {mentionedBy} mentioned you in a message about {candidateName} ({jobTitle}): | [preview del mensaje]",
      cta: "View Conversation",
    },
    {
      name: "18. Candidate feedback",
      cuando: "El cliente dejó un rating o un comentario sobre un candidato compartido.",
      subject: "{reviewerName} left {5★ feedback | new feedback | viewed} on {candidateName}  ← \"viewed\" rompe la oración",
      body: "Hi {firstName}, | {reviewerName} at {clientCompanyName} just left feedback on {candidateName} for {jobTitle}. | Rating: ★★★★☆ (4/5) | [comentario, si hay] | (si no hay rating ni comentario): They opened the profile but didn't leave a comment or rating yet.",
      cta: "View Candidate",
    },
  ],
  interview: [
    {
      name: "19. Interview invitation — al candidato",
      cuando: "El recruiter agenda una entrevista y tildá \"email the candidate\".",
      subject: "Interview Invitation: {jobTitle} @ {clientName}",
      body: "Hi {firstName}, | You've been scheduled for an interview. Here are the details: | Job: {jobTitle} · Client: {clientName} · When: {date} · {time}–{endTime} ({timezone}) · Type: Video Call / Phone Call / In Person · Where: {location} · Notes: {notes} | If you need to reschedule or have any questions, please contact {recruiterName}. | Good luck!",
      cta: "Join Meeting (si hay meetingLink)",
    },
    {
      name: "20. Interview scheduled — al cliente",
      cuando: "Misma acción que el 19, pero al contacto del cliente que está en la entrevista.",
      subject: "Interview Scheduled: {candidateName} for {jobTitle} @ {clientName}",
      body: "Hi {firstName}, | {recruiterName} from {firmName} has scheduled an interview for your review: | Candidate: {candidateName} · Job: {jobTitle} · Client: {clientName} · When: {date} · {time}–{endTime} ({timezone}) · Type: Video Call / Phone Call / In Person · Where: {location} · Notes: {notes} | Thanks for taking the time — let us know if you need to reschedule.",
      cta: "Join Meeting (si hay meetingLink)",
    },
  ],
  billing: [
    {
      name: "21. Subscription activated",
      cuando: "Primer checkout de Stripe exitoso de un plan pago.",
      subject: "Subscription active — welcome to Recruiting ATS",
      body: "{firstName}, you're all set. | Your subscription to Recruiting ATS is now active. Thanks for trusting us with {organizationName}'s recruiting workflow. | Plan: {N} seats · ${monthlyTotal}/month · Billing: Monthly, auto-renewed | You can manage billing — update your payment method, download invoices, or cancel — any time from your settings. Stripe will email you a receipt for every payment. | If you add or remove teammates the bill adjusts automatically on your next invoice. | Reply to this email if anything's confusing or you'd like to chat — we read every message.",
      cta: "Open Dashboard",
    },
    {
      name: "22. Subscription canceled (scheduled)",
      cuando: "El admin canceló desde el Stripe Customer Portal. La sub sigue ACTIVE hasta el {cancelAt}.",
      subject: "Subscription canceled — access until {cancelStr}",
      body: "{firstName}, we got your cancellation. | Your Recruiting ATS subscription for {organizationName} is scheduled to cancel. | Access until {cancelStr}. After that: you'll lose access to create new data. Your existing candidates, jobs and clients stay in our DB. | Changed your mind? Reactivate before {cancelStr} and keep everything as it is — no new charge until your normal billing cycle. | If we can do something to keep you on board, just reply — we read every email.",
      cta: "Reactivate subscription",
    },
    {
      name: "23. Subscription ended",
      cuando: "Llega la fecha de {cancelAt} y Stripe elimina la subscription.",
      subject: "Your Recruiting ATS subscription has ended",
      body: "{firstName}, your subscription has ended. | Your Recruiting ATS subscription for {organizationName} ended today. | Your data is safe — we keep it in our DB so you can pick up where you left off. To regain access: | • Resubscribe — same price, your candidates and pipeline come back instantly. | • Reply to this email if you'd like to chat about your experience or ask for a custom plan. | Thanks for using Recruiting ATS, whatever you decide.",
      cta: "Resubscribe",
    },
    {
      name: "24. Subscription reactivated",
      cuando: "El admin clickeó \"Don't cancel after all\" en el Stripe Portal antes de la fecha cancelAt.",
      subject: "Subscription reactivated — welcome back",
      body: "{firstName}, glad to have you back. | Your Recruiting ATS subscription for {organizationName} is back on track. No cancellation pending. | Next billing date: {dateStr}. Same plan, same seats — billing continues uninterrupted. | If you reactivated by accident, you can cancel again from Settings → Billing.",
      cta: "Open Dashboard",
    },
    {
      name: "25. Payment failed",
      cuando: "Stripe dispara invoice.payment_failed. Si no se resuelve, la sub pasa a past_due.",
      subject: "Action required: payment failed for Recruiting ATS",
      body: "{firstName}, your payment didn't go through. | We tried to charge your card for Recruiting ATS — {organizationName} — and the bank declined it. | To avoid losing access, update your payment method.",
      cta: "Update payment method",
    },
  ],
};

// ────────────────────────────────────────────────────────────────
// Build doc
// ────────────────────────────────────────────────────────────────

const children = [
  title("Revisión de mails"),
  subtitle("25 mails que envía la app · 24 de junio, 2026"),
  intro("Cada mail tal cual lo recibe el usuario, con su asunto, cuerpo y CTA, y una nota de cuándo se dispara. La línea \"Cambios:\" al final de cada mail es para anotar lo que queramos modificar."),

  h1("Signup, onboarding, passwords"),
  ...emails.signup.flatMap(emailBlock),

  h1("Invites y aceptación"),
  ...emails.invites.flatMap(emailBlock),

  h1("Client portal"),
  ...emails.client.flatMap(emailBlock),

  h1("Chat, mentions, feedback"),
  ...emails.chat.flatMap(emailBlock),

  h1("Interviews"),
  ...emails.interview.flatMap(emailBlock),

  h1("Subscription y billing"),
  ...emails.billing.flatMap(emailBlock),
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: ARIAL, size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: ARIAL, color: "111827" },
        paragraph: { spacing: { before: 480, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: ARIAL, color: "111827" },
        paragraph: { spacing: { before: 360, after: 80 }, outlineLevel: 1 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children,
  }],
});

const out = path.join(__dirname, "mails.docx");
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf);
  console.log("OK:", out, "(" + buf.length + " bytes)");
}).catch(err => {
  console.error("FAIL:", err);
  process.exit(1);
});
