import { useEffect, useRef, useState } from "react";
import type { ResolvedTheme } from "./theme";
import { VIDEO_PLAY_EVENT } from "./media-events";

// Background music (Pro) for the public invitation. Browsers block
// autoplay with sound, so it starts on the guest's first tap anywhere —
// usually opening the envelope — and the floating button pauses or resumes
// it at any time. Nothing is downloaded until it plays (preload="none"),
// which matters on mobile data. Sits below the envelope gate (z-50), so it
// appears once the invitation is open.
// `bottom` lifts the button clear of anything else pinned to the bottom of
// the page (the sample invitation's call-to-action bar).
export default function MusicPlayer({ url, title, theme, bottom = "1rem" }: { url: string; title?: string; theme: ResolvedTheme; bottom?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Once the guest has used the button, the first-tap autostart is off.
  const touched = useRef(false);

  useEffect(() => {
    const start = (e: Event) => {
      if (touched.current || buttonRef.current?.contains(e.target as Node)) return;
      touched.current = true;
      audioRef.current?.play().catch(() => {
        // Blocked or unsupported: the button is still there to try again.
      });
      remove();
    };
    const events = ["click", "touchend", "keydown"] as const;
    const remove = () => events.forEach((name) => document.removeEventListener(name, start, true));
    events.forEach((name) => document.addEventListener(name, start, true));
    return remove;
  }, []);

  // A guest starting one of the invitation's videos wants to hear it, not
  // this — pause (they can resume from the button) and don't autostart.
  useEffect(() => {
    const onVideo = () => {
      touched.current = true;
      audioRef.current?.pause();
    };
    window.addEventListener(VIDEO_PLAY_EVENT, onVideo);
    return () => window.removeEventListener(VIDEO_PLAY_EVENT, onVideo);
  }, []);

  // Don't keep playing in a background tab.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) audioRef.current?.pause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  function toggle() {
    touched.current = true;
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setFailed(false);
      audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }

  const label = playing ? `Pause music${title ? `: ${title}` : ""}` : `Play music${title ? `: ${title}` : ""}`;

  return (
    <>
      <audio
        ref={audioRef}
        src={url}
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-pressed={playing}
        title={failed ? "Couldn't play the music — tap to try again" : label}
        className="fixed z-40 right-4 w-11 h-11 rounded-full flex items-center justify-center transition-transform hover:scale-105"
        style={{
          bottom: `calc(${bottom} + env(safe-area-inset-bottom, 0px))`,
          backgroundColor: theme.palette.primary,
          color: theme.palette.onPrimary,
          boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
        }}
      >
        {playing ? (
          // Animated bars while playing, so it reads as "music is on".
          <span className="flex items-end gap-[3px] h-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-[3px] rounded-full invyta-music-bar" style={{ backgroundColor: "currentColor", animationDelay: `${i * 0.18}s` }} />
            ))}
          </span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        )}
      </button>
    </>
  );
}
