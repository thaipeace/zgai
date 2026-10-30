import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CloseReason, ThreadType } from "zca-js";
import { decrypt } from "@/lib/crypto";
import { kvGet, run } from "@/lib/db";
import { getGroup, messagesInRange } from "@/lib/messages";
import { ZaloService } from "@/lib/zalo/service";
import { resetDb, vn, waitFor } from "../helpers/db";
import { createFakeApi, createFakeZalo, groupMessage, userMessage } from "../helpers/fake-zalo";

const services: ZaloService[] = [];
function makeService(client: ReturnType<typeof createFakeZalo>) {
  const s = new ZaloService({ createClient: () => client, leasePollMs: 20 });
  services.push(s);
  return s;
}

beforeEach(resetDb);
afterEach(async () => {
  for (const s of services.splice(0)) await s.stop();
});

async function loginViaQr(groups = [{ id: "g1", name: "Dự án ABC" }]) {
  const fake = createFakeApi(groups);
  const client = createFakeZalo(fake.api);
  const service = makeService(client);
  await service.startQrLogin();
  await waitFor(() => service.state.status === "connected");
  return { service, client, ...fake };
}

describe("đăng nhập", () => {
  it("init khi khởi động server: chỉ kiểm tra phiên lưu, KHÔNG tự gọi Zalo", async () => {
    const client1 = createFakeZalo(createFakeApi().api);
    const s1 = makeService(client1);
    await s1.init();
    expect(s1.state.status).toBe("logged_out");
    expect(s1.state.hasSavedSession).toBe(false);
    expect(client1.login).not.toHaveBeenCalled();

    // Sau khi đã có phiên lưu trong DB, init() chuyển về idle + hasSavedSession=true mà không gọi login()
    const first = await loginViaQr();
    await first.service.stop();

    const client2 = createFakeZalo(createFakeApi().api);
    const s2 = makeService(client2);
    await s2.init();
    expect(s2.state.status).toBe("idle");
    expect(s2.state.hasSavedSession).toBe(true);
    expect(client2.login).not.toHaveBeenCalled();
  });

  it("chưa có phiên lưu => start() chuyển sang logged_out, không gọi Zalo", async () => {
    const client = createFakeZalo(createFakeApi().api);
    const service = makeService(client);
    await service.start();
    expect(service.state.status).toBe("logged_out");
    expect(service.state.hasSavedSession).toBe(false);
    expect(client.login).not.toHaveBeenCalled();
  });

  it("quét QR: lưu phiên ĐÃ MÃ HÓA, kết nối, đồng bộ tên nhóm, xin lại tin cũ", async () => {
    const { service, listener } = await loginViaQr();
    expect(service.state.account?.id).toBe("bot-1");

    const raw = await kvGet("zalo_credentials");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("imei-123"); // không lưu dạng rõ
    expect(JSON.parse(decrypt(raw!))).toMatchObject({ imei: "imei-123", userAgent: "UA-test" });

    await waitFor(async () => (await getGroup("g1"))?.name === "Dự án ABC");
    expect(listener.oldMessageRequests).toEqual([{ type: ThreadType.Group, lastMsgId: null }]);
  });

  it("QR hết hạn => trạng thái qr_expired", async () => {
    const service = makeService(createFakeZalo(createFakeApi().api, { qr: "expire" }));
    await service.startQrLogin();
    await waitFor(() => service.state.status === "qr_expired");
    expect(service.state.qrImage).toBeUndefined();
  });

  it("từ chối trên điện thoại => trạng thái error", async () => {
    const service = makeService(createFakeZalo(createFakeApi().api, { qr: "decline" }));
    await service.startQrLogin();
    await waitFor(() => service.state.status === "error");
  });

  it("khởi động lại: dùng phiên đã lưu, không cần QR", async () => {
    const first = await loginViaQr();
    await first.service.stop();

    const fake = createFakeApi();
    const client = createFakeZalo(fake.api);
    const second = makeService(client);
    await second.start();
    await waitFor(() => second.state.status === "connected");
    expect(client.loginQR).not.toHaveBeenCalled();
    expect(client.login).toHaveBeenCalledWith(expect.objectContaining({ imei: "imei-123" }));
  });

  it("tạm dừng (stop): lưu cookie mới nhất, giữ phiên lưu (hasSavedSession = true, status = idle)", async () => {
    const { service } = await loginViaQr();
    await service.stop();
    expect(service.state.status).toBe("idle");
    expect(service.state.hasSavedSession).toBe(true);
    const creds = JSON.parse(decrypt((await kvGet("zalo_credentials"))!));
    expect(creds.cookie).toEqual([{ key: "zpw_sek", value: "refreshed" }]);
  });

  it("phiên lưu hết hạn => báo lỗi, yêu cầu quét QR lại", async () => {
    await loginViaQr().then((x) => x.service.stop());
    const service = makeService(createFakeZalo(createFakeApi().api, { loginFails: true }));
    await service.start();
    expect(service.state.status).toBe("error");
    expect(service.state.lastError).toMatch(/quét QR/);
  });

  it("đăng xuất: xóa phiên đã lưu, hasSavedSession = false", async () => {
    const { service } = await loginViaQr();
    await service.logout();
    expect(await kvGet("zalo_credentials")).toBeNull();
    expect(service.state.hasSavedSession).toBe(false);
    expect(service.state.status).toBe("logged_out");
  });
});

describe("thu thập tin nhắn", () => {
  it("lưu tin nhóm, bỏ qua tin nhắn riêng (1-1)", async () => {
    const { service, listener } = await loginViaQr();
    listener.emit("message", groupMessage("g1", { msgId: "1", text: "Gửi báo cáo trước 5h", dName: "Minh", ts: vn("2026-10-29 14:00") }));
    listener.emit("message", userMessage("friend-1", "tin riêng tư"));
    await waitFor(() => service.state.receivedSinceStart === 1);

    const rows = await messagesInRange("g1", "2026-10-29", "2026-10-29");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sender_name: "Minh", text: "Gửi báo cáo trước 5h", kind: "text" });
    const all = await messagesInRange("friend-1", "2000-01-01", "2100-01-01");
    expect(all).toHaveLength(0);
  });

  it("lưu trích dẫn trả lời", async () => {
    const { service, listener } = await loginViaQr();
    listener.emit(
      "message",
      groupMessage("g1", { msgId: "2", text: "Ok anh", ts: vn("2026-10-29 14:01"), quote: { fromD: "Minh", msg: "Gửi báo cáo", attach: "" } }),
    );
    await waitFor(() => service.state.receivedSinceStart === 1);
    const [row] = await messagesInRange("g1", "2026-10-29", "2026-10-29");
    expect(row).toMatchObject({ quote_sender: "Minh", quote_text: "Gửi báo cáo" });
  });

  it("nhóm bị tắt thu thập => không lưu", async () => {
    const { service, listener } = await loginViaQr();
    await waitFor(async () => Boolean(await getGroup("g1")));
    await run("UPDATE groups SET enabled = 0 WHERE id = 'g1'");
    listener.emit("message", groupMessage("g1", { msgId: "3", text: "x", ts: vn("2026-10-29 14:02") }));
    await new Promise((r) => setTimeout(r, 50));
    expect(service.state.receivedSinceStart).toBe(0);
  });

  it("tin từ nhóm mới (chưa đồng bộ) vẫn được lưu và lấy tên nhóm", async () => {
    const { service, listener } = await loginViaQr([{ id: "g1", name: "A" }, { id: "g-new", name: "Nhóm mới" }]);
    listener.emit("message", groupMessage("g-new", { msgId: "4", text: "xin chào", ts: vn("2026-10-29 14:03") }));
    await waitFor(() => service.state.receivedSinceStart === 1);
    await waitFor(async () => (await getGroup("g-new"))?.name === "Nhóm mới");
  });

  it("thu hồi tin => xóa nội dung", async () => {
    const { service, listener } = await loginViaQr();
    listener.emit("message", groupMessage("g1", { msgId: "555", text: "nhầm rồi", ts: vn("2026-10-29 14:04") }));
    await waitFor(() => service.state.receivedSinceStart === 1);
    listener.emit("undo", { isGroup: true, threadId: "g1", data: { content: { globalMsgId: 555 } } });
    await waitFor(async () => (await messagesInRange("g1", "2026-10-29", "2026-10-29"))[0]?.recalled === 1);
  });

  it("old_messages (bù tin lúc mất kết nối) được lưu, không trùng", async () => {
    const { service, listener } = await loginViaQr();
    const m = groupMessage("g1", { msgId: "10", text: "tin cũ", ts: vn("2026-10-29 07:00") });
    listener.emit("old_messages", [m, m, groupMessage("g1", { msgId: "11", text: "tin cũ 2", ts: vn("2026-10-29 07:01") })], ThreadType.Group);
    await waitFor(() => service.state.receivedSinceStart === 2);
    expect(await messagesInRange("g1", "2026-10-29", "2026-10-29")).toHaveLength(2);
  });
});

describe("mất kết nối", () => {
  it("bị đá phiên (trùng kết nối) => trạng thái kicked kèm hướng dẫn", async () => {
    const { service, listener } = await loginViaQr();
    listener.emit("closed", CloseReason.DuplicateConnection, "dup");
    expect(service.state.status).toBe("kicked");
    expect(service.state.lastError).toMatch(/Kết nối lại/);
  });

  it("mất mạng thường => disconnected", async () => {
    const { service, listener } = await loginViaQr();
    listener.emit("closed", CloseReason.AbnormalClosure, "");
    expect(service.state.status).toBe("disconnected");
  });
});

describe("lease (chống 2 instance cùng kết nối khi deploy)", () => {
  it("instance thứ 2 chờ cho tới khi instance 1 nhả lease", async () => {
    const first = await loginViaQr();

    const client2 = createFakeZalo(createFakeApi().api);
    const second = makeService(client2);
    void second.start();
    await waitFor(() => second.state.status === "waiting_lease");
    await new Promise((r) => setTimeout(r, 100));
    expect(client2.login).not.toHaveBeenCalled();

    await first.service.stop();
    await waitFor(() => second.state.status === "connected");
    expect(client2.login).toHaveBeenCalledTimes(1);
  });

  it("không cho quét QR khi instance khác đang giữ kết nối", async () => {
    await loginViaQr();
    const other = makeService(createFakeZalo(createFakeApi().api));
    await expect(other.startQrLogin()).rejects.toThrow(/Instance khác/);
  });
});

