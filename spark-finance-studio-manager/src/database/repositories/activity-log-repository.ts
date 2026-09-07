/**
 * ActivityLogRepository: Immutable System Audit Trail Logging.
 */

import { IDatabaseDriver } from '../driver/types';
import {
  ActivityLogRecord,
  CreateActivityLogInput,
} from '../../domain/models/activity-log';
import { assertNonEmptyString } from '../../domain/rules/invariants';

export interface ActivityLogFilter {
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
}

export class ActivityLogRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async log(input: CreateActivityLogInput): Promise<ActivityLogRecord> {
    const id = crypto.randomUUID();
    const action = assertNonEmptyString(input.action, 'action');
    const entityType = assertNonEmptyString(input.entityType, 'entityType');
    const entityId = assertNonEmptyString(input.entityId, 'entityId');
    const timestamp = new Date().toISOString();
    const payloadJson = input.payload ? JSON.stringify(input.payload) : null;

    await this.driver.execute(
      `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [id, action, entityType, entityId, timestamp, input.note ?? null, payloadJson]
    );

    return {
      id,
      action,
      entityType,
      entityId,
      timestamp,
      note: input.note ?? null,
      payloadJson,
    };
  }

  public async list(filter?: ActivityLogFilter): Promise<ActivityLogRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.entityType) {
      conditions.push('entity_type = ?');
      params.push(filter.entityType);
    }
    if (filter?.entityId) {
      conditions.push('entity_id = ?');
      params.push(filter.entityId);
    }
    if (filter?.action) {
      conditions.push('action = ?');
      params.push(filter.action);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filter?.limit ? `LIMIT ${filter.limit}` : 'LIMIT 100';

    const rows = await this.driver.query<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      timestamp: string;
      note: string | null;
      payload_json: string | null;
    }>(
      `SELECT id, action, entity_type, entity_id, timestamp, note, payload_json
       FROM activity_log ${whereClause} ORDER BY timestamp DESC ${limitClause};`,
      params
    );

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      timestamp: r.timestamp,
      note: r.note,
      payloadJson: r.payload_json,
    }));
  }
}
