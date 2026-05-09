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
git clone https://github.com/nguyen-gia-tuong/dApp-Voting.git
cd dApp-Voting
```

### Bước 2 — Mở `index.html` bằng Live Server

1. Mở folder `dApp-Voting` trong VS Code
2. Right-click `index.html` → **Open with Live Server**
3. Trang web tự bật ở `http://127.0.0.1:5500/index.html`

### Bước 3 — Kết nối MetaMask

1. Trên trang web, click nút **"Bắt đầu bầu cử ngay"** ở hero
2. MetaMask popup → click **Connect**
3. Đảm bảo MetaMask đang ở mạng **Hardhat Localhost** (chainId `31337`, RPC
   `http://127.0.0.1:8545`). Nếu chưa có, thêm thủ công:

   - Network name: `Hardhat Localhost`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`

> 💡 **Backend Hardhat node phải chạy trước** để frontend kết nối được. Việc này do
> teammate phụ trách backend setup. Nếu bạn cần test nhanh không có backend, vẫn xem
> được giao diện nhưng không vote được.

---

## 🧪 Test các tính năng

### Bỏ phiếu thường

1. Click **"Bắt đầu bầu cử ngay"** → MetaMask connect
2. Cuộn xuống bảng **"Bảng xếp hạng ứng viên"**
3. Section **"Bỏ phiếu của bạn"** bên phải → chọn ứng viên trong picker → click **Vote**
4. MetaMask popup ký giao dịch → progress modal (Stage 1 → 3) → confetti vàng + toast
5. Bảng + chart tự cập nhật, hàng ứng viên dẫn đầu nhảy lên top với gold treatment

### Test admin (chỉ tài khoản owner thấy)

Tài khoản owner = account đã deploy contract (mặc định Hardhat account #0).

1. MetaMask switch sang account owner → reload trang
2. Topbar xuất hiện nút **"Bảng điều khiển"** màu gold
3. Click → vào admin panel với 4 tab:
   - **Ứng viên** — thêm/xóa ứng viên
   - **Thời gian** — set start/end với Flatpickr (click date input → calendar đẹp với
     month dropdown + year ±30 năm)
   - **Whitelist** — bật/tắt whitelist, thêm địa chỉ 1-1 hoặc batch
   - **Thống kê** — overview dashboard

### Test multi-account (vote từ nhiều ví)

Hardhat node tự sinh sẵn 20 test account (mỗi cái 10000 ETH). Để test multi-vote:

1. MetaMask → click avatar → **Import account** → paste private key của account #1:
   ```
   0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
   ```
   (Lấy private key bất kỳ trong list Hardhat node terminal khi khởi động)
2. Switch sang account đó → reload → vote cho ứng viên khác
3. Nếu whitelist đang bật, owner phải whitelist account đó trước khi vote

### Test theme dark mode

- Click icon orb 🌙 ở topbar → toggle dark mode (View Transitions ripple animation)
- Theme save vào `localStorage`, persist khi reload

---

## 🗂️ Cấu trúc frontend

| File | Vai trò |
|------|---------|
| `index.html` | Layout chính: hero, results table, vote form, admin panel, modals |
| `style.css` | Design system v3.3 Luxe (~6000 dòng): light navy + dark gold theme, Flatpickr custom theme |
| `app.js` | Vanilla JS + ethers.js v6 (~2200 dòng): connect wallet, load candidates, vote flow, real-time event listener, charts |
| `admin.js` | Admin panel logic (~700 dòng): tabs, datetime picker, whitelist tracking |
| `eventHandler.js` | Subscribe `votedEvent` real-time, render transaction history |
| `contract-config.js` | ABI + contract address (auto-generated khi deploy) |

### Thư viện CDN

- [Lucide Icons](https://lucide.dev/) — icon system
- [Ethers.js v6](https://docs.ethers.org/v6/) — Web3 client
- [Chart.js v4](https://www.chartjs.org/) — biểu đồ kết quả
- [Flatpickr v4.6](https://flatpickr.js.org/) — datetime picker đẹp + locale Vietnamese

---

## 🎨 Design system

| Theme | Background | Primary | Accent |
|-------|------------|---------|--------|
| **Light** | `#FCFCFD → #F4F6FA` | Navy `#0A2540` | Blue `#2962FF` + Gold `#C9A961` |
| **Dark** | Jet black `#04040A` multi-layer + 6 radial spotlights | Gold `#E8C268` | Gold gradient |

Typography:
- **Display**: Source Serif 4 (variable, italic + slant)
- **Body**: Inter 14.5px
- **Mono / numbers / hash**: JetBrains Mono

---

## 🐛 Troubleshooting

| Vấn đề | Cách fix |
|--------|----------|
| **MetaMask "wrong network"** | Switch sang Hardhat Localhost (chainId 31337) bằng nút "Chuyển ngay" trong banner |
| **"Insufficient funds"** | Account chưa có ETH — import 1 trong 20 Hardhat test accounts (mỗi cái 10000 ETH sẵn) |
| **Vote không lên** | Check Hardhat node terminal có đang chạy không. F12 console xem error chi tiết |
| **Đã vote rồi muốn test lại** | Switch MetaMask sang account khác (mỗi address chỉ vote 1 lần — by design của smart contract) |
| **MetaMask "nonce too high"** | Settings → Advanced → Clear activity tab data (do reset Hardhat node) |

---

