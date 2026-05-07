/**
 * app.js — Logic chính của dApp Voting
 *
 * File này kết nối ví, tải dữ liệu và gọi các hàm trong eventHandler.js
 * Các hàm được đánh dấu ★ là nơi tích hợp phần xử lý sự kiện
 */

// ─── State ────────────────────────────────────────────────────────────────────
var provider    = null;
var signer      = null;
var contract    = null;
var account     = null;
var countdownId = null;

// ─── Tự động kết nối nếu đã từng kết nối trước đó ───────────────────────────
window.addEventListener("DOMContentLoaded", function() {
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    }

    // Lắng nghe MetaMask đổi tài khoản
    if (window.ethereum) {
        window.ethereum.on("accountsChanged", function(accounts) {
            // ★ Dọn dẹp listener khi đổi tài khoản
            removeRealtimeListener();
            clearInterval(countdownId);

            if (accounts.length === 0) {
                resetWalletUI();
            } else {
                connectWallet();
            }
        });

        // Tải lại trang khi đổi mạng
        window.ethereum.on("chainChanged", function() {
            removeRealtimeListener(); // ★ Dọn dẹp trước khi reload
            window.location.reload();
        });
    }
});

// ════════════════════════════════════════════════════════════════
// KẾT NỐI VÍ
// ════════════════════════════════════════════════════════════════

async function connectWallet() {
    if (!window.ethereum) {
        showToast("Không tìm thấy MetaMask",
            "Vui lòng cài tiện ích MetaMask trên trình duyệt.", "error");
        return;
    }

    try {
        setBtnLoading("btn-connect", true, "Đang kết nối...");

        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer  = await provider.getSigner();
        account = await signer.getAddress();

        // Khởi tạo contract
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        // Cập nhật giao diện ví
        var net = await provider.getNetwork();
        document.getElementById("wallet-dot").classList.add("connected");
        document.getElementById("wallet-address").textContent = account;
        document.getElementById("btn-connect").textContent    = "✅ Đã kết nối";

        // Tải dữ liệu ban đầu
        await loadContractInfo();
        await loadCandidates();
        await checkVoterStatus();

        // ★ PHẦN XỬ LÝ SỰ KIỆN ─────────────────────────────────────────────

        // 1. Khởi tạo module eventHandler với contract và callback
        initEventHandler(contract, account, async function() {
            // Hàm này chạy mỗi khi có phiếu bầu mới
            await loadCandidates();
        });

        // 2. Kích hoạt listener real-time
        setupRealtimeListener();

        // 3. Tải lịch sử giao dịch từ blockchain
        await loadTransactionHistory();

        // ───────────────────────────────────────────────────────────────────

        startCountdown();
        showToast("Kết nối thành công!", account.slice(0,6) + "..." + account.slice(-4), "success");

    } catch(err) {
        console.error("[App] connectWallet:", err);
        showToast("Kết nối thất bại", friendlyError(err), "error");
        document.getElementById("btn-connect").textContent = "🔌 Kết nối MetaMask";
    } finally {
        setBtnLoading("btn-connect", false);
    }
}

function resetWalletUI() {
    account  = null;
    contract = null;
    document.getElementById("wallet-dot").classList.remove("connected");
    document.getElementById("wallet-address").textContent = "Chưa kết nối";
    document.getElementById("btn-connect").textContent    = "🔌 Kết nối MetaMask";
    document.getElementById("vote-status-badge").textContent = "Chưa bỏ phiếu";
}

// ════════════════════════════════════════════════════════════════
// TẢI THÔNG TIN CUỘC BẦU CỬ
// ════════════════════════════════════════════════════════════════

async function loadContractInfo() {
    try {
        var info   = await contract.getContractInfo();
        var status = info[6]; // vị trí status trong tuple trả về

        // Hiện banner
        var banner = document.getElementById("election-banner");
        banner.style.display = "flex";
        banner.className     = "election-banner";

        var statusMap = {
            "DANG_MO":        { cls: "active",   icon: "🟢", text: "Bầu cử đang mở — Hãy bỏ phiếu!" },
            "CHUA_MO":        { cls: "upcoming", icon: "⏳", text: "Bầu cử chưa bắt đầu."            },
            "DA_KET_THUC":    { cls: "ended",    icon: "🔴", text: "Bầu cử đã kết thúc."             },
            "KHONG_GIOI_HAN": { cls: "active",   icon: "🟢", text: "Bầu cử đang mở (không giới hạn thời gian)." },
        };
        var cfg = statusMap[status] || { cls: "active", icon: "🟢", text: status };
        banner.classList.add(cfg.cls);
        document.getElementById("banner-icon").textContent = cfg.icon;
        document.getElementById("banner-text").textContent = cfg.text;

        // Lưu cho countdown
        window._electionStatus = status;
        window._startTime      = Number(info[3]);
        window._endTime        = Number(info[4]);
        window._timingEnabled  = info[2];

    } catch(err) {
        console.error("[App] loadContractInfo:", err);
    }
}

// ════════════════════════════════════════════════════════════════
// TẢI DANH SÁCH ỨNG VIÊN
// ════════════════════════════════════════════════════════════════

async function loadCandidates() {
    var tbody    = document.getElementById("candidates-tbody");
    var selectEl = document.getElementById("candidate-select");
    var badge    = document.getElementById("candidate-count-badge");
    if (!tbody) return;

    try {
        var candidates = await contract.getAllCandidates();
        var total = candidates.reduce(function(s, c) {
            return s + Number(c.voteCount);
        }, 0);

        if (badge) badge.textContent = candidates.length + " ứng viên";

        // Sắp xếp theo phiếu giảm dần
        var sorted = candidates.slice().sort(function(a, b) {
            return Number(b.voteCount) - Number(a.voteCount);
        });

        // Render bảng
        tbody.innerHTML = sorted.map(function(c, i) {
            var pct = total > 0
                ? ((Number(c.voteCount) / total) * 100).toFixed(1)
                : "0.0";
            return "<tr>"
                + "<td>" + (i + 1) + "</td>"
                + "<td>" + (i === 0 && Number(c.voteCount) > 0 ? "🥇 " : "") + c.name + "</td>"
                + "<td>"
                +   "<div class='vote-bar-wrap'>"
                +     "<div class='vote-bar-bg'>"
                +       "<div class='vote-bar-fill' style='width:" + pct + "%'></div>"
                +     "</div>"
                +     "<span class='vote-num'>" + c.voteCount + "</span>"
                +   "</div>"
                + "</td>"
                + "<td>" + pct + "%</td>"
                + "</tr>";
        }).join("");

        // Dropdown bỏ phiếu
        if (selectEl) {
            var prevVal = selectEl.value;
            selectEl.innerHTML = '<option value="">— Chọn ứng viên —</option>';
            candidates.forEach(function(c) {
                var opt = document.createElement("option");
                opt.value       = c.id;
                opt.textContent = c.name;
                selectEl.appendChild(opt);
            });
            if (prevVal) selectEl.value = prevVal;
        }

        // Cập nhật tổng phiếu
        var totalEl = document.getElementById("total-votes");
        if (totalEl) totalEl.textContent = total;

        var countEl = document.getElementById("candidate-count");
        if (countEl) countEl.textContent = candidates.length;

    } catch(err) {
        console.error("[App] loadCandidates:", err);
        tbody.innerHTML = "<tr><td colspan='4' class='error-cell'>⚠️ Không thể tải danh sách: " + friendlyError(err) + "</td></tr>";
    }
}

// ════════════════════════════════════════════════════════════════
// KIỂM TRA ĐÃ BỎ PHIẾU CHƯA
// ════════════════════════════════════════════════════════════════

async function checkVoterStatus() {
    if (!account || !contract) return;
    try {
        var voted    = await contract.checkHasVoted(account);
        var formEl   = document.getElementById("vote-form-section");
        var votedEl  = document.getElementById("voted-message");
        var badgeEl  = document.getElementById("vote-status-badge");

        if (voted) {
            if (formEl)  formEl.style.display  = "none";
            if (votedEl) votedEl.style.display  = "block";
            if (badgeEl) {
                badgeEl.textContent = "✓ Đã bỏ phiếu";
                badgeEl.className   = "badge badge-success";
            }
        } else {
            if (formEl)  formEl.style.display  = "block";
            if (votedEl) votedEl.style.display  = "none";
            if (badgeEl) {
                badgeEl.textContent = "Chưa bỏ phiếu";
                badgeEl.className   = "badge";
            }
        }
    } catch(err) {
        console.error("[App] checkVoterStatus:", err);
    }
}

// ════════════════════════════════════════════════════════════════
// BỎ PHIẾU
// ════════════════════════════════════════════════════════════════

async function castVote() {
    var selectEl    = document.getElementById("candidate-select");
    var candidateId = Number(selectEl ? selectEl.value : 0);

    if (!candidateId) {
        showToast("Chưa chọn ứng viên", "Hãy chọn một ứng viên từ danh sách.", "warning");
        return;
    }
    if (!contract || !account) {
        showToast("Chưa kết nối", "Vui lòng kết nối ví MetaMask trước.", "error");
        return;
    }

    try {
        // 1. Hiện trạng thái chờ ký
        setBtnLoading("btn-vote", true, "Chờ ký giao dịch...");

        // 2. Gửi giao dịch lên blockchain
        var tx = await contract.vote(candidateId);
        showToast("Giao dịch đã gửi", "Đang chờ xác nhận: " + tx.hash.slice(0,10) + "...", "info", 8000);

        setBtnLoading("btn-vote", true, "Đang xác nhận...");

        // 3. Chờ block xác nhận
        await tx.wait();

        // 4. Thành công
        showToast("🎉 Bỏ phiếu thành công!", "Phiếu đã được ghi nhận trên blockchain.", "success");

        await loadCandidates();
        await checkVoterStatus();

        // ★ Cập nhật lịch sử giao dịch sau khi bỏ phiếu
        await loadTransactionHistory();

    } catch(err) {
        console.error("[App] castVote:", err);
        showToast("Bỏ phiếu thất bại", friendlyError(err), "error");
    } finally {
        setBtnLoading("btn-vote", false);
    }
}

// ════════════════════════════════════════════════════════════════
// ĐẾM NGƯỢC THỜI GIAN
// ════════════════════════════════════════════════════════════════

function startCountdown() {
    clearInterval(countdownId);
    var el = document.getElementById("countdown");
    if (!el) return;

    countdownId = setInterval(function() {
        if (!window._timingEnabled) {
            el.textContent = "Không giới hạn";
            clearInterval(countdownId);
            return;
        }

        var now    = Math.floor(Date.now() / 1000);
        var target = (window._electionStatus === "DANG_MO")
            ? window._endTime : window._startTime;
        var diff   = target - now;

        if (diff <= 0) {
            el.textContent = "Kết thúc";
            clearInterval(countdownId);
            return;
        }

        var h = Math.floor(diff / 3600);
        var m = Math.floor((diff % 3600) / 60);
        var s = diff % 60;
        el.textContent = pad(h) + ":" + pad(m) + ":" + pad(s);
    }, 1000);
}

function pad(n) { return String(n).padStart(2, "0"); }
