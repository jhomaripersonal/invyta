// Screenshots the launch post images (src/pages/LaunchMockup.tsx) to PNG,
// using the Chrome installed on this machine.
//
//   pnpm dev            (in another terminal, if it isn't running)
//   pnpm mockups        → launch-mockups/<badge>/<format>.png
//
// MOCKUP_BASE_URL overrides where the dev server is (default
// http://localhost:8443). MOCKUP_URL sets the address shown in the call to
// action (default invytaph.sbs).
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const BASE = process.env.MOCKUP_BASE_URL ?? "http://localhost:8443";
const CTA_URL = process.env.MOCKUP_URL ?? "invytaph.sbs";
const FORMATS = { portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], link: [1200, 630] };
const BADGES = { "launching-soon": "Launching soon", "now-live": "Now live" };

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const [folder, badge] of Object.entries(BADGES)) {
    await mkdir(`launch-mockups/${folder}`, { recursive: true });
    for (const [format, [width, height]] of Object.entries(FORMATS)) {
      // Reduced motion keeps the invitations still, showing their covers.
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      const query = new URLSearchParams({ format, badge, url: CTA_URL });
      await page.goto(`${BASE}/launch-mockup?${query}`, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
      });
      // Let the invitation sections finish fading in.
      await page.waitForTimeout(1500);
      const path = `launch-mockups/${folder}/${format}.png`;
      await page.screenshot({ path });
      console.log(`  ${path}  (${width}×${height})`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
