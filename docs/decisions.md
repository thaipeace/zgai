# Quyết định thiết kế & rủi ro

Mỗi quyết định ghi lại **bối cảnh, lựa chọn, các phương án đã loại và hệ quả**. Khi điều kiện thay đổi (ví dụ nick bot bị khóa nhiều lần, Render đổi chính sách), hãy xem lại các quyết định ở đây trước khi sửa code.

| # | Quyết định | Trạng thái |
| :-: | :--- | :--- |
| 001 | Thu thập bằng nick Zalo phụ + `zca-js` (bot thành viên nhóm) | Đã chấp nhận |
| 002 | Web app Next.js (PWA) thay vì app Android native | Đã chấp nhận |
| 003 | Chạy trên Render (server liên tục), không dùng Vercel | Đã chấp nhận, xem lại nếu nick bị khóa |
| 004 | Turso/libSQL làm cơ sở dữ liệu | Đã chấp nhận |
| 005 | Lease trong DB + Kích hoạt kết nối Zalo thủ công (tách rời deploy) | Đã chấp nhận |
| 006 | Tóm tắt phân cấp Ngày → Tháng → Năm có cache | Đã chấp nhận |
| 007 | Gemini Flash qua Interactions API, `store: false` | Đã chấp nhận |
| 008 | Bot chỉ đọc | Đã chấp nhận |
| 009 | Không thông báo cho thành viên nhóm | Quyết định của chủ dự án, có rủi ro |

---

## ADR-001 · Nguồn dữ liệu: nick Zalo phụ + `zca-js`

**Bối cảnh.** Cần đọc tin nhắn của **nhóm Zalo cá nhân** để trích xuất việc cần làm. Zalo **không có API chính thức** cho tài khoản/nhóm cá nhân.

**Các phương án đã đánh giá:**

| Phương án | Đánh giá | Lý do loại / chọn |
| :--- | :-: | :--- |
| Zalo OA API (nhóm GMF) | Loại | Chỉ dành cho nhóm có OA doanh nghiệp, cần giấy phép kinh doanh và gói trả phí. Không áp dụng được cho nhóm cá nhân. |
| `AccessibilityService` tự cuộn đọc màn hình | Loại | Cảm giác "hack máy", dễ hỏng khi Zalo đổi giao diện, Google Play hạn chế. |
| Chia sẻ thủ công (Share sheet / ảnh chụp) | 3/10 | Không tự động. Được giữ lại dưới dạng tính năng **Nhập tay**. |
| `NotificationListenerService` | 5/10 | Chạy ngầm trên máy người dùng, không lấy được lịch sử, sót tin khi tắt thông báo nhóm. |
| Nhúng `chat.zalo.me` trong WebView | 8/10 | Lấy được lịch sử, nhưng phụ thuộc vào điện thoại của người dùng và cấu trúc web Zalo. |
| **Nick bot + `zca-js`** | **8.5/10** | **Chọn.** "Nhóm cấp quyền" bằng cách thêm bot vào nhóm, điện thoại người dùng không cần quyền gì, thu thập 24/7. |

**Hệ quả:**
- ✅ App sạch, không xin quyền nhạy cảm; dùng chung được cho nhiều người.
- ❌ `zca-js` là thư viện **không chính thức**, có thể vi phạm điều khoản của Zalo. Zalo có thể khóa nick hoặc đổi giao thức bất cứ lúc nào.
- ❌ Chỉ có tin **từ lúc bot vào nhóm**. Lịch sử cũ phải nhập tay.
- ❌ Cần một SIM phụ duy trì lâu dài và một điện thoại để giữ app Zalo của nick bot.
- Giảm thiểu: tầng nhập liệu thiết kế theo kiểu **cắm–rút**. Phần phân tích (`analysis.ts`) chỉ làm việc với bảng `messages`, không phụ thuộc vào `zca-js`.

## ADR-002 · Next.js PWA thay vì Android native

**Bối cảnh.** Sau ADR-001, điện thoại không còn phải thu thập gì. Phía client chỉ còn là giao diện xem và yêu cầu phân tích.

**Quyết định.** Một codebase TypeScript (Next.js App Router) cho cả API lẫn giao diện, kèm manifest PWA để "Thêm vào màn hình chính" trên Android.

**Hệ quả:** phát triển nhanh, dùng được trên điện thoại lẫn máy tính, không cần phát hành trên Google Play. Đổi lại là không có thông báo đẩy native (có thể bổ sung Web Push sau).

## ADR-003 · Render thay vì Vercel

**Bối cảnh.** `zca-js` cần **một kết nối WebSocket sống liên tục**. Vercel là serverless: hàm chỉ chạy vài giây đến vài phút rồi tắt.

**Quyết định.** Custom server (`server.ts`) gộp Next.js và listener vào một tiến trình, chạy trên **Render Web Service, gói Free, region Singapore**. Dùng cron-job.org ping `/api/health` mỗi 10 phút để server không ngủ.

**Các lưu ý đã kiểm chứng:**
- Gói Free có 750 giờ/tháng, vừa đủ cho **đúng 1 service chạy 24/7** (tối đa 744 giờ/tháng).
- Kết nối WebSocket **chiều ra** (từ server tới Zalo) không được Render tính là traffic, nên bắt buộc phải có ping từ ngoài.
- Không cài lịch nghỉ đêm: tắt server thì sót tin, và mỗi lần đăng nhập lại là thêm một tín hiệu bất thường với Zalo.

**Rủi ro:** IP datacenter nước ngoài là yếu tố **làm tăng nguy cơ khóa nick nhiều nhất**. Gói Free chỉ có 512MB RAM. Render có thể đổi chính sách gói Free.

**Phương án dự phòng (nếu nick bị khóa ≥ 2 lần):** chuyển listener sang máy ở nhà (IP dân dụng Việt Nam) hoặc VPS Việt Nam. Code đã sẵn sàng: chỉ cần chạy `npm start` ở nơi mới, trỏ cùng `TURSO_*`, và cơ chế lease (ADR-005) đảm bảo chỉ một nơi được kết nối.

## ADR-004 · Turso/libSQL thay vì Neon (PostgreSQL) hay SQLite file trên Render

**Bối cảnh.** Ổ đĩa của Render Free bị **xóa mỗi lần deploy**, nên không lưu SQLite file trên Render được. Cần một database cloud miễn phí, độ trễ thấp từ Singapore và phù hợp với tiến trình chạy 24/7.

**Tại sao chọn Turso (libSQL) mà không chọn Neon (Serverless PostgreSQL)?**
1. **Cái bẫy "Compute Hours" của Neon Free khi chạy 24/7**: Neon giới hạn gói Free theo **giờ thức của máy chủ DB (~190 giờ/tháng)** và dựa vào cơ chế tự ngủ (scale-to-zero) sau 5 phút không có truy vấn. Tuy nhiên, bot Zalo chạy **24/7 (744 giờ/tháng)**, nhận tin nhắn rải rác cả ngày và duy trì khóa `zalo_lease` định kỳ, khiến Neon không thể ngủ và sẽ **cạn sạch hạn mức miễn phí chỉ sau ~8 ngày**. Ngược lại, **Turso Free** không tính giờ thức mà tính theo **số dòng đọc/ghi (500 triệu dòng đọc + 10 triệu dòng ghi/tháng)** — chạy 24/7 cả tháng mới chỉ tốn chưa tới 1% hạn mức miễn phí.
2. **Chạy Local & Test mất 0 giây cài đặt**: Cùng một thư viện `@libsql/client`, khi chạy trên Render thì nối vào Turso (`libsql://...`), khi chạy ở máy local (`npm run dev`) thì tự tạo file `file:./data/zalo-ai.db` không cần cài Docker/Postgres, và khi chạy 96 bài test (`npm test`) thì chạy thẳng trên RAM (`:memory:`) hoàn toàn offline.
3. **Đặt tại Singapore (`sin`)**: Khớp vùng với Render Singapore, không bị trễ vài giây vì cold-start đánh thức DB như Neon.

**Hệ quả:** một dialect SQL duy nhất cho mọi môi trường; SQL viết tay, không dùng ORM. Hiện chưa có migration (xem phần Nợ kỹ thuật).

## ADR-005 · Tách rời Deploy khỏi Kết nối Zalo + Lease trong DB

**Bối cảnh.**
1. Khi phát triển hoặc cập nhật ứng dụng trên Render, mỗi lần push code hoặc khởi động lại container mà tự động gọi `zalo.login()` ngay lập tức sẽ tạo ra hàng loạt phiên đăng nhập dồn dập từ IP datacenter — dấu hiệu điển hình khiến Zalo quét và khóa nick bot.
2. Ngoài ra, Render deploy theo kiểu chạy instance mới trước khi tắt instance cũ; hai kết nối Zalo dùng cùng một phiên sẽ bị Zalo đá (`DuplicateConnection`).

**Quyết định.**
1. **Không tự kết nối Zalo khi khởi động server (`server.ts` chỉ gọi `init()`)**: Khi mới deploy hoặc khởi động lại, hệ thống chỉ kiểm tra xem trong DB đã có phiên lưu (`hasSavedSession`) hay chưa và dừng ở trạng thái `idle` (Tạm dừng). Người dùng chủ động bấm nút **"Kích hoạt kết nối Zalo"** trên giao diện khi đã deploy ổn định, hoặc bấm **"Tạm dừng kết nối"** bất cứ lúc nào mà không làm mất phiên đã lưu.
2. **Khóa lease có TTL trong bảng `kv`**: Khi người dùng bấm kích hoạt, instance phải giành được lease bằng câu lệnh UPDATE nguyên tử trước khi kết nối Zalo. Chi tiết trong [architecture.md §5.2](architecture.md#52-lease-chống-hai-instance-cùng-kết-nối).

**Hệ quả:**
- ✅ Quy hoạch rủi ro rõ ràng: deploy sửa giao diện, sửa prompt AI, kiểm tra DB bao nhiêu lần cũng **không chạm tới Zalo**.
- ✅ Chủ động hoàn toàn thời điểm mở/ngắt kết nối Zalo.
- ❌ Sau khi Render deploy bản mới hoặc khởi động lại, người quản lý cần vào app bấm **"Kích hoạt kết nối Zalo"** để bot tiếp tục lắng nghe tin nhắn. Tin nhắn trong khoảng tạm dừng ngắn sẽ được bù qua `requestOldMessages` ngay khi kết nối lại.

## ADR-006 · Tóm tắt phân cấp có cache

**Bối cảnh.** Hàng nghìn tin mỗi tháng; xem báo cáo tháng/năm phải nhanh và rẻ.

**Quyết định.** Ngày được tóm tắt từ tin gốc; tháng từ các bản ngày; năm từ các bản tháng. Cache theo `message_count` nên chỉ tính lại khi có thay đổi.

**Hệ quả:** ✅ mỗi ngày quá khứ chỉ tốn Gemini **một lần**. ❌ Tóm tắt của tóm tắt làm mất chi tiết nhỏ và khuếch đại lỗi của tầng dưới. Vì vậy phân tích theo mẫu và hỏi tự do ưu tiên đọc **tin gốc**, chỉ chuyển sang tóm tắt khi vượt `MAX_TRANSCRIPT_CHARS`.

## ADR-007 · Gemini

**Quyết định.**
- Model mặc định `gemini-3.8-flash`, đổi được qua biến `GEMINI_MODEL`. (Bản thiết kế đầu từng đề xuất `gemini-2.5-flash`, model này **đã ngừng hỗ trợ**.)
- Gọi qua Interactions API, đầu ra JSON có schema (`response_format`) cho danh sách việc.
- `store: false` để Google không lưu hội thoại.

**Rủi ro:** gói **Free** của Gemini API có thể dùng dữ liệu để cải thiện sản phẩm. Với dữ liệu công việc thật, **nên bật billing** (chi phí ước tính vài chục nghìn đồng mỗi tháng).

**Kiểm soát chất lượng:** mọi thay đổi prompt hoặc model phải chạy [eval harness](testing.md#3-eval-harness-chất-lượng-ai) và so sánh với kết quả trước.

## ADR-008 · Bot chỉ đọc

**Quyết định.** `ZaloService` **không bao giờ** gửi tin, kết bạn, thả cảm xúc hay sửa nhóm. Chỉ gọi `getAllGroups`, `getGroupInfo` và lắng nghe sự kiện.

**Lý do:** hệ thống chống spam của Zalo chủ yếu nhắm vào hành vi chủ động. Một tài khoản chỉ đọc trông giống người dùng mở Zalo Web.

**Ràng buộc cho người phát triển:** đừng thêm tính năng "bot gửi báo cáo vào nhóm" mà không đánh giá lại rủi ro khóa nick.

## ADR-009 · Không thông báo cho thành viên nhóm

**Quyết định của chủ dự án:** thêm bot vào nhóm mà không thông báo riêng.

**Rủi ro đã được nêu:**
- Tin nhắn chứa dữ liệu cá nhân của mọi thành viên. Nghị định 13/2023/NĐ-CP thường yêu cầu sự đồng ý của chủ thể dữ liệu khi thu thập và chuyển dữ liệu ra nước ngoài (Render ở Singapore, Gemini ở Mỹ).
- Nếu thành viên phát hiện, đó là vấn đề về **niềm tin** trong nhóm.
- Lưu ý thực tế: Zalo vẫn tự hiện thông báo "X đã thêm Y vào nhóm".

**Có thể xem lại** nếu dùng cho nhóm có người ngoài công ty, hoặc nếu có thành viên phản đối.

---

## Sổ rủi ro

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu | Dấu hiệu cần hành động |
| :--- | :-: | :-: | :--- | :--- |
| Nick bot bị khóa / bắt xác minh | Trung bình | Rất cao | Chỉ đọc; giữ cố định imei/cookie; nuôi nick trước khi dùng | Trạng thái `error`/`kicked` lặp lại → xem ADR-003 phương án dự phòng |
| `zca-js` hỏng khi Zalo cập nhật | Cao (theo năm) | Cao | Khóa phiên bản trong `package-lock.json`; theo dõi GitHub của thư viện; dùng Nhập tay | Không có tin mới nhiều giờ trong khi nhóm vẫn hoạt động |
| SIM bị thu hồi, người khác chiếm nick | Thấp–TB | Rất cao | Nạp tiền định kỳ hoặc dùng SIM trả sau | Nhà mạng báo sắp khóa chiều |
| Lộ cookie phiên Zalo | Thấp | Cao | Mã hóa AES-GCM; không log | Đổi `SESSION_SECRET` + quét QR lại |
| Web app bị truy cập trái phép | Thấp | Cao | Bắt buộc đăng nhập; gate so khớp chính xác (có test) | Đổi `APP_PASSWORD` |
| AI trích xuất sai | Chắc chắn (một phần) | Trung bình | Kèm trích dẫn tin gốc; eval harness; người dùng kiểm tra | F1 eval < 0.8 |
| Render đổi chính sách gói Free | Thấp–TB | Trung bình | Code chạy được ở bất kỳ host Node nào | Email thông báo từ Render |

## Nợ kỹ thuật đã biết

1. **Chưa có migration** cho schema. Lần đổi schema đầu tiên nên bổ sung bảng `schema_version`.
2. **Media** (ảnh, file, voice) chỉ lưu nhãn. Có thể tải về và dùng Gemini đa phương thức (tốn chi phí hơn).
3. **Chưa quản lý vòng đời việc** (tick hoàn thành, gộp trùng giữa các lần phân tích); hiện mỗi lần phân tích là độc lập.
4. **Chưa có cảnh báo** khi bot mất kết nối lâu (có thể thêm Web Push hoặc email).
5. Chạy mẫu trên khoảng thời gian dài có thể mất vài phút, và request HTTP phải chờ đến khi xong.

