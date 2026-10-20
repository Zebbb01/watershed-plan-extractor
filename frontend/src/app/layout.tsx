import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { connection } from 'next/server';
import { Droplets } from 'lucide-react';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Watershed Plan Extractor', template: '%s · Watershed Plan Extractor' },
  description:
    'Turns watershed plan PDFs into verified goals, BMPs, activities, monitoring, outreach and areas, with page-level evidence.',
  robots: { index: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Render per request so each page carries the nonce the proxy put in its CSP header.
  await connection();
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-control focus:bg-white focus:px-3 focus:py-2 focus:shadow-overlay"
        >
          Skip to content
        </a>
        <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2.5 rounded-control font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-primary-600"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-panel bg-primary-600 text-white">
                <Droplets className="size-4" aria-hidden />
              </span>
              <span className="truncate text-[15px] tracking-tight">Watershed Plan Extractor</span>
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1 text-[13px] font-medium text-slate-600">
              <Link
                href="/accuracy"
                className="rounded-control px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                Accuracy
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
