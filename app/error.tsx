"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center">
        <p className="text-7xl font-extrabold text-red-500">Oops</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-4">
          Something went wrong
        </h1>
        <p className="text-gray-500 mt-2 max-w-md">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="mt-8 bg-indigo-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
