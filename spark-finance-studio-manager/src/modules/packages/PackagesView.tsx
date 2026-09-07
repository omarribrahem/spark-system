import React, { useState } from 'react';
import { Package, ShoppingBag, Video } from 'lucide-react';
import { ClientPackagesList } from './ClientPackagesList';
import { PackageTemplatesList } from './PackageTemplatesList';
import { PackageTemplateWithItems } from './package-service';

export type PackagesMainTab = 'client_packages' | 'templates' | 'reels';

export interface PackagesViewProps {
  onRequestNewPackage?: boolean;
  onResetNewPackageRequest?: () => void;
  onRequestNewReel?: boolean;
  onResetNewReelRequest?: () => void;
  renderReelsKanban?: () => React.ReactNode;
  onOpenHeaderForm?: (mode: "form-package-buy" | "form-package-template" | "form-reel") => void;
}

export const PackagesView: React.FC<PackagesViewProps> = ({
  onRequestNewPackage,
  onResetNewPackageRequest,
  renderReelsKanban,
  onOpenHeaderForm,
}) => {
  const [activeTab, setActiveTab] = useState<PackagesMainTab>('client_packages');
  const [templateToSell, setTemplateToSell] = useState<PackageTemplateWithItems | null>(null);
  const [triggerPurchaseModal, setTriggerPurchaseModal] = useState<boolean>(false);

  const handleSellTemplate = (template: PackageTemplateWithItems) => {
    setTemplateToSell(template);
    setActiveTab('client_packages');
    setTriggerPurchaseModal(true);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Sub-navigation Capsule Tabs */}
      <div className="inline-flex items-center gap-1.5 p-1.5 bg-white border border-[#E5E5E5] rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <button
          type="button"
          onClick={() => setActiveTab('client_packages')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
            activeTab === 'client_packages'
              ? 'bg-[#004AC6] text-white shadow-sm'
              : 'text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-50'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>باقات العملاء</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
            activeTab === 'templates'
              ? 'bg-[#004AC6] text-white shadow-sm'
              : 'text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-50'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>قوالب الباقات</span>
        </button>

        {renderReelsKanban && (
          <button
            type="button"
            onClick={() => setActiveTab('reels')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
              activeTab === 'reels'
                ? 'bg-[#004AC6] text-white shadow-sm'
                : 'text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-50'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>إنتاج الريلز</span>
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'client_packages' && (
        <ClientPackagesList
          onRequestNewPurchase={onRequestNewPackage || triggerPurchaseModal}
          onResetNewPurchaseRequest={() => {
            setTriggerPurchaseModal(false);
            if (onResetNewPackageRequest) onResetNewPackageRequest();
          }}
          initialTemplate={templateToSell}
          onOpenHeaderForm={onOpenHeaderForm ? () => onOpenHeaderForm('form-package-buy') : undefined}
        />
      )}

      {activeTab === 'templates' && (
        <PackageTemplatesList
          onSellTemplate={handleSellTemplate}
          onOpenHeaderForm={onOpenHeaderForm ? () => onOpenHeaderForm('form-package-template') : undefined}
        />
      )}

      {activeTab === 'reels' && renderReelsKanban && renderReelsKanban()}
    </div>
  );
};

export default PackagesView;
