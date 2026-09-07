/**
 * Repairs the timestamp triggers installed by migration 001.
 *
 * Version 001 originally used a self-update condition that could recurse when
 * SQLite's recursive triggers pragma is enabled. New installations receive the
 * corrected definitions from 001; this migration applies the same correction
 * to databases created before that fix.
 */
const updatedAtTrigger = (trigger: string, table: string): string => `
DROP TRIGGER IF EXISTS ${trigger};
CREATE TRIGGER ${trigger} AFTER UPDATE ON ${table}
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
  UPDATE ${table}
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;`;

export const REPAIR_UPDATED_AT_TRIGGERS_SQL = [
  ['trg_clients_updated_at', 'clients'],
  ['trg_marketing_contracts_updated_at', 'marketing_contracts'],
  ['trg_subscriptions_updated_at', 'subscriptions'],
  ['trg_website_projects_updated_at', 'website_projects'],
  ['trg_client_packages_updated_at', 'client_packages'],
  ['trg_studio_bookings_updated_at', 'studio_bookings'],
  ['trg_reel_items_updated_at', 'reel_items'],
  ['trg_marketing_monthly_dues_updated_at', 'marketing_monthly_dues'],
  ['trg_subscription_monthly_dues_updated_at', 'subscription_monthly_dues'],
].map(([trigger, table]) => updatedAtTrigger(trigger, table)).join('\n');
