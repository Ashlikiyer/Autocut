"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Big two-line statement whose words light up one by one as it scrolls into
 * view ("Cuts, captions, motion. / One upload.").
 */
export function ScrollReveal({ lines }: { lines: { words: string[]; serif?: boolean }[] }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [p, setP] = useState(0);
  const total = lines.reduce((n, l) => n + l.words.length, 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        setP(Math.max(0, Math.min(1, (vh * 0.92 - r.top) / (vh * 0.5))));
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  let i = 0;
  return (
    <h2 ref={ref} className="m-0 text-center">
      {lines.map((line, li) => (
        <span
          key={li}
          className={
            line.serif
              ? "block font-serif text-[clamp(44px,6.5vw,84px)] leading-[1] font-normal italic tracking-[-0.01em]"
              : "block text-[clamp(44px,6.5vw,84px)] leading-[1.02] font-medium tracking-[-0.04em]"
          }
        >
          {line.words.map((w) => {
            const k = i++;
            const lit = p > (k + 0.5) / total;
            return (
              <span
                key={k}
                className="transition-colors duration-300"
                style={{ color: lit ? (line.serif ? "#a1a1a8" : "#ededee") : "#26262a" }}
              >
                {w}{" "}
              </span>
            );
          })}
        </span>
      ))}
    </h2>
  );
}
