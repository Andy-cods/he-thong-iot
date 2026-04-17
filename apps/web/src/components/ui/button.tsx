import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors duration-fast ease-industrial focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-cta text-white hover:bg-cta-hover active:bg-cta-press",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300",
        outline:
          "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
        ghost: "text-slate-900 hover:bg-slate-100",
        danger: "bg-danger text-white hover:bg-danger/90",
        link: "text-info underline-offset-2 hover:underline",
      },
      size: {
        default: "h-10 px-4 text-base",
        sm: "h-8 px-2 text-sm",
        lg: "h-12 px-5 text-lg", // PWA tap target 48px cho găng tay
        icon: "h-10 w-10",
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
