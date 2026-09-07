import React from "react";

export interface UserAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  size = "md",
  className = "",
}) => {
  const getInitials = (str: string) => {
    if (!str) return "S";
    const parts = str.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base font-bold",
  };

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold bg-neutral-100 border border-[#E5E5E5] text-[#1A1A1A] select-none ${sizeClasses[size]} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
