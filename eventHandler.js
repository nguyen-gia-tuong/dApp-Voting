/**
 * eventHandler.js
 * Xử lý Sự kiện (Event Handling) — dApp Voting
 *
 * Gồm các chức năng chính:
 *   1. setupRealtimeListener()   — Lắng nghe votedEvent real-time
 *   2. removeRealtimeListener()  — Dọn dẹp listener (tránh memory leak)
 *   3. loadTransactionHistory()  — Đọc lịch sử phiếu bầu (queryFilter)
 *      • Hiển thị: tx hash (link block explorer), block, sender, timestamp, ứng viên
 *      • Cache block + tx info để tránh request lặp
 *   4. showToast(), setBtnLoading(), friendlyError() — UI utilities
 *
 * Yêu cầu: ethers.js v6 đã được nhúng.
 */

// ─── State nội bộ ─────────────────────────────────────────────────────────
var _contract       = null;
var _currentAccount = null;
var _onNewVote      = null;

// Cache để tránh fetch trùng lặp
var _blockCache = {};   // blockNumber → timestamp
var _txCache    = {};   // txHash → from address

// ════════════════════════════════════════════════════════════════════════
// KHỞI TẠO
// ════════════════════════════════════════════════════════════════════════

function initEventHandler(contract, account, onNewVote) {
    _contract       = contract;
    _currentAccount = account;
    _onNewVote      = onNewVote;
}

// ════════════════════════════════════════════════════════════════════════
// 1. REAL-TIME LISTENER
// ════════════════════════════════════════════════════════════════════════

function setupRealtimeListener() {
    if (!_contract) {
        console.warn("[EventHandler] Chưa khởi tạo — gọi initEventHandler() trước.");
        return;
    }

    removeRealtimeListener();

    _contract.on("votedEvent", async function(candidateId, ev) {
        console.log("[EventHandler] votedEvent nhận được, candidateId =", candidateId.toString());

        if (typeof _onNewVote === "function") {
            await _onNewVote();
        }
        await loadTransactionHistory();

        var tenUngVien = "Ứng viên #" + candidateId.toString();
        try {
            var c = await _contract.getCandidate(candidateId);
            tenUngVien = c.name;
        } catch(e) { /* giữ tên mặc định */ }

        // Phase 7.3 — Push vào activity ticker (sticky bottom-left)
        pushActivity('Vừa có phiếu cho <strong>' + escapeHtmlEH(tenUngVien) + '</strong> · vài giây trước');

        // Wave 4A — Đồng bộ vào hero dashboard activity feed (in-hero social proof)
        var heroAct = document.getElementById("hero-dash-activity");
        if (heroAct) {
            heroAct.innerHTML = 'Vừa có phiếu cho <strong>' + escapeHtmlEH(tenUngVien) + '</strong>';
        }

        // Real-time visual feedback — kết nối toast với data thực tế:
        //   1. Row của ứng viên đó "lóe sáng" (.is-remote-vote, 1.4s)
        //   2. Hero front card "VOTES CONFIRMED" celebrate animation (1.2s)
        try { triggerRemoteVotePulse(candidateId); } catch(e) { /* non-fatal */ }

        // Live Ledger: drop block mới + update IMMUTABLE badge với hash của event
        try { if (typeof dropLedgerBlock === "function") dropLedgerBlock(); } catch(e) { /* non-fatal */ }
        try {
            // ev là EventLog từ ethers v6, có .log.transactionHash
            var txHash = (ev && ev.log && ev.log.transactionHash)
                || (ev && ev.transactionHash)
                || null;
            if (txHash && typeof updateImmutableBadge === "function") {
                updateImmutableBadge(txHash, "immutable");
            }
        } catch(e) { /* non-fatal */ }

        showToast("Có phiếu bầu mới", "Vừa có người bỏ phiếu cho " + tenUngVien, "info");
    });

    console.log("[EventHandler] ✅ Realtime listener đang hoạt động.");
}

function removeRealtimeListener() {
    if (!_contract) return;
    try {
        _contract.removeAllListeners("votedEvent");
        _contract.removeAllListeners("CandidateAdded");
        _contract.removeAllListeners("CandidateRemoved");
        _contract.removeAllListeners("VoterWhitelisted");
        _contract.removeAllListeners("VoterRemovedFromWhitelist");
        console.log("[EventHandler] Listener đã được gỡ bỏ.");
    } catch(e) {
        console.warn("[EventHandler] Không thể gỡ listener:", e.message);
    }
}

// ════════════════════════════════════════════════════════════════════════
// 2. LỊCH SỬ GIAO DỊCH
// ════════════════════════════════════════════════════════════════════════

async function loadTransactionHistory() {
    var container = document.getElementById("tx-list");
    if (!container || !_contract) return;

    // Phase 4.1 — Skeleton thay vì "Đang load..."
    container.innerHTML =
        '<div class="tx-item skeleton-row" style="grid-template-columns:32px 1fr 80px 120px">'
      +   '<div class="skeleton skeleton-circle"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:65%"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:50px"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:90px"></div>'
      + '</div>'
      + '<div class="tx-item skeleton-row" style="grid-template-columns:32px 1fr 80px 120px">'
      +   '<div class="skeleton skeleton-circle"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:55%"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:50px"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:90px"></div>'
      + '</div>'
      + '<div class="tx-item skeleton-row" style="grid-template-columns:32px 1fr 80px 120px">'
      +   '<div class="skeleton skeleton-circle"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:70%"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:50px"></div>'
      +   '<div class="skeleton skeleton-bar" style="width:90px"></div>'
      + '</div>';

    try {
        var filter = _contract.filters.votedEvent();
        var events = await _contract.queryFilter(filter, 0, "latest");

        var countEl = document.getElementById("tx-count");
        if (countEl) countEl.textContent = events.length === 0
            ? "Chưa có giao dịch"
            : events.length + " giao dịch";

        if (events.length === 0) {
            // Phase 5.2 — Empty state với personality
            container.innerHTML =
                '<div class="tx-empty"><i data-lucide="inbox"></i> Phiếu đầu tiên đang chờ bạn.</div>';
            refreshLucideIfAvailable();
            return;
        }

        // 20 giao dịch gần nhất, mới nhất lên đầu
        var recent = events.slice().reverse().slice(0, 20);

        // Live Ledger: badge IMMUTABLE pre-fill với hash của tx mới nhất
        try {
            var latestHash = recent[0] && recent[0].transactionHash;
            if (latestHash && typeof updateImmutableBadge === "function") {
                updateImmutableBadge(latestHash, "immutable");
            }
        } catch(e) { /* non-fatal */ }

        // Provider để fetch block + tx info
        var provider = _contract.runner && _contract.runner.provider
            ? _contract.runner.provider
            : (window.provider || null);

        // Network info để build explorer link
        var explorer = (window._networkInfo && window._networkInfo.explorer) || null;

        var rows = await Promise.all(recent.map(async function(ev) {
            var txHash      = ev.transactionHash;
            var blockNo     = ev.blockNumber;
            var candidateId = ev.args[0];

            // Tên ứng viên
            var tenUngVien = "Ứng viên #" + candidateId.toString();
            try {
                var c = await _contract.getCandidate(candidateId);
                tenUngVien = c.exists ? c.name : c.name + " (đã xóa)";
            } catch(e) {}

            // Timestamp (cached)
            var timestamp = _blockCache[blockNo];
            if (!timestamp && provider) {
                try {
                    var blk = await provider.getBlock(blockNo);
                    if (blk) {
                        timestamp = Number(blk.timestamp);
                        _blockCache[blockNo] = timestamp;
                    }
                } catch(e) {}
            }

            // Sender (cached)
            var sender = _txCache[txHash];
            if (!sender && provider) {
                try {
                    var tx = await provider.getTransaction(txHash);
                    if (tx) {
                        sender = tx.from;
                        _txCache[txHash] = sender;
                    }
                } catch(e) {}
            }

            // Build hash link
            var shortHash = txHash.slice(0, 10) + "…" + txHash.slice(-6);
            var hashHtml;
            if (explorer) {
                hashHtml = '<span class="tx-hash"><a href="' + explorer + '/tx/' + txHash
                    + '" target="_blank" rel="noopener noreferrer" title="Xem trên ' + escapeHtmlEH(window._networkInfo.name)
                    + '">' + shortHash + ' <i data-lucide="external-link" style="width:11px;height:11px;display:inline-block;vertical-align:middle"></i></a></span>';
            } else {
                hashHtml = '<span class="tx-hash" title="Local network — không có block explorer\n' + txHash + '">' + shortHash + '</span>';
            }

            // Sender + time
            var senderHtml = sender ? '<span class="mono" style="color:var(--ink-4);font-size:11.5px">' + shortAddrEH(sender) + '</span>' : '';
            var timeHtml   = timestamp ? '<span style="color:var(--ink-5);font-size:11.5px">' + relativeTime(timestamp) + '</span>' : '';

            var metaParts = [];
            if (senderHtml) metaParts.push(senderHtml);
            if (timeHtml)   metaParts.push(timeHtml);
            var metaLine = metaParts.length > 0
                ? '<div style="display:flex;gap:10px;align-items:center;margin-top:3px;flex-wrap:wrap">' + metaParts.join('<span style="color:var(--ink-6)">·</span>') + '</div>'
                : '';

            return '<div class="tx-item">'
                +    '<div class="tx-item-icon"><i data-lucide="vote"></i></div>'
                +    '<div>'
                +      hashHtml
                +      metaLine
                +    '</div>'
                +    '<span class="tx-block">Block #' + blockNo + '</span>'
                +    '<span class="tx-candidate"><i data-lucide="user-check"></i>' + escapeHtmlEH(tenUngVien) + '</span>'
                +  '</div>';
        }));

        container.innerHTML = rows.join("");
        refreshLucideIfAvailable();

    } catch(err) {
        console.error("[EventHandler] loadTransactionHistory lỗi:", err);
        // Phase 6.2 — Error state có nút retry
        container.innerHTML =
            '<div class="tx-error">'
          +   '<i data-lucide="alert-triangle"></i>'
          +   '<span>Đã xảy ra lỗi khi tải lịch sử</span>'
          +   '<button class="btn btn-ghost btn-sm" type="button" onclick="refreshHistory()" style="margin-left:auto">'
          +     '<i data-lucide="refresh-cw"></i><span>Thử lại</span>'
          +   '</button>'
          + '</div>';
        refreshLucideIfAvailable();
    }
}

async function refreshHistory() {
    if (!_contract) {
        showToast("Chưa kết nối", "Vui lòng kết nối ví MetaMask trước.", "warning");
        return;
    }
    await loadTransactionHistory();
}

// ════════════════════════════════════════════════════════════════════════
// 3. TOAST
// ════════════════════════════════════════════════════════════════════════

/**
 * showToast — extended với Phase 6.1 actions param + Phase 1.9 progress bar
 *
 * @param {string} title    — Title
 * @param {string} message  — Body
 * @param {string} type     — "success" | "error" | "info" | "warning"
 * @param {number} duration — ms (0 = không tự đóng, dùng khi có actions)
 * @param {Array}  actions  — [{ label, onclick, ghost }] tối đa 2 nút
 */
function showToast(title, message, type, duration, actions) {
    type = type || "info";
    if (duration === undefined || duration === null) duration = 4000;
    actions = actions || [];

    // Nếu có actions mà duration không set → giữ toast lại (0 = không tự đóng)
    if (actions.length > 0 && duration === 4000) duration = 0;

    var iconMap = {
        success: "check-circle-2",
        error:   "x-circle",
        info:    "info",
        warning: "alert-triangle"
    };

    var container = document.getElementById("toast-container");
    if (!container) {
        console.log("[Toast][" + type + "] " + title + ": " + message);
        return null;
    }

    var el = document.createElement("div");
    el.className = "toast toast-" + type;

    var actionsHtml = "";
    if (actions.length > 0) {
        actionsHtml = '<div class="toast-actions">';
        for (var i = 0; i < actions.length && i < 2; i++) {
            var a = actions[i];
            var cls = "toast-action" + (a.ghost ? " toast-action-ghost" : "");
            actionsHtml += '<button class="' + cls + '" data-action-idx="' + i + '">' + escapeHtmlEH(a.label) + '</button>';
        }
        actionsHtml += '</div>';
    }

    var progressHtml = duration > 0
        ? '<div class="toast-progress" style="animation-duration:' + duration + 'ms"></div>'
        : "";

    el.innerHTML =
        '<div class="toast-icon"><i data-lucide="' + (iconMap[type] || "info") + '"></i></div>'
      + '<div class="toast-body">'
      +   '<div class="toast-title">' + escapeHtmlEH(title) + '</div>'
      +   (message ? '<div class="toast-msg">' + escapeHtmlEH(message) + '</div>' : "")
      +   actionsHtml
      + '</div>'
      + '<button class="toast-close" aria-label="Đóng">'
      +   '<i data-lucide="x" style="width:14px;height:14px"></i>'
      + '</button>'
      + progressHtml;

    container.appendChild(el);
    refreshLucideIfAvailable();

    function dismiss() {
        if (el._dismissed) return;
        el._dismissed = true;
        el.classList.add("toast-hiding");
        setTimeout(function() { if (el.parentNode) el.remove(); }, 250);
    }

    var timer = duration > 0 ? setTimeout(dismiss, duration) : null;

    // Wire close button
    var closeBtn = el.querySelector(".toast-close");
    if (closeBtn) closeBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (timer) clearTimeout(timer);
        dismiss();
    });

    // Wire action buttons
    var actionBtns = el.querySelectorAll(".toast-action");
    for (var j = 0; j < actionBtns.length; j++) {
        (function(btn) {
            btn.addEventListener("click", function(e) {
                e.stopPropagation();
                var idx = Number(btn.getAttribute("data-action-idx"));
                if (timer) clearTimeout(timer);
                try {
                    if (actions[idx] && typeof actions[idx].onclick === "function") {
                        actions[idx].onclick();
                    }
                } catch(err) { console.warn("[Toast] action error:", err); }
                dismiss();
            });
        })(actionBtns[j]);
    }

    // Click body (không phải nút) → dismiss
    el.addEventListener("click", function(e) {
        if (e.target.closest(".toast-action") || e.target.closest(".toast-close")) return;
        if (timer) clearTimeout(timer);
        dismiss();
    });

    return el;
}

// ════════════════════════════════════════════════════════════════════════
// 4. LOADING + ERROR HELPERS
// ════════════════════════════════════════════════════════════════════════

function setBtnLoading(btnId, loading, text) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        if (!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span>' + (text ? '<span>' + escapeHtmlEH(text) + '</span>' : "");
    } else {
        btn.innerHTML = btn.dataset.orig || btn.innerHTML;
        delete btn.dataset.orig;
        refreshLucideIfAvailable();
    }
}

/**
 * friendlyError — Phase 5.1 extended mappings
 * Tiếng Việt thân thiện, có context.
 */
function friendlyError(err) {
    if (!err) return "Lỗi không xác định.";

    if (err.code === 4001 || err.code === "ACTION_REJECTED")
        return "Bạn đã hủy giao dịch.";
    if (err.code === 4902)
        return "Mạng chưa được thêm vào MetaMask. Hãy bấm 'Chuyển ngay' để tự động thêm.";

    var raw = (err.message || err.reason || err.shortMessage || "").toLowerCase();

    // Smart contract revert reasons (tiếng Việt từ contract)
    if (raw.includes("ban da bo phieu roi"))
        return "Bạn đã bỏ phiếu trong cuộc bầu cử này rồi.";
    if (raw.includes("chua den thoi gian"))
        return "Bầu cử chưa mở. Hãy quay lại sau.";
    if (raw.includes("da het thoi gian") || raw.includes("het thoi gian"))
        return "Bầu cử đã kết thúc.";
    if (raw.includes("ban khong co trong") || raw.includes("khong co trong danh sach"))
        return "Ví của bạn không có trong danh sách cử tri.";
    if (raw.includes("id ung vien khong"))
        return "Ứng viên không hợp lệ.";
    if (raw.includes("ung vien nay khong ton tai") || raw.includes("ung vien khong ton tai"))
        return "Ứng viên này không tồn tại hoặc đã bị xóa.";
    if (raw.includes("chi owner"))
        return "Chỉ owner mới có quyền thực hiện hành động này.";
    if (raw.includes("khong the them ung vien"))
        return "Không thể thêm ứng viên khi đang trong kỳ bầu cử.";
    if (raw.includes("khong the xoa ung vien"))
        return "Không thể xóa ứng viên khi đang trong kỳ bầu cử.";
    if (raw.includes("ten ung vien khong duoc rong"))
        return "Tên ứng viên không được để trống.";
    if (raw.includes("starttime phai truoc endtime"))
        return "Thời gian bắt đầu phải trước thời gian kết thúc.";
    if (raw.includes("endtime phai trong tuong lai"))
        return "Thời gian kết thúc phải ở tương lai.";
    if (raw.includes("dia chi khong hop le"))
        return "Địa chỉ không hợp lệ.";

    // Network / wallet errors
    if (raw.includes("insufficient funds")) {
        // Localhost (chainId 31337/1337) → Hardhat tự seed 10000 ETH cho 20 ví đầu, gợi ý import account
        var chainHex = (window._networkInfo && window._networkInfo.chainIdHex) || "";
        var isLocal = chainHex === "0x7a69" || chainHex === "0x539";
        if (isLocal) {
            return "Số dư ETH không đủ. Hãy import một account khác từ Hardhat node (mỗi account có sẵn 10000 ETH).";
        }
        return "Số dư ETH không đủ trả phí gas (~0.001 ETH). Lấy thêm ETH testnet tại https://sepoliafaucet.com hoặc https://www.alchemy.com/faucets/ethereum-sepolia.";
    }
    if (raw.includes("user rejected") || raw.includes("user denied"))
        return "Bạn đã hủy giao dịch.";
    if (raw.includes("wrong network") || raw.includes("chain mismatch") || raw.includes("unknown chain"))
        return "Hãy chuyển MetaMask sang mạng Localhost (chainId 1337).";
    if (raw.includes("nonce too low") || raw.includes("nonce has already"))
        return "Giao dịch trùng. Hãy đợi 5 giây rồi thử lại.";
    if (raw.includes("network error") || raw.includes("timeout") || raw.includes("network changed"))
        return "Mạng đang chậm hoặc mất kết nối. Hãy thử lại.";
    if (raw.includes("missing revert data"))
        return "Giao dịch thất bại. Vui lòng kiểm tra lại điều kiện bầu cử.";
    if (raw.includes("could not coalesce") || raw.includes("contract runner does not"))
        return "Mất kết nối với contract. Hãy refresh trang.";
    if (raw.includes("internal json-rpc error"))
        return "Lỗi từ blockchain node. Hãy thử lại sau vài giây.";

    // Fallback
    if (err.shortMessage) return err.shortMessage;
    if (err.reason)       return err.reason;
    return (err.message || "Lỗi không xác định.").slice(0, 180);
}

/**
 * getLoadingMessage — Phase 5.5 stage-based message variation
 */
function getLoadingMessage(stage) {
    var messages = {
        0: { title: "Đang chờ chữ ký từ MetaMask…",  body: "Mở MetaMask, kiểm tra giao dịch và bấm 'Confirm' để ký. Không thấy popup? Bấm icon con cáo ở thanh extension trên trình duyệt." },
        1: { title: "Đã ký. Đang gửi lên blockchain…", body: "Giao dịch đang được phát đến mạng Ethereum." },
        2: { title: "Đang chờ network xác nhận…",    body: "Các node đang xác minh giao dịch của bạn (~12 giây)." },
        3: { title: "Sắp xong! Đang đồng bộ kết quả…", body: "Phiếu bầu của bạn đã được ghi vĩnh viễn trên blockchain." }
    };
    return messages[stage] || messages[0];
}

/**
 * getExplorerUrl — Phase 7.5 block explorer integration
 */
function getExplorerUrl(networkInfo, txHash) {
    if (!networkInfo || !networkInfo.explorer) return null;
    return networkInfo.explorer + "/tx/" + txHash;
}

/**
 * pushActivity — Phase 7.3 activity ticker (sticky bottom-left social proof)
 */
var _activityHideTimer = null;
function pushActivity(text) {
    var ticker = document.getElementById("activity-ticker");
    var textEl = document.getElementById("activity-text");
    if (!ticker || !textEl) return;

    if (_activityHideTimer) clearTimeout(_activityHideTimer);

    textEl.innerHTML = text;
    ticker.hidden = false;
    ticker.classList.remove("is-hiding");

    // Auto-hide sau 8s nếu không có vote mới
    _activityHideTimer = setTimeout(function() {
        ticker.classList.add("is-hiding");
        setTimeout(function() { ticker.hidden = true; }, 320);
    }, 8000);
}

// ════════════════════════════════════════════════════════════════════════
// HELPERS NỘI BỘ (tránh đụng tên với app.js)
// ════════════════════════════════════════════════════════════════════════

function escapeHtmlEH(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function shortAddrEH(addr) {
    if (!addr) return "—";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function relativeTime(unixSec) {
    var now = Math.floor(Date.now() / 1000);
    var diff = now - unixSec;
    if (diff < 0) diff = 0;

    if (diff < 60)        return diff + " giây trước";
    if (diff < 3600)      return Math.floor(diff / 60) + " phút trước";
    if (diff < 86400)     return Math.floor(diff / 3600) + " giờ trước";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + " ngày trước";

    var d = new Date(unixSec * 1000);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function refreshLucideIfAvailable() {
    if (window.lucide && window.lucide.createIcons) {
        try { window.lucide.createIcons(); } catch(e) { /* ignore */ }
    }
}

/**
 * Trigger visual feedback khi votedEvent từ người khác về tới
 *  - Row tương ứng "lóe sáng" 1.4s (kết nối toast với data)
 *  - Hero block #049 trong SVG nhảy nhẹ + glow vàng (1.1s)
 *
 * Gọi SAU KHI _onNewVote re-render bảng (DOM đã có row mới).
 */
function triggerRemoteVotePulse(candidateId) {
    var idStr = String(candidateId);

    // 1. Row pulse — chờ 1 frame để re-render hoàn tất
    requestAnimationFrame(function() {
        var row = document.querySelector('tr[data-cand-id="' + idStr + '"]');
        if (row) {
            row.classList.remove("is-remote-vote");
            // Force reflow để re-trigger animation nếu vote liên tiếp cùng ứng viên
            void row.offsetWidth;
            row.classList.add("is-remote-vote");
            setTimeout(function() { row.classList.remove("is-remote-vote"); }, 1500);
        }
    });

    // 2. Hero front card celebrate — luôn chạy (dashboard hiện cả pre & post connect)
    var heroBlock = document.getElementById("hero-block-confirm");
    if (heroBlock) {
        heroBlock.classList.remove("is-celebrating");
        void heroBlock.getBoundingClientRect();
        heroBlock.classList.add("is-celebrating");
        setTimeout(function() { heroBlock.classList.remove("is-celebrating"); }, 1300);
    }
}
