import { IDatabaseDriver } from '../harness/test-database';

export interface ClientData {
  id?: string;
  name: string;
  company_name?: string;
  phone?: string;
  secondary_phone?: string;
  status?: 'active' | 'inactive';
  notes?: string;
}

export class ClientFixture {
  constructor(private driver: IDatabaseDriver) {}

  public async create(data: ClientData): Promise<string> {
    const id = data.id || `client_${Math.random().toString(36).substring(2, 9)}`;
    await this.driver.execute(
      `INSERT INTO clients (id, name, company_name, phone, secondary_phone, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.company_name || null,
        data.phone || '+201000000000',
        data.secondary_phone || null,
        data.status || 'active',
        data.notes || null,
      ]
    );
    return id;
  }

  public async getById(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.driver.query<Record<string, unknown>>('SELECT * FROM clients WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }
}
