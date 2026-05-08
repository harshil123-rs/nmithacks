/**
 * Claymorphic search input — no native browser styling.
 *
 * - Magnifying-glass icon on the left.
 * - Clear button (X) appears when there's text.
 * - Internal debouncing: the parent receives `onChange` either eagerly on
 *   every keystroke OR debounced via `debounceMs`. Defaults to 250ms which
 *   feels snappy without spamming the server.
 * - "/" hotkey to focus from anywhere on the page (gh-style).
 *
 * Used by the audit-log surface initially; reusable for future pages.
 */
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface SearchInputProps {
  /** Controlled value. */
  value: string;
  /** Called when the debounced value settles. */
  onChange: (next: string) => void;
  placeholder?: string;
  /** Debounce window in ms. Default 250. Set 0 to disable. */
  debounceMs?: number;
  /** Visual size — matches Button/Select primitives. Default "md". */
  size?: "sm" | "md";
  /** Tailwind classes for the wrapper. */
  className?: string;
  /** Whether the "/" hotkey focuses this input. Default true. */
  hotkey?: boolean;
  ariaLabel?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  debounceMs = 250,
  size = "md",
  className = "",
  hotkey = true,
  ariaLabel,
}: SearchInputProps) {
  // We keep our own local state so typing feels instant; the parent only
  // sees the value after the debounce window settles. When the parent
  // pushes a new external value (e.g. clearing all filters), we sync.
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== local) setLocal(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (debounceMs === 0) {
      if (local !== value) onChange(local);
      return;
    }
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, debounceMs]);

  // "/" anywhere on the page focuses the search input — unless the user is
  // already typing in a text field.
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName.toLowerCase();
      const editable = (t as HTMLElement).isContentEditable;
      if (tag === "input" || tag === "textarea" || tag === "select" || editable) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkey]);

  const sizing =
    size === "sm" ? "py-1.5 text-xs pl-7 pr-7" : "py-2 text-sm pl-9 pr-9";
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const iconLeft = size === "sm" ? "left-2.5" : "left-3";
  const iconRight = size === "sm" ? "right-2" : "right-2.5";

  return (
    <div className={`relative inline-block ${className}`}>
      <Search
        className={`absolute top-1/2 -translate-y-1/2 ${iconLeft} ${iconSize} text-muted-foreground/60 pointer-events-none`}
      />
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && local !== "") {
            setLocal("");
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        spellCheck={false}
        className={`clay-pressed w-full ${sizing} font-sans bg-transparent text-foreground placeholder:text-muted-foreground/40 focus:outline-none`}
        style={{ borderRadius: "12px" }}
      />
      {local !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setLocal("");
            onChange("");
            inputRef.current?.focus();
          }}
          className={`absolute top-1/2 -translate-y-1/2 ${iconRight} p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors`}
        >
          <X className={iconSize} />
        </button>
      )}
    </div>
  );
}
