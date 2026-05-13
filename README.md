# VoteChain — dApp Bầu cử trên Ethereum

Ứng dụng phi tập trung (dApp) bầu cử minh bạch, mỗi phiếu được ký bằng ví MetaMask và ghi vĩnh viễn lên blockchain Ethereum. Bài tập nhóm môn **Công nghệ chuỗi khối** — Đại học Kinh tế TPHCM (UEH).

> 🎓 **Khoa Công nghệ thông tin kinh doanh · UEH 2026** · Bài tập nhóm dApp Voting

---

## 👥 Thông tin nhóm F

| Họ và tên | Vai trò đóng góp |
| --- | --- |
| **Đinh Mạnh Đức** | Test |
| **Nguyễn Gia Tường** | Smart Contract |
| **Nguyễn Ngọc Thuỷ** | Báo cáo kỹ thuật |
| **Trương Hoàng Khang** | Xử lý sự kiện |
| **Trần Bùi Hoàng Kim** | Frontend |

---

## ✨ Mô tả chức năng

Dự án cung cấp một giải pháp bầu cử phi tập trung toàn diện với các tính năng:

* 🔐 **Kết nối MetaMask**: Xác thực người dùng qua địa chỉ ví, không cần mật khẩu.
* 🗳️ **Cơ chế bỏ phiếu**: Mỗi ví chỉ được bầu một lần. Hệ thống tự động kiểm tra tính hợp lệ qua Smart Contract.
* 📊 **Bảng xếp hạng Real-time**: Biểu đồ Chart.js tự động cập nhật ngay khi có `votedEvent` từ blockchain.
* 👑 **Quản trị (Admin Panel)**: Chỉ chủ sở hữu hợp đồng (Owner) mới có quyền:
* Thêm/Xóa ứng cử viên.
* Thiết lập thời gian bắt đầu và kết thúc bầu cử.
* Quản lý danh sách cử tri được phép (Whitelist).


* 📜 **Lịch sử giao dịch**: Hiển thị minh bạch mã băm (tx hash), số block và thời gian thực của mọi lá phiếu.
* 🎨 **Thiết kế Luxe UI/UX**: Hỗ trợ Dark/Light mode với hiệu ứng View Transitions API hiện đại.

---

## 🚀 Hướng dẫn chạy dự án chi tiết

### Yêu cầu hệ thống

* [VS Code](https://code.visualstudio.com/) + Extension [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer).
* [Node.js](https://nodejs.org/) (để chạy Hardhat node).
* Extension [MetaMask](https://metamask.io/) trên trình duyệt.

### Bước 1: Khởi chạy Blockchain nội bộ (Hardhat)

Mở Terminal và chạy lệnh sau để bật máy chủ blockchain ảo:

```bash
npx hardhat node

```

*Lưu ý: Giữ Terminal này chạy xuyên suốt quá trình sử dụng dApp.*

### Bước 2: Triển khai Smart Contract

Mở một Terminal khác và thực hiện deploy hợp đồng lên mạng localhost:

```bash
npx hardhat ignition deploy ignition/modules/Voting.js --network localhost

```

### Bước 3: Cấu hình MetaMask

1. Thêm mạng mới thủ công vào MetaMask:
* **Network Name**: `Hardhat Localhost`
* **RPC URL**: `http://127.0.0.1:8545`
* **Chain ID**: `31337`
* **Currency**: `ETH`


2. Nhập (Import) Private Key của **Account #0** từ Terminal Hardhat vào MetaMask để có quyền Admin.

### Bước 4: Khởi động Frontend

1. Mở folder dự án bằng VS Code.
2. Chuột phải vào file `index.html` → chọn **Open with Live Server**.
3. Truy cập `http://127.0.0.1:5500` và bắt đầu bầu cử.

---

## 🗂️ Cấu trúc thư mục

| Tên tệp/Thư mục | Chức năng |
| --- | --- |
| `contracts/` | Chứa mã nguồn Smart Contract (Solidity) |
| `ignition/` | Chứa kịch bản deploy hợp đồng |
| `index.html` | Cấu trúc layout chính của dApp |
| `app.js` | Logic kết nối Ethers.js và xử lý bầu cử |
| `admin.js` | Logic quản lý dành cho Admin |
| `style.css` | Hệ thống Design System (Light/Dark mode) |
| `contract-config.js` | Lưu trữ ABI và địa chỉ Contract sau khi deploy |

---

## 🐛 Troubleshooting (Xử lý sự cố)

| Lỗi thường gặp | Giải pháp |
| --- | --- |
| **MetaMask "nonce too high"** | Vào Settings → Advanced → Clear activity tab data (do reset Hardhat node). |
| **Không thấy nút Admin** | Đảm bảo bạn đang sử dụng ví đã dùng để deploy contract (Account #0). |
| **Giao diện không load ứng viên** | Kiểm tra xem Terminal chạy `npx hardhat node` có bị tắt không. |

---

**VoteChain Nhóm F** — Bài tập môn Công nghệ chuỗi khối · UEH 2026