import cron from 'node-cron';
import { pool } from '../config/db';

export async function markOverdueInvoices(now = new Date()) {

  const [result] = await pool.execute(
    `
    UPDATE invoices i
    LEFT JOIN (
      SELECT invoice_id, COALESCE(SUM(amount), 0) AS paid
      FROM payments
      WHERE status = 'COMPLETED'
      GROUP BY invoice_id
    ) p ON p.invoice_id = i.id
    SET i.status = 'OVERDUE',
        i.updated_at = CURRENT_TIMESTAMP
    WHERE i.due_date < :now
      AND i.status <> 'PAID'
      AND i.status <> 'OVERDUE'
      AND COALESCE(p.paid, 0) < i.amount
    `,
    { now }
  );

  // mysql2 types: OkPacket for UPDATE
  // @ts-ignore
  const changed = result.affectedRows ?? 0;
  return { changed };
}

/** Start a daily job at 00:00 Asia/Colombo */
export function startOverdueCron() {
  cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        const { changed } = await markOverdueInvoices(new Date());
        console.log(`[overdue.cron] Updated ${changed} invoices to OVERDUE`);
      } catch (e) {
        console.error('[overdue.cron] Failed:', e);
      }
    },
    { timezone: 'Asia/Colombo' }
  );
}
