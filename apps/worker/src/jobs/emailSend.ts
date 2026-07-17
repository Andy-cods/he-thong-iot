import { readFileSync } from "node:fs";
import type { Job } from "bullmq";
import nodemailer, { type Transporter } from "nodemailer";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "iot-worker", job: "email-send" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * V3.12 — Job gửi email thông báo "cần duyệt".
 *
 * Payload đã được web resolve sẵn (địa chỉ nhận + link tuyệt đối) —
 * worker chỉ render template + gửi SMTP, KHÔNG cần query DB.
 *
 * SMTP config qua env (VPS: smtp.office365.com:587, account info@gtam.vn).
 * Lưu ý M365: Basic auth SMTP còn hoạt động tới hết 12/2026 (sau đó bị tắt
 * mặc định, admin bật lại được; khoá hẳn ~2027). Khi Microsoft khoá →
 * chuyển transporter sang OAuth2/Graph, payload + queue giữ nguyên.
 */
export interface EmailSendJob {
  /** Địa chỉ email người nhận (đã verify khác null ở phía web). */
  to: string;
  /** Loại sự kiện (PR_SUBMITTED...) — dùng cho log + subject prefix. */
  eventType: string;
  /** Tiêu đề notification (đã tiếng Việt sẵn). */
  title: string;
  message?: string;
  /** Mã phiếu hiển thị (VD "DNVT-2607-001"). */
  entityCode?: string;
  actorUsername?: string;
  /** Link TUYỆT ĐỐI mở thẳng phiếu (web đã ghép APP_URL). */
  link?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/** Đọc secret: ưu tiên {VAR}_FILE (docker secret) → fallback env thường. */
function readSecret(name: string): string | undefined {
  const filePath = process.env[`${name}_FILE`];
  if (filePath) {
    try {
      return readFileSync(filePath, "utf8").trim();
    } catch (err) {
      logger.warn({ err, filePath }, `không đọc được ${name}_FILE`);
    }
  }
  return process.env[name] || undefined;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = readSecret("SMTP_PASSWORD");
  if (!host || !user || !password) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    password,
    from: process.env.MAIL_FROM ?? user,
  };
}

let transporter: Transporter | null = null;

function getTransporter(cfg: SmtpConfig): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      // M365/office365 dùng STARTTLS trên 587 — bắt buộc TLS, không gửi plain.
      requireTLS: cfg.port !== 465,
      auth: { user: cfg.user, pass: cfg.password },
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return transporter;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Template HTML tối giản, inline style (email client không load CSS ngoài). */
function renderHtml(data: EmailSendJob): string {
  const title = escapeHtml(data.title);
  const message = data.message ? escapeHtml(data.message) : "";
  const actor = data.actorUsername
    ? `<p style="margin:4px 0 0;color:#71717a;font-size:13px;">Người thực hiện: <strong>${escapeHtml(data.actorUsername)}</strong></p>`
    : "";
  const code = data.entityCode
    ? `<p style="margin:4px 0 0;color:#71717a;font-size:13px;">Mã phiếu: <strong>${escapeHtml(data.entityCode)}</strong></p>`
    : "";
  const button = data.link
    ? `<a href="${escapeHtml(data.link)}" style="display:inline-block;margin-top:20px;padding:11px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Mở phiếu trên hệ thống →</a>`
    : "";
  return `<!doctype html>
<html lang="vi"><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:520px;margin:24px auto;padding:28px 28px 24px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
    <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#a1a1aa;">MES SONG CHÂU · CẦN DUYỆT</p>
    <h1 style="margin:0;font-size:18px;line-height:1.4;color:#18181b;">${title}</h1>
    ${message ? `<p style="margin:12px 0 0;color:#3f3f46;font-size:14px;line-height:1.6;">${message}</p>` : ""}
    ${code}
    ${actor}
    ${button}
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;line-height:1.5;">
      Email tự động từ hệ thống MES Song Châu — vui lòng không trả lời email này.<br/>
      Bạn nhận email vì tài khoản của bạn có quyền duyệt loại phiếu này.
    </p>
  </div>
</body></html>`;
}

export async function processEmailSend(job: Job<EmailSendJob>) {
  const cfg = getSmtpConfig();
  if (!cfg) {
    // Chưa cấu hình SMTP (dev/staging) — skip êm, KHÔNG fail để job không
    // retry vô ích. Prod thiếu config sẽ thấy warn này trong log.
    logger.warn(
      { jobId: job.id, to: job.data.to },
      "email-send: SMTP chưa cấu hình (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) — skip",
    );
    return { status: "skipped", reason: "smtp_not_configured" };
  }
  const t = getTransporter(cfg);
  const subject = job.data.entityCode
    ? `[Cần duyệt] ${job.data.title} — ${job.data.entityCode}`
    : `[Cần duyệt] ${job.data.title}`;
  const info = await t.sendMail({
    from: { name: "MES Song Châu", address: cfg.from },
    to: job.data.to,
    subject,
    html: renderHtml(job.data),
    text: [
      job.data.title,
      job.data.message ?? "",
      job.data.link ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  return { status: "sent", messageId: info.messageId };
}
