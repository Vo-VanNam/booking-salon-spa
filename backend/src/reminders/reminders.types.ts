export const REMINDERS_QUEUE = 'reminders';
export const SEND_REMINDER_JOB = 'send-reminder';
// bullmq 5.x từ chối custom jobId chứa ':' (Custom Id cannot contain :) nên
// dùng '-' thay vì định dạng `${bookingId}:d1` trong spec gốc
export const reminderJobId = (bookingId: string, slot: 'd1' | 'h1') =>
  `${bookingId}-${slot}`;

export interface ReminderJobData {
  bookingId: string;
  startTime: string; // ISO
}
