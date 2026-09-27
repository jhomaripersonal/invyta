import { useId, useState, type InputHTMLAttributes } from "react";

// Shared form pieces for the sign-in, sign-up and password pages: visible
// labels (placeholders vanish while typing and aren't read reliably by
// screen readers), autofill hints so phones and password managers can
// fill or suggest, and a show/hide toggle for passwords.

export const AUTH_T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  white: "#FFFFFF",
  // 5.4:1 on white — readable at small sizes (the old #E55757 was 3.6:1).
  error: "#B42318",
};

const inputClass = "w-full px-4 py-3 rounded-xl text-sm outline-none";
const inputStyle = { border: `1px solid ${AUTH_T.border}`, backgroundColor: AUTH_T.cream, color: AUTH_T.charcoal };

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "style"> & { label: string };

export function AuthField({ label, ...input }: FieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1.5" style={{ color: AUTH_T.charcoal }}>
        {label}
      </label>
      <input id={id} className={inputClass} style={inputStyle} {...input} />
    </div>
  );
}

export function PasswordField({ label, ...input }: Omit<FieldProps, "type">) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1.5" style={{ color: AUTH_T.charcoal }}>
        {label}
      </label>
      <div className="relative">
        <input id={id} type={visible ? "text" : "password"} className={`${inputClass} pr-16`} style={inputStyle} {...input} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-stone-100"
          style={{ color: AUTH_T.muted }}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

// role="alert" so screen readers announce it when it appears.
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-xs leading-relaxed" style={{ color: AUTH_T.error }}>
      {children}
    </p>
  );
}

export const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
  </svg>
);
