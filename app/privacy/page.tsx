import Link from "next/link";
import { Briefcase } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | Recruiting ATS",
  description: "How Recruiting ATS collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Simple header */}
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Recruiting ATS</span>
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
            ← Back to home
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-12 prose prose-gray">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: April 16, 2026</p>

        <section className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            This Privacy Policy explains how Alphabridge Partners LLC
            (&ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;, or &ldquo;<strong>Recruiting ATS</strong>&rdquo;)
            collects, uses, and protects information when you use our applicant
            tracking software (the &ldquo;Service&rdquo;). By using the Service you agree
            to the practices described here.
          </p>
        </section>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">1. Information we collect</h2>
        <div className="space-y-3 text-gray-700 leading-relaxed">
          <p><strong>Account information.</strong> When you register we collect your name, email, password (hashed), company name, and job title.</p>
          <p><strong>Recruiting data.</strong> Information you choose to add about candidates, clients, jobs, submissions, interviews, comments, and documents (including résumés).</p>
          <p><strong>Integration data.</strong> If you connect Google Calendar or Microsoft accounts, we store access/refresh tokens so we can create calendar events and video meeting links on your behalf. We request only the scopes needed for those features.</p>
          <p><strong>Usage data.</strong> Standard server logs (IP address, browser, timestamps) collected to keep the Service running and secure.</p>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">2. How we use your information</h2>
        <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed">
          <li>To provide and operate the Service (manage candidates, schedule interviews, send invitations).</li>
          <li>To authenticate you and keep your account secure.</li>
          <li>To send transactional emails (interview invites, password resets, team invitations, billing receipts).</li>
          <li>To respond to support requests.</li>
          <li>To comply with legal obligations.</li>
        </ul>
        <p className="text-gray-700 leading-relaxed mt-3">
          We do not sell your data. We do not use your data or your candidates&apos; data to train machine-learning models.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">3. Google API data</h2>
        <p className="text-gray-700 leading-relaxed">
          If you connect a Google account, Recruiting ATS&apos;s use of information received from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Specifically:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed mt-3">
          <li>We use Google Calendar data only to create and update the interview events you schedule in the app.</li>
          <li>We do not transfer Google user data to third parties except as necessary to provide or improve the features you use.</li>
          <li>We do not use Google user data for advertising.</li>
          <li>We do not allow humans to read Google user data unless we have your consent, it&apos;s necessary for security, or it&apos;s required by law.</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">4. Sub-processors we rely on</h2>
        <p className="text-gray-700 leading-relaxed">
          We use the following service providers to run the Service. Each of them is contractually bound to protect your data:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed mt-3">
          <li><strong>Vercel</strong> &mdash; application hosting</li>
          <li><strong>Neon</strong> &mdash; PostgreSQL database hosting</li>
          <li><strong>Vercel Blob</strong> &mdash; file storage (résumés, documents)</li>
          <li><strong>Resend</strong> &mdash; transactional email delivery</li>
          <li><strong>Stripe</strong> &mdash; payment processing</li>
          <li><strong>Google</strong> &mdash; OAuth sign-in, Calendar and Meet integration (only if you connect)</li>
          <li><strong>Microsoft</strong> &mdash; OAuth sign-in, Teams integration (only if you connect)</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">5. Data retention</h2>
        <p className="text-gray-700 leading-relaxed">
          We keep account data for as long as your account is active. Candidate and recruiting records are retained for up to 24 months after the related search closes, unless you delete them earlier or your subscription ends. You can request full deletion of your data at any time by emailing us.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">6. Your rights</h2>
        <p className="text-gray-700 leading-relaxed">
          Depending on where you live, you may have the right to access, correct, export, or delete the personal information we hold about you. To exercise any of these rights, email us at the address below and we will respond within 30 days.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">7. Security</h2>
        <p className="text-gray-700 leading-relaxed">
          We use industry-standard measures to protect your data, including encryption in transit (TLS), encryption at rest where supported by our providers, hashed passwords, and role-based access controls. No system is perfectly secure, so we cannot guarantee absolute security.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">8. Children</h2>
        <p className="text-gray-700 leading-relaxed">
          The Service is not intended for anyone under 16. We do not knowingly collect personal information from children.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">9. Changes to this policy</h2>
        <p className="text-gray-700 leading-relaxed">
          We may update this Privacy Policy from time to time. Material changes will be announced inside the app or via email. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">10. Contact us</h2>
        <p className="text-gray-700 leading-relaxed">
          For any questions about this policy or to exercise your privacy rights, contact us at{" "}
          <a href="mailto:nicolas@alphabridgepartners.com" className="text-indigo-600 hover:underline">
            nicolas@alphabridgepartners.com
          </a>
          .
        </p>
        <p className="text-gray-700 leading-relaxed mt-3">
          Alphabridge Partners LLC, operating as Recruiting ATS.
        </p>
      </article>

      <footer className="border-t border-gray-200 bg-gray-50 py-8 px-6 mt-12">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Alphabridge Partners LLC. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <Link href="/" className="hover:text-gray-700">Home</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
