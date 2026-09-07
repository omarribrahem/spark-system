import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
}

export const Card: React.FC<CardProps> = ({
  className = "",
  glass = true,
  children,
  ...props
}) => {
  return (
    <div
      className={`rounded-[2rem] p-6 transition-all duration-200 border border-[#E5E5E5] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-gray-300 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export interface MotionCardProps extends HTMLMotionProps<"div"> {
  glass?: boolean;
}

export const MotionCard: React.FC<MotionCardProps> = ({
  className = "",
  children,
  ...props
}) => {
  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={`rounded-[2rem] p-6 transition-all duration-200 border border-[#E5E5E5] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-gray-300 ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};
