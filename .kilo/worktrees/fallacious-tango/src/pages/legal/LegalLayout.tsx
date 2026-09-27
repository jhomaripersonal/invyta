import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import webAppLogo from "../../assets/webApp-logo-mark.png";
import { LEGAL_INFO } from "../../data/legal";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  white: "#FFFFFF",
};

// Shared shell for the Privacy Policy and Terms pages: plain, readable
// long-form text with a header back to the site.
export default function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  const { hash } = useLocation();

  // Honor in-page anchors like /privacy#cookies (the landing footer's
  // "Cookies" link) — the router doesn't scroll to them on its own.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.cream, color: T.charcoal }}>
      <header className="h-16 px-5 md:px-8 flex items-center justify-between" style={{ backgroundColor: T.white, borderBottom: `1px solid ${T.border}` }}>
        <Link to="/">
          <img src={webAppLogo} alt="Invyta" className="h-9 w-auto" />
        </Link>
        <nav className="flex items-center gap-5 text-sm" style={{ color: T.muted }}>
          <Link to="/privacy" className="hover:underline">Privacy</Link>
          <Link to="/terms" className="hover:underline">Terms</Link>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-5 md:px-8 py-12">
        <h1 className="text-3xl font-bold mb-2" style={{ letterSpacing: "-0.025em" }}>{title}</h1>
        <p className="text-sm mb-10" style={{ color: T.muted }}>Last updated {LEGAL_INFO.lastUpdated}</p>
        <div className="legal-body text-[15px] leading-relaxed space-y-4">{children}</div>
      </main>
    </div>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return <h2 id={id} className="text-lg font-semibold pt-6 scroll-mt-6">{children}</h2>;
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}
