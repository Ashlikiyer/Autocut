"use client";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/** Building blocks shared by the upload → style → processing → preview screens. */

/** "02 / 04" above each screen's title. */
export function StepLabel({ n, extra }: { n: number; extra?: string }) {
  return (
    <p className="font-mono text-[11px] font-medium text-primary">
      {String(n).padStart(2, "0")} / 04{extra ? ` · ${extra}` : ""}
    </p>
  );
}

export function ScreenTitle({ step, title, subtitle, extra }: { step: number; title: React.ReactNode; subtitle?: React.ReactNode; extra?: string }) {
  return (
    <header className="flex flex-col gap-4">
      <StepLabel n={step} extra={extra} />
      <h1 className="m-0 text-[clamp(32px,4vw,42px)] leading-[1.05] font-medium tracking-[-0.035em]">{title}</h1>
      {subtitle && <p className="text-[15px] text-[#a1a1a8]">{subtitle}</p>}
    </header>
  );
}

/** Tiny mono uppercase label above a group of controls. */
export function GroupLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[10.5px] tracking-[.14em] text-faint uppercase", className)}>{children}</p>;
}

/** Pill-ish chip used for single and multiple choice. */
export function Chip({
  on,
  onClick,
  disabled,
  children,
  role = "radio",
  small,
  className,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  role?: "radio" | "checkbox";
  small?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-[7px] border font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45",
        small ? "px-2.5 py-1.5 text-[12.5px]" : "px-3.5 py-2 text-[13px]",
        on
          ? "border-foreground bg-foreground text-background"
          : "border-white/[.09] bg-[#141416] text-subtle hover:border-white/20 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {children}
    </div>
  );
}

/** A full-width row with a label (and hint) on the left and a switch on the right. */
export function ToggleLine({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-6 border-b border-white/[.06] py-4", className)}>
      <label htmlFor={id} className="flex min-w-0 flex-col gap-1">
        <span className="text-[15px] font-medium">{label}</span>
        {hint && <span className="font-mono text-[11.5px] text-faint">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Dark panel with the design's hairline border. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[10px] border border-white/[.07] bg-[#111113]", className)}>{children}</div>;
}
