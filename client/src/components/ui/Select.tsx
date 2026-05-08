/**
 * Custom claymorphic select. Matches the dashboard's design language —
 * no native <select> chrome.
 *
 * - Click to open, click outside or Escape to close.
 * - Arrow keys navigate options, Enter selects.
 * - Renders the menu as a portal-free absolute element below the trigger,
 *   which is fine because every dashboard page scrolls inside its own
 *   container.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional icon component (lucide). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Optional Tailwind classes applied to the option label color. */
  className?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** Trigger size. Default = "md". */
  size?: "sm" | "md";
  /** Optional Tailwind classes for the trigger button. */
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export default function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Select…",
  size = "md",
  className = "",
  ariaLabel,
  disabled = false,
}: SelectProps<T>) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const opt = options[activeIdx];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
          buttonRef.current?.focus();
        }
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, activeIdx, options, onChange]);

  const triggerSize =
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-2 text-sm";

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setActiveIdx(
            Math.max(
              0,
              options.findIndex((o) => o.value === value),
            ),
          );
        }}
        className={`clay-sm ${triggerSize} rounded-xl flex items-center gap-2 hover:scale-[1.01] active:scale-100 transition-transform disabled:opacity-50 disabled:cursor-not-allowed text-foreground/90 ${selected?.className ?? ""}`}
      >
        {selected?.icon && (
          <selected.icon className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-labelledby={id}
          className="clay-lg absolute z-50 mt-2 min-w-full max-h-72 overflow-y-auto p-1.5"
          style={{ borderRadius: "16px" }}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIdx;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                  isActive ? "bg-white/[0.04]" : ""
                } ${opt.className ?? "text-foreground/90"}`}
              >
                {opt.icon && <opt.icon className="w-3.5 h-3.5 shrink-0" />}
                <span className="flex-1 truncate">{opt.label}</span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
