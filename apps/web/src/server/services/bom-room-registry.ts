/**
 * BOM V5 / WP9 — registry THUẦN (không Redis/DB) cho SSE `/api/bom/templates/[id]/live`.
 *
 * - "room" = templateId → Set<RoomClient>. Broadcast theo room.
 * - Giới hạn MAX_BOM_STREAMS_PER_USER stream/người (tổng mọi room): vượt thì
 *   evict stream CŨ NHẤT của người đó (giống notify-stream-registry).
 * - Presence: mỗi lần vào/ra room, gửi event `presence` {users:[{id,name}]}
 *   (đã gộp theo userId) tới mọi client của room.
 */

export interface RoomClient {
  id: string;
  userId: string;
  userName: string;
  templateId: string;
  send: (event: string, data: string) => void;
  /** PHẢI idempotent. */
  close: () => void;
}

export const MAX_BOM_STREAMS_PER_USER = 5;

const rooms = new Map<string, Set<RoomClient>>();
const byUser = new Map<string, Set<RoomClient>>();

export function getRoomPresence(templateId: string): Array<{ id: string; name: string }> {
  const set = rooms.get(templateId);
  if (!set) return [];
  const seen = new Map<string, string>();
  for (const c of set) if (!seen.has(c.userId)) seen.set(c.userId, c.userName);
  return [...seen].map(([id, name]) => ({ id, name }));
}

export function broadcastToRoom(templateId: string, event: string, data: string): number {
  const set = rooms.get(templateId);
  if (!set || set.size === 0) return 0;
  let sent = 0;
  for (const c of [...set]) {
    try {
      c.send(event, data);
      sent++;
    } catch {
      /* client tự dọn qua abort handler */
    }
  }
  return sent;
}

function broadcastPresence(templateId: string): void {
  broadcastToRoom(templateId, "presence", JSON.stringify({ users: getRoomPresence(templateId) }));
}

function removeFromRoom(client: RoomClient): boolean {
  const room = rooms.get(client.templateId);
  if (!room || !room.delete(client)) return false;
  if (room.size === 0) rooms.delete(client.templateId);
  return true;
}

export function unregisterRoomClient(client: RoomClient): void {
  const mine = byUser.get(client.userId);
  if (mine) {
    mine.delete(client);
    if (mine.size === 0) byUser.delete(client.userId);
  }
  if (removeFromRoom(client)) broadcastPresence(client.templateId);
}

export function registerRoomClient(client: RoomClient): void {
  let mine = byUser.get(client.userId);
  if (!mine) {
    mine = new Set();
    byUser.set(client.userId, mine);
  }
  while (mine.size >= MAX_BOM_STREAMS_PER_USER) {
    const oldest = mine.values().next().value as RoomClient | undefined;
    if (!oldest) break;
    mine.delete(oldest);
    try {
      oldest.close();
    } catch {
      /* ignore */
    }
    // close() thường tự unregister; gọi lại vẫn an toàn (idempotent).
    unregisterRoomClient(oldest);
    if (!byUser.has(client.userId)) {
      mine = new Set();
      byUser.set(client.userId, mine);
    }
  }
  mine.add(client);
  let room = rooms.get(client.templateId);
  if (!room) {
    room = new Set();
    rooms.set(client.templateId, room);
  }
  room.add(client);
  broadcastPresence(client.templateId);
}

export function getRoomClientCount(templateId: string): number {
  return rooms.get(templateId)?.size ?? 0;
}
export function getRoomStreamCountForUser(userId: string): number {
  return byUser.get(userId)?.size ?? 0;
}
export function getActiveRoomCount(): number {
  return rooms.size;
}

export function __resetRoomRegistryForTests(): void {
  rooms.clear();
  byUser.clear();
}
