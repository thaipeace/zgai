# Hướng dẫn sử dụng

Dành cho người dùng app **Thư ký AI Zalo**. Không cần biết lập trình.

## 1. App làm được gì?

Một tài khoản Zalo phụ (gọi là **nick bot**) được thêm vào các nhóm Zalo của bạn. Nick này lặng lẽ lưu lại tin nhắn, rồi app dùng AI (Gemini) để:

- 📅 **Tóm tắt** theo ngày, tháng, năm
- 📋 **Liệt kê việc cần làm**: ai làm, ai giao, hạn chót, đã xong chưa
- ⏳ **Tìm việc tồn đọng**: việc đã giao nhưng chưa ai báo xong
- 💬 **Trả lời câu hỏi** về nội dung nhóm, ví dụ: "Tuần này anh Minh giao gì cho tôi?"

> [!NOTE]
> Bot chỉ thấy tin nhắn **từ lúc được thêm vào nhóm**. Tin cũ hơn có thể bổ sung bằng mục **Nhập tay** (xem phần 7).

## 2. Cài app lên điện thoại

1. Mở **Chrome** trên Android, vào địa chỉ app (ví dụ `https://zalo-ai.onrender.com`).
2. Nhập **mật khẩu** được cung cấp.
3. Bấm menu **⋮** → **Thêm vào màn hình chính** → **Cài đặt**.

Từ đó app có biểu tượng riêng và mở toàn màn hình như một app bình thường. Trên iPhone: mở bằng Safari → nút **Chia sẻ** → **Thêm vào MH chính**.

> [!TIP]
> Lần đầu mở app sau một thời gian dài có thể mất khoảng 30 giây nếu server đang "ngủ".

## 3. Kết nối và điều khiển nick bot

Việc này do người quản lý app thực hiện tại khung **🤖 Nick bot Zalo** ở trang chủ:

- **Lần đầu tiên (chưa có phiên lưu)**:
  1. Bấm **Đăng nhập bằng QR**.
  2. Trên điện thoại đang đăng nhập **nick bot**: mở Zalo → biểu tượng **QR** ở góc trên → quét mã trên màn hình và xác nhận.
  3. Trạng thái chuyển sang 🟢 **Đang lắng nghe** và phiên đăng nhập được mã hóa lưu lại.
- **Sau khi cập nhật (deploy) hoặc khởi động lại server**:
  - Để bảo vệ nick bot khỏi bị Zalo quét khi cập nhật hệ thống, server **không tự động kết nối ngay khi vừa khởi động** mà ở trạng thái ⚪ **Đang tạm dừng (chờ kích hoạt thủ công)**.
  - Bạn chỉ cần bấm nút **Kích hoạt kết nối Zalo** — hệ thống sẽ dùng lại phiên đã lưu để kết nối ngay mà **không cần quét QR lại**.
- **Tạm dừng chủ động**:
  - Bấm **Tạm dừng kết nối** khi muốn ngắt kết nối tạm thời (phiên đăng nhập vẫn được giữ nguyên để lần sau bấm **Kích hoạt kết nối Zalo** là chạy tiếp).
  - Chỉ bấm **Đăng xuất bot** khi bạn muốn xóa hẳn phiên đã lưu để đổi sang nick bot khác.

## 4. Thêm nhóm cần theo dõi

1. Trong Zalo, mở nhóm → **Thêm thành viên** → chọn nick bot.
2. Quay lại app, bấm **Đồng bộ danh sách nhóm**. Nhóm sẽ xuất hiện trong danh sách.
3. Muốn tạm ngừng lưu tin của một nhóm: bỏ chọn ô **Thu thập** bên cạnh nhóm đó.

## 5. Xem một nhóm

Bấm vào tên nhóm. Trang nhóm có 5 thẻ:

| Thẻ | Dùng để |
| :--- | :--- |
| **Tin nhắn** | Xem lại tin đã lưu theo từng ngày (nút ← → để đổi ngày) |
| **Báo cáo** | Tóm tắt Ngày / Tháng / Năm |
| **Theo mẫu** | Chạy một mẫu phân tích có sẵn hoặc tự tạo |
| **Hỏi AI** | Đặt câu hỏi tự do |
| **Nhập tay** | Dán đoạn chat cũ vào |

### 5.1. Báo cáo Ngày / Tháng / Năm

Chọn **Ngày**, **Tháng** hoặc **Năm** → chọn thời điểm → **Xem báo cáo**. Báo cáo gồm:

- Tóm tắt ngắn
- ✨ Điểm chính · ⚠️ Vướng mắc · ✅ Quyết định
- 📋 Danh sách đầu việc

Báo cáo tháng/năm lần đầu có thể mất **1–3 phút**; những lần sau mở ra ngay vì đã được lưu. Khi có tin mới, báo cáo tự cập nhật ở lần xem tiếp theo. Bấm **Phân tích lại** nếu muốn AI làm lại từ đầu.

### 5.2. Phân tích theo mẫu

1. Chọn **mẫu**:

   | Mẫu | Kết quả |
   | :--- | :--- |
   | **Việc cần làm** | Mọi đầu việc trong khoảng thời gian |
   | **Việc tồn đọng** | Chỉ những việc chưa ai báo xong |
   | **Tóm tắt nhanh** | Đọc trong một phút |
   | **Theo từng người** | Ai đang được giao những gì |
   | **Quyết định & vấn đề** | Những gì đã chốt, sự cố, câu hỏi bỏ ngỏ |

2. Chọn **khoảng thời gian** (bấm nhanh *Hôm nay / Hôm qua / 7 ngày / 30 ngày / Tháng này* hoặc tự chọn ngày).
3. Bấm **Phân tích**.

Các lần phân tích trước được lưu ở mục **Lần trước** bên dưới.

### 5.3. Hỏi AI

Gõ câu hỏi, chọn khoảng thời gian rồi bấm **Hỏi**. Một số câu hỏi mẫu:

- "Những việc nào giao cho Lan mà chưa thấy báo xong?"
- "Lô hàng của nhà cung cấp B đang gặp vấn đề gì, đã chốt cách xử lý chưa?"
- "Tuần này có những khoản chi nào được nhắc tới?"
- "Tóm tắt những gì khách hàng Phú Thái yêu cầu trong tháng này."

> [!TIP]
> Câu hỏi càng cụ thể (tên người, tên khách, chủ đề) thì câu trả lời càng chính xác. Chọn khoảng thời gian vừa đủ: quá dài thì AI phải dùng bản tóm tắt và có thể bỏ sót chi tiết.

## 6. Đọc danh sách việc

Mỗi đầu việc hiển thị:

- **Tên việc** và nhãn trạng thái: 🟡 Chưa làm · 🔵 Đang làm · 🟢 Xong · ⚪ Chưa rõ
- 👤 người phụ trách · 📣 người giao · ⏰ hạn chót · mức ưu tiên
- **Tin nhắn gốc**: bấm để xem AI dựa vào tin nào

> [!IMPORTANT]
> AI **có thể sai**, đặc biệt với tin nhắn mơ hồ ("ok", "để em xem") hoặc thời gian nói tắt. Với việc quan trọng, hãy bấm **Tin nhắn gốc** để kiểm tra lại.

## 7. Nhập tay đoạn chat cũ

Dùng khi muốn phân tích tin nhắn **trước khi bot vào nhóm**, hoặc lúc bot bị mất kết nối.

1. Trong Zalo, chọn và sao chép đoạn chat của một ngày.
2. Thẻ **Nhập tay** → chọn **ngày** của đoạn chat → dán → **Lưu đoạn chat**.
3. Đoạn chat được tính vào báo cáo và phân tích của ngày đó.

## 8. Tạo mẫu phân tích riêng

Trang chủ → **Mẫu phân tích** → phần **Tạo mẫu mới**:

- **Tên mẫu**: ví dụ "Tổng hợp đơn hàng"
- **Yêu cầu cho AI**: mô tả rõ cần lấy thông tin gì, trình bày ra sao. Ví dụ:
  > Liệt kê các đơn hàng được nhắc tới: mã đơn, tên khách, yêu cầu, người xử lý, tình trạng. Trình bày dạng bảng. Cuối cùng ghi các đơn bị trễ.
- **Kiểu kết quả**: *Văn bản / bảng tự do* (linh hoạt) hoặc *Danh sách việc* (hiện dạng thẻ việc như mẫu có sẵn).

## 9. Khi có sự cố

| App hiển thị | Ý nghĩa | Cách xử lý |
| :--- | :--- | :--- |
| 🔴 **Bị Zalo ngắt phiên** | Nick bot vừa đăng nhập Zalo Web/PC ở nơi khác | Đóng Zalo Web/PC của nick bot ở nơi đó → bấm **Kết nối lại** |
| 🟠 **Mất kết nối (đang thử lại)** | Mạng chập chờn | Đợi vài phút, app tự kết nối lại |
| 🔴 **Lỗi** + "Hãy quét QR lại" | Phiên đăng nhập hết hạn | Bấm **Đăng nhập bằng QR** |
| 🟠 **Đang chờ instance cũ nhả kết nối** | Server vừa cập nhật | Đợi khoảng 1 phút |
| Báo cáo trống | Ngày đó không có tin, hoặc nhóm đang tắt **Thu thập** | Kiểm tra thẻ **Tin nhắn** và ô Thu thập |
| Phân tích báo lỗi | AI quá tải hoặc chưa cấu hình key | Thử lại sau ít phút; báo cho người quản lý |

> [!WARNING]
> **Đừng** dùng nick bot để đăng nhập `chat.zalo.me` trên máy tính. Zalo sẽ ngắt phiên của server.

