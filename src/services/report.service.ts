import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { pool } from '../config/db';

// Helpers
function startOfDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}
function addDays(d: Date, n: number) {
  const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x;
}
function startOfISOWeek(d = new Date()) { // Monday as week start
  const day = d.getUTCDay() || 7; // 1..7 (Sun as 7)
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (day - 1));
  return startOfDay(start);
}
function monthRange(ym?: string) {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    return { start, end };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start, end };
}

async function sumCompletedPaymentsBetween(start: Date, end: Date) {
  const [rows] = await pool.execute(
    `SELECT COALESCE(SUM(amount),0) AS total
       FROM payments
      WHERE status = 'COMPLETED'
        AND date >= :start AND date < :end`,
    { start, end }
  );
  const r: any = Array.isArray(rows) ? rows[0] : { total: 0 };
  return Number(r.total || 0);
}

export async function getOverview(opts: { month?: string }) {
  
  // A) Totals and counts
  const [[invSumRows], [payCompletedSumRows], [payPendingSumRows], [invCountRows], [paidCountRows]]: any = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM invoices`),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'COMPLETED'`),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'PENDING'`),
    pool.query(`SELECT COUNT(*) AS cnt FROM invoices`),
    pool.query(`SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'PAID'`),
  ]);
  const totalInvoiced = Number(invSumRows[0]?.total || 0);
  const totalCompletedPayments = Number(payCompletedSumRows[0]?.total || 0);
  const invoiceCount = Number(invCountRows[0]?.cnt || 0);
  const paidInvoiceCount = Number(paidCountRows[0]?.cnt || 0);
  const totalPendingPayments = Number(payPendingSumRows[0]?.total || 0);

  const totalOutstanding = Math.max(totalInvoiced - totalCompletedPayments, 0);
  const totalActiveInvoices = Math.max(invoiceCount - paidInvoiceCount, 0);
  const paymentSuccessRate = totalInvoiced > 0
    ? Number(((totalCompletedPayments / totalInvoiced) * 100).toFixed(2))
    : 0;

  // B) Payments this month (by amount), month param like "2025-08"
  const { start: monthStart, end: monthEnd } = monthRange(opts.month);
  const paymentsThisMonth = await sumCompletedPaymentsBetween(monthStart, monthEnd);

  // C) Payment received: today, thisWeek, thisMonth
  const todayStart = startOfDay(new Date());
  const todayEnd = addDays(todayStart, 1);
  const weekStart = startOfISOWeek(new Date());
  const weekEnd = addDays(weekStart, 7);

  const [receivedToday, receivedThisWeek, receivedThisMonth] = await Promise.all([
    sumCompletedPaymentsBetween(todayStart, todayEnd),
    sumCompletedPaymentsBetween(weekStart, weekEnd),
    sumCompletedPaymentsBetween(monthStart, monthEnd),
  ]);

  const [topRows] = await pool.execute(
    `SELECT
        i.client_email AS clientEmail,
        SUM(GREATEST(i.amount - IFNULL(p.total_paid, 0), 0))                                        AS outstandingTotal,
        SUM(CASE WHEN i.due_date < NOW()
                THEN GREATEST(i.amount - IFNULL(p.total_paid, 0), 0) ELSE 0 END)                   AS outstandingOverdue,
        SUM(CASE WHEN i.due_date >= NOW()
                THEN GREATEST(i.amount - IFNULL(p.total_paid, 0), 0) ELSE 0 END)                   AS outstandingPending,
        SUM(CASE WHEN i.due_date < NOW()
                    AND (i.amount - IFNULL(p.total_paid, 0)) > 0 THEN 1 ELSE 0 END)                  AS overdueInvoiceCount,
        SUM(CASE WHEN i.due_date >= NOW()
                    AND (i.amount - IFNULL(p.total_paid, 0)) > 0 THEN 1 ELSE 0 END)                  AS pendingInvoiceCount
        FROM invoices i
        LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS total_paid
            FROM payments
            WHERE status != 'FAILED'
            GROUP BY invoice_id
        ) p ON p.invoice_id = i.id
        WHERE (i.amount - IFNULL(p.total_paid, 0)) > 0   -- only unpaid invoices (covers overdue+pending)
        GROUP BY i.client_email
        ORDER BY outstandingTotal DESC
        LIMIT 3`
    );

    const topDebtors = (topRows as any[]).map(r => ({
    clientEmail: r.clientEmail,
    outstanding: Number(r.outstandingTotal || 0),          // total (overdue + pending)
    outstandingOverdue: Number(r.outstandingOverdue || 0), // overdue-only amount
    outstandingPending: Number(r.outstandingPending || 0), // pending-only amount
    overdueInvoiceCount: Number(r.overdueInvoiceCount || 0),
    pendingInvoiceCount: Number(r.pendingInvoiceCount || 0),
    }));

  return {
    totalOutstanding,
    paymentsThisMonth,
    totalCompletedPayments,
    totalPendingPayments,
    totalActiveInvoices,
    paymentSuccessRate,
    paymentReceived: {
      today: receivedToday,
      thisWeek: receivedThisWeek,
      thisMonth: receivedThisMonth,
    },
    topDebtors,
    meta: {
      monthRange: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
      generatedAt: new Date().toISOString(),
    },
  };
}
