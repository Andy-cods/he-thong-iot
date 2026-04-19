/**
 * V1.4 Phase G — Seed 100 user test với argon2 hash thật.
 *
 * Chạy:
 *   DATABASE_URL=postgres://... pnpm tsx tests/load/setup-test-users.ts
 *
 * Dùng nó thay cho setup-test-users.sql khi cần hash argon2 thật để
 * k6 login pass 401. SQL file giữ như template fallback.
 */
import argon2 from "argon2";
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://hethong_app:changeme@localhost:5432/hethong_iot";
const PASSWORD = process.env.LOAD_TEST_PASSWORD ?? "Loadtest!234";
const USER_COUNT = Number(process.env.USER_COUNT ?? 100);

async function main() {
  const sql = postgres(DATABASE_URL, { max: 2 });

  console.log(`[seed-loadtest] Hash argon2 cho "${PASSWORD}"...`);
  const hash = await argon2.hash(PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  console.log(
    `[seed-loadtest] Insert ${USER_COUNT} user loadtest-001..${String(
      USER_COUNT,
    ).padStart(3, "0")}`,
  );

  await sql.begin(async (tx) => {
    // Đảm bảo role operator tồn tại
    await tx`
      INSERT INTO app.role (code, display_name, description)
      VALUES ('operator', 'Công nhân', 'Operator xưởng')
      ON CONFLICT (code) DO NOTHING
    `;

    const [roleRow] = await tx`
      SELECT id FROM app.role WHERE code = 'operator'
    `;
    if (!roleRow) throw new Error("Role operator không tồn tại sau insert");

    for (let i = 1; i <= USER_COUNT; i++) {
      const username = `loadtest-${String(i).padStart(3, "0")}`;
      const [user] = await tx`
        INSERT INTO app.user_account (
          username, email, full_name, password_hash,
          mfa_enabled, is_active, must_change_password
        ) VALUES (
          ${username},
          ${username + "@iot.local"},
          ${"Loadtest User " + i},
          ${hash},
          false, true, false
        )
        ON CONFLICT (username) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          is_active = true
        RETURNING id
      `;
      if (!user) continue;

      await tx`
        INSERT INTO app.user_role (user_id, role_id)
        VALUES (${user.id}, ${roleRow.id})
        ON CONFLICT DO NOTHING
      `;
    }
  });

  const [{ count }] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM app.user_account
    WHERE username LIKE 'loadtest-%'
  `;
  console.log(`[seed-loadtest] Done. Total loadtest users: ${count}`);

  await sql.end();
}

main().catch((err) => {
  console.error("[seed-loadtest] FAIL:", err);
  process.exit(1);
});
