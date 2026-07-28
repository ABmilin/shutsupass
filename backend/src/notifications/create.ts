import { pool } from "../db";

export async function notifyUser(userId: number, message: string, applicationId?: number): Promise<void> {
  await pool.query(
    "INSERT INTO notifications (user_id, application_id, message) VALUES ($1, $2, $3)",
    [userId, applicationId ?? null, message]
  );
}

// 全職員に一斉通知(新規申請の受付など)
export async function notifyAllStaff(message: string, applicationId?: number): Promise<void> {
  const staff = await pool.query("SELECT id FROM users WHERE role = 'staff'");
  for (const row of staff.rows) {
    await notifyUser(row.id, message, applicationId);
  }
}
