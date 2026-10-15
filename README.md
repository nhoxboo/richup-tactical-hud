# 🎲 Richup Tactical HUD VIP - Monopoly Assistant & Mod Menu

> **Userscript (Tampermonkey)** trợ lý chiến thuật đỉnh cao và Menu Mod cho game cờ tỷ phú trực tuyến **[Richup.io](https://richup.io)**.  
> Cung cấp Radar xác suất 11 bước xúc xắc, Bảng soi tài sản ròng thời gian thực, Phân tích độc quyền & ROI xây nhà, cùng hệ thống Tự động hóa thông minh (Auto Roll, Auto Buy, Auto End Turn, Sniper đấu giá).

---

## 🚀 Cài đặt nhanh vào Tampermonkey

1. Cài đặt tiện ích mở rộng [Tampermonkey](https://www.tampermonkey.net/) trên trình duyệt của bạn (Chrome, Edge, Brave, Cốc Cốc, Firefox).
2. Nhấp trực tiếp vào link cài đặt bên dưới:
   👉 **[Cài đặt Richup Tactical HUD VIP v1.2.0 (raw link)](https://raw.githubusercontent.com/nhoxboo/richup-tactical-hud/main/richup-tactical-hud.user.js)**
3. Tampermonkey sẽ mở giao diện xác nhận -> Bấm **"Install" (Cài đặt)** hoặc **"Update"**.
4. Mở game **[https://richup.io](https://richup.io)** và vào bất kỳ phòng chơi nào để tận hưởng!

> 💡 **Auto-Update**: Script đã tích hợp `@updateURL` và `@downloadURL` trỏ về GitHub raw. Khi có bản vá mới, Tampermonkey sẽ tự động cập nhật mà không cần cài lại.

---

## 🌟 Bảng tính năng chính

| Nhóm module | Tên tính năng | Mô tả chi tiết |
| :--- | :--- | :--- |
| **🎯 Radar Xác Suất** | **Dice Probability & Danger Radar** | Phân tích phân phối xác suất 2–12 của xúc xắc (tổng 7 = 16.7%, 6/8 = 13.9%...). Quét 11 ô phía trước, cảnh báo chính xác ô nguy hiểm (nhà/khách sạn đối thủ) kèm số tiền phạt dự kiến, đánh dấu ô đất trống có thể mua và ô an toàn. |
| **💰 Soi Tài Sản** | **Real-time Net Worth & Liquidity Tracker** | Thống kê thời gian thực: **Tiền mặt + Giá trị BĐS = Tổng tài sản ròng (Net Worth)** của toàn bộ người chơi trong phòng. Tính tỷ lệ thanh khoản và cảnh báo nguy cơ phá sản. |
| **🏰 Độc Quyền & ROI** | **Monopoly Sets & Build Optimizer** | Theo dõi tiến độ sở hữu các bộ màu (Nâu, Xanh, Hồng, Cam, Đỏ, Vàng, Xanh lá...). Hướng dẫn thời điểm tối ưu để xây nhà (mốc 3 nhà trên 1 ô cho ROI hoàn vốn nhanh nhất). |
| **⚡ Auto Roll** | **Tự động đổ xúc xắc** | Tự động bấm đổ khi tới lượt với độ trễ jitter ngẫu nhiên (350–700ms) mô phỏng thao tác của con người. |
| **🛒 Auto Buy** | **Tự động mua đất an toàn** | Tự động mua các ô đất trống nếu số tiền mặt dự phòng sau khi mua vẫn lớn hơn ngưỡng an toàn (mặc định > $300). |
| **⏭️ Auto End Turn** | **Tự động kết thúc lượt** | Tự động bấm "End Turn" ngay sau khi hoàn tất các thao tác để tăng tốc trận đấu. |
| **🎲 Auto Re-Roll** | **Tự đổ tiếp khi trúng số đôi** | Tự động nhận diện khi đổ ra cặp số giống nhau (Doubles) để đổ tiếp lượt phụ. |
| **🎯 Auction Sniper** | **Bắn tỉa đấu giá** | Tự động theo dõi các phiên đấu giá đất và trả giá vào 1 giây cuối nếu giá còn dưới ngưỡng sinh lời. |

---

## ⌨️ Phím tắt nhanh (Hotkeys)

- **`F2`** hoặc **`H`**: Ẩn / Hiện Menu Mod HUD.
- **`R`**: Đổ xúc xắc thủ công ngay lập tức.
- **`E`**: Kết thúc lượt ngay lập tức.
- **Kéo thả chuột**: Nhấp giữ vào thanh tiêu đề màu xanh của HUD để di chuyển vị trí bất kỳ trên màn hình.

---

## 🎨 Giao diện Menu Mod (Modern White-Blue HUD)

- Giao diện thiết kế theo phong cách White-Blue hiện đại, card bo tròn, đổ bóng mềm mại.
- Có nút thu gọn thành icon viên thuốc tròn nhỏ gọn `[🎲 HUD]` góc màn hình khi không cần mở rộng.
- Tự động lưu vị trí kéo thả và cài đặt Toggle vào `localStorage` của trình duyệt.
- Tự động cập nhật phiên bản mới nhất qua tính năng `@updateURL` của Tampermonkey.

---

## 🛡️ Tuyên bố miễn trừ trách nhiệm (Disclaimer)
Tool được phát triển nhằm mục đích nghiên cứu, học tập và giải trí cùng bạn bè. Vui lòng sử dụng có trách nhiệm và tôn trọng cộng đồng người chơi.
