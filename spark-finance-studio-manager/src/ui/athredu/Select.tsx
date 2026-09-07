import React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (val: string) => void;
  placeholder?: string;
  options: SelectOption[];
  className?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onValueChange,
  placeholder = "اختر خياراً...",
  options,
  className = "",
  disabled = false,
}) => {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={`h-11 w-full px-4 rounded-full bg-white border border-[#E5E5E5] text-[#1A1A1A] flex items-center justify-between text-xs font-semibold hover:border-gray-300 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all ${className}`}
        dir="rtl"
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 min-w-[10rem] overflow-hidden rounded-2xl bg-white/95 backdrop-blur-2xl border border-[#E5E5E5] shadow-2xl p-1.5 animate-in fade-in-80"
          position="popper"
          sideOffset={6}
          dir="rtl"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center justify-between h-9 px-3 rounded-xl text-xs font-medium text-[#1A1A1A] hover:bg-neutral-100 hover:text-black focus:bg-blue-50 focus:text-[#004AC6] focus:outline-none select-none cursor-pointer transition-colors"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="w-3.5 h-3.5 text-[#004AC6] mr-2" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};
