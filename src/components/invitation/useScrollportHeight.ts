import { useEffect, useState } from "react";

// The visible height of a scrolling container, kept up to date as it
// resizes — as a CSS length for SectionList's `screenHeight`. The Story
// and Split layouts size panels to "one screen", which inside the
// builder's preview pane or a preview modal is that pane's height, not
// the browser window's (a Split cover sized to the window would push its
// bottom-aligned title out of view).
//
// Returns a callback ref rather than taking a ref object, so it still
// works when the container mounts after the first render (the builder
// only renders its preview pane once the event has loaded).
export function useScrollportHeight(): [(el: HTMLElement | null) => void, string | undefined] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<string>();
  useEffect(() => {
    if (!el) return;
    const update = () => setHeight(`${el.clientHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, height];
}
