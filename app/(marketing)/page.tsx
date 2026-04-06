import Link from "next/link";
import {
  ArrowRight,
  Check,
  Users,
  Briefcase,
  BarChart3,
  Shield,
  Zap,
  Globe,
  Star,
  GripVertical,
  MessageSquare,
  CreditCard,
} from "lucide-react";

export const metadata = {
  title: "RecruitPro — The ATS Built for Recruiting Firms",
  description:
    "Pipeline management, client portals, and team collaboration. Built for staffing and search firms that place talent across every industry.",
};

// ─── NAV ───
function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">RecruitPro</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-gray-600 hover:text-gray-900 transition">
            How It Works
          </a>
          <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition">
            Pricing
          </a>
          <a href="#testimonials" className="text-sm text-gray-600 hover:text-gray-900 transition">
            Testimonials
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-gray-700 hover:text-gray-900 transition"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Start Free Trial
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── HERO ───
function Hero() {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          <Zap className="w-3.5 h-3.5" />
          Built for recruiting &amp; staffing firms
        </div>
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 tracking-tight leading-[1.1] mb-6">
          Place more candidates.
          <br />
          <span className="text-indigo-600">Close more searches.</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          The all-in-one ATS that gives your recruiting firm a visual pipeline,
          client collaboration portal, and team management — so you can focus on
          making placements, not managing spreadsheets.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
          >
            Start 7-Day Free Trial
            <ArrowRight className="w-5 h-5" />
          </Link>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-gray-700 text-lg font-semibold px-8 py-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition"
          >
            See How It Works
          </a>
        </div>
        <p className="text-sm text-gray-400 mt-4">
          No credit card required · Set up in 2 minutes · Cancel anytime
        </p>
      </div>

      {/* Pipeline preview */}
      <div className="max-w-6xl mx-auto mt-16">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-gray-200/50 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center gap-2">
            <div className="w-3 h-3 bg-red-400 rounded-full" />
            <div className="w-3 h-3 bg-yellow-400 rounded-full" />
            <div className="w-3 h-3 bg-green-400 rounded-full" />
            <span className="ml-4 text-sm text-gray-400">RecruitPro — Pipeline View</span>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-6 gap-3">
              {[
                { name: "Sourced", color: "bg-slate-400", count: 12 },
                { name: "Contacted", color: "bg-blue-400", count: 8 },
                { name: "Submitted", color: "bg-violet-400", count: 5 },
                { name: "Interview", color: "bg-amber-400", count: 3 },
                { name: "Offer", color: "bg-emerald-400", count: 2 },
                { name: "Placed", color: "bg-green-500", count: 1 },
              ].map((stage) => (
                <div key={stage.name} className="space-y-2">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                      <span className="text-xs font-semibold text-gray-700">
                        {stage.name}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {stage.count}
                    </span>
                  </div>
                  {Array.from({ length: Math.min(stage.count, 3) }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition cursor-grab"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <GripVertical className="w-3 h-3 text-gray-300" />
                        <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                          {["JD", "SK", "MR", "AL", "TP", "CB"][i % 6]}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-800">
                            {["John Doe", "Sarah Kim", "Mike Ross", "Amy Lee", "Tom Park", "Cara B."][i % 6]}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {["Sr. Engineer", "PM Lead", "VP Sales", "Data Scientist", "CTO", "Designer"][i % 6]}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── STATS BAR ───
function SocialProof() {
  const stats = [
    { value: "500+", label: "Recruiting firms" },
    { value: "2M+", label: "Candidates tracked" },
    { value: "98%", label: "Client satisfaction" },
    { value: "40%", label: "Faster placements" },
  ];
  return (
    <section className="py-12 border-y border-gray-100 bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-8 text-center">
          Trusted by recruiting firms across IT, Finance, Healthcare &amp; Legal
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold text-indigo-600">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FEATURES ───
function Features() {
  const features = [
    {
      icon: GripVertical,
      title: "Visual Pipeline & Kanban",
      desc: "Drag-and-drop candidates through customizable stages. See your entire search at a glance — from sourced to placed.",
    },
    {
      icon: Globe,
      title: "Client Portal",
      desc: "Give your clients a branded portal to review candidates, leave feedback, rate talent, and request interviews — no email chains needed.",
    },
    {
      icon: Users,
      title: "Multi-User Teams",
      desc: "Each recruiter gets their own login, candidate database, and pipeline. Admins see everything across the firm.",
    },
    {
      icon: BarChart3,
      title: "Dashboard & KPIs",
      desc: "Track active searches, placements, submission rates, and team activity. Know exactly where your revenue is coming from.",
    },
    {
      icon: Shield,
      title: "Multi-Tenant Security",
      desc: "Each firm's data is completely isolated. Your candidates, clients, and searches are yours alone — guaranteed.",
    },
    {
      icon: MessageSquare,
      title: "Candidate & Client Notes",
      desc: "Internal notes for your team, client-visible comments for collaboration. Full activity audit trail on every candidate.",
    },
  ];

  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Everything your recruiting firm needs
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Stop juggling spreadsheets, email, and five different tools. RecruitPro
            brings your entire workflow into one place.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition"
            >
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition">
                <f.icon className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── HOW IT WORKS ───
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Sign up your firm",
      desc: "Create your organization in 30 seconds. Add your recruiters — each gets their own login.",
    },
    {
      num: "02",
      title: "Add clients & jobs",
      desc: "Set up your client companies and active job orders. Each gets a customizable pipeline.",
    },
    {
      num: "03",
      title: "Source & submit candidates",
      desc: "Add candidates, drag them through pipeline stages, and share them with clients via the portal.",
    },
    {
      num: "04",
      title: "Close placements",
      desc: "Clients review, rate, and request interviews right in the portal. You track it all from your dashboard.",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Up and running in minutes
          </h2>
          <p className="text-lg text-gray-500">
            No complex setup. No implementation calls. Just sign up and start placing.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s) => (
            <div key={s.num} className="relative">
              <div className="text-5xl font-extrabold text-indigo-100 mb-3">{s.num}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── PRICING ───
function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-500">
            No tiers. No hidden fees. One plan with everything included.
          </p>
        </div>

        <div className="bg-white rounded-2xl border-2 border-indigo-600 shadow-xl shadow-indigo-100 overflow-hidden max-w-lg mx-auto">
          <div className="bg-indigo-600 text-white text-center py-2 text-sm font-medium">
            7-day free trial — no credit card required
          </div>
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-extrabold text-gray-900">$10</span>
                <span className="text-gray-500">/ user / month</span>
              </div>
              <p className="text-sm text-gray-400 mt-2">Billed monthly. Cancel anytime.</p>
            </div>
            <div className="space-y-3 mb-8">
              {[
                "Unlimited candidates & jobs",
                "Visual drag-and-drop pipeline",
                "Client collaboration portal",
                "Shareable candidate links",
                "Team management & roles",
                "Dashboard with KPIs",
                "Activity audit trail",
                "Email support",
              ].map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-indigo-600 shrink-0" />
                  <span className="text-sm text-gray-700">{f}</span>
                </div>
              ))}
            </div>
            <Link
              href="/register"
              className="block w-full text-center bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
            >
              Start Free Trial
            </Link>
            <p className="text-xs text-gray-400 text-center mt-3">
              Add or remove seats anytime. Only pay for active users.
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-500 mb-4">Need more than 25 seats?</p>
          <a
            href="mailto:sales@recruitpro.com"
            className="text-indigo-600 font-medium hover:underline"
          >
            Contact us for volume pricing
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── TESTIMONIALS ───
function Testimonials() {
  const testimonials = [
    {
      quote:
        "We switched from spreadsheets and our placement rate jumped 40% in the first quarter. The client portal alone is worth the price.",
      name: "Jessica T.",
      role: "Managing Partner",
      company: "IT Recruiting Firm, 12 recruiters",
    },
    {
      quote:
        "My team of 8 recruiters was up and running in a day. The pipeline view is exactly what we needed — simple, visual, fast.",
      name: "David C.",
      role: "Director of Operations",
      company: "Tech Staffing Agency",
    },
    {
      quote:
        "Our clients love the portal. They can review candidates and give feedback without me being in the middle. Game changer.",
      name: "Sarah M.",
      role: "Senior Recruiter",
      company: "Healthcare Search Firm",
    },
  ];

  return (
    <section id="testimonials" className="py-24 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Recruiters love RecruitPro
          </h2>
          <p className="text-lg text-gray-500">
            Hear from firms that made the switch.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>
              <p className="text-gray-700 mb-6 leading-relaxed">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="font-semibold text-gray-900">{t.name}</p>
                <p className="text-sm text-gray-500">
                  {t.role}, {t.company}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA ───
function FinalCTA() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Ready to modernize your recruiting firm?
        </h2>
        <p className="text-lg text-gray-500 mb-8">
          Join hundreds of recruiting firms already using RecruitPro to manage
          their pipeline, collaborate with clients, and make more placements.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
        >
          Start Your Free Trial
          <ArrowRight className="w-5 h-5" />
        </Link>
        <p className="text-sm text-gray-400 mt-4">
          7 days free · No credit card · Cancel anytime
        </p>
      </div>
    </section>
  );
}

// ─── FOOTER ───
function Footer() {
  return (
    <footer className="border-t border-gray-200 py-12 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">RecruitPro</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              The modern ATS built for recruiting and staffing firms of all sizes and specialties.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#features" className="hover:text-gray-900 transition">Features</a></li>
              <li><a href="#pricing" className="hover:text-gray-900 transition">Pricing</a></li>
              <li><a href="#how-it-works" className="hover:text-gray-900 transition">How It Works</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Company</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#" className="hover:text-gray-900 transition">About</a></li>
              <li><a href="#" className="hover:text-gray-900 transition">Blog</a></li>
              <li><a href="mailto:support@recruitpro.com" className="hover:text-gray-900 transition">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#" className="hover:text-gray-900 transition">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-gray-900 transition">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 mt-10 pt-6 text-sm text-gray-400 text-center">
          &copy; {new Date().getFullYear()} RecruitPro. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

// ─── PAGE ───
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <FinalCTA />
      <Footer />
    </div>
  );
}
