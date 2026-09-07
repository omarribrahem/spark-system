import React, { useEffect, useState } from 'react';
import { AppShell } from './AppShell';
import { getDatabaseDriver } from '../database/driver';
import { runMigrations } from '../database/migrations';
import { LoadingSpinner, ActionableError } from '../ui/feedback';

export const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  const initApp = async () => {
    try {
      setInitError(null);
      setIsReady(false);
      // Initialize database driver and run pending migrations
      const driver = await getDatabaseDriver();
      await runMigrations(driver);
      setIsReady(true);
    } catch (err: any) {
      console.error('Failed to bootstrap database / migrations:', err);
      setInitError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  if (initError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center p-6 bg-surface-canvas" dir="rtl">
        <ActionableError
          title="فشل تهيئة قاعدة البيانات المحلية"
          message="تعذر تطبيق التحديثات الأولية على ملف قاعدة بيانات سبارك. يرجى إعادة المحاولة."
          error={initError}
          onRetry={initApp}
        />
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface-canvas" dir="rtl">
        <LoadingSpinner size="xl" label="جاري تهيئة قاعدة بيانات سبارك والتحقق من الجداول..." />
      </div>
    );
  }

  return <AppShell />;
};

export default App;
