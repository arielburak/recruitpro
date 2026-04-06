import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center">
        <p className="text-7xl font-extrabold text-indigo-600">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-4">Page not found</h1>
        <p className="text-gray-500 mt-2 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <Link
            href="/dashboard"
            className="bg-indigo-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="text-gray-700 font-medium px-6 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
