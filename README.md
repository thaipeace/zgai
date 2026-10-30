# Thư ký AI Zalo

Web app (PWA, cài được lên Android) dùng một **nick Zalo phụ ("bot")** để thu thập tin nhắn trong các nhóm Zalo cá nhân, rồi dùng **Gemini** để:

- Tóm tắt **Ngày → Tháng → Năm** (có cache, chỉ gọi lại AI khi có tin mới)
- **Phân tích theo mẫu**: việc cần làm, việc tồn đọng, tóm tắt nhanh, theo từng người, quyết định & vấn đề, và mẫu tự tạo
- **Hỏi tự do** trên dữ liệu nhóm trong khoảng thời gian bất kỳ
- **Nhập tay** đoạn chat cũ (bù lịch sử trước khi bot vào nhóm)

> [!WARNING]
> `zca-js` là thư viện **không chính thức**. Zalo có thể khóa nick bot hoặc thay đổi giao thức bất cứ lúc nào.
> Bot được thiết kế **chỉ đọc**: không gửi tin, không kết bạn. Xem phân tích rủi ro trong tài liệu thiết kế.

## Kiến trúc

```
Nhóm Zalo ──(WebSocket, zca-js)──▶ server.ts (Next.js custom server, chạy liên tục)
                                       ├─ src/lib/zalo/service.ts   giữ 1 kết nối, lưu tin vào DB
                                       ├─ src/lib/analysis.ts       Gemini: tóm tắt / mẫu / hỏi đáp
                                       └─ src/app/*                 giao diện PWA + API
                                   DB: SQLite local hoặc Turso (cloud)
```

- Một tiến trình duy nhất: Next.js + listener Zalo. **Không chạy được trên Vercel** (serverless không giữ WebSocket).
- **Lease trong DB**: khi Render deploy, instance mới chờ instance cũ nhả kết nối → tránh Zalo đá phiên vì trùng kết nối.
- Cookie phiên Zalo được **mã hóa AES-256-GCM** bằng `SESSION_SECRET` trước khi lưu.
- Toàn bộ app yêu cầu đăng nhập bằng `APP_PASSWORD` (trừ `/api/health`).
- Gọi Gemini với `store: false`.

## Chạy local

```bash
cp .env.example .env      # điền APP_PASSWORD, SESSION_SECRET, GEMINI_API_KEY
npm install
npm run dev               # http://localhost:3000
```

1. Đăng nhập bằng `APP_PASSWORD`.
2. Bấm **Đăng nhập bằng QR** → mở Zalo trên điện thoại của **nick bot** → quét mã.
3. Thêm nick bot vào các nhóm cần theo dõi → bấm **Đồng bộ danh sách nhóm**.

## Triển khai lên Render (Free)

1. Tạo DB miễn phí trên [Turso](https://turso.tech): lấy `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN`.
   **Bắt buộc**: ổ đĩa của Render Free bị xóa mỗi lần deploy, nên không dùng SQLite file trên Render.
2. Push repo lên GitHub → Render → **New → Blueprint** → chọn repo (dùng `render.yaml`, region Singapore).
3. Điền các biến `APP_PASSWORD`, `GEMINI_API_KEY`, `TURSO_*` (`SESSION_SECRET` được Render tự sinh).
4. **Giữ server không ngủ**: tạo job trên [cron-job.org](https://cron-job.org) gọi
   `https://<tên-app>.onrender.com/api/health` **mỗi 10 phút**.
   Gói Free có 750 giờ/tháng, đủ cho đúng **1 service chạy 24/7**. Đừng tạo thêm service Free khác trên cùng tài khoản.
5. Mở app trên Chrome Android → menu → **Thêm vào màn hình chính**.

> [!IMPORTANT]
> Đừng đổi `SESSION_SECRET` sau khi đã quét QR. Nếu đổi, phiên Zalo đã lưu sẽ không giải mã được và phải quét lại.
> Đừng mở `chat.zalo.me` bằng nick bot ở nơi khác vì Zalo sẽ đá phiên của server.

## Vận hành

| Tình huống | Cách xử lý |
| :--- | :--- |
| Vừa deploy / khởi động lại server | Hệ thống ở trạng thái **Đang tạm dừng** (không tự gọi Zalo khi deploy để tránh bị khóa nick). Bấm **Kích hoạt kết nối Zalo** để kết nối bằng phiên đã lưu (không cần quét QR) |
| Muốn ngắt kết nối tạm thời | Bấm **Tạm dừng kết nối** (phiên đăng nhập vẫn được giữ lại trong DB) |
| Trạng thái "Bị Zalo ngắt phiên" | Đóng Zalo Web/PC của nick bot ở nơi khác → bấm **Kết nối lại** |
| Đăng nhập bằng phiên đã lưu thất bại | Bấm **Đăng nhập bằng QR** để quét lại |
| Không muốn thu thập 1 nhóm | Bỏ chọn **Thu thập** ở trang chủ |

**Giữ SIM của nick bot**: nạp tiền định kỳ để nhà mạng không thu hồi số (nếu số bị cấp lại cho người khác, họ có thể chiếm nick bot).

## Giới hạn hiện tại

- Chỉ có tin nhắn **từ lúc bot vào nhóm** (cộng với những gì nhập tay).
- Ảnh, file, tin nhắn thoại chỉ được lưu dưới dạng nhãn (`[Ảnh: ...]`), AI chưa đọc nội dung bên trong.
- Kết quả AI có thể sai, cần kiểm tra lại tin nhắn gốc (mỗi đầu việc có kèm trích dẫn).

## Tài liệu

| Tài liệu | Dành cho |
| :--- | :--- |
| [docs/user-guide.md](docs/user-guide.md) | Người dùng: cài app, đọc báo cáo, hỏi AI, xử lý sự cố |
| [docs/architecture.md](docs/architecture.md) | Lập trình viên: thành phần, luồng dữ liệu, schema DB, API |
| [docs/decisions.md](docs/decisions.md) | Vì sao thiết kế như vậy, rủi ro, nợ kỹ thuật |
| [docs/testing.md](docs/testing.md) | Test harness (offline) và eval harness (chất lượng AI) |

## Scripts

| Lệnh | Mô tả |
| :--- | :--- |
| `npm run dev` | Chạy dev (Next dev + listener Zalo) |
| `npm run build` | Build production |
| `npm start` | Chạy production |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm test` | Toàn bộ test, offline (Zalo & Gemini được giả lập) |
| `npm run check` | typecheck + test, nên chạy trước khi commit |
| `npm run eval` | Chấm điểm chất lượng AI trên bộ ca mẫu (cần `GEMINI_API_KEY`) |
| `npm run eval -- --dry-run` | Xem prompt gửi cho AI, không gọi API |

