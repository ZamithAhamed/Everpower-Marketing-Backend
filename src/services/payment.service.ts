import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { pool } from '../config/db';


function getPool() {
  if (!pool) throw new Error('Database connection pool not initialized');
  return pool;
}

export class NotFoundError extends Error { status = 404; constructor(m='Payment not found'){ super(m);} }
function pad(n: number, len = 4) { return String(n).padStart(len, '0'); }

export async function create(data: {
  invoiceId: string; clientEmail?: string; amount: number;
  method: 'CASH'|'CARD'|'BANK_TRANSFER'|'ONLINE'|'CHEQUE'|'OTHER';
  status: 'PENDING'|'COMPLETED'|'FAILED'|'REFUNDED';
  date: string;
  reference?: string;
}) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const year = new Date().getFullYear();

    // Verify invoice & get client email/amount for auto-fill and paid-sync
    const [invRows] = await conn.execute(
      `SELECT id, client_email, amount, status FROM invoices WHERE id = :invoiceId FOR UPDATE`,
      { invoiceId: data.invoiceId }
    );
    const inv = Array.isArray(invRows) && (invRows[0] as any);
    if (!inv) throw new Error('Invoice not found');

    // Counter for PAY-YYYY-#### (safe under concurrency)
    const [ctrRows] = await conn.execute(
      `SELECT last_series FROM payment_counters WHERE year = :year FOR UPDATE`,
      { year }
    );
    let last = Array.isArray(ctrRows) && (ctrRows[0] as any)?.last_series as number | undefined;
    if (last === undefined) {
      await conn.execute(`INSERT INTO payment_counters (year, last_series) VALUES (:year, 0)`, { year });
      last = 0;
    }
    const series = Number(last ?? 0) + 1;
    await conn.execute(`UPDATE payment_counters SET last_series = :series WHERE year = :year`, { series, year });
    const id = `PAY-${year}-${pad(series)}`;

    await conn.execute(
        `INSERT INTO payments
        (id, year, series, invoice_id, client_email, amount, method, status, date, reference)
        VALUES
        (:id, :year, :series, :invoiceId, :clientEmail, :amount, :method, :status, :date, :reference)`,
        {
        id, year, series, invoiceId: data.invoiceId,
        clientEmail: data.clientEmail ?? inv.client_email,
        amount: data.amount, method: data.method, status: data.status,
        date: new Date(data.date),
        reference: data.reference ?? null, // NEW
        }
    );

    // Optional: auto-mark invoice PAID when fully covered by COMPLETED payments
    const [paidRows] = await conn.execute(
      `SELECT COALESCE(SUM(amount),0) AS paid
         FROM payments WHERE invoice_id = :invoiceId AND status = 'COMPLETED'`,
      { invoiceId: data.invoiceId }
    );
    const paid = Number((Array.isArray(paidRows) && (paidRows[0] as any)?.paid) ?? 0);
    const invAmount = Number(inv.amount);
    if (paid >= invAmount) {
      await conn.execute(
        `UPDATE invoices SET status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE id = :invoiceId`,
        { invoiceId: data.invoiceId }
      );
    }

    await conn.commit();
    const [row] = await pool.execute(`SELECT * FROM payments WHERE id = :id`, { id });
    return Array.isArray(row) ? row[0] : row;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getById(id: string) {
  const [rows] = await getPool().execute(`SELECT * FROM payments WHERE id = :id`, { id });
  const p = Array.isArray(rows) && rows[0];
  if (!p) throw new NotFoundError();
  return p;
}

export async function update(id: string, patch: Partial<{
  clientEmail: string; amount: number;
  method: 'CASH'|'CARD'|'BANK_TRANSFER'|'ONLINE'|'CHEQUE'|'OTHER';
  status: 'PENDING'|'COMPLETED'|'FAILED'|'REFUNDED'; date: string;
  reference?: string;
}>) {
  // Find invoice_id to resync totals after update
  const [pre] = await getPool().execute(`SELECT invoice_id FROM payments WHERE id = :id`, { id });
  const payment = Array.isArray(pre) && pre[0] as any;
  if (!payment) throw new NotFoundError();
  const invoiceId = payment.invoice_id;

  const sets: string[] = []; const params: Record<string, any> = { id };
  if (patch.clientEmail !== undefined) { sets.push(`client_email = :clientEmail`); params.clientEmail = patch.clientEmail; }
  if (patch.amount !== undefined)      { sets.push(`amount = :amount`); params.amount = patch.amount; }
  if (patch.method !== undefined)      { sets.push(`method = :method`); params.method = patch.method; }
  if (patch.reference !== undefined) { sets.push(`reference = :reference`); params.reference = patch.reference ?? null; }
  if (patch.status !== undefined)      { sets.push(`status = :status`); params.status = patch.status; }
  if (patch.date !== undefined)        { sets.push(`date = :date`); params.date = new Date(patch.date); }
  if (sets.length === 0) return getById(id);

  const [res] = await getPool().execute(
    `UPDATE payments SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id`, params
  );
  // @ts-ignore
  if (!res.affectedRows) throw new NotFoundError();

  // Re-sync invoice PAID flag
  const pool = getPool();
  const [[inv]]: any = await Promise.all([
    pool.query(`SELECT amount FROM invoices WHERE id = ?`, [invoiceId]),
  ]);
  const invAmount = inv?.[0]?.amount ? Number(inv[0].amount) : 0;
  const [paidRows] = await pool.execute(
    `SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = :invoiceId AND status = 'COMPLETED'`,
    { invoiceId }
  );
  const paid = Number((Array.isArray(paidRows) && (paidRows[0] as any)?.paid) ?? 0);
  if (invAmount) {
    await pool.execute(
      `UPDATE invoices SET status = :status WHERE id = :invoiceId`,
      { status: paid >= invAmount ? 'PAID' : 'PENDING', invoiceId }
    );
  }

  return getById(id);
}

export async function remove(id: string) {
  // find invoice_id first for resync
  const [pre] = await getPool().execute(`SELECT invoice_id FROM payments WHERE id = :id`, { id });
  const payment = Array.isArray(pre) && pre[0] as any;
  if (!payment) throw new NotFoundError();
  const invoiceId = payment.invoice_id;

  const [res] = await getPool().execute(`DELETE FROM payments WHERE id = :id`, { id });
  // @ts-ignore
  if (!res.affectedRows) throw new NotFoundError();

  // Re-sync invoice status
  const pool = getPool();
  const [[inv]]: any = await Promise.all([
    pool.query(`SELECT amount FROM invoices WHERE id = ?`, [invoiceId]),
  ]);
  const invAmount = inv?.[0]?.amount ? Number(inv[0].amount) : 0;
  const [paidRows] = await pool.execute(
    `SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = :invoiceId AND status = 'COMPLETED'`,
    { invoiceId }
  );
  const paid = Number((Array.isArray(paidRows) && (paidRows[0] as any)?.paid) ?? 0);
  if (invAmount) {
    await pool.execute(
      `UPDATE invoices SET status = :status WHERE id = :invoiceId`,
      { status: paid >= invAmount ? 'PAID' : 'PENDING', invoiceId }
    );
  }

  return { success: true };
}

export async function list(opts: {
  q?: string; invoiceId?: string;
  status?: 'PENDING'|'COMPLETED'|'FAILED'|'REFUNDED';
  method?: 'CASH'|'CARD'|'BANK_TRANSFER'|'ONLINE'|'CHEQUE'|'OTHER';
  from?: string; to?: string; page?: number; limit?: number;
}) {
  const { q, invoiceId, status, method, from, to, page = 1, limit = 20 } = opts;
  const where: string[] = []; const params: Record<string, any> = {};
  if (invoiceId) { where.push(`invoice_id = :invoiceId`); params.invoiceId = invoiceId; }
  if (status)    { where.push(`status = :status`); params.status = status; }
  if (method)    { where.push(`method = :method`); params.method = method; }
  if (from)      { where.push(`date >= :from`); params.from = new Date(from); }
  if (to)        { where.push(`date <= :to`); params.to = new Date(to); }
  if (q) {
    where.push(`(id LIKE :q OR invoice_id LIKE :q OR client_email LIKE :q OR method LIKE :q OR status LIKE :q OR reference LIKE :q)`);
    params.q = `%${q}%`;
    }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // params.limit = limit; params.offset = (page - 1) * limit;
  const offset = (page - 1) * limit;

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT SQL_CALC_FOUND_ROWS * FROM payments
     ${whereSql}
     ORDER BY date DESC, year DESC, series DESC
     LIMIT ${limit} OFFSET ${offset}`
  );
  const [countRows] = await pool.query(`SELECT FOUND_ROWS() AS total`);
  const total = Array.isArray(countRows) ? (countRows[0] as any).total as number : 0;

  return { data: rows, meta: { page, limit, total } };
}
