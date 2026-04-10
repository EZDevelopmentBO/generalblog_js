import { query } from '../config/database';

export type NotificationChannel = 'email' | 'whatsapp' | 'telegram';
export type NotificationStatus = 'sent' | 'failed';

export interface NotificationLogRow {
  id: number;
  channel: NotificationChannel;
  recipient: string;
  subject_or_template: string | null;
  related_type: string | null;
  related_id: number | null;
  sent_at: string;
  status: NotificationStatus;
  error_message: string | null;
}

export interface LogNotificationParams {
  channel: NotificationChannel;
  recipient: string;
  subject_or_template?: string | null;
  related_type?: string | null;
  related_id?: number | null;
  status: NotificationStatus;
  error_message?: string | null;
}

export async function logNotification(params: LogNotificationParams): Promise<NotificationLogRow> {
  const {
    channel,
    recipient,
    subject_or_template = null,
    related_type = null,
    related_id = null,
    status,
    error_message = null,
  } = params;
  const { rows } = await query<NotificationLogRow>(
    `INSERT INTO notification_log (channel, recipient, subject_or_template, related_type, related_id, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [channel, recipient, subject_or_template, related_type, related_id, status, error_message]
  );
  return rows[0];
}

export interface ListNotificationLogParams {
  limit: number;
  offset: number;
  channel?: NotificationChannel;
  recipient?: string;
  from?: string;
  to?: string;
  status?: NotificationStatus;
}

export async function listNotificationLog(
  params: ListNotificationLogParams
): Promise<{ rows: NotificationLogRow[]; total: number }> {
  const { limit, offset, channel, recipient, from, to, status } = params;
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let idx = 1;
  if (channel) {
    conditions.push(`channel = $${idx}`);
    values.push(channel);
    idx += 1;
  }
  if (recipient?.trim()) {
    conditions.push(`recipient ILIKE $${idx}`);
    values.push(`%${recipient.trim()}%`);
    idx += 1;
  }
  if (from) {
    conditions.push(`sent_at >= $${idx}::timestamptz`);
    values.push(from);
    idx += 1;
  }
  if (to) {
    conditions.push(`sent_at <= $${idx}::timestamptz`);
    values.push(to);
    idx += 1;
  }
  if (status) {
    conditions.push(`status = $${idx}`);
    values.push(status);
    idx += 1;
  }
  const where = conditions.join(' AND ');

  const [countResult, dataResult] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*)::text FROM notification_log WHERE ${where}`, values),
    query<NotificationLogRow>(
      `SELECT * FROM notification_log WHERE ${where} ORDER BY sent_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
  ]);
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
  return { rows: dataResult.rows, total };
}
