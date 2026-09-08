import { IDatabaseDriver } from '../driver/types';
import { assertNonEmptyString } from '../../domain/rules/invariants';

export function inferMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'mp4': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    default: return 'application/octet-stream';
  }
}

export interface AttachmentRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  sha256: string;
  created_at: string;
}

export interface SaveAttachmentInput {
  entityType: string;
  entityId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  sha256?: string;
}

export class AttachmentRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async listForEntity(entityType: string, entityId: string): Promise<AttachmentRecord[]> {
    return await this.driver.query<AttachmentRecord>(
      `SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC;`,
      [entityType, entityId]
    );
  }

  public async listAll(limit = 100): Promise<AttachmentRecord[]> {
    return await this.driver.query<AttachmentRecord>(
      `SELECT * FROM attachments ORDER BY created_at DESC LIMIT ?;`,
      [limit]
    );
  }

  public async saveAttachment(input: SaveAttachmentInput): Promise<AttachmentRecord> {
    assertNonEmptyString(input.entityType, 'entityType');
    assertNonEmptyString(input.entityId, 'entityId');
    assertNonEmptyString(input.fileName, 'fileName');

    const id = `att-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const sha256 = input.sha256 ?? 'pending_hash';

    await this.driver.execute(
      `INSERT INTO attachments (
        id, entity_type, entity_id, file_name, file_path, file_size, mime_type, sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        input.entityType,
        input.entityId,
        input.fileName.trim(),
        input.filePath.trim(),
        input.fileSize,
        input.mimeType,
        sha256,
        now,
      ]
    );

    const rows = await this.driver.query<AttachmentRecord>(
      `SELECT * FROM attachments WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows[0];
  }

  public async deleteAttachment(id: string): Promise<void> {
    await this.driver.execute(`DELETE FROM attachments WHERE id = ?;`, [id]);
  }
}
