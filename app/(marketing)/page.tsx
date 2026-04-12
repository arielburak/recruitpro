"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Users,
  Briefcase,
  BarChart3,
  Zap,
  Globe,
  Star,
  GripVertical,
  MessageSquare,
  Search,
  Menu,
  X,
} from "lucide-react";

// ─── NAV ───
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/80 backdrop-blur-md shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Briefcase className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">
            RecruitPro
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          <a
            href="#features"
            className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
          >
            Pricing
          </a>
          <a
            href="#testimonials"
            className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
          >
            Testimonials
          </a>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-all"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-gray-700"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-md border-t border-gray-100 px-6 py-6 space-y-4">
          <a
            href="#features"
            onClick={() => setMobileOpen(false)}
            className="block text-sm font-medium text-gray-700 hover:text-indigo-600"
          >
            Features
          </a>
          <a
            href="#pricing"
            onClick={() => setMobileOpen(false)}
            className="block text-sm font-medium text-gray-700 hover:text-indigo-600"
          >
            Pricing
          </a>
          <a
            href="#testimonials"
            onClick={() => setMobileOpen(false)}
            className="block text-sm font-medium text-gray-700 hover:text-indigo-600"
          >
            Testimonials
          </a>
          <div className="flex flex-col gap-3 pt-2">
            <Link
              href="/login"
              className="text-center text-sm font-medium text-gray-700 px-4 py-2.5 rounded-lg border border-gray-200"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-center text-sm font-semibold bg-indigo-600 text-white px-4 py-2.5 rounded-lg"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── HERO ───
function Hero() {
  const stages = [
    { name: "Sourced", color: "bg-slate-400", count: 12 },
    { name: "Contacted", color: "bg-blue-500", count: 8 },
    { name: "Submitted", color: "bg-violet-500", count: 5 },
    { name: "Interview", color: "bg-amber-400", count: 3 },
    { name: "Offer", color: "bg-emerald-400", count: 2 },
    { name: "Placed", color: "bg-green-500", count: 1 },
  ];

  const candidates = [
    { initials: "JD", name: "John Doe", role: "Sr. Engineer" },
    { initials: "SK", name: "Sarah Kim", role: "PM Lead" },
    { initials: "MR", name: "Mike Ross", role: "VP Sales" },
    { initials: "AL", name: "Amy Lee", role: "Data Scientist" },
    { initials: "TP", name: "Tom Park", role: "CTO" },
    { initials: "CB", name: "Cara B.", role: "Designer" },
  ];

  return (
    <section className="relative pt-28 pb-20 px-6 overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-indigo-50/80 -z-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-100/30 rounded-full blur-3xl -z-10" />

      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-8 border border-indigo-100">
          <Zap className="w-3.5 h-3.5" />
          Built for recruiting &amp; search firms
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 tracking-tight leading-[1.08] mb-6">
          The modern ATS built
          <br className="hidden sm:block" />
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            for recruiting firms
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          From sourcing to placement — manage your entire pipeline, impress
          clients, and close more searches. All in one platform.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300"
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5" />
          </Link>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-gray-700 text-lg font-semibold px-8 py-4 rounded-xl border-2 border-gray-200 hover:border-indigo-300 hover:text-indigo-700 bg-white transition-all"
          >
            See How It Works
          </a>
        </div>
      </div>

      {/* Browser mockup */}
      <div className="max-w-6xl mx-auto mt-16 sm:mt-20">
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl shadow-gray-300/30 overflow-hidden">
          {/* Browser chrome */}
          <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-red-400 rounded-full" />
              <div className="w-3 h-3 bg-yellow-400 rounded-full" />
              <div className="w-3 h-3 bg-green-400 rounded-full" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-white rounded-md px-4 py-1 text-xs text-gray-400 border border-gray-200 max-w-xs w-full text-center">
                app.recruitpro.com/pipeline
              </div>
            </div>
          </div>

          {/* Mock dashboard */}
          <div className="p-4 sm:p-6 bg-gray-50/50">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Acme Corp — Senior Engineer Search
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  31 candidates in pipeline
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <div className="text-xs text-gray-400 bg-white border border-gray-200 rounded-md px-3 py-1.5">
                  Filter
                </div>
                <div className="text-xs text-white bg-indigo-600 rounded-md px-3 py-1.5 font-medium">
                  + Add Candidate
                </div>
              </div>
            </div>

            {/* Pipeline columns */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {stages.map((stage, si) => (
                <div key={stage.name} className="min-w-0">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full ${stage.color}`}
                      />
                      <span className="text-[11px] font-semibold text-gray-700 truncate">
                        {stage.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                      {stage.count}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Array.from({ length: Math.min(stage.count, 2) }).map(
                      (_, i) => {
                        const c = candidates[(si + i) % candidates.length];
                        return (
                          <div
                            key={i}
                            className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm"
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical className="w-3 h-3 text-gray-300 shrink-0 hidden sm:block" />
                              <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                                {c.initials}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium text-gray-800 truncate">
                                  {c.name}
                                </p>
                                <p className="text-[10px] text-gray-400 truncate">
                                  {c.role}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── SOCIAL PROOF ───
function SocialProof() {
  const stats = [
    { value: "500+", label: "Firms" },
    { value: "2M+", label: "Candidates" },
    { value: "98%", label: "Satisfaction" },
    { value: "40%", label: "Faster Placements" },
  ];

  return (
    <section className="py-14 bg-indigo-50/50 border-y border-indigo-100/50">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-10 text-center">
          Trusted by 500+ recruiting firms worldwide
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                {s.value}
              </p>
              <p className="text-sm text-gray-500 mt-1.5 font-medium">
                {s.label}
              </p>
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
      title: "Visual Pipeline",
      desc: "Drag-and-drop candidates through customizable stages. See your entire search at a glance, from sourced to placed.",
      color: "bg-indigo-100 text-indigo-600",
    },
    {
      icon: Globe,
      title: "Client Portal",
      desc: "Give clients a branded portal to review candidates, leave feedback, and request interviews. No email chains.",
      color: "bg-violet-100 text-violet-600",
    },
    {
      icon: Users,
      title: "Multi-User Teams",
      desc: "Each recruiter gets their own login and pipeline. Admins see everything across the firm.",
      color: "bg-blue-100 text-blue-600",
    },
    {
      icon: BarChart3,
      title: "Analytics Dashboard",
      desc: "Track placements, submission rates, and team activity. Know where your revenue is coming from.",
      color: "bg-amber-100 text-amber-600",
    },
    {
      icon: Search,
      title: "Smart Search",
      desc: "Find the right candidate in seconds. Search across skills, titles, companies, and notes instantly.",
      color: "bg-emerald-100 text-emerald-600",
    },
    {
      icon: MessageSquare,
      title: "Notes & Activity",
      desc: "Internal notes for your team, client-visible comments for collaboration. Full audit trail on every record.",
      color: "bg-rose-100 text-rose-600",
    },
  ];

  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">
            Features
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Everything you need to place more candidates
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Stop juggling spreadsheets, email, and five different tools.
            RecruitPro brings your entire workflow into one platform.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-gray-100 hover:border-gray-200 transition-all duration-300"
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${f.color} transition-transform duration-300 group-hover:scale-110`}
              >
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {f.title}
              </h3>
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
      num: "1",
      title: "Set up your workspace",
      desc: "Create your organization in under 2 minutes. Invite your team and configure your pipeline stages.",
      time: "2 min",
    },
    {
      num: "2",
      title: "Add clients, jobs & candidates",
      desc: "Import your existing data or start fresh. Set up client companies, active searches, and your candidate database.",
      time: "Day 1",
    },
    {
      num: "3",
      title: "Track, collaborate & place",
      desc: "Drag candidates through stages, share them with clients via the portal, and close placements faster than ever.",
      time: "Ongoing",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 bg-gray-50/80">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">
            How It Works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Up and running in minutes
          </h2>
          <p className="text-lg text-gray-500">
            No complex setup. No implementation calls. Just sign up and start
            placing.
          </p>
        </div>

        <div className="relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-gradient-to-r from-indigo-200 via-violet-200 to-indigo-200" />

          <div className="grid md:grid-cols-3 gap-10 md:gap-8">
            {steps.map((s, i) => (
              <div key={s.num} className="relative text-center">
                {/* Number circle */}
                <div className="relative z-10 w-12 h-12 mx-auto mb-6 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-200">
                  {s.num}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {s.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
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
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">
            Pricing
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-500">
            One plan. Everything included. No hidden fees.
          </p>
        </div>

        {/* Card with glow */}
        <div className="relative max-w-md mx-auto">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-3xl blur-lg opacity-20" />
          <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
            {/* Badge */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-center py-2.5 text-sm font-medium">
              7-day free trial included
            </div>

            <div className="p-8">
              <div className="text-center mb-8">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-extrabold text-gray-900">
                    $10
                  </span>
                  <span className="text-gray-500 text-lg">/ user / month</span>
                </div>
                <p className="text-sm text-gray-400 mt-2">
                  Billed monthly. Cancel anytime.
                </p>
              </div>

              <div className="space-y-3.5 mb-8">
                {[
                  "Unlimited candidates & jobs",
                  "Visual drag-and-drop pipeline",
                  "Client collaboration portal",
                  "Shareable candidate links",
                  "Team management & roles",
                  "Dashboard with KPIs",
                  "Activity audit trail",
                  "Priority email support",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-indigo-600" />
                    </div>
                    <span className="text-sm text-gray-700">{f}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/register"
                className="block w-full text-center bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold py-3.5 rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-200"
              >
                Start Free Trial
              </Link>
              <p className="text-xs text-gray-400 text-center mt-3">
                No credit card required
              </p>
            </div>
          </div>
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
      company: "Apex IT Recruiting",
    },
    {
      quote:
        "My team of 8 recruiters was up and running in a day. The pipeline view is exactly what we needed — simple, visual, fast.",
      name: "David C.",
      role: "Director of Operations",
      company: "TechBridge Staffing",
    },
    {
      quote:
        "Our clients love the portal. They review candidates and give feedback without me being in the middle. Absolute game changer.",
      name: "Sarah M.",
      role: "Senior Recruiter",
      company: "MedSearch Partners",
    },
  ];

  return (
    <section id="testimonials" className="py-24 px-6 bg-gray-50/80">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">
            Testimonials
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Recruiters love RecruitPro
          </h2>
          <p className="text-lg text-gray-500">
            Hear from firms that made the switch.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>

              <p className="text-gray-700 mb-6 leading-relaxed text-[15px]">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {t.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.role}, {t.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FINAL CTA ───
function FinalCTA() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),transparent)]" />

          <div className="relative text-center py-16 sm:py-20 px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to transform your recruiting?
            </h2>
            <p className="text-lg text-indigo-100 mb-10 max-w-xl mx-auto">
              Join hundreds of firms already using RecruitPro to manage their
              pipeline, collaborate with clients, and close more placements.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-white text-indigo-700 text-lg font-semibold px-8 py-4 rounded-xl hover:bg-gray-50 transition-all shadow-lg"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="text-sm text-indigo-200 mt-4">
              No credit card required
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FOOTER ───
function Footer() {
  return (
    <footer className="bg-gray-900 pt-16 pb-8 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          {/* Product */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Product</h4>
            <ul className="space-y-2.5 text-sm text-gray-400">
              <li>
                <a
                  href="#features"
                  className="hover:text-white transition-colors"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="hover:text-white transition-colors"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="hover:text-white transition-colors"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="#testimonials"
                  className="hover:text-white transition-colors"
                >
                  Testimonials
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Company</h4>
            <ul className="space-y-2.5 text-sm text-gray-400">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  About
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Careers
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Legal</h4>
            <ul className="space-y-2.5 text-sm text-gray-400">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Security
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Contact</h4>
            <ul className="space-y-2.5 text-sm text-gray-400">
              <li>
                <a
                  href="mailto:support@recruitpro.com"
                  className="hover:text-white transition-colors"
                >
                  support@recruitpro.com
                </a>
              </li>
              <li>
                <a
                  href="mailto:sales@recruitpro.com"
                  className="hover:text-white transition-colors"
                >
                  sales@recruitpro.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Briefcase className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-300">
              RecruitPro
            </span>
          </div>
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} RecruitPro. All rights reserved.
          </p>
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
