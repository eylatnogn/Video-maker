import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Maker",
  description: "Turn your photos into singing and dancing videos of you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold text-base">
              Video Maker
            </Link>
            <Link href="/personas/new" className="text-muted hover:text-foreground">
              New persona
            </Link>
            <Link href="/templates" className="text-muted hover:text-foreground">
              Templates
            </Link>
            <Link href="/generate" className="ml-auto rounded bg-accent px-3 py-1.5 font-medium text-white">
              Generate
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
