import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const UI_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

type Props = Omit<React.ComponentProps<"input">, "type"> & {
  /** "ui" = same look as <Input>; "raw" = use only the className given. */
  variant?: "ui" | "raw";
  wrapperClassName?: string;
};

/** Password field with a show/hide (eye) button. */
export const PasswordInput = React.forwardRef<HTMLInputElement, Props>(
  ({ className, variant = "ui", wrapperClassName, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <div className={cn("relative", wrapperClassName ?? "w-full")}>
        <input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn(variant === "ui" ? UI_CLASS : "", className, "pr-10")}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-foreground/50 hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
