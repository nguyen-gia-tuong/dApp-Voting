# VoteChain — dApp Bầu cử trên Ethereum

Ứng dụng phi tập trung (dApp) bầu cử minh bạch, mỗi phiếu được ký bằng ví MetaMask
và ghi vĩnh viễn lên blockchain Ethereum. Bài tập nhóm môn **Công nghệ chuỗi khối** —
Đại học Kinh tế TPHCM (UEH).

> 🎓 **Khoa Công nghệ thông tin kinh doanh · UEH 2026** · Bài tập nhóm dApp Voting

---

## ✨ Tính năng

- 🔐 **Kết nối MetaMask** — ký giao dịch trực tiếp từ ví, không cần đăng nhập trung gian
- 🗳️ **Bỏ phiếu 1 lần / 1 ví** — smart contract chống double-vote tự động
- 📊 **Bảng xếp hạng real-time** — ứng viên dẫn đầu có gold accent, biểu đồ Chart.js
  bar + doughnut tự động cập nhật khi có vote mới (event listener)
- 🎨 **Theme Light + Dark** — light navy gold / dark deep noir gold, toggle bằng orb
  animation (View Transitions API)
- 👑 **Admin Panel** — chỉ owner thấy nút "Bảng điều khiển": thêm/xóa ứng viên,
  set start/end time với Flatpickr datetime picker, whitelist cử tri
- 📜 **Lịch sử giao dịch** — đọc event `votedEvent` từ blockchain, hiển thị tx hash +
  block number + thời gian, link tới explorer
- 🎉 **Confetti + toast khi vote thành công** — visual feedback + optimistic UI
  (bảng + chart nhảy số ngay khi user ký ví, không chờ on-chain confirm)

---

## 🚀 Chạy frontend trong 30 giây

Frontend là HTML/CSS/JS thuần, không cần build. Bạn chỉ cần serve qua local server
bất kỳ. Cách nhanh nhất là **VS Code Live Server**.

### Yêu cầu

- 📦 [VS Code](https://code.visualstudio.com/) + extension
  [Live Server (Ritwick Dey)](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
- 🦊 [MetaMask](https://metamask.io/) — extension Chrome/Firefox/Edge

### Bước 1 — Clone repo

```bash
git clone [https://github.com/nguyen-gia-tuong/dApp-Voting.git](https://github.com/nguyen-gia-tuong/dApp-Voting.git)
cd dApp-Voting