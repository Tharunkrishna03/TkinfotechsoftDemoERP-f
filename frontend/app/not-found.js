"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center max-w-md w-full">
        <div className="w-full max-w-[240px] mb-6">
          <img 
            src="/notfound.jpg" 
            alt="Page not found" 
            className="w-full h-auto object-contain"
          />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Page Not Found</h1>
        <p className="text-slate-500 mb-8 text-base">
          Sorry, we couldn't find the page you're looking for. It might have been removed or the URL might be incorrect.
        </p>
        <Link 
          href="/dashboard" 
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors duration-200 w-full inline-flex justify-center items-center"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
