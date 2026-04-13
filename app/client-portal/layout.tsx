import { Briefcase } from "lucide-react";

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Gradient accent line */}
      <div className="h-0.5 bg-gradient-to-r from-indigo-600 to-violet-600" />

      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-indigo-600 text-white">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                Client Portal
              </h1>
              <p className="text-xs text-gray-500 leading-tight">
                Manage your hiring pipeline
              </p>
            </div>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">
            Powered by <span className="font-semibold text-gray-500">RecruitPro</span>
          </span>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            This link is private. Please do not share externally.
          </p>
          <p className="text-xs text-gray-400">
            Powered by{" "}
            <span className="font-semibold text-indigo-600">RecruitPro</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
