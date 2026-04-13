"use client";

import { useState, useEffect, useRef } from "react";
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
  Shield,
  Upload,
  FileText,
  Building2,
  ChevronDown,
  ChevronRight,
  Inbox,
  UserPlus,
  DollarSign,
  Clock,
  Sparkles,
  ArrowUpRight,
  Play,
  MousePointerClick,
  Send,
  Eye,
  Lock,
  TrendingUp,
  Target,
  Layers,
  CheckCircle2,
} from "lucide-react";

// ─── ANIMATED COUNTER ───
function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !counted.current) {
          counted.current = true;
          const duration = 1500;
          const start = performance.now();
          function tick(now: number) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

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
        scrolled ? "bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">RecruitPro</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {["Features", "How It Works", "Pricing", "Testimonials"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
            >
              {item}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/client-portal/login" className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors">
            Client Portal
          </Link>
          <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
            Sign In
          </Link>
          <Link href="/register" className="text-sm font-semibold bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 hover:shadow-lg">
            Start Free Trial
          </Link>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-700">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-md border-t border-gray-100 px-6 py-6 space-y-4 shadow-lg">
          {["Features", "How It Works", "Pricing", "Testimonials"].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, "-")}`} onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-gray-700 hover:text-indigo-600">
              {item}
            </a>
          ))}
          <div className="flex flex-col gap-3 pt-2">
            <Link href="/login" className="text-center text-sm font-medium text-gray-700 px-4 py-2.5 rounded-lg border border-gray-200">Sign In</Link>
            <Link href="/register" className="text-center text-sm font-semibold bg-indigo-600 text-white px-4 py-2.5 rounded-lg">Start Free Trial</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── HERO ───
function Hero() {
  const [activeStage, setActiveStage] = useState(2);

  const stages = [
    { name: "Sourced", color: "#94a3b8", count: 12 },
    { name: "Submitted", color: "#6366f1", count: 8 },
    { name: "Interview", color: "#f59e0b", count: 5 },
    { name: "Offer", color: "#10b981", count: 3 },
    { name: "Placed", color: "#22c55e", count: 1 },
  ];

  const candidates = [
    { initials: "JC", name: "James Chen", role: "VP Engineering", rating: 4.8, tags: ["Leadership", "SaaS"] },
    { initials: "SK", name: "Sarah Kim", role: "Product Director", rating: 4.5, tags: ["Strategy", "B2B"] },
    { initials: "MR", name: "Mike Ross", role: "CTO", rating: 5.0, tags: ["Architecture", "AI/ML"] },
    { initials: "AL", name: "Amy Liu", role: "Head of Data", rating: 4.2, tags: ["Analytics", "Python"] },
  ];

  return (
    <section className="relative pt-24 pb-8 sm:pt-32 sm:pb-16 px-6 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,white,#f8faff_40%,#eef2ff_70%,white)]" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-72 h-72 bg-violet-200/20 rounded-full blur-3xl" />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white text-indigo-700 text-sm font-medium px-4 py-2 rounded-full mb-8 border border-indigo-100 shadow-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Now with AI resume parsing and client marketplace
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.5rem] font-extrabold text-gray-900 tracking-tight leading-[1.1] mb-6">
            Stop losing placements{" "}
            <br className="hidden sm:block" />
            to{" "}
            <span className="relative">
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
                disorganization
              </span>
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                <path d="M2 8C50 2 100 2 150 6C200 10 250 4 298 8" stroke="url(#grad)" strokeWidth="3" strokeLinecap="round" />
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="300" y2="0">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            The all-in-one ATS that recruiting firms actually love. Manage candidates, impress clients with a
            branded portal, and track every placement from sourcing to fee collection.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
            <Link
              href="/register"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-xl hover:-translate-y-0.5"
            >
              Start Free — 7 Day Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/client-portal/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-gray-600 text-lg font-semibold px-8 py-4 rounded-xl border-2 border-gray-200 hover:border-emerald-300 hover:text-emerald-700 bg-white transition-all hover:-translate-y-0.5"
            >
              <Building2 className="w-5 h-5" />
              I'm a Hiring Company
            </Link>
          </div>
          <p className="text-sm text-gray-400">No credit card required. Set up in under 2 minutes.</p>
        </div>

        {/* Product mockup */}
        <div className="max-w-6xl mx-auto mt-16 sm:mt-20 perspective-[2000px]">
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl shadow-gray-300/40 overflow-hidden transform-gpu">
            {/* Browser chrome */}
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-white rounded-lg px-4 py-1.5 text-xs text-gray-400 border border-gray-200 max-w-sm w-full flex items-center gap-2">
                  <Lock className="w-3 h-3 text-green-500" />
                  app.recruitpro.com/jobs/senior-engineer
                </div>
              </div>
            </div>

            {/* Mock app with sidebar + pipeline */}
            <div className="flex min-h-[420px]">
              {/* Mini sidebar */}
              <div className="hidden lg:flex w-14 bg-gray-900 flex-col items-center py-4 gap-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-white" />
                </div>
                <div className="w-px h-4 bg-gray-700" />
                {[BarChart3, Users, Briefcase, Building2, Inbox, Upload].map((Icon, i) => (
                  <div key={i} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${i === 2 ? "bg-gray-700" : "hover:bg-gray-800"}`}>
                    <Icon className={`w-4 h-4 ${i === 2 ? "text-white" : "text-gray-500"}`} />
                  </div>
                ))}
              </div>

              {/* Pipeline content */}
              <div className="flex-1 p-4 sm:p-6 bg-gray-50/50">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">Acme Corp — Senior Engineer</h3>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">ACTIVE</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">29 candidates · $180K-$220K · San Francisco</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                      <Search className="w-3 h-3" />
                      Search
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white bg-indigo-600 rounded-lg px-3 py-1.5 font-medium shadow-sm">
                      <UserPlus className="w-3 h-3" />
                      Add Candidate
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 font-medium">
                      <Send className="w-3 h-3" />
                      Share with Client
                    </div>
                  </div>
                </div>

                {/* Pipeline columns */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {stages.map((stage, si) => (
                    <div key={stage.name} className="min-w-0">
                      <div className="flex items-center justify-between px-1 mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                          <span className="text-[11px] font-bold text-gray-700 truncate">{stage.name}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md font-semibold">{stage.count}</span>
                      </div>
                      <div className="space-y-2">
                        {candidates.slice(0, si === activeStage ? 3 : Math.min(stage.count, 2)).map((c, ci) => {
                          const cand = candidates[(si + ci) % candidates.length];
                          return (
                            <div
                              key={ci}
                              onClick={() => setActiveStage(si)}
                              className={`bg-white border rounded-xl p-2.5 shadow-sm cursor-pointer transition-all duration-200 ${
                                si === activeStage && ci === 0
                                  ? "border-indigo-300 ring-2 ring-indigo-100 shadow-md"
                                  : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <GripVertical className="w-3 h-3 text-gray-300 shrink-0 hidden sm:block" />
                                <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {cand.initials}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold text-gray-800 truncate">{cand.name}</p>
                                  <p className="text-[10px] text-gray-400 truncate">{cand.role}</p>
                                </div>
                              </div>
                              {si === activeStage && ci === 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-100">
                                  <div className="flex items-center gap-1 mb-1">
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <Star key={n} className={`w-2.5 h-2.5 ${n <= Math.floor(cand.rating) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                                    ))}
                                    <span className="text-[9px] text-gray-400 ml-0.5">{cand.rating}</span>
                                  </div>
                                  <div className="flex gap-1">
                                    {cand.tags.map((tag) => (
                                      <span key={tag} className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">{tag}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── SOCIAL PROOF ───
function SocialProof() {
  return (
    <section className="py-16 border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: 500, suffix: "+", label: "Recruiting Firms" },
            { value: 2, suffix: "M+", label: "Candidates Managed" },
            { value: 98, suffix: "%", label: "Customer Satisfaction" },
            { value: 40, suffix: "%", label: "Faster Time-to-Fill" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                <AnimatedNumber target={s.value} suffix={s.suffix} />
              </p>
              <p className="text-sm text-gray-500 mt-1.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── TWO SIDES ───
function TwoSides() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">One Platform, Two Sides</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Built for everyone in the hiring process</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">Recruiters manage the pipeline. Clients collaborate in real time. Everyone stays aligned.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Recruiter side */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-3xl opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-xl transition-all duration-500">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">For Recruiting Firms</h3>
                  <p className="text-sm text-indigo-600 font-medium">$10/user/month</p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { icon: Layers, text: "Drag-and-drop Kanban pipeline" },
                  { icon: Users, text: "Full candidate database with search" },
                  { icon: Building2, text: "Client & deal management CRM" },
                  { icon: Send, text: "Shareable candidate shortlists" },
                  { icon: DollarSign, text: "Placement & fee tracking" },
                  { icon: Upload, text: "Resume parsing & bulk import" },
                  { icon: Inbox, text: "Incoming job requests from clients" },
                  { icon: BarChart3, text: "Dashboard analytics & KPIs" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-indigo-600" />
                    </div>
                    <span className="text-sm text-gray-700">{text}</span>
                  </div>
                ))}
              </div>
              <Link href="/register" className="mt-8 w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Client side */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-3xl opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-xl transition-all duration-500">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">For Hiring Companies</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-emerald-600 font-bold">100% Free</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">FOREVER</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { icon: FileText, text: "Post job descriptions and requirements" },
                  { icon: Search, text: "Find and invite recruiting firms" },
                  { icon: Eye, text: "Review candidate profiles and resumes" },
                  { icon: Star, text: "Rate and give feedback on candidates" },
                  { icon: MessageSquare, text: "Real-time chat with your recruiters" },
                  { icon: Target, text: "Track progress across all your roles" },
                  { icon: Shield, text: "Secure, branded portal experience" },
                  { icon: TrendingUp, text: "Compare recruiting firm performance" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="text-sm text-gray-700">{text}</span>
                  </div>
                ))}
              </div>
              <Link href="/client-portal/login" className="mt-8 w-full inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200">
                Create Free Account <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FEATURES DEEP DIVE ───
function Features() {
  const [activeFeature, setActiveFeature] = useState(0);

  const features = [
    {
      icon: Layers,
      title: "Visual Kanban Pipeline",
      desc: "Drag candidates through your customizable stages. Every search gets its own board with real-time updates.",
      detail: "Built with drag-and-drop. Customize stages per job. Filter by recruiter, client, or status. See everything at a glance.",
      color: "indigo",
      mockup: (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          {["Sourced (12)", "Submitted (8)", "Interview (5)", "Offer (3)", "Placed (1)"].map((s, i) => (
            <div key={s} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${i === 2 ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200"}`}>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${["bg-slate-400","bg-blue-500","bg-amber-400","bg-emerald-400","bg-green-500"][i]}`} />
                <span className="text-sm font-medium text-gray-700">{s}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: Globe,
      title: "Interactive Client Portal",
      desc: "Share a branded shortlist link. Clients review profiles, rate candidates, leave feedback — no login needed.",
      detail: "Generate shareable links in one click. Clients see redacted profiles (no salary info). Real-time feedback appears in your dashboard.",
      color: "violet",
      mockup: (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold">JC</div>
            <div className="flex-1">
              <p className="text-sm font-semibold">James Chen</p>
              <p className="text-xs text-gray-500">VP Engineering</p>
            </div>
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(n => <Star key={n} className={`w-3.5 h-3.5 ${n <= 4 ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />)}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-emerald-700">Acme Corp</span>
              <span className="text-[10px] text-gray-400">2 min ago</span>
            </div>
            <p className="text-xs text-gray-600">Strong technical background. Let's move to interview stage.</p>
          </div>
        </div>
      ),
    },
    {
      icon: Sparkles,
      title: "AI Resume Parsing",
      desc: "Upload a resume and watch the form fill itself. Name, email, skills, experience — extracted in seconds.",
      detail: "Supports PDF, DOCX, and TXT. Extracts contact info, skills, work history, and education. Import from LinkedIn with one click.",
      color: "amber",
      mockup: (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <FileText className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-700">resume_james_chen.pdf</span>
            <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded ml-auto">Parsed</span>
          </div>
          {[["Name", "James Chen"], ["Title", "VP Engineering"], ["Email", "james@email.com"], ["Skills", "React, Node.js, AWS"]].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg">
              <span className="text-[10px] text-gray-400 w-12">{k}</span>
              <span className="text-xs font-medium text-gray-700">{v}</span>
              <CheckCircle2 className="w-3 h-3 text-green-500 ml-auto" />
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: Inbox,
      title: "Client Marketplace",
      desc: "Hiring companies post jobs and invite your firm directly. Accept engagements and auto-create pipelines.",
      detail: "Clients sign up free, post jobs, and search for recruiting firms. You get notified, accept with one click, and start sourcing immediately.",
      color: "rose",
      mockup: (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-semibold text-amber-700">NEW REQUEST</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">Senior Data Engineer</p>
            <p className="text-xs text-gray-500">TechCorp Inc. · Remote · $160K-$200K</p>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-1 text-xs font-medium bg-emerald-600 text-white py-2 rounded-lg">
              <Check className="w-3 h-3" /> Accept
            </button>
            <button className="flex-1 flex items-center justify-center gap-1 text-xs font-medium bg-white text-gray-500 py-2 rounded-lg border border-gray-200">
              <X className="w-3 h-3" /> Decline
            </button>
          </div>
        </div>
      ),
    },
  ];

  const f = features[activeFeature];
  const colors: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-600",
    violet: "bg-violet-100 text-violet-600",
    amber: "bg-amber-100 text-amber-600",
    rose: "bg-rose-100 text-rose-600",
  };

  return (
    <section id="features" className="py-24 px-6 bg-gray-50/60">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Everything you need to place more candidates</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">Stop juggling spreadsheets and email. Every tool your firm needs, in one platform.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Feature selector */}
          <div className="space-y-3">
            {features.map((feat, i) => (
              <button
                key={feat.title}
                onClick={() => setActiveFeature(i)}
                className={`w-full text-left p-5 rounded-xl border transition-all duration-300 ${
                  i === activeFeature
                    ? "bg-white border-indigo-200 shadow-lg ring-1 ring-indigo-100"
                    : "bg-white/50 border-gray-200 hover:bg-white hover:shadow-md"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors[feat.color]}`}>
                    <feat.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">{feat.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{feat.desc}</p>
                    {i === activeFeature && (
                      <p className="text-xs text-gray-400 mt-2 leading-relaxed">{feat.detail}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Feature preview */}
          <div className="sticky top-24">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-red-400 rounded-full" />
                <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full" />
                <div className="w-2.5 h-2.5 bg-green-400 rounded-full" />
              </div>
              <div className="p-6">
                {f.mockup}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── HOW IT WORKS ───
function HowItWorks() {
  const steps = [
    { num: "01", title: "Sign up in 2 minutes", desc: "Create your firm, invite your team, set your pipeline stages.", icon: Zap, time: "Day 0" },
    { num: "02", title: "Add your data", desc: "Import candidates from CSV, parse resumes, or add manually. Set up clients and open searches.", icon: Upload, time: "Day 1" },
    { num: "03", title: "Work your pipeline", desc: "Drag candidates through stages. Share shortlists with clients. Collect feedback in real time.", icon: MousePointerClick, time: "Ongoing" },
    { num: "04", title: "Close placements", desc: "Track fees, record placements, and grow your revenue. Analytics show you what's working.", icon: DollarSign, time: "Payday" },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Up and running in minutes, not weeks</h2>
          <p className="text-lg text-gray-500">No implementation calls. No data migration headaches. Just sign up and go.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <div key={s.num} className="relative group">
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-6 h-0.5 bg-gradient-to-r from-indigo-200 to-transparent z-10" />
              )}
              <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg hover:border-gray-200 transition-all duration-300 h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl font-black bg-gradient-to-br from-indigo-600 to-violet-600 bg-clip-text text-transparent">{s.num}</span>
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                    <s.icon className="w-5 h-5 text-indigo-600" />
                  </div>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── COMPARISON ───
function Comparison() {
  const features = [
    "Visual Kanban pipeline",
    "Client collaboration portal",
    "AI resume parsing",
    "Client marketplace (incoming jobs)",
    "Placement & fee tracking",
    "Team roles & permissions",
    "Bulk import (CSV/JSON)",
    "Shareable candidate links",
    "@mention notes system",
    "Mobile responsive",
  ];

  return (
    <section className="py-24 px-6 bg-gray-50/60">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Comparison</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Why firms switch to RecruitPro</h2>
          <p className="text-lg text-gray-500">All the features of enterprise ATS platforms at a fraction of the cost.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="grid grid-cols-4 border-b border-gray-200 bg-gray-50">
            <div className="p-4 col-span-1" />
            <div className="p-4 text-center border-l border-gray-200">
              <div className="flex items-center justify-center gap-2">
                <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
                  <Briefcase className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-bold text-gray-900">RecruitPro</span>
              </div>
              <p className="text-xs text-indigo-600 font-semibold mt-1">$10/user/mo</p>
            </div>
            <div className="p-4 text-center border-l border-gray-200">
              <span className="text-sm font-medium text-gray-500">Bullhorn</span>
              <p className="text-xs text-gray-400 mt-1">$99+/user/mo</p>
            </div>
            <div className="p-4 text-center border-l border-gray-200">
              <span className="text-sm font-medium text-gray-500">Loxo</span>
              <p className="text-xs text-gray-400 mt-1">$119+/user/mo</p>
            </div>
          </div>
          {features.map((feature, i) => (
            <div key={feature} className={`grid grid-cols-4 ${i < features.length - 1 ? "border-b border-gray-100" : ""}`}>
              <div className="p-3.5 text-sm text-gray-700">{feature}</div>
              <div className="p-3.5 flex justify-center border-l border-gray-100">
                <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-600" />
                </div>
              </div>
              <div className="p-3.5 flex justify-center border-l border-gray-100">
                {i < 6 ? (
                  <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-emerald-600" />
                  </div>
                ) : (
                  <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center">
                    <X className="w-3 h-3 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="p-3.5 flex justify-center border-l border-gray-100">
                {i < 5 ? (
                  <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-emerald-600" />
                  </div>
                ) : (
                  <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center">
                    <X className="w-3 h-3 text-gray-400" />
                  </div>
                )}
              </div>
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
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Simple pricing. No surprises.</h2>
          <p className="text-lg text-gray-500">One plan with everything included. Scale as your team grows.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Recruiter plan */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-3xl blur-sm opacity-20" />
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-center py-2 text-sm font-medium">
                7-day free trial
              </div>
              <div className="p-8">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Recruiting Firms</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-extrabold text-gray-900">$10</span>
                  <span className="text-gray-500">/ user / month</span>
                </div>
                <p className="text-sm text-gray-400 mb-6">Billed monthly. Cancel anytime.</p>
                <div className="space-y-3 mb-8">
                  {[
                    "Unlimited candidates & jobs",
                    "Visual drag-and-drop pipeline",
                    "Client collaboration portal",
                    "AI resume parsing",
                    "Client marketplace access",
                    "Team management & roles",
                    "Placement & fee tracking",
                    "Bulk import & export",
                    "Priority support",
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-3">
                      <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-indigo-600" />
                      </div>
                      <span className="text-sm text-gray-700">{f}</span>
                    </div>
                  ))}
                </div>
                <Link href="/register" className="block w-full text-center bg-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                  Start Free Trial
                </Link>
                <p className="text-xs text-gray-400 text-center mt-3">No credit card required</p>
              </div>
            </div>
          </div>

          {/* Client plan */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
            <div className="bg-emerald-600 text-white text-center py-2 text-sm font-medium">
              Free forever
            </div>
            <div className="p-8">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Hiring Companies</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-5xl font-extrabold text-gray-900">$0</span>
                <span className="text-gray-500">/ forever</span>
              </div>
              <p className="text-sm text-gray-400 mb-6">No catches. No limits.</p>
              <div className="space-y-3 mb-8">
                {[
                  "Post unlimited job descriptions",
                  "Invite any recruiting firm",
                  "Review candidate shortlists",
                  "Rate & give feedback",
                  "Real-time messaging",
                  "Track hiring progress",
                  "Download candidate docs",
                  "Multi-firm management",
                  "Branded portal",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-sm text-gray-700">{f}</span>
                  </div>
                ))}
              </div>
              <Link href="/client-portal/login" className="block w-full text-center bg-emerald-600 text-white font-semibold py-3.5 rounded-xl hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200">
                Create Free Account
              </Link>
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
      quote: "We switched from spreadsheets and our placement rate jumped 40% in the first quarter. The client portal alone is worth the price.",
      name: "Jessica Torres",
      role: "Managing Partner",
      company: "Apex IT Recruiting",
      metric: "40% more placements",
    },
    {
      quote: "My team of 8 recruiters was up and running in a day. The pipeline view is exactly what we needed — simple, visual, and fast.",
      name: "David Chen",
      role: "Director of Operations",
      company: "TechBridge Staffing",
      metric: "8 recruiters onboarded in 1 day",
    },
    {
      quote: "Our clients love the portal. They review candidates and give feedback without me being in the middle. Absolute game changer.",
      name: "Sarah Mitchell",
      role: "Senior Recruiter",
      company: "MedSearch Partners",
      metric: "3x faster client feedback",
    },
  ];

  return (
    <section id="testimonials" className="py-24 px-6 bg-gray-50/60">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Testimonials</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Recruiters love RecruitPro</h2>
          <p className="text-lg text-gray-500">Hear from firms that made the switch.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col">
              <div className="flex gap-1 mb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full w-fit mb-4">
                <TrendingUp className="w-3 h-3" />
                {t.metric}
              </div>

              <p className="text-gray-700 mb-6 leading-relaxed text-[15px] flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {t.name.split(" ").map(w => w[0]).join("")}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.role}, {t.company}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ───
function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  const questions = [
    { q: "Is there really a free trial with no credit card?", a: "Yes! Sign up and use RecruitPro free for 7 days. No credit card required. If you love it, subscribe at $10/user/month. If not, no strings attached." },
    { q: "Can I import data from my current ATS?", a: "Absolutely. We support CSV and JSON imports for candidates, clients, and jobs. We have templates for Bullhorn, Zoho, Lever, Greenhouse, Loxo, and Ashby exports." },
    { q: "How does the client portal work?", a: "You generate a shareable link for each client/job. Clients can view candidate profiles (with salary info redacted), rate them, leave comments, and download resumes — all without creating an account. Or they can sign up for free to manage all their searches." },
    { q: "Is my data secure?", a: "Yes. All data is encrypted in transit and at rest. We use Vercel's enterprise infrastructure, Neon PostgreSQL, and follow SOC 2 security practices. Each organization's data is fully isolated." },
    { q: "Can hiring companies really use it for free?", a: "Yes, forever. Hiring companies can sign up, post jobs, invite recruiting firms, review candidates, and give feedback — all at no cost. We only charge recruiting firms." },
    { q: "What happens when I cancel?", a: "You can export all your data anytime. When you cancel, you'll retain read-only access through your billing period end. We never hold your data hostage." },
  ];

  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Common questions</h2>
        </div>

        <div className="space-y-3">
          {questions.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full text-left px-6 py-4 flex items-center justify-between gap-4"
              >
                <span className="font-semibold text-gray-900 text-[15px]">{item.q}</span>
                <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && (
                <div className="px-6 pb-4">
                  <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
                </div>
              )}
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
      <div className="max-w-5xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent)]" />
          {/* Grid pattern overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

          <div className="relative py-20 px-8 text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 text-white/90 text-sm font-medium px-4 py-2 rounded-full mb-6 backdrop-blur-sm border border-white/10">
              <Zap className="w-4 h-4" />
              Join 500+ firms already using RecruitPro
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
              Ready to close more<br />placements, faster?
            </h2>
            <p className="text-lg text-indigo-100 mb-10 max-w-xl mx-auto">
              Your competitors are already using modern tools. Don't let another great candidate slip through the cracks.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-700 text-lg font-semibold px-8 py-4 rounded-xl hover:bg-gray-50 transition-all shadow-lg hover:-translate-y-0.5"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/client-portal/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white/90 text-lg font-semibold px-8 py-4 rounded-xl border-2 border-white/20 hover:bg-white/10 transition-all"
              >
                I'm a Hiring Company
              </Link>
            </div>
            <p className="text-sm text-indigo-200 mt-5">No credit card required · 2-minute setup · Cancel anytime</p>
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold text-white">RecruitPro</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">The modern ATS for recruiting firms and hiring companies.</p>
          </div>
          {[
            { title: "Product", links: [["Features", "#features"], ["Pricing", "#pricing"], ["How It Works", "#how-it-works"], ["Client Portal", "/client-portal/login"]] },
            { title: "Company", links: [["About", "#"], ["Blog", "#"], ["Careers", "#"]] },
            { title: "Legal", links: [["Privacy", "#"], ["Terms", "#"], ["Security", "#"]] },
            { title: "Contact", links: [["support@recruitpro.com", "mailto:support@recruitpro.com"], ["sales@recruitpro.com", "mailto:sales@recruitpro.com"]] },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="font-semibold text-white mb-4 text-sm">{col.title}</h4>
              <ul className="space-y-2.5 text-sm text-gray-400">
                {col.links.map(([label, href]) => (
                  <li key={label}><a href={href} className="hover:text-white transition-colors">{label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} RecruitPro. All rights reserved.</p>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
            <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
          </div>
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
      <TwoSides />
      <Features />
      <HowItWorks />
      <Comparison />
      <Pricing />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
