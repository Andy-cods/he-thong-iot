import { readFileSync } from "node:fs";

/**
 * Đọc secret: ưu tiên {VAR}_FILE (docker compose secret mount),
 * fallback {VAR} env var. Throw nếu cả hai đều thiếu và required.
 */
function readSecret(name: string, required = true): string | undefined {
  const fileVar = `${name}_FILE`;
  const filePath = process.env[fileVar];
  if (filePath) {
    try {
      return readFileSync(filePath, "utf8").trim();
    } catch (err) {
      if (required) {
        throw new Error(
          `Không đọc được secret ${fileVar}=${filePath}: ${(err as Error).message}`,
        );
      }
    }
  }
  const direct = process.env[name];
  if (direct) return direct;
  if (required) {
    throw new Error(`Biến môi trường ${name} (hoặc ${fileVar}) bắt buộc`);
  }
  return undefined;
}

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Biến môi trường ${name} bắt buộc`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_URL: process.env.APP_URL ?? "http://localhost:3001",
  DATABASE_URL: (() => {
    const raw = must("DATABASE_URL");
    // Thay `hethong_app@` bằng `hethong_app:<password>@` nếu DB_PASSWORD_FILE set
    const dbPwd = readSecret("DB_PASSWORD", false);
    if (dbPwd && !raw.includes(":")) {
      return raw.replace(/\/\/([^@]+)@/, `//$1:${encodeURIComponent(dbPwd)}@`);
    }
    return raw;
  })(),
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379/2",
  BULLMQ_PREFIX: process.env.BULLMQ_PREFIX ?? "iot-",
  JWT_SECRET: readSecret("JWT_SECRET") as string,
  SESSION_SECRET: readSecret("SESSION_SECRET", false) ?? "",
  JWT_ACCESS_TTL: Number(process.env.JWT_ACCESS_TTL ?? 900),
  JWT_REFRESH_TTL: Number(process.env.JWT_REFRESH_TTL ?? 604800),
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  R2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    bucket: process.env.R2_BUCKET ?? "",
    endpoint: process.env.R2_ENDPOINT ?? "",
    accessKey: readSecret("R2_ACCESS_KEY", false) ?? "",
    secretKey: readSecret("R2_SECRET_KEY", false) ?? "",
  },
};

export type Env = typeof env;
