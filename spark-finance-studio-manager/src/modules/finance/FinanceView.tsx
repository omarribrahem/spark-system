import React, { useState } from "react";
import { Wallet, ReceiptText } from "lucide-react";
import { PaymentsList } from "./PaymentsList";
import { ExpensesList } from "./ExpensesList";

export type FinanceTab = "payments" | "expenses";

export interface FinanceViewProps {
  onRequestNewPayment?: boolean;
  onResetNewPaymentRequest?: () => void;
  onRequestNewExpense?: boolean;
  onResetNewExpenseRequest?: () => void;
  onOpenHeaderForm?: (mode: "form-payment" | "form-expense") => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  onRequestNewPayment,
  onResetNewPaymentRequest,
  onRequestNewExpense,
  onResetNewExpenseRequest,
  onOpenHeaderForm,
}) => {
  const [activeTab, setActiveTab] = useState<FinanceTab>("payments");

  return (
    <div className="space-y-6" dir="rtl">
      {/* Sub-navigation Tabs (ATHREDU Capsule Pill Switcher) */}
      <div className="flex items-center gap-2 p-1 rounded-full bg-neutral-200/50 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full transition-all select-none ${
            activeTab === "payments"
              ? "bg-white text-[#1A1A1A] shadow-sm font-bold"
              : "text-[#707070] hover:text-[#1A1A1A]"
          }`}
        >
          <Wallet className="w-3.5 h-3.5 text-emerald-600" />
          <span>المقبوضات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("expenses")}
          className={`flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full transition-all select-none ${
            activeTab === "expenses"
              ? "bg-white text-[#1A1A1A] shadow-sm font-bold"
              : "text-[#707070] hover:text-[#1A1A1A]"
          }`}
        >
          <ReceiptText className="w-3.5 h-3.5 text-blue-600" />
          <span>المصروفات</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "payments" ? (
        <PaymentsList
          onRequestNewPayment={onRequestNewPayment}
          onResetNewPaymentRequest={onResetNewPaymentRequest}
          onOpenHeaderForm={onOpenHeaderForm ? () => onOpenHeaderForm("form-payment") : undefined}
        />
      ) : (
        <ExpensesList
          onRequestNewExpense={onRequestNewExpense}
          onResetNewExpenseRequest={onResetNewExpenseRequest}
          onOpenHeaderForm={onOpenHeaderForm ? () => onOpenHeaderForm("form-expense") : undefined}
        />
      )}
    </div>
  );
};
