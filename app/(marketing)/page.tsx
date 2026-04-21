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
  MoveRight,
  Heart,
  Workflow,
  Award,
  CircleDollarSign,
  Handshake,
  Bot,
  ArrowDown,
} from "lucide-react";

// ─── NAVBAR ───
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">Recruiting ATS</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {["Features", "How It Works", "The Math", "Pricing"].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, "-")}`} className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
              {item}
            </a>
          ))}
          <Link href="/privacy" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
            Terms
          </Link>
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
          {["Features", "How It Works", "The Math", "Pricing"].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, "-")}`} onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-gray-700 hover:text-indigo-600">
              {item}
            </a>
          ))}
          <Link href="/privacy" onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-gray-700 hover:text-indigo-600">
            Privacy
          </Link>
          <Link href="/terms" onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-gray-700 hover:text-indigo-600">
            Terms
          </Link>
          <div className="flex flex-col gap-3 pt-2">
            <Link href="/login" className="text-center text-sm font-medium text-gray-700 px-4 py-2.5 rounded-lg border border-gray-200">Sign In</Link>
            <Link href="/register" className="text-center text-sm font-semibold bg-indigo-600 text-white px-4 py-2.5 rounded-lg">Start Free Trial</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── HERO WITH LARGE INTERACTIVE PIPELINE MOCKUP ───
function Hero() {
  const [activeStage, setActiveStage] = useState(1);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const stages = [
    { name: "Sourced", color: "#94a3b8", dotColor: "bg-slate-400", count: 12 },
    { name: "Contacted", color: "#60a5fa", dotColor: "bg-blue-400", count: 8 },
    { name: "Submitted", color: "#818cf8", dotColor: "bg-indigo-400", count: 5 },
    { name: "Interview", color: "#f59e0b", dotColor: "bg-amber-400", count: 3 },
    { name: "Offer", color: "#10b981", dotColor: "bg-emerald-400", count: 2 },
    { name: "Placed", color: "#22c55e", dotColor: "bg-green-500", count: 1 },
  ];

  const allCandidates = [
    { initials: "JD", name: "John Doe", role: "Sr. Engineer", bg: "from-blue-500 to-blue-600" },
    { initials: "SK", name: "Sarah Kim", role: "PM Lead", bg: "from-violet-500 to-purple-600" },
    { initials: "MR", name: "Mike Ross", role: "VP Sales", bg: "from-indigo-500 to-blue-600" },
    { initials: "AL", name: "Amy Lee", role: "Data Scientist", bg: "from-pink-500 to-rose-600" },
    { initials: "TP", name: "Tom Park", role: "CTO", bg: "from-emerald-500 to-teal-600" },
    { initials: "CB", name: "Cara B.", role: "Designer", bg: "from-amber-500 to-orange-600" },
  ];

  // Map candidates to stages
  const stageCards = [
    [0, 1],     // Sourced
    [1, 2],     // Contacted
    [2, 3],     // Submitted
    [3, 4],     // Interview
    [4, 5],     // Offer
    [5],        // Placed
  ];

  return (
    <section className="relative pt-24 pb-4 sm:pt-32 sm:pb-8 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,white,#f8faff_30%,#eef2ff_60%,white)]" />
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-indigo-200/15 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-violet-200/15 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Copy */}
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white text-indigo-700 text-sm font-medium px-4 py-2 rounded-full mb-8 border border-indigo-100 shadow-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            The ATS built for boutique recruiting firms
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.5rem] font-extrabold text-gray-900 tracking-tight leading-[1.08] mb-6">
            Your candidates deserve{" "}
            <br className="hidden sm:block" />
            a better{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
                pipeline
              </span>
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                <path d="M2 8C50 2 100 2 150 6C200 10 250 4 298 8" stroke="url(#heroGrad)" strokeWidth="3" strokeLinecap="round" />
                <defs><linearGradient id="heroGrad" x1="0" y1="0" x2="300" y2="0"><stop offset="0%" stopColor="#4f46e5" /><stop offset="100%" stopColor="#7c3aed" /></linearGradient></defs>
              </svg>
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop losing placements to spreadsheets and scattered emails. Recruiting ATS gives your firm a visual pipeline,
            a client portal, and everything you need to place faster — from $15/seat/month.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-3">
            <Link
              href="/register"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-xl hover:-translate-y-0.5"
            >
              Start 5-Day Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/client-portal/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-gray-600 text-lg font-semibold px-8 py-4 rounded-xl border-2 border-gray-200 hover:border-emerald-300 hover:text-emerald-700 bg-white transition-all hover:-translate-y-0.5"
            >
              <Building2 className="w-5 h-5" />
              I&apos;m Hiring
            </Link>
          </div>
          <p className="text-sm text-gray-400 mb-12">5-day trial &middot; Credit card required &middot; Cancel anytime</p>
        </div>

        {/* ── GIANT INTERACTIVE PIPELINE MOCKUP ── */}
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl shadow-gray-300/30 overflow-hidden">
            {/* Browser chrome */}
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-white rounded-lg px-5 py-1.5 text-sm text-gray-400 border border-gray-200 max-w-md w-full flex items-center gap-2">
                  <Lock className="w-3 h-3 text-green-500" />
                  app.recruitingats.com/pipeline
                </div>
              </div>
            </div>

            {/* App content */}
            <div className="p-6 sm:p-8 bg-[#fafbfc]">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900">Acme Corp &mdash; Senior Engineer Search</h3>
                  <p className="text-sm text-gray-400 mt-0.5">31 candidates in pipeline</p>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm hover:border-gray-300 transition cursor-pointer">
                    <Search className="w-3.5 h-3.5" />
                    Filter
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-white bg-gray-900 rounded-lg px-4 py-2 font-medium shadow-sm cursor-pointer hover:bg-gray-800 transition">
                    <UserPlus className="w-3.5 h-3.5" />
                    + Add Candidate
                  </div>
                </div>
              </div>

              {/* Pipeline columns */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4">
                {stages.map((stage, si) => (
                  <div key={stage.name} className="min-w-0">
                    {/* Column header */}
                    <div className="flex items-center justify-between px-1 mb-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${stage.dotColor}`} />
                        <span className="text-xs sm:text-sm font-bold text-gray-700">{stage.name}</span>
                      </div>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md font-semibold">{stage.count}</span>
                    </div>

                    {/* Cards */}
                    <div className="space-y-2.5">
                      {stageCards[si].map((ci) => {
                        const c = allCandidates[ci];
                        const isActive = activeStage === si && hoveredCard === `${si}-${ci}`;
                        return (
                          <div
                            key={`${si}-${ci}`}
                            onClick={() => setActiveStage(si)}
                            onMouseEnter={() => setHoveredCard(`${si}-${ci}`)}
                            onMouseLeave={() => setHoveredCard(null)}
                            className={`bg-white border rounded-xl p-3 cursor-pointer transition-all duration-200 ${
                              isActive
                                ? "border-indigo-300 ring-2 ring-indigo-100 shadow-lg scale-[1.02]"
                                : "border-gray-200 hover:border-gray-300 hover:shadow-md shadow-sm"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <GripVertical className="w-3 h-3 text-gray-300 shrink-0 hidden sm:block" />
                              <div className={`w-8 h-8 bg-gradient-to-br ${c.bg} text-white rounded-full flex items-center justify-center text-[11px] font-bold shrink-0`}>
                                {c.initials}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs sm:text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                                <p className="text-[10px] sm:text-xs text-gray-400 truncate">{c.role}</p>
                              </div>
                            </div>
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
    </section>
  );
}

// ─── TRUST BAR ───
function TrustBar() {
  const items = [
    { icon: Sparkles, title: "Fresh off the build", desc: "New platform, honest start", bg: "bg-emerald-100", color: "text-emerald-600" },
    { icon: Zap, title: "Ships every week", desc: "Real-time roadmap, not quarterly", bg: "bg-indigo-100", color: "text-indigo-600" },
    { icon: Heart, title: "Built with recruiters", desc: "Early access is open", bg: "bg-violet-100", color: "text-violet-600" },
  ];
  return (
    <section className="py-12 sm:py-14 border-y border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
          {items.map((it, i) => (
            <div key={it.title} className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${it.bg}`}>
                <it.icon className={`w-5 h-5 ${it.color}`} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-sm leading-tight">{it.title}</p>
                <p className="text-xs text-gray-500 leading-tight">{it.desc}</p>
              </div>
              {i < items.length - 1 && <div className="hidden md:block h-8 w-px bg-gray-200 ml-6" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── PAIN → SOLUTION ───
function PainSolution() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-red-500 uppercase tracking-widest mb-3">Sound Familiar?</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            The recruiting firm struggle is real
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {[
            { pain: "Candidates fall through the cracks", desc: "No one remembers who was submitted where. Follow-ups get missed. Placements slip away.", icon: "😩" },
            { pain: "Clients have zero visibility", desc: "They email asking for updates. You scramble to compile a list. They feel out of the loop.", icon: "📧" },
            { pain: "Your data lives in 5 different places", desc: "Spreadsheets, email, LinkedIn, your brain, sticky notes. Nothing is connected.", icon: "🗂️" },
          ].map((item) => (
            <div key={item.pain} className="bg-red-50/50 border border-red-100 rounded-2xl p-6 relative">
              <span className="text-3xl mb-3 block">{item.icon}</span>
              <h3 className="font-bold text-gray-900 mb-2">{item.pain}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-center mb-16">
          <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 py-3 rounded-full shadow-lg">
            <ArrowDown className="w-5 h-5 animate-bounce" />
            <span className="font-bold text-lg">There&apos;s a better way</span>
            <ArrowDown className="w-5 h-5 animate-bounce" />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { solution: "Every candidate, tracked visually", desc: "Drag-and-drop pipeline per job. See exactly where every candidate stands. Never lose track again.", icon: Layers, color: "bg-indigo-50 border-indigo-100 text-indigo-600" },
            { solution: "Clients collaborate in real time", desc: "Share a branded portal. Clients rate candidates, leave feedback, request interviews — without a single email.", icon: Globe, color: "bg-emerald-50 border-emerald-100 text-emerald-600" },
            { solution: "One system for everything", desc: "Candidates, clients, jobs, fees, documents, notes — all in one place. Import from any ATS in minutes.", icon: Target, color: "bg-violet-50 border-violet-100 text-violet-600" },
          ].map((item) => (
            <div key={item.solution} className={`border rounded-2xl p-6 ${item.color.split(" ").slice(0, 2).join(" ")}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${item.color}`}>
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{item.solution}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FEATURES SHOWCASE (Interactive with big mockups) ───
function Features() {
  const [activeTab, setActiveTab] = useState(0);

  const features = [
    {
      tab: "Pipeline",
      icon: Layers,
      title: "Drag-and-drop Kanban pipeline",
      desc: "Every search gets its own visual board. Drag candidates between stages, add notes, share with clients — all in one view. Customize stages per job.",
      bullets: ["Custom stages per job", "Drag-and-drop reordering", "Bulk actions & filters", "One-click client sharing"],
      mockup: (
        <div className="space-y-3">
          {["Sourced", "Contacted", "Submitted", "Interview", "Offer", "Placed"].map((s, i) => (
            <div key={s} className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${i === 2 ? "bg-indigo-50 border-indigo-200 shadow-sm" : "bg-white border-gray-200"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${["bg-slate-400","bg-blue-400","bg-indigo-400","bg-amber-400","bg-emerald-400","bg-green-500"][i]}`} />
                <span className="text-sm font-semibold text-gray-700">{s}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">{[12,8,5,3,2,1][i]} candidates</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      tab: "Client Portal",
      icon: Globe,
      title: "Interactive client collaboration portal",
      desc: "Generate a secure link. Your client reviews candidate profiles, rates them 1-5, leaves detailed feedback, and requests interviews — all without you being in the middle.",
      bullets: ["Branded, white-label experience", "Star ratings & written feedback", "Salary info auto-redacted", "Real-time notifications"],
      mockup: (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center text-sm font-bold">JC</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">James Chen</p>
              <p className="text-xs text-gray-500">VP Engineering &middot; 12 years exp.</p>
            </div>
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(n => <Star key={n} className={`w-4 h-4 ${n <= 4 ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center"><MessageSquare className="w-3 h-3 text-blue-600" /></div>
              <span className="text-xs font-bold text-gray-700">Acme Corp</span>
              <span className="text-[10px] text-gray-400">2 min ago</span>
            </div>
            <p className="text-sm text-gray-600">Great background — let&apos;s move to a technical interview this week.</p>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 text-sm font-medium bg-emerald-600 text-white py-2.5 rounded-lg flex items-center justify-center gap-1.5"><Check className="w-3.5 h-3.5" /> Shortlist</button>
            <button className="flex-1 text-sm font-medium bg-white text-gray-600 py-2.5 rounded-lg border border-gray-200 flex items-center justify-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Comment</button>
          </div>
        </div>
      ),
    },
    {
      tab: "AI Parsing",
      icon: Sparkles,
      title: "AI-powered resume parsing",
      desc: "Upload a resume (PDF, DOCX, TXT) and watch the form auto-fill. Name, email, phone, skills, experience — extracted in seconds. Also import directly from LinkedIn.",
      bullets: ["PDF, DOCX, TXT support", "Skills & experience extraction", "LinkedIn profile import", "Bulk import from any ATS"],
      mockup: (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <FileText className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">resume_james_chen.pdf</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-auto font-semibold">Parsed</span>
          </div>
          {[
            ["Name", "James Chen"],
            ["Title", "VP Engineering"],
            ["Email", "james@email.com"],
            ["Location", "San Francisco, CA"],
            ["Skills", "React, Node.js, AWS, Python"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
              <span className="text-xs text-gray-400 w-14 shrink-0">{k}</span>
              <span className="text-sm font-medium text-gray-800 flex-1">{v}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
          ))}
        </div>
      ),
    },
    {
      tab: "Marketplace",
      icon: Handshake,
      title: "Clients post jobs — you get hired",
      desc: "Hiring companies sign up, post their open roles, and invite your firm to work on them. Accept with one click and a pipeline is auto-created.",
      bullets: ["Clients sign up directly", "Job posting & firm discovery", "One-click engagement accept", "Auto-creates pipeline & client record"],
      mockup: (
        <div className="space-y-3">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">New Engagement Request</span>
            </div>
            <p className="text-base font-bold text-gray-900 mb-1">Senior Data Engineer</p>
            <p className="text-sm text-gray-500">TechCorp Inc. &middot; Remote &middot; $160K-$200K</p>
            <p className="text-xs text-gray-400 mt-2">We need someone with strong Spark/Kafka experience to build our data platform...</p>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold bg-emerald-600 text-white py-3 rounded-xl shadow-sm">
              <Check className="w-4 h-4" /> Accept &amp; Create Pipeline
            </button>
            <button className="flex items-center justify-center gap-1.5 text-sm font-medium bg-white text-gray-500 py-3 px-5 rounded-xl border border-gray-200">
              <X className="w-4 h-4" /> Pass
            </button>
          </div>
        </div>
      ),
    },
  ];

  const f = features[activeTab];

  return (
    <section id="features" className="py-24 px-6 bg-gray-50/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Everything you need to place more candidates
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Stop juggling spreadsheets and email. Every tool your firm needs in one platform.
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {features.map((feat, i) => (
            <button
              key={feat.tab}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                i === activeTab
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-200 hover:text-indigo-600"
              }`}
            >
              <feat.icon className="w-4 h-4" />
              {feat.tab}
            </button>
          ))}
        </div>

        {/* Feature content */}
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* Text */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                <f.icon className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{f.title}</h3>
            </div>
            <p className="text-gray-600 leading-relaxed mb-6 text-[15px]">{f.desc}</p>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {f.bullets.map((b) => (
                <div key={b} className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-emerald-600" />
                  </div>
                  <span className="text-sm text-gray-700">{b}</span>
                </div>
              ))}
            </div>
            <Link href="/register" className="inline-flex items-center gap-2 text-indigo-600 font-semibold hover:text-indigo-700 transition group">
              Try it free <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Mockup */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-red-400 rounded-full" />
              <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full" />
              <div className="w-2.5 h-2.5 bg-green-400 rounded-full" />
            </div>
            <div className="p-6">{f.mockup}</div>
          </div>
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
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Two Sides, One Platform</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Built for everyone in the hiring process</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">Recruiters run the pipeline. Clients collaborate in real time. Everyone wins.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Recruiter */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-3xl opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-xl transition-all duration-500 h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                  <Briefcase className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">For Recruiting Firms</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-extrabold text-indigo-600">From $15</span>
                    <span className="text-sm text-gray-400">/seat/month</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3 mb-8">
                {[
                  { icon: Layers, text: "Drag-and-drop Kanban pipeline" },
                  { icon: Users, text: "Full candidate database with search" },
                  { icon: Building2, text: "Client & deal management CRM" },
                  { icon: Send, text: "Shareable candidate shortlists" },
                  { icon: DollarSign, text: "Placement & fee tracking" },
                  { icon: Sparkles, text: "AI resume parsing & bulk import" },
                  { icon: Inbox, text: "Incoming job requests from clients" },
                  { icon: BarChart3, text: "Dashboard with charts & insights" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-indigo-600" />
                    </div>
                    <span className="text-sm text-gray-700">{text}</span>
                  </div>
                ))}
              </div>
              <Link href="/register" className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-xl">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Client */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-3xl opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-xl transition-all duration-500 h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">For Hiring Companies</h3>
                  <p className="text-sm text-gray-500">Collaborate with your recruiting firms in one portal.</p>
                </div>
              </div>
              <div className="space-y-3 mb-8">
                {[
                  { icon: FileText, text: "Post job descriptions & requirements" },
                  { icon: Search, text: "Find and invite recruiting firms" },
                  { icon: Eye, text: "Review candidate profiles & resumes" },
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
              <Link href="/client-portal/login" className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3.5 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 hover:shadow-xl">
                Open Client Portal <ArrowRight className="w-4 h-4" />
              </Link>
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
    { num: "01", title: "Sign up in 2 minutes", desc: "Create your firm, invite your team, set up your default pipeline stages.", icon: Zap, color: "from-indigo-500 to-violet-500" },
    { num: "02", title: "Add your data", desc: "Import candidates from CSV, parse resumes with AI, or add manually. Set up clients and open searches.", icon: Upload, color: "from-blue-500 to-indigo-500" },
    { num: "03", title: "Work your pipeline", desc: "Drag candidates through stages. Share shortlists with clients. Collect real-time feedback.", icon: MousePointerClick, color: "from-violet-500 to-purple-500" },
    { num: "04", title: "Close placements", desc: "Track fees, record placements, and grow revenue. Analytics show you what&apos;s working.", icon: CircleDollarSign, color: "from-emerald-500 to-teal-500" },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 bg-gray-50/50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Up and running in minutes, not weeks</h2>
          <p className="text-lg text-gray-500">No implementation calls. No consultants. Just sign up and go.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <div key={s.num} className="relative group">
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-10 left-[calc(100%+2px)] w-[calc(100%-72px)] h-0.5 bg-gradient-to-r from-indigo-200 to-transparent z-10" />
              )}
              <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-xl hover:border-gray-200 transition-all duration-300 h-full hover:-translate-y-1">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-3xl font-black bg-gradient-to-br from-indigo-600 to-violet-600 bg-clip-text text-transparent">{s.num}</span>
                  <div className={`w-11 h-11 bg-gradient-to-br ${s.color} rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
                    <s.icon className="w-5 h-5 text-white" />
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

// ─── COMPARISON TABLE ───
function Comparison() {
  const feats = [
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
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Comparison</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">10x the value at 1/10th the price</h2>
          <p className="text-lg text-gray-500">All the features of enterprise ATS platforms. None of the bloat.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="grid grid-cols-4 border-b border-gray-200 bg-gray-50">
            <div className="p-4 col-span-1" />
            <div className="p-4 text-center border-l border-gray-200 bg-indigo-50/50">
              <div className="flex items-center justify-center gap-2">
                <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                  <Briefcase className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-bold text-gray-900">Recruiting ATS</span>
              </div>
              <p className="text-xs text-indigo-600 font-bold mt-1">From $15/seat/mo</p>
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
          {feats.map((feature, i) => (
            <div key={feature} className={`grid grid-cols-4 ${i < feats.length - 1 ? "border-b border-gray-100" : ""}`}>
              <div className="p-3.5 text-sm text-gray-700">{feature}</div>
              <div className="p-3.5 flex justify-center border-l border-gray-100 bg-indigo-50/20">
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
          {/* Savings row (vs Team tier at $19/seat/mo) */}
          <div className="grid grid-cols-4 border-t-2 border-indigo-200 bg-indigo-50/30">
            <div className="p-4 text-sm font-bold text-gray-900">You save per seat</div>
            <div className="p-4 text-center border-l border-indigo-100">
              <span className="text-sm font-extrabold text-indigo-600">—</span>
            </div>
            <div className="p-4 text-center border-l border-indigo-100">
              <span className="text-sm font-extrabold text-emerald-600">$80/mo</span>
            </div>
            <div className="p-4 text-center border-l border-indigo-100">
              <span className="text-sm font-extrabold text-emerald-600">$100/mo</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── PRICING ───
function Pricing() {
  const recruiterFeatures = [
    "Unlimited candidates & jobs",
    "Visual drag-and-drop pipeline",
    "Client collaboration portal",
    "AI resume parsing",
    "Client marketplace access",
    "Placement & fee tracking",
    "Bulk import & export",
  ];

  return (
    <section id="pricing" className="py-24 px-6 bg-gray-50/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Simple pricing. No surprises.</h2>
          <p className="text-lg text-gray-500">Solo for one-person firms. Team when you grow.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-3xl mx-auto">
          {/* Solo */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden flex flex-col">
            <div className="bg-gray-900 text-white text-center py-2.5 text-sm font-semibold">
              5-day trial &middot; Credit card required
            </div>
            <div className="p-8 flex flex-col flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Solo</h3>
              <p className="text-sm text-gray-500 mb-4">For independent recruiters.</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-5xl font-extrabold text-gray-900">$15</span>
                <span className="text-gray-400 font-medium">/ seat / month</span>
              </div>
              <p className="text-sm text-gray-400 mb-8">1 seat &middot; Billed monthly.</p>
              <div className="space-y-3 mb-8 flex-1">
                {recruiterFeatures.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-gray-700" />
                    </div>
                    <span className="text-sm text-gray-700">{f}</span>
                  </div>
                ))}
              </div>
              <Link href="/register" className="block w-full text-center bg-gray-900 text-white font-semibold py-3.5 rounded-xl hover:bg-gray-800 transition-all shadow-md">
                Start Free Trial
              </Link>
            </div>
          </div>

          {/* Team (highlighted) */}
          <div className="relative flex flex-col">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-3xl blur-lg opacity-20" />
            <div className="relative bg-white rounded-2xl border border-indigo-200 shadow-xl overflow-hidden flex flex-col flex-1">
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-center py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                Most popular &middot; 5-day trial
              </div>
              <div className="p-8 flex flex-col flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Team</h3>
                <p className="text-sm text-gray-500 mb-4">For growing recruiting firms.</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-extrabold text-gray-900">$19</span>
                  <span className="text-gray-400 font-medium">/ seat / month</span>
                </div>
                <p className="text-sm text-gray-400 mb-8">2–10 seats &middot; Billed monthly.</p>
                <div className="space-y-3 mb-8 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-indigo-600" />
                    </div>
                    <span className="text-sm font-semibold text-gray-800">Everything in Solo, plus:</span>
                  </div>
                  {[
                    "Team management & roles",
                    "@mentions and shared notes",
                    "Multi-recruiter assignments",
                    "Per-recruiter performance dashboards",
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
                <Link href="/register" className="block w-full text-center bg-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-xl">
                  Start Free Trial
                </Link>
              </div>
            </div>
          </div>

        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          Need more than 10 seats?{" "}
          <a href="mailto:hello@recruitingats.com" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Talk to us
          </a>{" "}
          about a custom plan.
        </p>
      </div>
    </section>
  );
}

// ─── THE MATH (dedicated section) ───
function TheMath() {
  return (
    <section id="the-math" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-indigo-200/50">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />

          <div className="relative p-10 md:p-16 text-white">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20 uppercase tracking-widest mb-5">
                <CircleDollarSign className="w-3.5 h-3.5" />
                The Math
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">
                One placement covers <br className="hidden sm:block" />
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-white to-indigo-100 bg-clip-text text-transparent">
                    21 years
                  </span>
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                    <path d="M2 8C50 2 100 2 150 6C200 10 250 4 298 8" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </span>{" "}
                of Recruiting ATS
              </h2>
              <p className="text-indigo-100 text-base md:text-lg max-w-2xl mx-auto">
                One placement. Two decades. The math isn&apos;t hard.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 md:gap-6 mb-10">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 text-center">
                <p className="text-[11px] uppercase tracking-widest text-indigo-200 mb-2 font-semibold">Avg. placement fee</p>
                <p className="text-3xl md:text-4xl font-extrabold">$25,000</p>
                <p className="text-xs text-indigo-200 mt-1">Industry average</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 text-center">
                <p className="text-[11px] uppercase tracking-widest text-indigo-200 mb-2 font-semibold">Your cost</p>
                <p className="text-3xl md:text-4xl font-extrabold">$95</p>
                <p className="text-xs text-indigo-200 mt-1">/ month, Team plan (5 seats)</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-400 to-emerald-500 border border-emerald-300/40 rounded-2xl p-6 text-center shadow-lg shadow-emerald-500/20">
                <p className="text-[11px] uppercase tracking-widest text-white/90 mb-2 font-semibold">Months covered</p>
                <p className="text-3xl md:text-4xl font-extrabold text-white">263</p>
                <p className="text-xs text-white/80 mt-1">= 21+ years</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 md:p-6 text-center max-w-3xl mx-auto">
              <p className="text-indigo-50 text-sm md:text-base leading-relaxed">
                <span className="font-bold text-white">If Recruiting ATS helps you close one extra placement</span>{" "}
                — ever — the ROI pays for the whole team. For years.
              </p>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 bg-white text-indigo-700 font-semibold text-base px-7 py-3.5 rounded-xl hover:bg-indigo-50 transition-all shadow-lg hover:-translate-y-0.5"
              >
                Start your 5-day trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── EARLY ACCESS ───
function EarlyAccess() {
  const perks = [
    {
      icon: MessageSquare,
      title: "Direct line to the team",
      desc: "Feedback reaches us the same day. Bugs get fixed in hours, not sprint cycles. Your feature request goes straight to the roadmap.",
    },
    {
      icon: Zap,
      title: "We ship every week",
      desc: "New improvements land every week based on what our first users actually need. You help shape what comes next.",
    },
    {
      icon: Award,
      title: "Early-adopter pricing",
      desc: "Lock in $10/user/month today. When we raise prices later, your account stays grandfathered — no surprises.",
    },
  ];

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Early Access</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            You&apos;re early. We think that&apos;s a good thing.
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Recruiting ATS is a new platform. No inflated testimonials, no fake logos.
            We&apos;d rather build it with you than pretend we&apos;re something we&apos;re not.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {perks.map((p) => (
            <div
              key={p.title}
              className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-5">
                <p.icon className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">{p.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">{p.desc}</p>
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
    { q: "How does the free trial work?", a: "You get 5 days of full access to try Recruiting ATS. A credit card is required at signup — we won't charge you until the trial ends. Solo is $15/seat/month (1 seat) and Team is $19/seat/month (2–10 seats). Cancel any time before the trial ends and you won't be billed." },
    { q: "Can I import data from my current ATS?", a: "Yes. We support CSV and JSON imports for candidates, clients, and jobs. We have templates for Bullhorn, Zoho, Lever, Greenhouse, Loxo, and Ashby exports." },
    { q: "How does the client portal work?", a: "You generate a shareable link for each client/job. Clients see candidate profiles (with salary info redacted), rate them, leave comments, and download resumes. Or they can sign up to manage all their searches in one place." },
    { q: "Is my data secure?", a: "Yes. All data is encrypted in transit (TLS) and at rest. We run on managed Postgres (Neon) with per-organization isolation. We&apos;re not SOC 2 certified yet — that&apos;s on the roadmap, and we&apos;ll be transparent about it when we are." },
    { q: "What happens when I cancel?", a: "You can export all your data anytime. When you cancel, you retain read-only access through your billing period end. We never hold your data hostage." },
  ];

  return (
    <section className="py-24 px-6 bg-gray-50/50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Common questions</h2>
        </div>

        <div className="space-y-3">
          {questions.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full text-left px-6 py-4 flex items-center justify-between gap-4">
                <span className="font-semibold text-gray-900 text-[15px]">{item.q}</span>
                <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && (
                <div className="px-6 pb-5">
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
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

          <div className="relative py-20 px-8 text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 text-white/90 text-sm font-medium px-4 py-2 rounded-full mb-6 backdrop-blur-sm border border-white/10">
              <Sparkles className="w-4 h-4" />
              Early access is open
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
              Ready to close more<br />placements, faster?
            </h2>
            <p className="text-indigo-200 max-w-xl mx-auto mb-10 text-lg">
              Start your 5-day trial today. Cancel any time before it ends and you won&apos;t be charged.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="group inline-flex items-center justify-center gap-2 bg-white text-indigo-700 font-bold text-lg px-8 py-4 rounded-xl hover:bg-indigo-50 transition-all shadow-xl hover:-translate-y-0.5"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/client-portal/login"
                className="inline-flex items-center justify-center gap-2 text-white/90 border-2 border-white/20 font-semibold text-lg px-8 py-4 rounded-xl hover:bg-white/10 transition-all hover:-translate-y-0.5"
              >
                <Building2 className="w-5 h-5" />
                I&apos;m Hiring
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FOOTER ───
function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">Recruiting ATS</span>
        </div>
        <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} Recruiting ATS. All rights reserved.</p>
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">Sign In</Link>
          <Link href="/register" className="text-sm text-gray-500 hover:text-gray-700">Register</Link>
          <Link href="/client-portal/login" className="text-sm text-gray-500 hover:text-gray-700">Client Portal</Link>
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-700">Privacy</Link>
          <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-700">Terms</Link>
        </div>
      </div>
    </footer>
  );
}

// ─── PAGE ───
export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <TrustBar />
      <PainSolution />
      <Features />
      <TwoSides />
      <HowItWorks />
      <Comparison />
      <TheMath />
      <Pricing />
      <EarlyAccess />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
