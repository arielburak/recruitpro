import Link from "next/link";
import { Briefcase } from "lucide-react";

export const metadata = {
  title: "Terms of Service | Recruiting ATS",
  description: "The terms that govern your use of Recruiting ATS.",
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: April 16, 2026</p>

        <section className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            These Terms of Service (the &ldquo;<strong>Terms</strong>&rdquo;) govern your access to and use of the
            Recruiting ATS service operated by Alphabridge Partners LLC
            (&ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;). By creating an account or using the Service
            you agree to these Terms. If you don&apos;t agree, don&apos;t use the Service.
          </p>
        </section>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">1. The Service</h2>
        <p className="text-gray-700 leading-relaxed">
          Recruiting ATS is a web-based applicant tracking system that helps recruiting firms and hiring companies manage candidates, job pipelines, interviews, and communications. Features, pricing, and limits may change over time.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">2. Accounts</h2>
        <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed">
          <li>You must be at least 16 years old to use the Service.</li>
          <li>You are responsible for keeping your credentials secure and for all activity under your account.</li>
          <li>You agree to provide accurate information and to keep it up to date.</li>
          <li>We may suspend or terminate accounts that violate these Terms, applicable law, or that harm other users.</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">3. Your content</h2>
        <p className="text-gray-700 leading-relaxed">
          You retain ownership of the data and content you upload (candidate records, documents, notes, etc.). You grant us a limited license to host, process, and display that content solely to operate the Service on your behalf. You are responsible for having the legal right to upload and share that content, including any personal data of candidates or third parties.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">4. Acceptable use</h2>
        <p className="text-gray-700 leading-relaxed">You agree not to:</p>
        <ul className="list-disc pl-6 space-y-2 text-gray-700 leading-relaxed mt-2">
          <li>Use the Service to send spam or unsolicited messages.</li>
          <li>Upload unlawful, misleading, or infringing content.</li>
          <li>Attempt to access accounts or data that don&apos;t belong to you.</li>
          <li>Interfere with or disrupt the Service, or reverse-engineer it.</li>
          <li>Use the Service to build a competing product.</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">5. Third-party integrations</h2>
        <p className="text-gray-700 leading-relaxed">
          The Service connects to third-party services such as Google (Calendar, Meet) and Microsoft (Azure AD, Teams) when you choose to enable them. Your use of those services is governed by their own terms. We are not responsible for actions, outages, or policy changes made by those providers.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">6. Fees and billing</h2>
        <p className="text-gray-700 leading-relaxed">
          Paid plans are billed in advance through our payment processor (Stripe). Fees are non-refundable except where required by law or where specifically stated in writing by us. You authorize us to charge the payment method on file for the applicable fees and any taxes. If a payment fails, we may suspend your account until it is resolved.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">7. Cancellation and termination</h2>
        <p className="text-gray-700 leading-relaxed">
          You may cancel your subscription at any time from your account settings or by contacting support. Upon cancellation you will continue to have access until the end of the current paid period. We may terminate or suspend access at any time for breach of these Terms or for reasons of safety, legal compliance, or non-payment.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">8. Disclaimer of warranties</h2>
        <p className="text-gray-700 leading-relaxed">
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee that the Service will be uninterrupted, error-free, or entirely secure.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">9. Limitation of liability</h2>
        <p className="text-gray-700 leading-relaxed">
          To the maximum extent permitted by law, Alphabridge Partners LLC and its affiliates will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenues, data, or goodwill. Our total aggregate liability for any claim arising out of or relating to the Service will not exceed the amount you paid us in the 12 months immediately before the event giving rise to the claim.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">10. Indemnification</h2>
        <p className="text-gray-700 leading-relaxed">
          You agree to defend and indemnify Alphabridge Partners LLC from any claims, damages, or expenses arising out of your use of the Service, your content, or your violation of these Terms or applicable law.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">11. Governing law</h2>
        <p className="text-gray-700 leading-relaxed">
          These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-laws rules. Any dispute will be resolved in the courts located in Delaware, and you consent to their exclusive jurisdiction.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">12. Changes to these Terms</h2>
        <p className="text-gray-700 leading-relaxed">
          We may update these Terms from time to time. We&apos;ll post the updated version here and, for material changes, let you know through the app or by email. Continued use of the Service after the changes take effect means you accept the new Terms.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">13. Contact</h2>
        <p className="text-gray-700 leading-relaxed">
          Questions about these Terms?{" "}
          <a href="mailto:support@recruitingats.com" className="text-indigo-600 hover:underline">
            support@recruitingats.com
          </a>
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
