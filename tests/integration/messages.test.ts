import { beforeEach, describe, expect, it } from "vitest";
import { dayCounts, getGroup, insertMessage, isGroupEnabled, listGroups, markRecalled, messagesInRange, upsertGroup } from "@/lib/messages";
import { run } from "@/lib/db";
import { msg, resetDb, seedGroup, vn } from "../helpers/db";

beforeEach(resetDb);

describe("lưu trữ tin nhắn", () => {
  it("bỏ qua tin trùng id (Zalo có thể gửi lại cùng một tin)", async () => {
    const m = msg({ id: "dup", text: "a", ts: vn("2026-10-29 09:00") });
    expect(await insertMessage(m)).toBe(true);
    expect(await insertMessage({ ...m, text: "b" })).toBe(false);
    const rows = await messagesInRange("g1", "2026-10-29", "2026-10-29");
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("a");
  });

  it("tự tính ngày theo giờ VN khi không truyền day", async () => {
    await insertMessage(msg({ id: "late", text: "khuya", ts: vn("2026-10-29 00:30") }));
    const [row] = await messagesInRange("g1", "2026-10-29", "2026-10-29");
    expect(row.day).toBe("2026-10-29");
  });

  it("thu hồi tin: xóa nội dung, giữ dấu vết, không tính vào thống kê ngày", async () => {
    await insertMessage(msg({ id: "r1", text: "bí mật", ts: vn("2026-10-29 10:00") }));
    await insertMessage(msg({ id: "r2", text: "bình thường", ts: vn("2026-10-29 10:01") }));
    await markRecalled("r1");
    const rows = await messagesInRange("g1", "2026-10-29", "2026-10-29");
    const recalled = rows.find((r) => r.id === "r1")!;
    expect(recalled.recalled).toBe(1);
    expect(recalled.text).toBe("");
    expect(await dayCounts("g1", "2026-10")).toEqual([{ day: "2026-10-29", count: 1 }]);
  });

  it("trả tin theo khoảng ngày, sắp xếp theo thời gian", async () => {
    await insertMessage(msg({ text: "ngày 30", ts: vn("2026-10-30 08:00") }));
    await insertMessage(msg({ text: "ngày 28", ts: vn("2026-10-28 08:00") }));
    await insertMessage(msg({ text: "ngày 29 chiều", ts: vn("2026-10-29 15:00") }));
    await insertMessage(msg({ text: "ngày 29 sáng", ts: vn("2026-10-29 08:00") }));
    const rows = await messagesInRange("g1", "2026-10-29", "2026-10-30");
    expect(rows.map((r) => r.text)).toEqual(["ngày 29 sáng", "ngày 29 chiều", "ngày 30"]);
  });

  it("dayCounts lọc theo tháng hoặc năm", async () => {
    await insertMessage(msg({ text: "a", ts: vn("2026-09-30 08:00") }));
    await insertMessage(msg({ text: "b", ts: vn("2026-10-01 08:00") }));
    await insertMessage(msg({ text: "c", ts: vn("2026-10-01 09:00") }));
    expect(await dayCounts("g1", "2026-10")).toEqual([{ day: "2026-10-01", count: 2 }]);
    expect((await dayCounts("g1", "2026")).length).toBe(2);
  });
});

describe("nhóm", () => {
  it("upsert không ghi đè tên bằng chuỗi rỗng", async () => {
    await upsertGroup("g1", "Dự án ABC");
    await upsertGroup("g1"); // tin nhắn đến trước khi có thông tin nhóm
    expect((await getGroup("g1"))?.name).toBe("Dự án ABC");
  });

  it("nhóm chưa biết mặc định được thu thập; tắt thì không", async () => {
    expect(await isGroupEnabled("lạ")).toBe(true);
    await seedGroup("g1");
    await run("UPDATE groups SET enabled = 0 WHERE id = 'g1'");
    expect(await isGroupEnabled("g1")).toBe(false);
  });

  it("listGroups kèm số tin và nhóm có tin mới nhất lên đầu", async () => {
    await seedGroup("g1", "Cũ");
    await seedGroup("g2", "Mới");
    await seedGroup("g3", "Chưa có tin");
    await insertMessage(msg({ group_id: "g1", text: "a", ts: vn("2026-10-28 08:00") }));
    await insertMessage(msg({ group_id: "g2", text: "b", ts: vn("2026-10-29 08:00") }));
    await insertMessage(msg({ group_id: "g2", text: "c", ts: vn("2026-10-29 09:00") }));
    const groups = await listGroups();
    expect(groups.map((g) => g.name)).toEqual(["Mới", "Cũ", "Chưa có tin"]);
    expect(groups[0].message_count).toBe(2);
    expect(groups[2].last_ts).toBeNull();
  });
});

