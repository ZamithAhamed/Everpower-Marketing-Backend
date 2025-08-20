import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { env } from '../config/env';
import nodemailer from 'nodemailer';
import Stripe from 'stripe';

export class NotFoundError extends Error { status = 404; constructor(m='Invoice not found'){ super(m);} }

function getPool() {
  if (!pool) throw new Error('Database connection pool not initialized');
  return pool;
}

const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-07-30.basil' })
  : null;

function pad(n: number, len = 4) { return String(n).padStart(len, '0'); }


export async function create(data: {
  clientEmail: string;
  clientPhone: string;
  amount: number;                       // major units (e.g., 1499.50)
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  date: string;                         // ISO
  dueDate: string;                      // ISO
  description?: string;
  customerId?: string;
  // optional stripe object still supported, but not required
  stripe?: {
    items?: (
      | { price: string; quantity?: number }
      | { amount: number; currency: string; description?: string; quantity?: number }
    )[];
    daysUntilDue?: number;
    finalizeAndEmail?: boolean;
  };
}) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const year = new Date().getFullYear();

    // 1) Generate internal invoice ID (transaction-safe counter)
    const [counterRows] = await conn.execute(
      `SELECT last_series FROM invoice_counters WHERE year = :year FOR UPDATE`,
      { year }
    );
    let last = Array.isArray(counterRows) && (counterRows[0] as any)?.last_series as number | undefined;
    if (last === undefined) {
      await conn.execute(`INSERT INTO invoice_counters (year, last_series) VALUES (:year, 0)`, { year });
      last = 0;
    }
    const series = Number(last ?? 0) + 1;
    await conn.execute(`UPDATE invoice_counters SET last_series = :series WHERE year = :year`, { series, year });
    const id = `INV-${year}-${pad(series)}`;

    // 2) Optionally create Stripe invoice, even with NO items in payload.
    let stripe_invoice_id: string | null = null;
    let stripe_status: string | null = null;
    let stripe_hosted_url: string | null = null;
    let stripe_pdf_url: string | null = null;
    let stripe_customer_id: string | null = null;

    const stripeEnabled = Boolean(stripe);
    const autoEmail = (process.env.STRIPE_AUTO_EMAIL ?? 'true').toLowerCase() !== 'false';
    const defaultCurrency = (process.env.STRIPE_DEFAULT_CURRENCY ?? 'lkr').toLowerCase();
    const finalizeAndEmail =
      data.stripe?.finalizeAndEmail ?? autoEmail;

    if (stripeEnabled) {
      // derive daysUntilDue from body or from date→dueDate
      const daysUntilDue =
        data.stripe?.daysUntilDue ??
        Math.max(
          1,
          Math.ceil(
            (new Date(data.dueDate).getTime() - new Date(data.date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );

      // a) find/create stripe customer
      const existing = await stripe!.customers.list({ email: data.clientEmail, limit: 1 });
      let customer = existing.data[0];
      if (!customer) {
        customer = await stripe!.customers.create({
          email: data.clientEmail,
          name: data.clientEmail.split('@')[0],
          phone: data.clientPhone,
        });
      }
      stripe_customer_id = customer.id;

      // b) create draft invoice
      const draft = await stripe!.invoices.create({
        customer: customer.id,
        collection_method: 'send_invoice',
        days_until_due: daysUntilDue,
        currency: defaultCurrency,
        auto_advance: false,
        description: `Invoice ${id}`,
      });

      // c) add line items
      if (data.stripe?.items && data.stripe.items.length > 0) {
        // honor explicit items if provided
        for (const item of data.stripe.items) {
          if ('price' in item) {
            await stripe!.invoiceItems.create({
              customer: customer.id,
              // price: item.price,
              quantity: item.quantity ?? 1,
              invoice: draft.id,
            });
          } else {
            const totalAmount =
              typeof item.quantity === 'number' ? item.amount * item.quantity : item.amount;
            await stripe!.invoiceItems.create({
              customer: customer.id,
              amount: totalAmount,
              currency: item.currency,
              description: item.description ?? 'Item',
              invoice: draft.id,
            });
          }
        }
      } else {
        // NO ITEMS in payload → create a single ad-hoc item from `amount`
        // Convert major units to smallest currency unit (e.g., 1499.50 -> 149950)
        const minor = Math.round(Number(data.amount) * 100);
        await stripe!.invoiceItems.create({
          customer: customer.id,
          amount: minor,
          currency: defaultCurrency,
          description: data.description || `Invoice ${id}`,
          invoice: draft.id,
        });
      }

      // d) finalize (and email if configured)
      if (!draft.id) throw new Error('Stripe draft invoice ID is undefined');
      const finalized = await stripe!.invoices.finalizeInvoice(draft.id as string);
      if (finalizeAndEmail) {
        await stripe!.invoices.sendInvoice(finalized.id as string);
      }

      const email = await stripe!.invoices.sendInvoice(finalized.id as string);

      stripe_invoice_id = finalized.id ?? null;
      stripe_status = finalized.status ?? null;
      stripe_hosted_url = finalized.hosted_invoice_url ?? null;
      stripe_pdf_url = finalized.invoice_pdf ?? null;
    }

    // 3) Insert internal invoice row (with Stripe metadata if any)
    await conn.execute(
      `INSERT INTO invoices
        (id, year, series, client_email, client_phone, amount, status, date, due_date, description,
         customer_id, stripe_invoice_id, stripe_status, stripe_hosted_url, stripe_pdf_url, stripe_customer_id)
       VALUES
        (:id, :year, :series, :clientEmail, :clientPhone, :amount, :status, :date, :dueDate, :description,
         :customerId, :stripe_invoice_id, :stripe_status, :stripe_hosted_url, :stripe_pdf_url, :stripe_customer_id)`,
      {
        id, year, series,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        amount: data.amount,
        status: data.status,
        date: new Date(data.date),
        dueDate: new Date(data.dueDate),
        description: data.description ?? null,
        customerId: data.customerId ?? null,
        stripe_invoice_id, stripe_status, stripe_hosted_url, stripe_pdf_url, stripe_customer_id,
      }
    );

    await conn.commit();

    try {await sendInvoiceEmail(data.clientEmail, stripe_hosted_url ?? ''); } 
    catch (e) {
      console.error('[invoice.service] Failed to send invoice email:', e);
    }

    const [rows] = await pool.execute(`SELECT * FROM invoices WHERE id = :id`, { id });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function sendInvoiceEmail(to: string, stripe_hosted_url: string) {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: String(env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  const appName = "EverPower";
  const payUrl = stripe_hosted_url;

  const text = [
    `Hi,`,
    ``,
    `Your invoice from ${appName} is ready.`,
    `Please complete the payment using the link below:`,
    payUrl,
    ``,
    `If you've already paid, you can ignore this message.`,
    `Need help? Reply to this email.`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #111;">
      <p>Hi,</p>
      <p>Your invoice from <strong>${appName}</strong> is ready.</p>

      <div style="margin: 24px 0;">
        <a href="${payUrl}" style="display:inline-block;padding:12px 20px;text-decoration:none;border-radius:8px;background:#111;color:#fff;font-weight:600">
          Pay invoice
        </a>
      </div>

      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p><a href="${payUrl}" style="word-break: break-all;">${payUrl}</a></p>

      <p style="color:#555;">If you've already paid, you can ignore this message.</p>
      <p style="color:#555;">Need help? Just reply to this email.</p>

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
      <p style="font-size:12px;color:#777;margin-top:0;">Sent by ${appName}</p>
    </div>
  `;

  await transporter.sendMail({
    from: env.MAIL_FROM || "no-reply@example.com",
    to,
    subject: `Your invoice is ready – complete payment`,
    text,
    html,
  });
}

export async function getById(id: string) {
  const [rows] = await getPool().execute(`SELECT * FROM invoices WHERE id = :id`, { id });
  const inv = Array.isArray(rows) && rows[0];
  if (!inv) throw new NotFoundError();
  return inv;
}

export async function update(id: string, patch: Partial<{
  clientEmail: string; clientPhone: string; amount: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE'; date: string; dueDate: string;
  description?: string; customerId?: string;
}>) {
  const sets: string[] = [];
  const params: Record<string, any> = { id };

  if (patch.clientEmail !== undefined) { sets.push(`client_email = :clientEmail`); params.clientEmail = patch.clientEmail; }
  if (patch.clientPhone !== undefined) { sets.push(`client_phone = :clientPhone`); params.clientPhone = patch.clientPhone; }
  if (patch.amount !== undefined)      { sets.push(`amount = :amount`); params.amount = patch.amount; }
  if (patch.status !== undefined)      { sets.push(`status = :status`); params.status = patch.status; }
  if (patch.date !== undefined)        { sets.push(`date = :date`); params.date = new Date(patch.date); }
  if (patch.dueDate !== undefined)     { sets.push(`due_date = :dueDate`); params.dueDate = new Date(patch.dueDate); }
  if (patch.description !== undefined) { sets.push(`description = :description`); params.description = patch.description ?? null; } // NEW
  if (patch.customerId !== undefined)  { sets.push(`customer_id = :customerId`); params.customerId = patch.customerId ?? null; }

  if (sets.length === 0) return getById(id);

  const [result] = await getPool().execute(
    `UPDATE invoices SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id`,
    params
  );
  // @ts-ignore
  if (!result.affectedRows) throw new NotFoundError();
  return getById(id);
}

export async function remove(id: string) {
  const [res] = await getPool().execute(`DELETE FROM invoices WHERE id = :id`, { id });
  // @ts-ignore
  if (!res.affectedRows) throw new NotFoundError();
  return { success: true };
}

export async function list(opts: { q?: string; page?: number; limit?: number; status?: 'PENDING'|'PAID'|'OVERDUE'; year?: number }) {
  const { q, page = 1, limit = 20, status, year } = opts;
  const params: Record<string, any> = {};
  const where: string[] = [];

  if (status) { where.push(`i.status = :status`); params.status = status; }
  if (year)   { where.push(`i.year = :year`); params.year = year; }
  if (q) {
    where.push(`(i.id LIKE :q OR i.client_email LIKE :q OR i.client_phone LIKE :q OR i.description LIKE :q)`);
    params.q = `%${q}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // params.limit = limit;
  // params.offset = (page - 1) * limit;
  const offset = (page - 1) * limit;

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT SQL_CALC_FOUND_ROWS
            i.*,
            (i.amount - IFNULL(p.total_paid, 0)) AS over_due
     FROM invoices i
     LEFT JOIN (
       SELECT invoice_id, SUM(amount) AS total_paid
       FROM payments
       WHERE status != 'FAILED'
       GROUP BY invoice_id
     ) p ON p.invoice_id = i.id
     ${whereSql}
     ORDER BY i.year DESC, i.series DESC
     LIMIT ${limit} OFFSET ${offset}`
    //  LIMIT :limit OFFSET :offset`,
    // params
  );

  const [countRows] = await pool.query(`SELECT FOUND_ROWS() as total`);
  const total = Array.isArray(countRows) ? (countRows[0] as any).total as number : 0;

  return { data: rows, meta: { page, limit, total } };
}
