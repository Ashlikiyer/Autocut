import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardsHtml, cardsJobSchema } from "../src/cards.ts";

const job = cardsJobSchema.parse({
  width: 1080,
  height: 1920,
  theme: { panel: "#141A26", accent: "#FFC93C", text: "#FFFFFF" },
  cards: [
    { kind: "hook", text: "24/7 AI <editor>", accent: "AI", sticker: "NO COURSE NEEDED", duration: 2.9 },
    { kind: "pill", text: "₱0 · WALANG PAID COURSE", duration: 3 },
    { kind: "step", text: "Download Claude", label: "STEP 1", duration: 3.2 },
    { kind: "focus", text: "Sharingan method", duration: 2.2 },
  ],
});

test("lays cards back to back and follows the HyperFrames contract", () => {
  const { html, segments, duration } = buildCardsHtml(job);
  assert.deepEqual(segments, [
    { offset: 0, duration: 2.9 },
    { offset: 3, duration: 3 },
    { offset: 6.1, duration: 3.2 },
    { offset: 9.4, duration: 2.2 },
  ]);
  assert.equal(duration, 11.6);
  assert.match(html, /data-composition-id="main"/);
  assert.match(html, /window\.__timelines\["main"\] = tl/);
  assert.match(html, /gsap\.timeline\(\{ paused: true \}\)/);
  assert.equal((html.match(/class="clip /g) ?? []).length, 4);
  assert.doesNotMatch(html, /Math\.random|Date\.now|repeat:\s*-1/);
  assert.match(html, /&lt;EDITOR&gt;/, "user text is escaped");
  assert.match(html, /background:transparent/);
});

test("rejects unknown kinds and extra fields", () => {
  assert.equal(cardsJobSchema.safeParse({ ...job, cards: [{ kind: "video", text: "x", duration: 2 }] }).success, false);
  assert.equal(cardsJobSchema.safeParse({ ...job, extra: 1 }).success, false);
});
