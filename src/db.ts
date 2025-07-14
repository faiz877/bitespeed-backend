import { Pool, PoolClient } from "pg";
import { Contact } from "./types";
import "dotenv/config";

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432", 10),
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

export class PostgresDBClient {
  async transaction<T>(
    callback: (trxClient: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("DB Transaction rolled back:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  async findContacts(
    client: PoolClient,
    email: string | null | undefined,
    phoneNumber: string | null | undefined
  ): Promise<Contact[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (email) {
      conditions.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (phoneNumber) {
      conditions.push(`"phoneNumber" = $${paramIndex++}`);
      params.push(phoneNumber);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE (${conditions.join(" OR ")}) AND "deletedAt" IS NULL`
        : `WHERE 1=0`;

    const query = `
            SELECT id, "phoneNumber", email, "linkedId", "linkPrecedence", "createdAt", "updatedAt", "deletedAt"
            FROM Contact
            ${whereClause}
            ORDER BY "createdAt" ASC;
        `;
    const res = await client.query<Contact>(query, params);
    return res.rows;
  }

  async createContact(
    client: PoolClient,
    data: Omit<Contact, "id" | "createdAt" | "updatedAt" | "deletedAt">
  ): Promise<Contact> {
    const query = `
            INSERT INTO Contact ("phoneNumber", email, "linkedId", "linkPrecedence")
            VALUES ($1, $2, $3, $4)
            RETURNING id, "phoneNumber", email, "linkedId", "linkPrecedence", "createdAt", "updatedAt", "deletedAt";
        `;
    const values = [
      data.phoneNumber,
      data.email,
      data.linkedId,
      data.linkPrecedence,
    ];
    const res = await client.query<Contact>(query, values);
    console.log("DB: Contact created:", res.rows[0].id);
    return res.rows[0];
  }

  async updateContacts(
    client: PoolClient,
    ids: number[],
    data: Partial<Omit<Contact, "id" | "createdAt" | "updatedAt" | "deletedAt">>
  ): Promise<void> {
    if (ids.length === 0 || Object.keys(data).length === 0) {
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.linkPrecedence) {
      setClauses.push(`"linkPrecedence" = $${paramIndex++}`);
      params.push(data.linkPrecedence);
    }
    if (data.linkedId !== undefined) {
      setClauses.push(`"linkedId" = $${paramIndex++}`);
      params.push(data.linkedId);
    }

    setClauses.push(`"updatedAt" = NOW()`);
    params.push(...ids);

    const idPlaceholders = ids.map((_, i) => `$${paramIndex + i}`).join(",");

    const query = `
            UPDATE Contact
            SET ${setClauses.join(", ")}
            WHERE id IN (${idPlaceholders});
        `;
    await client.query(query, params);
    console.log("DB: Contacts updated:", ids);
  }

  async findById(client: PoolClient, id: number): Promise<Contact | undefined> {
    const query = `
            SELECT id, "phoneNumber", email, "linkedId", "linkPrecedence", "createdAt", "updatedAt", "deletedAt"
            FROM Contact
            WHERE id = $1 AND "deletedAt" IS NULL;
        `;
    const res = await client.query<Contact>(query, [id]);
    return res.rows[0];
  }

  async findByLinkedId(
    client: PoolClient,
    linkedId: number
  ): Promise<Contact[]> {
    const query = `
            SELECT id, "phoneNumber", email, "linkedId", "linkPrecedence", "createdAt", "updatedAt", "deletedAt"
            FROM Contact
            WHERE "linkedId" = $1 AND "deletedAt" IS NULL;
        `;
    const res = await client.query<Contact>(query, [linkedId]);
    return res.rows;
  }

  async queryAllLinkedContacts(
    client: PoolClient,
    primaryId: number
  ): Promise<Contact[]> {
    const query = `
            SELECT id, "phoneNumber", email, "linkedId", "linkPrecedence", "createdAt", "updatedAt", "deletedAt"
            FROM Contact
            WHERE (id = $1 OR "linkedId" = $1) AND "deletedAt" IS NULL
            ORDER BY "createdAt" ASC;
        `;
    const res = await client.query<Contact>(query, [primaryId]);
    return res.rows;
  }
}

export const db = new PostgresDBClient();
