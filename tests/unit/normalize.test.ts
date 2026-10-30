import { describe, expect, it } from "vitest";
import type { TGroupMessage } from "zca-js";
import { toTranscript, type StoredMessage } from "@/lib/messages";
import { normalizeContent } from "@/lib/zalo/service";
import { vn } from "../helpers/db";

const d = (msgType: string, content: unknown) => ({ msgType, content }) as unknown as TGroupMessage;

describe("normalizeContent (chuẩn hóa tin nhắn Zalo)", () => {
  it.each([
    ["webchat", "Gửi báo cáo nhé", { kind: "text", text: "Gửi báo cáo nhé" }],
    ["chat.sticker", { id: 1 }, { kind: "sticker", text: "[Sticker]" }],
    ["chat.photo", { title: "Phiếu xuất kho" }, { kind: "photo", text: "[Ảnh: Phiếu xuất kho]" }],
    ["chat.photo", {}, { kind: "photo", text: "[Ảnh]" }],
    ["chat.voice", { href: "x" }, { kind: "voice", text: "[Tin nhắn thoại]" }],
    ["chat.video.msg", { title: "" }, { kind: "video", text: "[Video]" }],
    ["share.file", { title: "baogia.xlsx" }, { kind: "file", text: "[File: baogia.xlsx]" }],
    ["chat.recommended", { title: "Trang KH", href: "https://a.b" }, { kind: "link", text: "[Link: Trang KH https://a.b]" }],
    ["chat.location.new", { title: "Kho A" }, { kind: "other", text: "[chat.location.new: Kho A]" }],
  ])("%s", (type, content, expected) => {
    expect(normalizeContent(d(type, content))).toEqual(expected);
  });

  it("cắt tiêu đề quá dài", () => {
    const out = normalizeContent(d("share.file", { title: "a".repeat(1000) }));
    expect(out.text.length).toBeLessThan(320);
  });
});

function stored(p: Partial<StoredMessage> & { text: string; ts: number }): StoredMessage {
  return {
    id: Math.random().toString(),
    group_id: "g1",
    sender_id: "u1",
    sender_name: "Minh",
    day: "2026-10-29",
    kind: "text",
    quote_sender: null,
    quote_text: null,
    recalled: 0,
    source: "zalo",
    ...p,
  };
}

describe("toTranscript (bản ghi gửi cho AI)", () => {
  it("định dạng [thời gian] người gửi: nội dung, kèm trả lời", () => {
    const out = toTranscript([
      stored({ ts: vn("2026-10-29 14:10"), text: "@Hùng check lỗi VNPay" }),
      stored({ ts: vn("2026-10-29 14:12"), sender_name: "Hùng", text: "Ok anh", quote_sender: "Minh", quote_text: "@Hùng check lỗi VNPay" }),
    ]);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[.*14:10.*\] Minh: @Hùng check lỗi VNPay$/);
    expect(lines[1]).toContain('(↪ trả lời Minh: "@Hùng check lỗi VNPay")');
  });

  it("bỏ tin thu hồi, sticker và tin rỗng", () => {
    const out = toTranscript([
      stored({ ts: 1, text: "giữ lại" }),
      stored({ ts: 2, text: "đã thu hồi", recalled: 1 }),
      stored({ ts: 3, text: "[Sticker]", kind: "sticker" }),
      stored({ ts: 4, text: "   " }),
    ]);
    expect(out.split("\n")).toHaveLength(1);
    expect(out).toContain("giữ lại");
  });

  it("gộp xuống dòng thành một dòng, người gửi trống thành 'Không rõ'", () => {
    const out = toTranscript([stored({ ts: 1, sender_name: "", text: "dòng 1\n\ndòng 2" })]);
    expect(out).toContain("Không rõ: dòng 1 dòng 2");
  });

  it("cắt trích dẫn dài còn 160 ký tự", () => {
    const out = toTranscript([stored({ ts: 1, text: "ok", quote_sender: "A", quote_text: "x".repeat(500) })]);
    expect(out).toContain(`"${"x".repeat(160)}"`);
    expect(out).not.toContain("x".repeat(161));
  });
});

