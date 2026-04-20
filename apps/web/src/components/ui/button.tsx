import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * V2 Button — Linear-inspired compact.
 * Size default = md (h-8 32px). Bỏ orange primary, dùng blue-500.
 * GIỮ backward-compat variant name `default` / `danger` / `destructive`.
 */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150 ease-out focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-300",
        primary:
          "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-300",
        secondary:
          "bg-zinc-100 text-zinc-900 border border-zinc-200 hover:bg-zinc-200 active:bg-zinc-300",
        outline:
          "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 hover:border-zinc-400 active:bg-zinc-100",
        ghost:
          "bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200",
        danger:
          "bg-red-500 text-white hover:bg-red-600 active:bg-red-700 disabled:bg-red-300",
        destructive:
          "bg-red-500 text-white hover:bg-red-600 active:bg-red-700 disabled:bg-red-300",
        link:
          "bg-transparent text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline active:text-blue-800",
      },
      size: {
        xs: "h-6 px-2 text-xs", // 24px
        sm: "h-7 px-2.5 text-sm", // 28px
        md: "h-8 px-3 text-base", // 32px — default V2
        default: "h-8 px-3 text-base", // alias md cho back-compat V1
        lg: "h-11 px-4 text-md", // 44px — PWA touch
        icon: "h-8 w-8", // 32px square
        "icon-sm": "h-7 w-7", // 28px square
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
