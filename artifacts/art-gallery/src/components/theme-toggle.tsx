import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`inline-flex items-center justify-center w-8 h-8 border border-border/60 text-foreground/60 hover:text-secondary hover:border-secondary transition-colors ${className}`}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
