import { Link } from "react-router-dom";
import CreateEventWizard from "./CreateEventWizard";

const T = { accent: "#1C2942", cream: "#FAF8F5", border: "#E7E1D8" };

export default function CreateEventPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: T.cream }}>
      <header className="h-16 flex items-center px-6" style={{ borderBottom: `1px solid ${T.border}` }}>
        <Link to="/dashboard" className="text-2xl font-bold" style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: T.accent }}>
          Invyta
        </Link>
      </header>
      <main className="px-6 py-12">
        <CreateEventWizard />
      </main>
    </div>
  );
}
