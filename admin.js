/**
 * admin.js — Bảng điều khiển quản trị (Owner Only)
 *
 * 4 tab:
 *   1. Ứng viên   — thêm / xóa
 *   2. Thời gian  — set start/end + bật/tắt timing
 *   3. Whitelist  — bật/tắt + thêm 1 / batch / xóa
 *   4. Thống kê   — overview
 *
 * Whitelist track local: do contract không expose getWhitelistedAddresses,
 * ta theo dõi qua event VoterWhitelisted / VoterRemovedFromWhitelist.
 */

// ─── State ────────────────────────────────────────────────────────────────
var _adminContract = null;
var _adminAccount  = null;
var _adminOwner    = null;
var _whitelistSet  = null;  // Set<string> (lowercase address)

// ════════════════════════════════════════════════════════════════════════
// KHỞI TẠO
// ════════════════════════════════════════════════════════════════════════

async function initAdminPanel(contract, account, ownerAddress) {
    _adminContract = contract;
    _adminAccount  = account;
    _adminOwner    = ownerAddress;
    _whitelistSet  = new Set();

    if (!ownerAddress || account.toLowerCase() !== ownerAddress.toLowerCase()) {
        // Không phải owner → ẩn panel, dừng
        var sec = document.getElementById("section-admin");
        if (sec) sec.hidden = true;
        return;
    }

    // Owner → KHÔNG auto-show panel.
    // Panel chỉ hiện khi user click nút "Bảng điều khiển" trên topbar (toggleAdminMode).
    // Vẫn pre-load data ngầm để khi chuyển vào admin mode thì instant.

    // Bind tab switcher
    initAdminTabs();

    // Init Flatpickr — beautiful datetime picker thay native browser picker
    initAdminDatePickers();

    // Load dữ liệu cho 4 tab
    await refreshAdminAll();

    // Lắng nghe event whitelist để cập nhật real-time
    setupAdminListeners();
}

/**
 * Init Flatpickr cho admin-start-time + admin-end-time.
 * - Vietnamese locale, 24h format, minute increment 5
 * - Custom theme override khớp với design system VoteChain (style.css)
 * - Linked: end-time minDate = start-time để tránh chọn lệch
 */
function initAdminDatePickers() {
    if (typeof flatpickr === "undefined") {
        console.warn("[Admin] Flatpickr chưa load, fallback sang native picker.");
        return;
    }

    var common = {
        enableTime: true,
        time_24hr: true,
        minuteIncrement: 5,
        dateFormat: "Y-m-d\\TH:i",  // ISO format (giữ tương thích với code đọc input.value)
        altInput: true,
        // altFormat dùng dấu "/" + space cho dễ GÕ THẲNG (allowInput=true) —
        // user nhập "15/05/2030 14:00" enter là xong, không cần mở picker.
        altFormat: "d/m/Y H:i",
        altInputClass: "input fp-alt-input",
        // allowInput: cho phép gõ thẳng vào ô — UX nhanh nhất cho power user.
        // Bị invalid → Flatpickr tự revert về giá trị cũ on blur.
        allowInput: true,
        locale: (typeof flatpickr.l10ns !== "undefined" && flatpickr.l10ns.vn) ? "vn" : "default",
        position: "auto center",
        animate: true,
        // monthSelectorType: "dropdown" → tháng là <select> click 1 phát chọn 12 tháng.
        monthSelectorType: "dropdown",
        // disableMobile: true = LUÔN dùng Flatpickr UI (kể cả mobile/responsive mode).
        disableMobile: true,
        onReady: function() {
            // KHÔNG còn enhance year thành <select> — giữ native number input
            // để user gõ năm bất kỳ (1990, 2050…). Combined với « » arrows + ↑↓ keys.
            try { enhanceFlatpickrYearNavArrows(this); }
            catch(e) { console.warn("[FP] year nav arrows failed:", e); }
            try { mountFlatpickrSummaryFooter(this); }
            catch(e) { console.warn("[FP] summary footer mount failed:", e); }
        },
        onValueUpdate: function() {
            // Cập nhật footer tóm tắt mỗi khi đổi ngày HOẶC giờ
            try { updateFlatpickrSummaryFooter(this); } catch(e) { /* non-fatal */ }
        }
    };

    var startEl = document.getElementById("admin-start-time");
    var endEl   = document.getElementById("admin-end-time");

    if (startEl && !startEl._flatpickr) {
        flatpickr(startEl, Object.assign({}, common, {
            onChange: function(dates) {
                // Khi đổi start, set minDate cho end để tránh chọn end < start
                if (endEl && endEl._flatpickr && dates[0]) {
                    endEl._flatpickr.set("minDate", dates[0]);
                }
                try { updateFlatpickrSummaryFooter(this); } catch(e) {}
            }
        }));
    }
    if (endEl && !endEl._flatpickr) {
        flatpickr(endEl, common);
    }
}

/**
 * Gắn 2 nút mũi tên kép (« năm trước, » năm sau) vào header — nhảy 1 năm/click.
 * Combo với prev/next month + 2 dropdown → user di chuyển nhanh nhất có thể.
 */
function enhanceFlatpickrYearNavArrows(instance) {
    if (!instance || !instance.calendarContainer) return;
    var monthsBar = instance.calendarContainer.querySelector(".flatpickr-months");
    if (!monthsBar || monthsBar.querySelector(".fp-year-nav")) return;

    var prevMonth = monthsBar.querySelector(".flatpickr-prev-month");
    var nextMonth = monthsBar.querySelector(".flatpickr-next-month");

    var SVG_PREV = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>';
    var SVG_NEXT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>';

    function makeBtn(dir, label, svg) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fp-year-nav fp-" + dir + "-year";
        btn.setAttribute("aria-label", label);
        btn.title = label;
        btn.innerHTML = svg;
        btn.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            var delta = dir === "prev" ? -1 : 1;
            instance.changeYear(instance.currentYear + delta);
        });
        return btn;
    }

    var prevYearBtn = makeBtn("prev", "Năm trước", SVG_PREV);
    var nextYearBtn = makeBtn("next", "Năm sau",   SVG_NEXT);

    // Đặt « TRƯỚC ‹  và  » SAU ›
    if (prevMonth) monthsBar.insertBefore(prevYearBtn, prevMonth);
    else           monthsBar.insertBefore(prevYearBtn, monthsBar.firstChild);

    if (nextMonth && nextMonth.nextSibling) monthsBar.insertBefore(nextYearBtn, nextMonth.nextSibling);
    else                                    monthsBar.appendChild(nextYearBtn);
}

/**
 * Gắn 1 dòng footer dưới calendar hiển thị ngày+giờ đã chọn ở dạng tiếng Việt
 * đầy đủ — "Thứ Sáu, 15 Tháng 5 2026 · 14:30". Lý do: header chỉ show tháng/năm
 * của TRANG đang xem, còn footer show giá trị THẬT ĐÃ CHỌN → bớt nhầm lẫn khi
 * đang chỉnh giờ ở dưới mà quên mất đang ở tháng nào.
 */
function mountFlatpickrSummaryFooter(instance) {
    if (!instance || !instance.calendarContainer) return;
    if (instance.calendarContainer.querySelector(".fp-summary-footer")) return;

    var footer = document.createElement("div");
    footer.className = "fp-summary-footer is-empty";
    instance.calendarContainer.appendChild(footer);
    instance._fpSummaryFooter = footer;
    updateFlatpickrSummaryFooter(instance);
}

function updateFlatpickrSummaryFooter(instance) {
    var footer = instance && instance._fpSummaryFooter;
    if (!footer) return;

    var d = instance.selectedDates && instance.selectedDates[0];
    if (!d) {
        footer.textContent = "Chưa chọn — bấm vào ngày trên lịch";
        footer.classList.add("is-empty");
        return;
    }

    var weekdays = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
    var months   = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
                    "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];
    var pad = function(n){ return String(n).padStart(2, "0"); };

    footer.innerHTML =
        '<span class="fp-summary-label">Đã chọn</span>'
        + '<span class="fp-summary-value">'
        +   weekdays[d.getDay()] + ', '
        +   d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear()
        +   ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
        + '</span>';
    footer.classList.remove("is-empty");
}

function initAdminTabs() {
    var tabs = document.querySelectorAll(".admin-tab");
    tabs.forEach(function(tab) {
        tab.addEventListener("click", function() {
            var name = tab.getAttribute("data-tab");
            switchAdminTab(name);
        });
    });
}

function switchAdminTab(name) {
    document.querySelectorAll(".admin-tab").forEach(function(t) {
        t.classList.toggle("active", t.getAttribute("data-tab") === name);
    });
    document.querySelectorAll(".admin-pane").forEach(function(p) {
        p.hidden = p.getAttribute("data-pane") !== name;
    });

    // Lazy refresh khi switch tab — đảm bảo data luôn fresh
    if (name === "stats")     refreshStatsPane();
    else if (name === "candidates") refreshCandidatesPane();
    else if (name === "timing")     refreshTimingPane();
    else if (name === "whitelist")  refreshWhitelistPane();
}

async function refreshAdminAll() {
    await refreshCandidatesPane();
    await refreshTimingPane();
    await refreshWhitelistPane();
    await refreshStatsPane();
}

// ════════════════════════════════════════════════════════════════════════
// TAB 1: ỨNG VIÊN
// ════════════════════════════════════════════════════════════════════════

async function refreshCandidatesPane() {
    var listEl = document.getElementById("admin-candidate-list");
    if (!listEl || !_adminContract) return;

    try {
        var rawCandidates = await _adminContract.getAllCandidates();
        var candidates = Array.from(rawCandidates).map(function(c) {
            return { id: Number(c.id), name: String(c.name), voteCount: Number(c.voteCount), exists: Boolean(c.exists) };
        });

        if (candidates.length === 0) {
            listEl.innerHTML = '<div class="admin-empty">Chưa có ứng viên.</div>';
            return;
        }

        listEl.innerHTML = candidates.map(function(c) {
            return '<div class="admin-list-item">'
                +    '<span class="name">'
                +      '<span class="id">#' + c.id + '</span>'
                +      escapeHtml(c.name)
                +    '</span>'
                +    '<button class="btn-danger" onclick="adminRemoveCandidate(' + c.id + ', \'' + escapeHtml(c.name).replace(/'/g, "\\'") + '\')" title="Xóa ứng viên">'
                +      '<i data-lucide="trash-2" style="width:14px;height:14px"></i>'
                +    '</button>'
                +  '</div>';
        }).join("");

        refreshLucide();

    } catch(err) {
        console.error("[Admin] refreshCandidatesPane:", err);
        listEl.innerHTML = '<div class="admin-empty" style="color:var(--red)">Không thể tải danh sách.</div>';
    }
}

async function adminAddCandidate() {
    var input = document.getElementById("admin-cand-name");
    if (!input) return;
    var name = input.value.trim();
    if (!name) {
        showToast("Tên không hợp lệ", "Hãy nhập tên ứng viên.", "warning");
        return;
    }

    try {
        setBtnLoading("btn-add-candidate", true, "Đang gửi…");
        var tx = await _adminContract.addCandidate(name);
        showToast("Giao dịch đã gửi", "Đang chờ xác nhận…", "info", 3000);
        await tx.wait();
        showToast("Đã thêm ứng viên", '"' + name + '" đã được thêm vào.', "success");

        input.value = "";
        await refreshCandidatesPane();
        await refreshStatsPane();
        // Trigger reload kết quả ở app.js (hàm này global)
        if (typeof loadCandidates === "function") await loadCandidates();
    } catch(err) {
        console.error("[Admin] adminAddCandidate:", err);
        showToast("Thêm thất bại", friendlyError(err), "error");
    } finally {
        setBtnLoading("btn-add-candidate", false);
    }
}

async function adminRemoveCandidate(id, name) {
    if (!confirm('Xóa ứng viên "' + name + '"? Hành động này không thể hoàn tác.')) return;

    try {
        var tx = await _adminContract.removeCandidate(id);
        showToast("Giao dịch đã gửi", "Đang xác nhận…", "info", 3000);
        await tx.wait();
        showToast("Đã xóa ứng viên", '"' + name + '" đã bị xóa.', "success");

        await refreshCandidatesPane();
        await refreshStatsPane();
        if (typeof loadCandidates === "function") await loadCandidates();
    } catch(err) {
        console.error("[Admin] adminRemoveCandidate:", err);
        showToast("Xóa thất bại", friendlyError(err), "error");
    }
}

// ════════════════════════════════════════════════════════════════════════
// TAB 2: THỜI GIAN
// ════════════════════════════════════════════════════════════════════════

async function refreshTimingPane() {
    if (!_adminContract) return;

    try {
        var info  = await _adminContract.getContractInfo();
        var enabled   = info[2];
        var startTime = Number(info[3]);
        var endTime   = Number(info[4]);

        // Cập nhật label nút toggle
        var lbl = document.getElementById("toggle-timing-label");
        if (lbl) lbl.textContent = enabled ? "Tắt giới hạn thời gian" : "Bật giới hạn thời gian";

        // Hiện thời gian hiện tại — qua Flatpickr API nếu có (sync alt input), fallback .value
        if (startTime > 0) {
            var startEl = document.getElementById("admin-start-time");
            if (startEl && !startEl.value) {
                if (startEl._flatpickr) startEl._flatpickr.setDate(new Date(startTime * 1000), false);
                else startEl.value = unixToLocalInput(startTime);
            }
        }
        if (endTime > 0) {
            var endEl = document.getElementById("admin-end-time");
            if (endEl && !endEl.value) {
                if (endEl._flatpickr) endEl._flatpickr.setDate(new Date(endTime * 1000), false);
                else endEl.value = unixToLocalInput(endTime);
            }
        }
    } catch(err) {
        console.error("[Admin] refreshTimingPane:", err);
    }
}

async function adminSetTime() {
    var startEl = document.getElementById("admin-start-time");
    var endEl   = document.getElementById("admin-end-time");
    if (!startEl || !endEl) return;

    if (!startEl.value || !endEl.value) {
        showToast("Thiếu thông tin", "Hãy chọn cả thời gian bắt đầu và kết thúc.", "warning");
        return;
    }

    var startTs = Math.floor(new Date(startEl.value).getTime() / 1000);
    var endTs   = Math.floor(new Date(endEl.value).getTime() / 1000);
    var nowTs   = Math.floor(Date.now() / 1000);

    if (startTs >= endTs) {
        showToast("Thời gian không hợp lệ", "Bắt đầu phải sớm hơn kết thúc.", "warning");
        return;
    }
    if (endTs <= nowTs) {
        showToast("Thời gian không hợp lệ", "Thời gian kết thúc phải ở tương lai.", "warning");
        return;
    }

    try {
        setBtnLoading("btn-set-time", true, "Đang gửi…");
        var tx = await _adminContract.setVotingTime(startTs, endTs);
        showToast("Giao dịch đã gửi", "Đang xác nhận…", "info", 3000);
        await tx.wait();
        showToast("Cập nhật thành công", "Thời gian bầu cử đã được cập nhật.", "success");

        await refreshTimingPane();
        if (typeof loadContractInfo === "function") {
            await loadContractInfo();
            startCountdown();
        }
    } catch(err) {
        console.error("[Admin] adminSetTime:", err);
        showToast("Cập nhật thất bại", friendlyError(err), "error");
    } finally {
        setBtnLoading("btn-set-time", false);
    }
}

async function adminToggleTimingClick() {
    if (!_adminContract) return;
    try {
        var info = await _adminContract.getContractInfo();
        var enabled = info[2];
        setBtnLoading("btn-toggle-timing", true, "Đang gửi…");
        var tx = await _adminContract.setTimingEnabled(!enabled);
        showToast("Giao dịch đã gửi", "Đang xác nhận…", "info", 3000);
        await tx.wait();
        showToast(
            enabled ? "Đã tắt giới hạn" : "Đã bật giới hạn",
            enabled ? "Bầu cử mở 24/7." : "Áp dụng giới hạn thời gian.",
            "success"
        );

        await refreshTimingPane();
        await refreshStatsPane();   // ← đồng bộ tab Thống kê (kv-timing)
        if (typeof loadContractInfo === "function") {
            await loadContractInfo();
            startCountdown();
        }
    } catch(err) {
        console.error("[Admin] adminToggleTimingClick:", err);
        showToast("Thất bại", friendlyError(err), "error");
    } finally {
        setBtnLoading("btn-toggle-timing", false);
    }
}

// ════════════════════════════════════════════════════════════════════════
// TAB 3: WHITELIST
// ════════════════════════════════════════════════════════════════════════

async function refreshWhitelistPane() {
    if (!_adminContract) return;

    try {
        var info = await _adminContract.getContractInfo();
        var enabled = info[5];

        var lbl = document.getElementById("toggle-wl-label");
        if (lbl) lbl.textContent = enabled ? "Tắt whitelist" : "Bật whitelist";

        // Build whitelist từ events
        await rebuildWhitelistFromEvents();
        renderWhitelistList();
    } catch(err) {
        console.error("[Admin] refreshWhitelistPane:", err);
    }
}

async function rebuildWhitelistFromEvents() {
    if (!_adminContract) return;
    _whitelistSet = new Set();

    try {
        // Fetch 2 event streams song song — luôn chỉ 2 RPC, không scale theo số địa chỉ
        var results = await Promise.all([
            _adminContract.queryFilter(_adminContract.filters.VoterWhitelisted(), 0, "latest"),
            _adminContract.queryFilter(_adminContract.filters.VoterRemovedFromWhitelist(), 0, "latest")
        ]);
        var addedEvents   = results[0];
        var removedEvents = results[1];

        // Sort tất cả events theo thứ tự chronological (block + log index)
        var allEvents = addedEvents.map(function(e) {
                return { type: "add",    addr: e.args[0].toLowerCase(), blockNumber: e.blockNumber, index: e.index || e.logIndex || 0 };
            }).concat(removedEvents.map(function(e) {
                return { type: "remove", addr: e.args[0].toLowerCase(), blockNumber: e.blockNumber, index: e.index || e.logIndex || 0 };
            }));

        allEvents.sort(function(a, b) {
            if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
            return a.index - b.index;
        });

        // Derive final state THUẦN TỪ event order — không cần verify RPC nào
        //   • Last event cho mỗi địa chỉ là "add"    → đang whitelist
        //   • Last event là "remove"                  → đã bị xóa khỏi whitelist
        //   • Chưa có event nào                       → không trong whitelist (skip)
        // Lý do bỏ verify Promise.all toàn bộ: với 100+ địa chỉ, gửi 100 RPC parallel
        // có thể làm Hardhat node treo + UI freeze. Event log là source of truth tin cậy
        // (Solidity emit phải đi cùng state change), nên không cần double-check.
        var stateMap = new Map();
        for (var i = 0; i < allEvents.length; i++) {
            stateMap.set(allEvents[i].addr, allEvents[i].type === "add");
        }
        stateMap.forEach(function(isWhitelisted, addr) {
            if (isWhitelisted) _whitelistSet.add(addr);
        });

    } catch(err) {
        console.error("[Admin] rebuildWhitelistFromEvents:", err);
    }
}

function renderWhitelistList() {
    var listEl = document.getElementById("admin-wl-list");
    var countEl = document.getElementById("wl-count");
    if (!listEl) return;

    var addrs = Array.from(_whitelistSet);
    if (countEl) countEl.textContent = addrs.length + " địa chỉ";

    if (addrs.length === 0) {
        listEl.innerHTML = '<div class="admin-empty">Whitelist trống.</div>';
        return;
    }

    listEl.innerHTML = addrs.map(function(addr) {
        return '<div class="admin-list-item">'
            +    '<span class="id mono" title="' + addr + '">' + addr.slice(0, 14) + '…' + addr.slice(-12) + '</span>'
            +    '<button class="btn-danger" onclick="adminRemoveWhitelist(\'' + addr + '\')" title="Xóa khỏi whitelist">'
            +      '<i data-lucide="trash-2" style="width:14px;height:14px"></i>'
            +    '</button>'
            +  '</div>';
    }).join("");

    refreshLucide();
}

async function adminAddWhitelist() {
    var input = document.getElementById("admin-wl-single");
    if (!input) return;
    var addr = input.value.trim();
    if (!isValidAddress(addr)) {
        showToast("Địa chỉ không hợp lệ", "Hãy nhập địa chỉ Ethereum đúng định dạng (0x…40 hex).", "warning");
        return;
    }

    try {
        setBtnLoading("btn-add-wl", true, "Đang gửi…");
        var tx = await _adminContract.addToWhitelist(addr);
        showToast("Giao dịch đã gửi", "Đang xác nhận…", "info", 3000);
        await tx.wait();
        _whitelistSet.add(addr.toLowerCase());
        renderWhitelistList();
        showToast("Đã thêm vào whitelist", shortAddr(addr), "success");
        input.value = "";
    } catch(err) {
        console.error("[Admin] adminAddWhitelist:", err);
        showToast("Thêm thất bại", friendlyError(err), "error");
    } finally {
        setBtnLoading("btn-add-wl", false);
    }
}

async function adminAddWhitelistBatch() {
    var ta = document.getElementById("admin-wl-batch");
    if (!ta) return;
    var lines = ta.value.split("\n").map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });

    if (lines.length === 0) {
        showToast("Trống", "Hãy dán danh sách địa chỉ vào ô.", "warning");
        return;
    }
    var invalid = lines.filter(function(s){ return !isValidAddress(s); });
    if (invalid.length > 0) {
        showToast("Có địa chỉ không hợp lệ", invalid.length + " địa chỉ sai định dạng.", "warning");
        return;
    }
    if (lines.length > 200) {
        showToast("Quá nhiều địa chỉ", "Tối đa 200 địa chỉ mỗi lần để tránh out-of-gas.", "warning");
        return;
    }

    try {
        setBtnLoading("btn-add-wl-batch", true, "Đang gửi…");
        var tx = await _adminContract.addBatchToWhitelist(lines);
        showToast("Giao dịch đã gửi", lines.length + " địa chỉ — đang xác nhận…", "info", 4000);
        await tx.wait();
        lines.forEach(function(a) { _whitelistSet.add(a.toLowerCase()); });
        renderWhitelistList();
        showToast("Đã thêm hàng loạt", "Đã thêm " + lines.length + " địa chỉ vào whitelist.", "success");
        ta.value = "";
    } catch(err) {
        console.error("[Admin] adminAddWhitelistBatch:", err);
        showToast("Thêm thất bại", friendlyError(err), "error");
    } finally {
        setBtnLoading("btn-add-wl-batch", false);
    }
}

async function adminRemoveWhitelist(addr) {
    if (!confirm("Xóa " + shortAddr(addr) + " khỏi whitelist?")) return;
    try {
        var tx = await _adminContract.removeFromWhitelist(addr);
        showToast("Giao dịch đã gửi", "Đang xác nhận…", "info", 3000);
        await tx.wait();
        _whitelistSet.delete(addr.toLowerCase());
        renderWhitelistList();
        showToast("Đã xóa", shortAddr(addr) + " không còn trong whitelist.", "success");
    } catch(err) {
        console.error("[Admin] adminRemoveWhitelist:", err);
        showToast("Xóa thất bại", friendlyError(err), "error");
    }
}

async function adminToggleWhitelistClick() {
    if (!_adminContract) return;
    try {
        var info = await _adminContract.getContractInfo();
        var enabled = info[5];
        setBtnLoading("btn-toggle-wl", true, "Đang gửi…");
        var tx = await _adminContract.setWhitelistEnabled(!enabled);
        showToast("Giao dịch đã gửi", "Đang xác nhận…", "info", 3000);
        await tx.wait();
        showToast(
            enabled ? "Đã tắt whitelist" : "Đã bật whitelist",
            enabled ? "Mọi ví đều có thể bỏ phiếu." : "Chỉ địa chỉ trong danh sách được bỏ phiếu.",
            "success"
        );
        await refreshWhitelistPane();
        await refreshStatsPane();   // ← đồng bộ tab Thống kê (kv-wl, mini-turnout)
        if (typeof loadContractInfo === "function") await loadContractInfo();
    } catch(err) {
        console.error("[Admin] adminToggleWhitelistClick:", err);
        showToast("Thất bại", friendlyError(err), "error");
    } finally {
        setBtnLoading("btn-toggle-wl", false);
    }
}

// ════════════════════════════════════════════════════════════════════════
// TAB 4: STATS
// ════════════════════════════════════════════════════════════════════════

async function refreshStatsPane() {
    if (!_adminContract) return;
    try {
        var info = await _adminContract.getContractInfo();
        var rawCandidates = await _adminContract.getAllCandidates();
        var candidates = Array.from(rawCandidates).map(function(c) {
            return { id: Number(c.id), name: String(c.name), voteCount: Number(c.voteCount), exists: Boolean(c.exists) };
        });
        var total = candidates.reduce(function(s, c){ return s + c.voteCount; }, 0);

        document.getElementById("mini-total").textContent = total;
        document.getElementById("mini-cands").textContent = candidates.length;

        var statusMap = {
            "DANG_MO": "Đang mở", "CHUA_MO": "Sắp diễn ra",
            "DA_KET_THUC": "Đã đóng", "KHONG_GIOI_HAN": "24/7"
        };
        document.getElementById("mini-status").textContent = statusMap[info[6]] || info[6];

        // Tỉ lệ tham gia
        var turnoutEl = document.getElementById("mini-turnout");
        if (info[5] && _whitelistSet && _whitelistSet.size > 0) {
            var turnout = ((total / _whitelistSet.size) * 100).toFixed(0);
            turnoutEl.textContent = turnout + "%";
        } else {
            turnoutEl.textContent = "—";
        }

        // KV list
        document.getElementById("kv-wl").textContent = info[5] ? "Đang bật" : "Đang tắt";
        document.getElementById("kv-timing").textContent = info[2] ? "Đang bật" : "Đang tắt";
        document.getElementById("kv-owner").textContent = info[0];
        document.getElementById("kv-owner").title = info[0];

    } catch(err) {
        console.error("[Admin] refreshStatsPane:", err);
    }
}

// ════════════════════════════════════════════════════════════════════════
// LISTENERS — cập nhật real-time khi có CandidateAdded/Removed/Whitelist
// ════════════════════════════════════════════════════════════════════════

function setupAdminListeners() {
    if (!_adminContract) return;

    _adminContract.on("CandidateAdded", function() {
        refreshCandidatesPane();
        refreshStatsPane();
    });
    _adminContract.on("CandidateRemoved", function() {
        refreshCandidatesPane();
        refreshStatsPane();
    });
    _adminContract.on("VoterWhitelisted", function(addr) {
        if (_whitelistSet) _whitelistSet.add(addr.toLowerCase());
        renderWhitelistList();
        refreshStatsPane();
    });
    _adminContract.on("VoterRemovedFromWhitelist", function(addr) {
        if (_whitelistSet) _whitelistSet.delete(addr.toLowerCase());
        renderWhitelistList();
        refreshStatsPane();
    });
}

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════

function isValidAddress(addr) {
    if (!addr || typeof addr !== "string") return false;
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function unixToLocalInput(unixSec) {
    if (!unixSec) return "";
    var d = new Date(unixSec * 1000);
    var pad2 = function(n){ return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate())
        + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
