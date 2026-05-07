/**
 * eventHandler.js
 * Xử lý Sự kiện (Event Handling) — dApp Voting
 *
 * Gồm 3 chức năng chính:
 *   1. setupRealtimeListener()   — Lắng nghe votedEvent real-time (không cần F5)
 *   2. removeRealtimeListener()  — Dọn dẹp listener, tránh memory leak
 *   3. loadTransactionHistory()  — Đọc lịch sử phiếu bầu từ blockchain
 *
 * Cách dùng: nhúng file này vào HTML sau khi đã nhúng ethers.js
 * <script src="eventHandler.js"></script>
 */

// ─── Biến nội bộ ─────────────────────────────────────────────────────────────
var _contract       = null;   // Contract object (Ethers.js v6)
var _currentAccount = null;   // Địa chỉ ví đang kết nối
var _onNewVote      = null;   // Callback gọi khi có phiếu bầu mới

// ════════════════════════════════════════════════════════════════
// KHỞI TẠO
// ════════════════════════════════════════════════════════════════

/**
 * Khởi tạo module. Gọi hàm này ngay sau khi connect ví thành công.
 *
 * @param {object}   contract  - ethers.Contract đã có signer
 * @param {string}   account   - Địa chỉ ví hiện tại
 * @param {function} onNewVote - Callback chạy sau mỗi phiếu mới,
 *                               thường là hàm loadCandidates() của nhóm
 */
function initEventHandler(contract, account, onNewVote) {
    _contract       = contract;
    _currentAccount = account;
    _onNewVote      = onNewVote;
}

// ════════════════════════════════════════════════════════════════
// 1. LẮNG NGHE EVENT REAL-TIME
// ════════════════════════════════════════════════════════════════

/**
 * Đăng ký listener cho event votedEvent.
 * Mỗi khi có phiếu bầu mới trên blockchain → callback chạy ngay,
 * bảng kết quả và biểu đồ cập nhật tự động mà không cần F5.
 */
function setupRealtimeListener() {
    if (!_contract) {
        console.warn("[EventHandler] Chưa khởi tạo — gọi initEventHandler() trước.");
        return;
    }

    // Xóa listener cũ trước để tránh bị gọi nhiều lần
    removeRealtimeListener();

    _contract.on("votedEvent", async function(candidateId) {
        console.log("[EventHandler] votedEvent nhận được, candidateId =", candidateId.toString());

        // Gọi callback (thường là loadCandidates)
        if (typeof _onNewVote === "function") {
            await _onNewVote();
        }

        // Cập nhật lại lịch sử giao dịch
        await loadTransactionHistory();

        // Lấy tên ứng viên để hiển thị toast
        var tenUngVien = "Ứng viên #" + candidateId.toString();
        try {
            var c = await _contract.getCandidate(candidateId);
            tenUngVien = c.name;
        } catch(e) { /* giữ tên mặc định */ }

        showToast("🗳️ Có phiếu bầu mới!", "Vừa có người bỏ phiếu cho " + tenUngVien, "info");
    });

    console.log("[EventHandler] ✅ Realtime listener đang hoạt động.");
}

/**
 * Gỡ bỏ listener — gọi khi đổi tài khoản hoặc đổi mạng.
 * Bắt buộc phải gọi để tránh memory leak.
 */
function removeRealtimeListener() {
    if (!_contract) return;
    try {
        _contract.off("votedEvent");
        console.log("[EventHandler] Listener đã được gỡ bỏ.");
    } catch(e) {
        console.warn("[EventHandler] Không thể gỡ listener:", e.message);
    }
}

// ════════════════════════════════════════════════════════════════
// 2. LỊCH SỬ GIAO DỊCH
// ════════════════════════════════════════════════════════════════

/**
 * Đọc toàn bộ lịch sử phiếu bầu từ blockchain bằng queryFilter().
 * Hiển thị 20 giao dịch gần nhất vào phần tử #tx-list trong HTML.
 */
async function loadTransactionHistory() {
    var container = document.getElementById("tx-list");
    if (!container || !_contract) return;

    // Hiện loading
    container.innerHTML = '<div class="tx-loading"><span class="spinner-sm"></span> Đang đọc từ blockchain...</div>';

    try {
        // Bước 1: Tạo filter cho event votedEvent
        var filter = _contract.filters.votedEvent();

        // Bước 2: Truy vấn tất cả event từ block 0 đến mới nhất
        var events = await _contract.queryFilter(filter, 0, "latest");

        // Cập nhật số đếm giao dịch
        var countEl = document.getElementById("tx-count");
        if (countEl) countEl.textContent = events.length + " giao dịch";

        if (events.length === 0) {
            container.innerHTML = '<div class="tx-empty">Chưa có phiếu bầu nào được ghi nhận.</div>';
            return;
        }

        // Bước 3: Lấy 20 giao dịch gần nhất (mới nhất lên đầu)
        var recent = events.slice().reverse().slice(0, 20);

        // Bước 4: Render từng dòng
        var rows = await Promise.all(recent.map(async function(ev) {
            var txHash      = ev.transactionHash;
            var blockNo     = ev.blockNumber;
            var candidateId = ev.args[0];

            // Lấy tên ứng viên
            var tenUngVien = "Ứng viên #" + candidateId.toString();
            try {
                var c = await _contract.getCandidate(candidateId);
                tenUngVien = c.exists ? c.name : c.name + " (đã xóa)";
            } catch(e) { /* giữ tên mặc định */ }

            var shortHash = txHash.slice(0, 10) + "..." + txHash.slice(-6);

            return '<div class="tx-item">'
                + '<span class="tx-hash" title="' + txHash + '">🔗 ' + shortHash + '</span>'
                + '<span class="tx-block">Block #' + blockNo + '</span>'
                + '<span class="tx-candidate">→ ' + tenUngVien + '</span>'
                + '</div>';
        }));

        container.innerHTML = rows.join("");

    } catch(err) {
        console.error("[EventHandler] loadTransactionHistory lỗi:", err);
        container.innerHTML = '<div class="tx-error">⚠️ Không thể tải lịch sử. Vui lòng thử lại.</div>';
    }
}

/**
 * Nút Refresh — tải lại lịch sử theo yêu cầu người dùng.
 * Gắn vào onclick của nút: onclick="refreshHistory()"
 */
async function refreshHistory() {
    if (!_contract) {
        showToast("Chưa kết nối", "Vui lòng kết nối ví MetaMask trước.", "warning");
        return;
    }
    await loadTransactionHistory();
}

// ════════════════════════════════════════════════════════════════
// 3. TOAST THÔNG BÁO
// ════════════════════════════════════════════════════════════════

/**
 * Hiển thị thông báo toast ở góc phải màn hình.
 *
 * @param {string} title    - Tiêu đề
 * @param {string} message  - Nội dung
 * @param {string} type     - "success" | "error" | "info" | "warning"
 * @param {number} duration - Thời gian tự đóng (ms), mặc định 4000
 */
function showToast(title, message, type, duration) {
    type     = type     || "info";
    duration = duration || 4000;

    var icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };

    var container = document.getElementById("toast-container");
    if (!container) {
        console.log("[Toast][" + type + "] " + title + ": " + message);
        return;
    }

    var el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.innerHTML =
        '<span class="toast-icon">' + (icons[type] || "ℹ️") + '</span>'
        + '<div class="toast-body">'
        +   '<div class="toast-title">' + title + '</div>'
        +   (message ? '<div class="toast-msg">' + message + '</div>' : "")
        + '</div>'
        + '<button class="toast-close" onclick="this.parentElement.remove()">✕</button>';

    container.appendChild(el);

    // Tự đóng sau duration ms
    var timer = setTimeout(function() {
        el.classList.add("toast-hiding");
        setTimeout(function() { el.remove(); }, 300);
    }, duration);

    el.addEventListener("click", function() {
        clearTimeout(timer);
        el.classList.add("toast-hiding");
        setTimeout(function() { el.remove(); }, 300);
    });
}

// ════════════════════════════════════════════════════════════════
// 4. LOADING STATE & XỬ LÝ LỖI
// ════════════════════════════════════════════════════════════════

/**
 * Bật/tắt trạng thái loading trên nút bấm.
 *
 * @param {string}  btnId     - ID nút trong HTML
 * @param {boolean} loading   - true = bật, false = tắt
 * @param {string}  text      - Chữ hiển thị khi đang loading
 */
function setBtnLoading(btnId, loading, text) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        if (!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span>' + (text || "Đang xử lý...");
    } else {
        btn.innerHTML = btn.dataset.orig || (text || btn.innerHTML);
        delete btn.dataset.orig;
    }
}

/**
 * Chuyển lỗi kỹ thuật sang tiếng Việt thân thiện.
 *
 * @param  {Error}  err - Lỗi bắt được từ try/catch
 * @return {string}     - Thông báo thân thiện
 */
function friendlyError(err) {
    if (err.code === 4001 || err.code === "ACTION_REJECTED")
        return "Bạn đã từ chối ký giao dịch trong MetaMask.";
    if (err.reason)       return err.reason;
    if (err.shortMessage) return err.shortMessage;

    var msg = (err.message || "").toLowerCase();
    if (msg.includes("ban da bo phieu roi"))
        return "Bạn đã bỏ phiếu trước đó rồi.";
    if (msg.includes("chua den thoi gian"))
        return "Chưa đến thời gian bầu cử.";
    if (msg.includes("da het thoi gian"))
        return "Thời gian bầu cử đã kết thúc.";
    if (msg.includes("ban khong co trong danh sach"))
        return "Bạn không có trong danh sách cử tri được ủy quyền.";
    if (msg.includes("id ung vien khong hop le"))
        return "ID ứng viên không hợp lệ.";
    if (msg.includes("insufficient funds"))
        return "Số dư ETH không đủ để trả phí gas.";

    return (err.message || "Lỗi không xác định.").slice(0, 150);
}
