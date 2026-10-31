import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

/**
 * Drop-in replacement for a native <select> whose list ALWAYS opens beneath the field
 * (a native select flips upward near the bottom of the screen). Same props as <select>:
 * value, onChange(e) with e.target.value, disabled, className, aria-label, <option> children.
 * The list is rendered in a portal so table/overflow containers can't clip it, and the page
 * scrolls down if needed so the whole list is visible.
 */
type Opt = { value: string; label: ReactNode; text: string; disabled?: boolean };
type Props = {
  value?: string | number | null;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
  name?: string;
};

function collect(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<any>;
    if (el.type === "option") {
      const label = el.props.children;
      const text = Children.toArray(label).map(String).join("");
      out.push({ value: String(el.props.value ?? text), label, text, disabled: el.props.disabled });
    } else if (el.props?.children) collect(el.props.children, out);
  });
  return out;
}

const PANEL_MAX = 288; // px (max-h-72)

export function DropSelect({ value, onChange, disabled, className = "", children, name, ...rest }: Props) {
  const opts = collect(children);
  const current = String(value ?? "");
  const selected = opts.find((o) => o.value === current) ?? opts[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX, width: r.width });
  }, []);

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, opts.findIndex((o) => o.value === current)));
    place();
    setOpen(true);
  };
  const close = (focus = true) => { setOpen(false); if (focus) btnRef.current?.focus(); };
  const choose = (o: Opt) => {
    if (o.disabled) return;
    close();
    if (o.value !== current) onChange?.({ target: { value: o.value } });
  };

  // Keep the list under the field while anything scrolls; scroll the page so the list fits below.
  useLayoutEffect(() => {
    if (!open) return;
    const r = btnRef.current?.getBoundingClientRect();
    const h = Math.min(panelRef.current?.scrollHeight ?? PANEL_MAX, PANEL_MAX);
    if (r && r.bottom + h + 8 > window.innerHeight) window.scrollBy({ top: r.bottom + h + 8 - window.innerHeight });
    place();
    panelRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) close(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") { close(e.key === "Escape"); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(opts.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === "Home") { e.preventDefault(); setActive(0); }
    if (e.key === "End") { e.preventDefault(); setActive(opts.length - 1); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (opts[active]) choose(opts[active]); }
  };

  return (
    <>
      <button
        ref={btnRef} type="button" name={name} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-label={rest["aria-label"]}
        onClick={() => (open ? close() : openList())} onKeyDown={onKey}
        className={`${className} inline-flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown size={14} className={`shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={panelRef} role="listbox"
          style={{ position: "absolute", top: pos.top, left: pos.left, minWidth: pos.width, maxHeight: PANEL_MAX }}
          className="z-[100] overflow-y-auto border border-border bg-popover text-popover-foreground shadow-lg py-1 text-sm"
        >
          {opts.map((o, i) => (
            <li
              key={o.value + i} role="option" aria-selected={o.value === current} data-active={i === active}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}
              className={`px-3 py-1.5 whitespace-nowrap cursor-pointer ${o.disabled ? "opacity-40 cursor-not-allowed" : ""} ${i === active ? "bg-secondary/20" : ""} ${o.value === current ? "text-primary font-medium" : ""}`}
            >
              {o.label}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
