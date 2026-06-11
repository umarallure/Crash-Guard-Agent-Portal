import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './legal.css';

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * LegalPage — shared dark-themed shell for the Privacy Policy and Terms pages.
 * Mirrors the sign-in page aesthetic so the legal documents feel like part of
 * the same branded experience.
 */
export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/auth" className="inline-flex items-center" aria-label="Accident Payments">
            <img src="/assets/logo.svg" alt="Accident Payments" className="h-7 w-auto" />
          </Link>
          <Link
            to="/auth"
            className="text-xs font-medium text-white/55 transition-colors hover:text-white"
          >
            ← Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/40">Agent Portal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-white/45">Last updated: {lastUpdated}</p>

        <div className="ap-legal mt-10">{children}</div>

        <footer className="mt-16 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Accident Payments. All rights reserved.</span>
          <span className="flex items-center gap-4">
            <Link to="/privacy-policy" className="transition-colors hover:text-white/70">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-white/70">
              Terms &amp; Conditions
            </Link>
            <Link to="/auth" className="transition-colors hover:text-white/70">
              Sign in
            </Link>
          </span>
        </footer>
      </main>
    </div>
  );
}

export default LegalPage;
