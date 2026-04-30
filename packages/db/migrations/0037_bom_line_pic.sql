-- V3.7.18 — Add PIC (Person In Charge) cho bom_line.
--
-- Yêu cầu user: cột "PIC" trong file Excel "BOM FINAL" (vd Vương Anh, Nguyện,
-- Tiến/Cường, Đức) → người chịu trách nhiệm dòng linh kiện đó.
-- Người PIC sẽ có quyền update SL nhận / tiến độ giao hàng cho row đó.
--
-- Approach:
--   - assigned_to_user_id (uuid FK user_account, nullable): match theo full_name
--   - assigned_to_name (varchar 255): raw text từ Excel khi không match user nào
--     (sẽ resolve sau khi tạo user mới với matching full_name)

ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID
    REFERENCES app.user_account(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS bom_line_assigned_user_idx
  ON app.bom_line (assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bom_line_assigned_name_idx
  ON app.bom_line (assigned_to_name)
  WHERE assigned_to_name IS NOT NULL;

COMMENT ON COLUMN app.bom_line.assigned_to_user_id IS
  'V3.7.18 — PIC user. NULL nếu chưa match user trong system → dùng assigned_to_name.';
COMMENT ON COLUMN app.bom_line.assigned_to_name IS
  'V3.7.18 — Raw PIC name từ Excel khi chưa có user matching (vd "Tiến/Cường", "Đức").';
