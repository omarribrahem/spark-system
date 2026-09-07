import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export type IslandType = "success" | "error" | "warning" | "info";

export interface DynamicIslandProps {
  message: string | null;
  type?: IslandType;
  onClose?: () => void;
  duration?: number;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  message,
  type = "info",
  onClose,
  duration = 3500,
}) => {
  useEffect(() => {
    if (!message || !onClose) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, onClose, duration]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div className="fixed top-3 left-0 right-0 z-50 flex justify-center pointer-events-none px-4" dir="rtl">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.9 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 26,
            }}
            className="pointer-events-auto bg-slate-900/95 backdrop-blur-2xl text-white px-5 py-2.5 rounded-full shadow-island border border-white/15 flex items-center gap-3 max-w-md w-auto"
          >
            {getIcon()}
            <span className="text-xs md:text-sm font-medium tracking-wide flex-1 leading-snug">
              {message}
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-full active:scale-95"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
