/**
 * Claymorphic modal. Backdrop + centered card with the existing clay-lg surface.
 *
 * Closes on Escape, click on backdrop, or X button. Locks body scroll while
 * open. The card uses the same `clay-lg` shadow stack as the rest of the
 * dashboard so it feels native to this design system.
 */
import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Tailwind max-width class. Default = "max-w-lg". */
  maxWidth?: string;
  children: React.ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  maxWidth = "max-w-lg",
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className={`clay-lg w-full ${maxWidth} max-h-[85vh] overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              {typeof title === "string" ? (
                <h2 className="text-lg font-semibold tracking-tight truncate">
                  {title}
                </h2>
              ) : (
                title
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
