import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { itemVariants, popoverVariants, springBouncy, springSnappy, tap } from "../lib/motion";

export function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <motion.section variants={itemVariants} className={`card p-5 ${className}`}>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{title}</h3>
      <div className="flex flex-col gap-1">{children}</div>
    </motion.section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-xl px-2 py-1.5">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        {hint && <div className="text-[11.5px] text-mute">{hint}</div>}
      </div>
      <div className="w-[min(58%,280px)] shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean;
}) {
  return (
    <motion.button
      type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-45"
    >
      <motion.span
        className="relative h-6 w-11 shrink-0 rounded-full border border-white/5"
        animate={{ backgroundColor: checked ? "#7c8cff" : "#232a37" }}
        transition={{ duration: 0.2 }}
      >
        <motion.span
          className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md"
          animate={{ x: checked ? 20 : 0, scale: 1 }}
          whileTap={{ scaleX: 1.25 }}
          transition={springBouncy}
        />
      </motion.span>
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint && <span className="block text-[11.5px] text-mute">{hint}</span>}
      </span>
    </motion.button>
  );
}

export interface Option<T> { value: T; label: string }

/** AnimatePresence only tracks real elements, so the portal lives inside a component. */
function BodyPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

export function Select<T extends string | number>({ value, options, onChange, disabled }: {
  value: T; options: Option<T>[]; onChange: (v: T) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    const close = (e: Event) => !list.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const reveal = useRef(false);
  useEffect(() => {
    if (!open || !reveal.current) return;
    reveal.current = false;
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active, pos]);

  const toggle = () => {
    if (disabled) return;
    if (!open && root.current) {
      // The list is portaled to <body> and positioned from the button so it can never grow or scroll its container.
      const rect = root.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const flip = below < 200 && above > below;
      setUp(flip);
      setPos({
        left: rect.left, width: rect.width, maxHeight: Math.max(120, Math.min(320, (flip ? above : below) - 6)),
        ...(flip ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      });
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
      reveal.current = true;
    }
    setOpen(!open);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return toggle();
      reveal.current = true;
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    }
    if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      onChange(options[active].value);
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <motion.button
        type="button" disabled={disabled} onClick={toggle} whileTap={disabled ? undefined : tap}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={id} data-open={open}
        className="field flex h-9 w-full items-center justify-between gap-2 px-3 text-left text-[13px]"
      >
        <span className="truncate">{current?.label ?? String(value)}</span>
        <motion.svg width="12" height="12" viewBox="0 0 12 12" animate={{ rotate: open ? 180 : 0 }} transition={springBouncy} className="shrink-0 text-mute">
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.button>
      <AnimatePresence>
        {open && pos && (
          <BodyPortal key="list">
          <motion.ul
            ref={list}
            id={id} role="listbox" variants={popoverVariants} initial="initial" animate="animate" exit="exit"
            style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, transformOrigin: up ? "bottom" : "top" }}
            className="no-scrollbar z-[90] overflow-y-auto rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/60"
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)} role="option" aria-selected={o.value === value} data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] ${i === active ? "bg-white/[0.07]" : ""} ${o.value === value ? "text-accent" : "text-ink"}`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <span className="text-accent">✓</span>}
              </li>
            ))}
          </motion.ul>
          </BodyPortal>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Stepper({ value, onChange, min, max, step = 1 }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = () => {
    const n = Number.parseInt(text, 10);
    const next = Number.isFinite(n) ? clamp(n) : value;
    setText(String(next));
    if (next !== value) onChange(next);
  };
  const btn = "grid h-7 w-7 place-items-center rounded-lg text-mute transition-colors hover:bg-white/10 hover:text-ink disabled:opacity-30";
  return (
    <div className="field flex h-9 items-center gap-1 px-1.5">
      <input
        inputMode="numeric" value={text} aria-label="value"
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()}
        className="min-w-0 flex-1 bg-transparent px-1.5 text-[13px] outline-none"
      />
      <motion.button type="button" whileTap={tap} transition={springSnappy} className={btn} disabled={value <= min} onClick={() => onChange(clamp(value - step))} aria-label="decrease">−</motion.button>
      <motion.button type="button" whileTap={tap} transition={springSnappy} className={btn} disabled={value >= max} onClick={() => onChange(clamp(value + step))} aria-label="increase">+</motion.button>
    </div>
  );
}

export function TextField({ value, onChange, disabled, maxLength, placeholder, invalid }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; maxLength?: number; placeholder?: string; invalid?: boolean;
}) {
  return (
    <input
      value={value} disabled={disabled} maxLength={maxLength} placeholder={placeholder} spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
      className={`field h-9 w-full px-3 text-[13px] ${invalid ? "!border-bad" : ""}`}
    />
  );
}

export function Progress({ value, indeterminate }: { value: number; indeterminate?: boolean }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
      {indeterminate ? (
        <motion.div key="indeterminate" className="h-full w-1/3 rounded-full bg-gradient-to-r from-accent to-accent-2" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }} />
      ) : (
        <motion.div key="determinate" className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" initial={false} animate={{ width: `${Math.round(value * 100)}%` }} transition={{ type: "spring", stiffness: 220, damping: 24 }} />
      )}
    </div>
  );
}

export function Button({ children, onClick, variant = "ghost", disabled, className = "" }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "danger"; disabled?: boolean; className?: string;
}) {
  const styles = {
    primary: "btn-primary",
    ghost: "border border-line bg-white/[0.03] text-ink hover:bg-white/[0.08]",
    danger: "border border-bad/30 bg-bad/10 text-bad hover:bg-bad/20",
  }[variant];
  return (
    <motion.button
      type="button" onClick={onClick} disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.04 }} whileTap={disabled ? undefined : tap} transition={springBouncy}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </motion.button>
  );
}
