/**
 * Claymorphic button. Wraps the existing `.clay-btn-*` classes from
 * index.css and adds size + loading state.
 *
 * Variants:
 *  - primary  → indigo gradient (CTA)
 *  - ghost    → dark clay surface (secondary)
 *  - accent   → yellow gradient (rare emphasis)
 *  - destructive → coral gradient (delete)
 *  - subtle   → flat hover-only (table rows, list items)
 */
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "ghost" | "accent" | "destructive" | "subtle";
type Size = "sm" | "md" | "lg";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  iconPosition?: "left" | "right";
}

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

const VARIANTS: Record<Variant, string> = {
  primary: "clay-btn clay-btn-primary",
  ghost: "clay-btn clay-btn-ghost",
  accent: "clay-btn clay-btn-accent",
  destructive: "clay-btn clay-btn-destructive",
  subtle:
    "rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors",
};

// Inline declaration for clay-btn-destructive so it stays consistent with the
// other gradient buttons. We add it via a plain CSS class would be cleaner,
// but since index.css doesn't define one, we hand-roll it here.
const DESTRUCTIVE_INLINE: React.CSSProperties = {
  background: "linear-gradient(145deg, #f87171, #ef4444)",
  color: "#000",
  border: "1px solid rgba(255,255,255,0.15)",
  boxShadow:
    "6px 6px 16px rgba(0,0,0,0.5), -3px -3px 10px rgba(248,113,113,0.1), inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 3px rgba(0,0,0,0.2)",
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon: Icon,
    iconPosition = "left",
    children,
    className = "",
    disabled,
    style,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const inlineStyle =
    variant === "destructive" ? { ...DESTRUCTIVE_INLINE, ...style } : style;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      style={inlineStyle}
      className={`${VARIANTS[variant]} ${SIZES[size]} inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none whitespace-nowrap ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      {!loading && Icon && iconPosition === "left" && (
        <Icon className="w-3.5 h-3.5 shrink-0" />
      )}
      {children && <span>{children}</span>}
      {!loading && Icon && iconPosition === "right" && (
        <Icon className="w-3.5 h-3.5 shrink-0" />
      )}
    </button>
  );
});

export default Button;
