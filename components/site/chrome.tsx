"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** Orange rounded square with a diamond: the AutoCut mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-5 place-items-center rounded-[5px] bg-primary", className)} aria-hidden>
      <span className="size-1.5 rotate-45 bg-background" />
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em]">
      <LogoMark />
      AutoCut
    </Link>
  );
}

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/#faq", label: "FAQ" },
];

/** The editor draws its own header (with the steps), so the site one steps aside there. */
const inApp = (path: string | null) => path?.startsWith("/edit") ?? false;

export function SiteHeader() {
  const path = usePathname();
  if (inApp(path)) return null;
  return (
    <header className="sticky top-0 z-20 border-b border-white/[.06] bg-background/80 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[1fr_auto] items-center gap-6 px-4 py-3.5 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
        <Logo />
        <nav className="hidden gap-6 text-[13px] whitespace-nowrap md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-[#a1a1a8] transition-colors hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex justify-end">
          <Link href="/edit" className={buttonVariants({ variant: "secondary", size: "lg", className: "border-white/10 px-3.5" })}>
            Upload video
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const path = usePathname();
  if (inApp(path)) return null;
  return (
    <footer className="border-t border-white/[.06]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-7 font-mono text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-ghost">© 2026 AutoCut · Ashley Kier Ferreol</p>
        <nav className="flex flex-wrap gap-5 text-subtle" aria-label="Footer">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/#faq" className="hover:text-foreground">FAQ</Link>
          <Link href="/credits" className="hover:text-foreground">Credits</Link>
        </nav>
      </div>
    </footer>
  );
}
