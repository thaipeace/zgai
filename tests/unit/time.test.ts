import { describe, expect, it } from "vitest";
import { dayKey, isDay, isMonth, isYear, stamp } from "@/lib/time";
import { vn } from "../helpers/db";

describe("time", () => {
  it("chia ngày theo giờ Việt Nam, không theo UTC", () => {
    // 23:30 ngày 28/10 giờ VN = 16:30 UTC cùng ngày
    expect(dayKey(vn("2026-10-28 23:30"))).toBe("2026-10-28");
    // 00:15 ngày 29/10 giờ VN = 17:15 UTC ngày 28 => vẫn phải là ngày 29
    expect(dayKey(vn("2026-10-29 00:15"))).toBe("2026-10-29");
  });

  it("stamp có thứ trong tuần để AI quy đổi 'thứ 6 này', 'mai'", () => {
    const s = stamp(vn("2026-10-29 14:05")); // 29/10/2026 là thứ Năm
    expect(s).toContain("14:05");
    expect(s).toContain("29/10/2026");
    expect(s).toMatch(/Th 5|Thứ Năm|T5/);
  });

  it("kiểm tra định dạng khóa thời gian", () => {
    expect(isDay("2026-10-29")).toBe(true);
    expect(isDay("2026-10")).toBe(false);
    expect(isMonth("2026-10")).toBe(true);
    expect(isYear("2026")).toBe(true);
    expect(isYear("26")).toBe(false);
  });
});

