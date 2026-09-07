/**
 * AttachmentRepository: Persistence and Lookup for Receipts and Entity Documents.
 */

import { IDatabaseDriver } from '../driver/types';

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

export interface CreateAttachmentInput {
  id?: string;
  entityType: string;
  entityId: string;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  sha256?: string;
}

export function inferMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export class AttachmentRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async createAttachment(input: CreateAttachmentInput): Promise<AttachmentRecord> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const mimeType = input.mimeType ?? inferMimeType(input.filePath);
    const fileSize = input.fileSize ?? 0;
    const sha256 = input.sha256 ?? '';

    await this.driver.execute(
      `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_path, file_size, mime_type, sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [id, input.entityType, input.entityId, input.fileName, input.filePath, fileSize, mimeType, sha256, now]
    );

    return {
      id,
      entity_type: input.entityType,
      entity_id: input.entityId,
      file_name: input.fileName,
      file_path: input.filePath,
      file_size: fileSize,
      mime_type: mimeType,
      sha256,
      created_at: now,
    };
  }

  public async getById(id: string): Promise<AttachmentRecord | null> {
    const rows = await this.driver.query<AttachmentRecord>(
      `SELECT id, entity_type, entity_id, file_name, file_path, file_size, mime_type, sha256, created_at
       FROM attachments WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows[0] ?? null;
  }

  public async listByEntity(entityType: string, entityId: string): Promise<AttachmentRecord[]> {
    return await this.driver.query<AttachmentRecord>(
      `SELECT id, entity_type, entity_id, file_name, file_path, file_size, mime_type, sha256, created_at
       FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC;`,
      [entityType, entityId]
    );
  }

  public async delete(id: string): Promise<void> {
    await this.driver.execute(`DELETE FROM attachments WHERE id = ?;`, [id]);
  }
}
