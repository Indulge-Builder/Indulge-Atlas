import EliaSidePanel from "@/components/elia/EliaSidePanel";
import EliaMobilePrototype from "@/components/elia/EliaMobilePrototype";

export default function EliaPreviewPage() {
  return (
    <div
      className="relative min-h-screen"
      style={{ background: "radial-gradient(ellipse at 30% 20%, #2A2520 0%, #1A1814 55%, #0A0908 100%)" }}
    >
      {/* Ambient gold glows */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 75%, rgba(212,175,55,0.07) 0%, transparent 45%), radial-gradient(circle at 85% 20%, rgba(212,175,55,0.05) 0%, transparent 40%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-16 px-8 py-16">

        {/* ── Section: Mobile Prototype ── */}
        <section className="flex flex-col items-center gap-5">
          <PreviewLabel>ELIA MOBILE · FLOATING OVERLAY · PROTOTYPE</PreviewLabel>
          <EliaMobilePrototype />
          <PreviewCaption>iPhone 15 Pro · 393 × 852 · Atlas Mobile CRM</PreviewCaption>
        </section>

        {/* ── Divider ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", maxWidth: 760 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(212,175,55,0.12)" }} />
          <span style={{ fontSize: 9, color: "rgba(212,175,55,0.3)", letterSpacing: "0.18em", fontFamily: "sans-serif", fontWeight: 600 }}>
            ELIA PRODUCT SUITE
          </span>
          <div style={{ flex: 1, height: 1, background: "rgba(212,175,55,0.12)" }} />
        </div>

        {/* ── Section: Chrome Side Panel ── */}
        <section className="flex flex-col items-center gap-5">
          <PreviewLabel>ELIA CHROME EXTENSION · SIDE PANEL · PREVIEW</PreviewLabel>
          <EliaSidePanel />
          <PreviewCaption>Side panel · 380px fixed width · Indulge Global</PreviewCaption>
        </section>

      </div>
    </div>
  );
}

function PreviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 40, height: 1, background: "rgba(212,175,55,0.3)" }} />
      <p style={{
        fontSize: 10, letterSpacing: "0.14em",
        color: "rgba(212,175,55,0.6)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        fontWeight: 600,
      }}>
        {children}
      </p>
      <div style={{ width: 40, height: 1, background: "rgba(212,175,55,0.3)" }} />
    </div>
  );
}

function PreviewCaption({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, color: "rgba(255,255,255,0.22)",
      letterSpacing: "0.06em",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    }}>
      {children}
    </p>
  );
}
