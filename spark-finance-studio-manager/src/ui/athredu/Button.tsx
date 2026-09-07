import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-95 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#004AC6] text-white shadow-md shadow-blue-600/15 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5",
        brand:
          "bg-[#004AC6] text-white shadow-md shadow-blue-600/15 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5",
        brandSoft:
          "bg-blue-50 text-[#004AC6] border border-blue-100 hover:bg-blue-100/70",
        destructive:
          "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
        outline:
          "border border-[#E5E5E5] bg-white text-[#1A1A1A] shadow-sm hover:bg-neutral-50 hover:border-gray-300",
        secondary:
          "bg-neutral-100 text-[#1A1A1A] hover:bg-neutral-200",
        ghost:
          "text-[#4A4A4A] hover:bg-neutral-100 hover:text-[#1A1A1A]",
        soft:
          "bg-[#F1F4FA] text-[#414956] hover:bg-[#E6E9F0]",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10 shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${buttonVariants({ variant, size })} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ml-2" />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
