/**
 * app.js — Logic chính của dApp Voting
 *
 * Trách nhiệm:
 *  - Kết nối ví, đọc thông tin contract
 *  - Phát hiện network + owner để hiện Admin Panel
 *  - Render bảng kết quả + biểu đồ Chart.js
 *  - Modal flow: confirm → pending → success + confetti
 *  - Dark mode, copy address, network switching
 *
 * Tích hợp:
 *  - eventHandler.js (real-time listener, history, toast, error)
 *  - admin.js (Admin Panel logic)
 */

// ─── State ────────────────────────────────────────────────────────────────
var provider     = null;
var signer       = null;
var contract     = null;
var account      = null;
var isOwner      = false;
var ownerAddress = null;

var countdownId  = null;
var pendingVoteCandidateId   = null;
var pendingVoteCandidateName = null;

// Chart.js instances (giữ để update mượt thay vì destroy/recreate)
var chartBar      = null;
var chartDoughnut = null;

// Cache last candidates state cho optimistic UI rollback
var _lastCandidatesState = null;

// Network config — chain ID → tên + explorer
var NETWORKS = {
    1:        { name: "Ethereum",  explorer: "https://etherscan.io",          isMain: true,  chainIdHex: "0x1"     },
    11155111: { name: "Sepolia",   explorer: "https://sepolia.etherscan.io",  isMain: false, chainIdHex: "0xaa36a7" },
    1337:     { name: "Localhost", explorer: null,                            isMain: false, chainIdHex: "0x539"   },
    31337:    { name: "Hardhat",   explorer: null,                            isMain: false, chainIdHex: "0x7a69"  }
};
var EXPECTED_CHAIN_ID = 31337;  // Hardhat default (config trong hardhat.config.js)

// Color palette cho chart (champagne gold theme)
var CHART_PALETTE = ["#C9A961", "#1E3A5F", "#2D6A4F", "#B07A1E", "#9D2933", "#5C3D8C", "#0E7C7B", "#A04668"];

// ════════════════════════════════════════════════════════════════════════
// KHỞI TẠO
// ════════════════════════════════════════════════════════════════════════

window.addEventListener("DOMContentLoaded", function() {
    initTheme();
    initModalCloseHandlers();
    initCopyButton();
    initFooterCopyContract();
    initFooterTrustBlock();
    initHeroPreConnect();   // Phase 0.1
    initMobileFab();        // Phase 8.1
    initCandidatePicker();  // v3.1 — custom rich dropdown
    startHeroDashBlockPoll(); // Wave 4A — poll latest block every 12s for hero dashboard
    initHeroDashParallax();   // 3D parallax tilt on hover (Linear / Vercel pattern)

    // Wave 4A — luôn load dashboard preview qua public RPC (kể cả khi chưa có MetaMask)
    loadHeroSamplePreview();

    // Phase 0.5 / 6.3 — Detect không có MetaMask
    if (!window.ethereum) {
        showNoMetaMaskState();
    } else {
        // Tự động kết nối nếu MetaMask đã có account chọn sẵn
        if (window.ethereum.selectedAddress) {
            connectWallet();
        }
        // (loadHeroSamplePreview đã chạy ở trên cho mọi trạng thái)

        window.ethereum.on("accountsChanged", function(accounts) {
            removeRealtimeListener();
            clearInterval(countdownId);
            if (accounts.length === 0) resetWalletUI();
            else                       connectWallet();
        });

        window.ethereum.on("chainChanged", function() {
            removeRealtimeListener();
            window.location.reload();
        });

        window.ethereum.on("disconnect", function() {
            // Phase 6.5 — Connection lost banner
            var banner = document.getElementById("sys-banner-disconnect");
            if (banner) banner.hidden = false;
        });
    }

    // Render Lucide icons (lần khởi tạo)
    refreshLucide();
});

// ════════════════════════════════════════════════════════════════════════
// PHASE 0.1 — HERO PRE-CONNECT + SAMPLE PREVIEW
// ════════════════════════════════════════════════════════════════════════

function initHeroPreConnect() {
    // Hero CTA mặc định visible khi chưa connect (CSS body.is-connected hide)
    // Sample preview sẽ load async
}

async function loadHeroSamplePreview() {
    // Đọc từ public RPC (Localhost) mà không cần wallet
    try {
        var rpcProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        window._publicRpcProvider = rpcProvider;
        var roContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rpcProvider);

        // Parallel fetch: candidates + latest block
        var results = await Promise.all([
            roContract.getAllCandidates(),
            rpcProvider.getBlockNumber()
        ]);
        var rawCandidates = results[0];
        var blockNum = Number(results[1]);

        var candidates = Array.from(rawCandidates).map(function(c) {
            return { id: Number(c.id), voteCount: Number(c.voteCount), exists: Boolean(c.exists) };
        });
        var total = candidates.reduce(function(s, c) { return s + c.voteCount; }, 0);

        // Legacy hero-sample chip (giữ tương thích)
        var sampleEl = document.getElementById("hero-sample");
        var candsEl  = document.getElementById("hero-sample-cands");
        var votesEl  = document.getElementById("hero-sample-votes");
        if (sampleEl && candsEl && votesEl) {
            candsEl.textContent = candidates.length;
            votesEl.textContent = total;
            sampleEl.hidden = false;
        }

        // Live Stats Dashboard
        updateHeroDashboard({ total: total, cands: candidates.length, block: blockNum, network: "Localhost" });

        // CTA inline stats — switch skeleton → live khi data về
        try { updateCTAStats({ cands: candidates.length, votes: total }); } catch(e) { /* non-fatal */ }

    } catch(e) {
        console.log("[App] Public RPC sample preview unavailable:", e.message);
    }
}

/**
 * Update Live Stats Dashboard (hero visual right side)
 *  - Block number ticker (top card)
 *  - Ứng viên + block time (mid card)
 *  - Total votes count-up + bar fill (front card)
 *
 * Gọi từ: loadHeroSamplePreview, loadCandidates, applyOptimisticVote, polling.
 * Tất cả field optional — chỉ cập nhật field nào được truyền vào.
 */
function updateHeroDashboard(opts) {
    opts = opts || {};
    if (typeof opts.block === "number") {
        var blockEl = document.getElementById("hero-dash-block");
        if (blockEl) {
            var prevBlock = window._heroDashLastBlock;
            blockEl.textContent = "#" + opts.block;
            // Khi block thay đổi → shift+fade animation cho block strip + reset countdown ring
            if (typeof prevBlock === "number" && prevBlock !== opts.block) {
                var strip = document.getElementById("hero-dash-block-strip");
                if (strip) {
                    strip.classList.remove("is-shifting");
                    void strip.offsetWidth;
                    strip.classList.add("is-shifting");
                    setTimeout(function() { strip.classList.remove("is-shifting"); }, 600);
                }
                // Reset countdown ring animation
                var ring = document.querySelector(".hero-dash-eta-ring-fill");
                if (ring) {
                    ring.style.animation = "none";
                    void ring.getBoundingClientRect();
                    ring.style.animation = "";
                }
            }
            window._heroDashLastBlock = opts.block;
        }
    }
    if (typeof opts.cands === "number") {
        var candsEl2 = document.getElementById("hero-dash-cands");
        if (candsEl2) candsEl2.textContent = opts.cands;
    }
    if (typeof opts.network === "string") {
        var netEl = document.getElementById("hero-dash-network");
        if (netEl) netEl.textContent = opts.network;
    }
    if (typeof opts.total === "number") {
        var totalEl = document.getElementById("hero-dash-total");
        if (totalEl) {
            var current = Number(totalEl.textContent.replace(/[^0-9-]/g, "")) || 0;
            if (current !== opts.total) {
                // Track delta — hiện pill "+N" khi total tăng (Coinbase pattern)
                if (opts.total > current) {
                    showHeroDashDelta(opts.total - current);
                }
                animateNumber("hero-dash-total", opts.total, 700);
            }
        }
        // Bar fill — grows visibly với mỗi phiếu, cap ở 95% để luôn có "head room"
        var barEl = document.getElementById("hero-dash-bar-fill");
        if (barEl) {
            var pct = opts.total <= 0 ? 0 : Math.min(20 + opts.total * 3, 95);
            barEl.style.width = pct + "%";
        }
    }
}

/**
 * Show delta pill "+N" briefly khi total votes tăng (Coinbase / Stripe stat-card pattern)
 * Auto-hide sau 5s.
 */
function showHeroDashDelta(deltaCount) {
    var pill = document.getElementById("hero-dash-delta");
    var text = document.getElementById("hero-dash-delta-text");
    if (!pill || !text || deltaCount <= 0) return;
    if (window._heroDashDeltaTimer) clearTimeout(window._heroDashDeltaTimer);

    text.textContent = "+" + deltaCount;
    pill.hidden = false;
    // Restart animation
    pill.style.animation = "none";
    void pill.offsetWidth;
    pill.style.animation = "";

    window._heroDashDeltaTimer = setTimeout(function() {
        pill.hidden = true;
    }, 5000);
}

/**
 * Poll latest block number every ~12s (Ethereum block time).
 * Chạy ngầm cho cả pre-connect (qua public RPC) và post-connect (qua signer provider).
 */
function startHeroDashBlockPoll() {
    if (window._heroDashPollId) return;
    window._heroDashPollId = setInterval(async function() {
        try {
            var p = window._publicRpcProvider
                || (typeof provider !== "undefined" && provider)
                || null;
            if (!p) return;
            var n = await p.getBlockNumber();
            updateHeroDashboard({ block: Number(n) });
        } catch(e) { /* silent — node có thể tạm gián đoạn */ }
    }, 12000);
}

/**
 * 3D parallax tilt cho hero dashboard — cursor-following effect (Linear / Vercel pattern)
 * Khi user di chuột trên hero-visual, cả frame nghiêng nhẹ theo vị trí cursor.
 * Max tilt ±6deg, decay smooth khi rời.
 */
function initHeroDashParallax() {
    var visual = document.querySelector(".hero-visual");
    if (!visual) return;
    // Skip nếu user prefer-reduced-motion
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Skip mobile (touch không có hover)
    if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;

    var rafId = null;
    var pending = null;

    function onMove(e) {
        pending = e;
        if (rafId) return;
        rafId = requestAnimationFrame(function() {
            rafId = null;
            if (!pending) return;
            var rect = visual.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            // Normalize -1 → +1
            var dx = (pending.clientX - cx) / (rect.width / 2);
            var dy = (pending.clientY - cy) / (rect.height / 2);
            // Tilt range ±5deg (subtle, không gây chóng mặt)
            var rotY =  dx * 5;
            var rotX = -dy * 5;
            visual.style.setProperty("--tilt-x", rotX.toFixed(2) + "deg");
            visual.style.setProperty("--tilt-y", rotY.toFixed(2) + "deg");
            pending = null;
        });
    }

    function onLeave() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        pending = null;
        visual.style.setProperty("--tilt-x", "0deg");
        visual.style.setProperty("--tilt-y", "0deg");
    }

    visual.addEventListener("mousemove", onMove);
    visual.addEventListener("mouseleave", onLeave);
}

function preloadOnHover() {
    // Phase 4.5 — Preload data khi hover button connect
    if (window._preloadedData || !window.ethereum) return;
    loadHeroSamplePreview();
    window._preloadedData = true;
}

// ════════════════════════════════════════════════════════════════════════
// HERO CTA primary button click handler (3 modes)
// ════════════════════════════════════════════════════════════════════════
function onHeroPrimaryClick() {
    if (!window.ethereum) {
        openModal("modal-metamask");
        return;
    }
    connectWallet();
}

function showNoMetaMaskState() {
    var label = document.getElementById("hero-cta-label");
    var btn   = document.getElementById("btn-hero-connect");
    var icon  = btn ? btn.querySelector("[data-lucide]") : null;
    if (label) label.textContent = "Cài MetaMask để bắt đầu";
    if (icon)  icon.setAttribute("data-lucide", "download");

    // Update topbar connect button
    var btnConnect = document.getElementById("btn-connect");
    if (btnConnect) {
        btnConnect.innerHTML = '<i data-lucide="download"></i><span>Cài MetaMask</span>';
        btnConnect.onclick = function() { openModal("modal-metamask"); };
    }
    refreshLucide();
}

// ════════════════════════════════════════════════════════════════════════
// DARK MODE
// ════════════════════════════════════════════════════════════════════════

function initTheme() {
    var saved = localStorage.getItem("votechain.theme");
    var theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(theme, /*skipAnimation*/ true);

    var btn = document.getElementById("btn-theme");
    if (btn) {
        btn.addEventListener("click", function(e) {
            var current = document.documentElement.getAttribute("data-theme");
            var next = current === "dark" ? "light" : "dark";
            setTheme(next, false, e);
        });
    }
}

/**
 * setTheme — animated theme switch with ripple effect
 *   theme: "light" | "dark"
 *   skipAnimation: bool (true on initial load)
 *   event: original click event (for ripple origin point)
 */
function setTheme(theme, skipAnimation, event) {
    var html = document.documentElement;
    var prevTheme = html.getAttribute("data-theme");
    if (prevTheme === theme) return;

    // Ripple animation: derive origin from theme-toggle button
    if (!skipAnimation && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        fireThemeRipple(theme, event);
    } else {
        applyThemeNow(theme);
    }
}

function applyThemeNow(theme) {
    document.body.classList.add("theme-transitioning");
    setTimeout(function() { document.body.classList.remove("theme-transitioning"); }, 360);

    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("votechain.theme", theme);

    // Update meta theme-color
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#08090E" : "#FCFCFD");

    // Update chart theme if rendered
    if (chartBar)      updateChartTheme(chartBar);
    if (chartDoughnut) updateChartTheme(chartDoughnut);
}

/**
 * Theme ripple — circular reveal expanding from toggle button
 * Uses View Transitions API where available, falls back to clip-path
 */
function fireThemeRipple(theme, event) {
    var ripple = document.getElementById("theme-ripple");
    var btn = document.getElementById("btn-theme");
    if (!ripple || !btn) { applyThemeNow(theme); return; }

    var rect = btn.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    if (event && typeof event.clientX === "number" && event.clientX > 0) {
        cx = event.clientX;
        cy = event.clientY;
    }

    // Ripple color = the color we're transitioning TO
    var rippleColor = theme === "dark" ? "#08090E" : "#FCFCFD";
    ripple.style.setProperty("--rx", cx + "px");
    ripple.style.setProperty("--ry", cy + "px");
    ripple.style.setProperty("--ripple-color", rippleColor);

    // Trigger animation
    ripple.classList.remove("is-firing");
    void ripple.offsetWidth; // force reflow
    ripple.classList.add("is-firing");

    // Apply theme at midpoint of animation (when ripple covers viewport)
    setTimeout(function() {
        applyThemeNow(theme);
    }, 280);

    // Clean up
    setTimeout(function() {
        ripple.classList.remove("is-firing");
    }, 760);
}

// ════════════════════════════════════════════════════════════════════════
// COPY ADDRESS
// ════════════════════════════════════════════════════════════════════════

function initCopyButton() {
    function wireCopy(id) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener("click", function(e) {
            e.stopPropagation();
            if (!account) return;
            try {
                navigator.clipboard.writeText(account);
                showToast("Đã sao chép", account.slice(0,10) + "…" + account.slice(-8), "success", 2000);
            } catch(err) {
                showToast("Không thể sao chép", "Trình duyệt không hỗ trợ clipboard.", "warning");
            }
        });
    }
    wireCopy("btn-copy");
    wireCopy("btn-wallet-dropdown-copy");  // Wave 4C — dropdown copy button
}

// ════════════════════════════════════════════════════════════════════════
// KẾT NỐI VÍ
// ════════════════════════════════════════════════════════════════════════

async function connectWallet() {
    if (!window.ethereum) {
        openModal("modal-metamask");
        return;
    }

    try {
        setBtnLoading("btn-connect", true, "Đang kết nối…");

        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer  = await provider.getSigner();
        account = await signer.getAddress();

        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        // Mark connected (CSS hide hero-cta)
        document.body.classList.add("is-connected");

        // Hiện UI
        showAfterConnect();

        // Cập nhật wallet bar
        document.getElementById("wallet-address").textContent = shortAddr(account);
        document.getElementById("wallet-address").title       = account;

        // Nút connect → biểu tượng "đã kết nối"
        // (Cập nhật cả dataset.orig để setBtnLoading(false) ở finally không revert lại trạng thái ban đầu)
        var btnConn = document.getElementById("btn-connect");
        var connectedHtml = '<i data-lucide="check-circle-2"></i><span>' + shortAddr(account) + '</span>';
        btnConn.innerHTML       = connectedHtml;
        btnConn.dataset.orig    = connectedHtml;

        // Network detection
        await detectNetwork();

        // Tải dữ liệu
        await loadContractInfo();
        await loadCandidates();
        await checkVoterStatus();

        // ★ Khởi tạo eventHandler + listener real-time
        initEventHandler(contract, account, async function() {
            await loadCandidates();
        });
        setupRealtimeListener();
        await loadTransactionHistory();

        // ★ Khởi tạo admin panel (chỉ hiện nếu là owner)
        if (typeof initAdminPanel === "function") {
            await initAdminPanel(contract, account, ownerAddress);
        }

        startCountdown();
        refreshLucide();

        showToast("Kết nối thành công", shortAddr(account), "success");

        // Phase 0.2 — First-connect onboarding tour
        if (!localStorage.getItem("votechain.hasConnectedBefore")) {
            setTimeout(function() { startOnboardingTour(); }, 700);
        }

    } catch(err) {
        console.error("[App] connectWallet:", err);
        // Phase 6.1 — Toast với action retry
        showToast("Kết nối thất bại", friendlyError(err), "error", 0, [
            { label: "Thử lại", onclick: connectWallet },
            { label: "Đóng",    onclick: function(){}, ghost: true }
        ]);
        document.getElementById("btn-connect").innerHTML =
            '<i data-lucide="wallet"></i><span>Kết nối ví</span>';
        refreshLucide();
    } finally {
        setBtnLoading("btn-connect", false);
    }
}

function showAfterConnect() {
    show("wallet-bar");
    show("stats-section");
    show("vote-form-section");
    show("status-chip");
    show("charts-block");
}

function resetWalletUI() {
    account     = null;
    contract    = null;
    isOwner     = false;
    ownerAddress = null;

    document.body.classList.remove("is-connected");
    document.body.classList.remove("is-admin-mode");

    // Wave 4C — close Smart Profile dropdown nếu đang mở
    if (typeof closeWalletDropdown === "function") closeWalletDropdown();

    hide("wallet-bar");
    hide("stats-section");
    hide("vote-form-section");
    hide("voted-message");
    hide("section-admin");
    var btnAdminMode = document.getElementById("btn-admin-mode");
    if (btnAdminMode) btnAdminMode.hidden = true;

    document.getElementById("btn-connect").innerHTML =
        '<i data-lucide="wallet"></i><span>Kết nối ví</span>';
    document.getElementById("vote-status-badge").textContent = "Chưa bỏ phiếu";
    document.getElementById("vote-status-badge").className   = "badge";

    // Hide mobile FAB
    var fab = document.getElementById("vote-fab");
    if (fab) { fab.hidden = true; fab.classList.remove("is-visible"); }

    refreshLucide();
}

// ════════════════════════════════════════════════════════════════════════
// ADMIN MODE TOGGLE — owner-only, switches main view
// ════════════════════════════════════════════════════════════════════════
function toggleAdminMode() {
    if (!isOwner) return;
    if (document.body.classList.contains("is-admin-mode")) {
        exitAdminMode();
    } else {
        enterAdminMode();
    }
}

function enterAdminMode() {
    if (!isOwner) return;
    var sec = document.getElementById("section-admin");
    if (sec) sec.hidden = false;
    document.body.classList.add("is-admin-mode");
    var lbl = document.getElementById("btn-admin-mode-label");
    if (lbl) lbl.textContent = "Đang quản trị";
    // Smooth scroll to top of admin panel
    if (sec) {
        setTimeout(function() {
            sec.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
    }
}

function exitAdminMode() {
    document.body.classList.remove("is-admin-mode");
    var sec = document.getElementById("section-admin");
    if (sec) sec.hidden = true;
    var lbl = document.getElementById("btn-admin-mode-label");
    if (lbl) lbl.textContent = "Bảng điều khiển";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ════════════════════════════════════════════════════════════════════════
// NETWORK DETECTION
// ════════════════════════════════════════════════════════════════════════

async function detectNetwork() {
    try {
        var net = await provider.getNetwork();
        var chainId = Number(net.chainId);
        var info = NETWORKS[chainId] || { name: "Chain " + chainId, explorer: null, isMain: false };

        window._networkInfo = info;
        window._chainId     = chainId;

        var pill = document.getElementById("network-pill");
        var name = document.getElementById("network-name");
        if (pill && name) {
            pill.hidden = false;
            pill.classList.add("connected");
            pill.classList.remove("wrong");
            name.textContent = info.name;
        }

        // Phase 6.4 — Wrong network banner
        // Localhost/Hardhat coi như cùng group (chainId 1337 + 31337)
        var isLocal = (chainId === 1337 || chainId === 31337);
        var banner = document.getElementById("sys-banner-network");
        var nameEl = document.getElementById("wrong-network-name");
        if (banner && nameEl) {
            if (!isLocal && EXPECTED_CHAIN_ID === 1337) {
                nameEl.textContent = info.name;
                banner.hidden = false;
                if (pill) { pill.classList.add("wrong"); pill.classList.remove("connected"); }
            } else {
                banner.hidden = true;
            }
        }

        // Update footer network info
        var footerNet = document.getElementById("footer-network-name");
        if (footerNet) footerNet.textContent = info.name;

        // Hero dashboard network metric
        updateHeroDashboard({ network: info.name });
    } catch(err) {
        console.error("[App] detectNetwork:", err);
    }
}

/**
 * Phase 6.4 — One-click network switch
 */
async function switchToLocalhost() {
    if (!window.ethereum) return;
    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x7a69" }]  // 31337 (Hardhat)
        });
    } catch(err) {
        // 4902 = chain chưa được add → tự thêm
        if (err.code === 4902) {
            try {
                await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                        chainId: "0x7a69",
                        chainName: "Hardhat Localhost",
                        rpcUrls: ["http://127.0.0.1:8545"],
                        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
                    }]
                });
            } catch(addErr) {
                showToast("Không thể thêm mạng", friendlyError(addErr), "error");
            }
        } else {
            showToast("Không thể chuyển mạng", friendlyError(err), "error");
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
// CONTRACT INFO
// ════════════════════════════════════════════════════════════════════════

async function loadContractInfo() {
    try {
        var info = await contract.getContractInfo();
        ownerAddress           = info[0];
        window._timingEnabled  = info[2];
        window._startTime      = Number(info[3]);
        window._endTime        = Number(info[4]);
        window._whitelistEnabled = info[5];
        var status             = info[6];
        window._electionStatus = status;

        // Owner check
        isOwner = account.toLowerCase() === ownerAddress.toLowerCase();
        var badgeAdmin = document.getElementById("badge-admin");
        if (badgeAdmin) badgeAdmin.hidden = !isOwner;

        // Wallet role label (Cử tri / Admin)
        var roleEl = document.getElementById("wallet-role");
        if (roleEl) roleEl.textContent = isOwner ? "Quản trị viên" : "Cử tri";

        // Admin panel: NEVER auto-show. Only via topbar button → admin mode toggle.
        // Topbar admin button is only visible to owner.
        var btnAdminMode = document.getElementById("btn-admin-mode");
        if (btnAdminMode) btnAdminMode.hidden = !isOwner;
        // If user is no longer owner (e.g., switched accounts), force-exit admin mode
        if (!isOwner && document.body.classList.contains("is-admin-mode")) {
            exitAdminMode();
        }

        // Whitelist check (chỉ hiện badge cảnh báo nếu whitelist bật + ko phải owner + ko whitelisted)
        var badgeWl = document.getElementById("badge-not-whitelisted");
        if (badgeWl) {
            if (window._whitelistEnabled && !isOwner) {
                try {
                    var wl = await contract.isWhitelisted(account);
                    badgeWl.hidden = wl;
                } catch(e) { badgeWl.hidden = true; }
            } else {
                badgeWl.hidden = true;
            }
        }

        // Status chip
        var chip = document.getElementById("status-chip");
        var chipText = document.getElementById("status-chip-text");
        if (chip && chipText) {
            chip.classList.remove("upcoming", "ended");
            var statusMap = {
                "DANG_MO":        { text: "Bầu cử đang diễn ra — hãy bỏ phiếu",  cls: "" },
                "CHUA_MO":        { text: "Bầu cử chưa bắt đầu",                  cls: "upcoming" },
                "DA_KET_THUC":    { text: "Bầu cử đã kết thúc",                   cls: "ended" },
                "KHONG_GIOI_HAN": { text: "Mở 24/7 — không giới hạn thời gian",   cls: "" }
            };
            var c = statusMap[status] || { text: status, cls: "" };
            if (c.cls) chip.classList.add(c.cls);
            chipText.textContent = c.text;
        }

        // Stat status (rút gọn cho stat card)
        var statStatus = document.getElementById("stat-status");
        if (statStatus) {
            var shortStatusMap = {
                "DANG_MO":        "Đang mở",
                "CHUA_MO":        "Sắp diễn ra",
                "DA_KET_THUC":    "Đã đóng",
                "KHONG_GIOI_HAN": "24/7"
            };
            statStatus.textContent = shortStatusMap[status] || status;

            // Phase 1.3 — Glow indicator khi đang mở
            var statusCard = statStatus.closest(".stat");
            if (statusCard) {
                if (status === "DANG_MO" || status === "KHONG_GIOI_HAN") {
                    statusCard.classList.add("is-active");
                } else {
                    statusCard.classList.remove("is-active");
                }
            }
        }

        refreshLucide();

    } catch(err) {
        console.error("[App] loadContractInfo:", err);
    }
}

// ════════════════════════════════════════════════════════════════════════
// LOAD CANDIDATES + RENDER TABLE + CHARTS
// ════════════════════════════════════════════════════════════════════════

async function loadCandidates() {
    var tbody    = document.getElementById("candidates-tbody");
    var selectEl = document.getElementById("candidate-select");
    var badge    = document.getElementById("candidate-count-badge");
    if (!tbody) return;

    // Phase 4.1 — Skeleton trong lúc fetch
    if (!tbody.querySelector("tr td:not(.empty-cell)")) {
        tbody.innerHTML =
            '<tr><td colspan="4" style="padding:0;border:none;background:transparent">'
          +   renderSkeletonRow() + renderSkeletonRow() + renderSkeletonRow()
          + '</td></tr>';
    }

    try {
        var rawCandidates = await contract.getAllCandidates();
        // Ethers v6 trả về Result object (read-only) — convert thành plain array để có thể sort/reduce/map
        var candidates = Array.from(rawCandidates).map(function(c) {
            return {
                id:        Number(c.id),
                name:      String(c.name),
                voteCount: Number(c.voteCount),
                exists:    Boolean(c.exists)
            };
        });

        var total = candidates.reduce(function(s, c) { return s + c.voteCount; }, 0);

        // Cache cho optimistic UI rollback
        _lastCandidatesState = { candidates: candidates, total: total };

        if (badge) badge.textContent = candidates.length === 0
            ? "Chưa có ứng viên"
            : candidates.length + " ứng viên";

        // Phase 3.1 / 4.4 — animate count-up
        animateNumber("total-votes", total);
        animateNumber("candidate-count", candidates.length);

        // Wave 4A — Live Stats Dashboard sync
        updateHeroDashboard({ total: total, cands: candidates.length });

        // CTA inline stats — re-sync khi candidates / votes đổi
        try { updateCTAStats({ cands: candidates.length, votes: total }); } catch(e) { /* non-fatal */ }

        // Phase 7.1 — Update footer trust stats
        var fcc = document.getElementById("footer-cand-count");
        var fvc = document.getElementById("footer-vote-count");
        if (fcc) fcc.textContent = candidates.length;
        if (fvc) fvc.textContent = total;

        // Phase 7.4 — Quorum (nếu whitelist enabled)
        updateQuorum(total);

        if (candidates.length === 0) {
            // Phase 5.2 — Empty state friendly
            tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">'
                + '<i data-lucide="users"></i> Owner chưa thêm ứng viên nào. Quay lại sau nhé.'
                + '</td></tr>';
            refreshLucide();
            updateCharts([], []);
            return;
        }

        // Sắp xếp theo phiếu giảm dần (đã là plain array nên sort được)
        var sorted = candidates.slice().sort(function(a, b) {
            return b.voteCount - a.voteCount;
        });

        tbody.innerHTML = sorted.map(function(c, i) {
            var votes = c.voteCount;
            var pct   = total > 0 ? ((votes / total) * 100) : 0;
            var pctTxt = pct.toFixed(1);

            var medal;
            var rowClass = "";
            var topLabel = "";
            if (i === 0 && votes > 0) {
                medal = '<span class="rank-medal gold">1</span>';
                rowClass = " class=\"is-top\"";
                // Phase 5.3 — "Đang dẫn đầu" label
                topLabel = '<span class="top-label"><i data-lucide="trending-up"></i>Đang dẫn đầu</span>';
            } else if (i === 1 && votes > 0) medal = '<span class="rank-medal silver">2</span>';
            else if (i === 2 && votes > 0) medal = '<span class="rank-medal bronze">3</span>';
            else                            medal = '<span class="rank-medal">' + (i + 1) + '</span>';

            var avatarHtml = '<span class="cand-avatar ' + pickerColorClass(c.id) + '">'
                + escapeHtml(pickerInitial(c.name)) + '</span>';

            return '<tr' + rowClass + ' data-cand-id="' + c.id + '">'
                +    '<td>' + medal + '</td>'
                +    '<td><span class="candidate-name">' + avatarHtml + '<span>' + escapeHtml(c.name) + '</span>' + topLabel + '</span></td>'
                +    '<td>'
                +      '<div class="vote-bar-wrap">'
                +        '<div class="vote-bar-bg">'
                +          '<div class="vote-bar-fill" style="width:' + pct.toFixed(2) + '%"></div>'
                +        '</div>'
                +        '<span class="vote-num">' + votes + '</span>'
                +      '</div>'
                +    '</td>'
                +    '<td class="cell-pct mono">' + pctTxt + '%</td>'
                +  '</tr>';
        }).join("");

        // Dropdown bỏ phiếu (giữ thứ tự gốc theo ID)
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
            onCandidateSelectChange();
        }

        // Custom rich picker — synchronized with native select
        renderCandidatePicker(candidates, total);

        // Update charts
        var labels = candidates.map(function(c) { return c.name; });
        var data   = candidates.map(function(c) { return c.voteCount; });
        updateCharts(labels, data);

        // Item 5b — wire hover preview (idempotent: chỉ wire 1 lần qua delegation)
        try { wireCandidateHoverPreview(); } catch(e) { /* non-fatal */ }

    } catch(err) {
        console.error("[App] loadCandidates:", err);
        // Phase 6.2 — Empty state có nút retry
        tbody.innerHTML = '<tr><td colspan="4" class="empty-cell" style="color:var(--red)">'
            + '<i data-lucide="alert-triangle"></i> Không thể tải danh sách. '
            + '<button class="btn btn-ghost btn-sm" type="button" onclick="loadCandidates()" style="margin-left:8px">'
            +   '<i data-lucide="refresh-cw"></i><span>Tải lại</span>'
            + '</button>'
            + '</td></tr>';
        refreshLucide();
    }
}

/**
 * Phase 4.1 — Render skeleton row HTML
 */
function renderSkeletonRow() {
    return '<div class="skeleton-row">'
         +   '<div class="skeleton skeleton-circle"></div>'
         +   '<div class="skeleton skeleton-bar" style="width:60%"></div>'
         +   '<div class="skeleton skeleton-bar" style="width:100%"></div>'
         +   '<div class="skeleton skeleton-bar" style="width:40px"></div>'
         + '</div>';
}

/**
 * Phase 3.1 / 4.4 — Animated count-up
 */
function animateNumber(elementId, targetValue, duration) {
    duration = duration || 600;
    var el = document.getElementById(elementId);
    if (!el) return;
    var startValue = Number(el.textContent.replace(/[^0-9-]/g, "")) || 0;
    var diff = targetValue - startValue;
    if (diff === 0) { el.textContent = targetValue; return; }

    var startTime = performance.now();
    function tick(now) {
        var elapsed = now - startTime;
        var progress = Math.min(elapsed / duration, 1);
        // cubic-out easing
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = Math.round(startValue + diff * eased);
        el.textContent = current;
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = targetValue;
    }
    requestAnimationFrame(tick);
}

// ════════════════════════════════════════════════════════════════════════
// CHART.JS — Bar + Doughnut
// ════════════════════════════════════════════════════════════════════════

function getChartTextColor() {
    return document.documentElement.getAttribute("data-theme") === "dark"
        ? "#B8B2A4" : "#4A5158";
}

function getChartBorderColor() {
    return document.documentElement.getAttribute("data-theme") === "dark"
        ? "#232A37" : "#E8E4DA";
}

function updateCharts(labels, data) {
    if (!window.Chart) return;

    var bg = labels.map(function(_, i) { return CHART_PALETTE[i % CHART_PALETTE.length]; });

    if (!chartBar) {
        var canvasBar = document.getElementById("chart-bar");
        if (!canvasBar) return;
        chartBar = new Chart(canvasBar.getContext("2d"), {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Số phiếu",
                    data: data,
                    backgroundColor: bg,
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 48
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600, easing: "easeOutQuart" },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(15,20,25,.92)",
                        titleFont: { family: "Inter", weight: "600", size: 12 },
                        bodyFont:  { family: "Inter", size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: function(ctx) {
                                var total = ctx.dataset.data.reduce(function(a,b){ return a+b; }, 0);
                                var pct = total > 0 ? ((ctx.parsed.y / total) * 100).toFixed(1) : 0;
                                return ctx.parsed.y + " phiếu (" + pct + "%)";
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: getChartTextColor(), font: { family: "Inter", size: 11 } },
                        grid:  { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: getChartTextColor(), font: { family: "JetBrains Mono", size: 11 }, precision: 0 },
                        grid:  { color: getChartBorderColor(), drawBorder: false }
                    }
                }
            }
        });
    } else {
        chartBar.data.labels = labels;
        chartBar.data.datasets[0].data = data;
        chartBar.data.datasets[0].backgroundColor = bg;
        chartBar.update();
    }

    if (!chartDoughnut) {
        var canvasDo = document.getElementById("chart-doughnut");
        if (!canvasDo) return;
        chartDoughnut = new Chart(canvasDo.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bg,
                    borderColor: "transparent",
                    borderWidth: 2,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "62%",
                animation: { duration: 600, easing: "easeOutQuart" },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: getChartTextColor(),
                            font: { family: "Inter", size: 11 },
                            usePointStyle: true,
                            pointStyle: "circle",
                            padding: 12,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: "rgba(15,20,25,.92)",
                        titleFont: { family: "Inter", weight: "600", size: 12 },
                        bodyFont:  { family: "Inter", size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(ctx) {
                                var total = ctx.dataset.data.reduce(function(a,b){ return a+b; }, 0);
                                var pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return " " + ctx.label + ": " + ctx.parsed + " (" + pct + "%)";
                            }
                        }
                    }
                }
            }
        });
    } else {
        chartDoughnut.data.labels = labels;
        chartDoughnut.data.datasets[0].data = data;
        chartDoughnut.data.datasets[0].backgroundColor = bg;
        chartDoughnut.update();
    }
}

function updateChartTheme(chart) {
    if (!chart) return;
    if (chart.options.scales) {
        if (chart.options.scales.x && chart.options.scales.x.ticks)
            chart.options.scales.x.ticks.color = getChartTextColor();
        if (chart.options.scales.y) {
            if (chart.options.scales.y.ticks) chart.options.scales.y.ticks.color = getChartTextColor();
            if (chart.options.scales.y.grid)  chart.options.scales.y.grid.color  = getChartBorderColor();
        }
    }
    if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
        chart.options.plugins.legend.labels.color = getChartTextColor();
    }
    chart.update("none");
}

// ════════════════════════════════════════════════════════════════════════
// VOTER STATUS
// ════════════════════════════════════════════════════════════════════════

async function checkVoterStatus() {
    if (!account || !contract) return;
    try {
        var voted   = await contract.checkHasVoted(account);
        var formEl  = document.getElementById("vote-form-section");
        var votedEl = document.getElementById("voted-message");
        var badgeEl = document.getElementById("vote-status-badge");
        var fab     = document.getElementById("vote-fab");

        if (voted) {
            if (formEl)  formEl.hidden  = true;
            if (votedEl) votedEl.hidden = false;
            if (badgeEl) {
                badgeEl.textContent = "✓ Đã bỏ phiếu";
                badgeEl.className   = "badge badge-success";
            }
            if (fab) { fab.hidden = true; fab.classList.remove("is-visible"); }
        } else {
            if (formEl)  formEl.hidden  = false;
            if (votedEl) votedEl.hidden = true;
            if (badgeEl) {
                badgeEl.textContent = "Chưa bỏ phiếu";
                badgeEl.className   = "badge";
            }
        }
        refreshLucide();
    } catch(err) {
        console.error("[App] checkVoterStatus:", err);
    }
}

// ════════════════════════════════════════════════════════════════════════
// VOTE FLOW: select → confirm modal → pending modal → success modal + confetti
// ════════════════════════════════════════════════════════════════════════

function onCandidateSelectChange() {
    var selectEl = document.getElementById("candidate-select");
    var btn = document.getElementById("btn-vote");
    if (!selectEl || !btn) return;
    btn.disabled = !selectEl.value;
    syncCandidatePickerTrigger();
}

// ════════════════════════════════════════════════════════════════════════
// CUSTOM CANDIDATE PICKER (rich dropdown — avatar + name + live vote count)
// ════════════════════════════════════════════════════════════════════════

var _pickerCandidates = []; // cache for live re-render after search input
var _pickerTotal = 0;

function pickerInitial(name) {
    if (!name) return "?";
    var trimmed = name.trim();
    var parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function pickerColorClass(id) {
    var n = (Number(id) % 8) + 1;
    return "cand-avatar--c" + n;
}

function renderCandidatePicker(candidates, total) {
    _pickerCandidates = candidates || [];
    _pickerTotal = total || 0;
    renderCandidatePickerList(_pickerCandidates);
    syncCandidatePickerTrigger();
}

function renderCandidatePickerList(candidates) {
    var listEl = document.getElementById("cand-picker-list");
    if (!listEl) return;

    if (!candidates || candidates.length === 0) {
        listEl.innerHTML =
            '<li class="cand-picker-empty">'
          +   '<i data-lucide="users"></i>'
          +   '<div>Không có ứng viên nào</div>'
          + '</li>';
        refreshLucide();
        return;
    }

    var selectEl = document.getElementById("candidate-select");
    var currentVal = selectEl ? selectEl.value : "";
    var maxVotes = Math.max.apply(null, candidates.map(function(c){ return c.voteCount; }));

    listEl.innerHTML = candidates.map(function(c) {
        var isLeader = c.voteCount > 0 && c.voteCount === maxVotes;
        var isActive = String(c.id) === String(currentVal);
        var pct = _pickerTotal > 0 ? (c.voteCount / _pickerTotal) * 100 : 0;
        var initial = pickerInitial(c.name);
        var colorCls = pickerColorClass(c.id);
        var nameSafe = escapeHtml(c.name);

        return '<li class="cand-option' + (isActive ? " is-active" : "") + '" '
            +    'data-cand-id="' + c.id + '" role="option" aria-selected="' + isActive + '">'
            +    '<span class="cand-avatar ' + colorCls + '">' + escapeHtml(initial) + '</span>'
            +    '<span class="cand-option-info">'
            +      '<span class="cand-option-name">' + nameSafe
            +        (isLeader ? ' <span class="cand-option-leader-tag"><i data-lucide="trending-up"></i>Dẫn đầu</span>' : '')
            +      '</span>'
            +      '<span class="cand-option-bar-wrap">'
            +        '<span class="cand-option-bar"><span class="cand-option-bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>'
            +        '<span class="cand-option-votes">' + c.voteCount + ' phiếu</span>'
            +      '</span>'
            +    '</span>'
            +    '<span class="cand-option-check"><i data-lucide="check"></i></span>'
            +  '</li>';
    }).join("");

    // Wire click → select candidate
    Array.prototype.forEach.call(listEl.querySelectorAll(".cand-option"), function(el) {
        el.addEventListener("click", function() {
            var id = el.getAttribute("data-cand-id");
            selectCandidateFromPicker(id);
        });
    });

    refreshLucide();
}

function syncCandidatePickerTrigger() {
    var selectEl = document.getElementById("candidate-select");
    var avatarEl = document.getElementById("cand-picker-avatar");
    var nameEl = document.getElementById("cand-picker-name");
    var subEl = document.getElementById("cand-picker-sub");
    if (!selectEl || !avatarEl || !nameEl) return;

    var val = selectEl.value;
    if (!val) {
        avatarEl.setAttribute("data-empty", "true");
        avatarEl.className = "cand-avatar cand-avatar--sm";
        avatarEl.innerHTML = '<i data-lucide="user-check"></i>';
        nameEl.textContent = "— Chọn ứng viên —";
        if (subEl) subEl.textContent = "Chạm để xem danh sách";
    } else {
        var c = _pickerCandidates.find(function(x){ return String(x.id) === String(val); });
        if (c) {
            avatarEl.removeAttribute("data-empty");
            avatarEl.className = "cand-avatar cand-avatar--sm " + pickerColorClass(c.id);
            avatarEl.innerHTML = escapeHtml(pickerInitial(c.name));
            nameEl.textContent = c.name;
            if (subEl) subEl.textContent = "Đang chọn · " + c.voteCount + " phiếu hiện tại";
        }
    }
    refreshLucide();
}

function selectCandidateFromPicker(id) {
    var selectEl = document.getElementById("candidate-select");
    if (!selectEl) return;
    selectEl.value = id;
    // Trigger native change handler
    onCandidateSelectChange();
    closeCandidatePicker();
}

function openCandidatePicker() {
    var picker = document.getElementById("cand-picker");
    var panel  = document.getElementById("cand-picker-panel");
    var trigger = document.getElementById("cand-picker-trigger");
    if (!picker || !panel) return;
    panel.hidden = false;
    picker.classList.add("is-open");
    if (trigger) trigger.setAttribute("aria-expanded", "true");

    // Focus search input after pop animation
    var search = document.getElementById("cand-picker-search");
    if (search) setTimeout(function() { search.focus(); search.value = ""; renderCandidatePickerList(_pickerCandidates); }, 80);

    // Click-outside handler
    setTimeout(function() {
        document.addEventListener("click", _pickerOutsideHandler, { once: false });
    }, 0);
    document.addEventListener("keydown", _pickerKeyHandler);
}

function closeCandidatePicker() {
    var picker = document.getElementById("cand-picker");
    var panel  = document.getElementById("cand-picker-panel");
    var trigger = document.getElementById("cand-picker-trigger");
    if (!picker || !panel) return;
    panel.hidden = true;
    picker.classList.remove("is-open");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", _pickerOutsideHandler);
    document.removeEventListener("keydown", _pickerKeyHandler);
}

function _pickerOutsideHandler(e) {
    var picker = document.getElementById("cand-picker");
    if (picker && !picker.contains(e.target)) closeCandidatePicker();
}

function _pickerKeyHandler(e) {
    if (e.key === "Escape") closeCandidatePicker();
}

function initCandidatePicker() {
    var trigger = document.getElementById("cand-picker-trigger");
    var search  = document.getElementById("cand-picker-search");
    if (trigger) {
        trigger.addEventListener("click", function(e) {
            e.stopPropagation();
            var picker = document.getElementById("cand-picker");
            if (picker.classList.contains("is-open")) closeCandidatePicker();
            else openCandidatePicker();
        });
    }
    if (search) {
        search.addEventListener("input", function() {
            var q = search.value.trim().toLowerCase();
            if (!q) {
                renderCandidatePickerList(_pickerCandidates);
                return;
            }
            var filtered = _pickerCandidates.filter(function(c) {
                return c.name.toLowerCase().includes(q);
            });
            renderCandidatePickerList(filtered);
        });
        search.addEventListener("click", function(e) { e.stopPropagation(); });
    }
}

function openVoteConfirm() {
    var selectEl = document.getElementById("candidate-select");
    var candidateId = Number(selectEl ? selectEl.value : 0);
    if (!candidateId) {
        showToast("Chưa chọn ứng viên", "Hãy chọn một ứng viên từ danh sách.", "warning");
        return;
    }
    if (!contract || !account) {
        showToast("Chưa kết nối", "Vui lòng kết nối ví MetaMask trước.", "error");
        return;
    }

    pendingVoteCandidateId   = candidateId;
    pendingVoteCandidateName = selectEl.options[selectEl.selectedIndex].text;

    document.getElementById("confirm-cand-name").textContent = pendingVoteCandidateName;

    // Phase 7.2 — Trust signals: gas estimate + contract address
    populateTrustInfo(candidateId);

    openModal("modal-confirm");
}

/**
 * Phase 7.2 — Populate trust info trong vote modal
 */
async function populateTrustInfo(candidateId) {
    var gasEl     = document.getElementById("trust-gas");
    var timeEl    = document.getElementById("trust-confirm-time");
    var contractEl = document.getElementById("trust-contract");

    if (contractEl) {
        contractEl.textContent = shortAddr(CONTRACT_ADDRESS);
        contractEl.title = CONTRACT_ADDRESS;
    }

    if (timeEl) {
        var info = window._networkInfo || { name: "Localhost" };
        timeEl.textContent = info.name === "Sepolia" ? "~15 giây" :
                             info.isMain ? "~30 giây" : "~12 giây";
    }

    if (gasEl) {
        gasEl.textContent = "đang tính…";
        try {
            var gasUnits = await contract.vote.estimateGas(candidateId);
            var feeData  = await provider.getFeeData();
            var gasPrice = feeData.gasPrice || feeData.maxFeePerGas || ethers.parseUnits("1", "gwei");
            var totalWei = gasUnits * gasPrice;
            var totalEth = ethers.formatEther(totalWei);
            // Format 5 chữ số sau dấu phẩy
            var formatted = Number(totalEth).toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
            gasEl.textContent = "~" + formatted + " ETH";
        } catch(e) {
            console.warn("[App] Gas estimate failed:", e.message);
            gasEl.textContent = "~0.001 ETH (ước tính)";
        }
    }
}

async function confirmAndVote() {
    closeModal("modal-confirm");

    if (!pendingVoteCandidateId) return;
    var candidateId = pendingVoteCandidateId;
    var candidateName = pendingVoteCandidateName;

    try {
        // Phase 4.3 — Mở multi-stage progress modal
        document.getElementById("modal-pending-tx").hidden = true;
        setProgressStage(0);
        openModal("modal-pending");

        setBtnLoading("btn-vote", true, "Chờ ký…");

        // Live ledger: kích hoạt neon cable pulse từ wallet → block
        try { setCablePending(true); } catch(e) { /* non-fatal */ }

        var tx = await contract.vote(candidateId);

        // Phase 4.2 — Optimistic UI: tăng vote count ngay sau khi tx được submit
        applyOptimisticVote(candidateId);

        // Live ledger: hiện hash trong VERIFYING state ngay khi tx đã ký + submit
        try { updateImmutableBadge(tx.hash, "verifying"); } catch(e) { /* non-fatal */ }

        // Stage 1 — Đã ký + đã submit
        setProgressStage(1);

        // Hiển thị tx hash
        var hashEl = document.getElementById("modal-pending-hash");
        var linkEl = document.getElementById("modal-pending-link");
        var txInfo = document.getElementById("modal-pending-tx");
        if (hashEl) hashEl.textContent = tx.hash.slice(0, 14) + "…" + tx.hash.slice(-8);
        if (linkEl) {
            var explorerUrl = getExplorerUrl(window._networkInfo, tx.hash);
            if (explorerUrl) {
                linkEl.href = explorerUrl;
                linkEl.hidden = false;
            } else {
                linkEl.hidden = true;
            }
        }
        if (txInfo) txInfo.hidden = false;

        // Stage 2 — Đang chờ confirm
        setProgressStage(2);

        await tx.wait();

        // Stage 3 — Done, đang đồng bộ
        setProgressStage(3);

        // Slight delay để user thấy stage 3 hoàn tất
        await new Promise(function(r) { setTimeout(r, 400); });

        // Live ledger: tx confirmed → IMMUTABLE state + tắt cable pulse + wow effect
        try { setCablePending(false); } catch(e) { /* non-fatal */ }
        try { updateImmutableBadge(tx.hash, "immutable"); } catch(e) { /* non-fatal */ }
        try { triggerWowEffect(); } catch(e) { /* non-fatal */ }

        closeModal("modal-pending");

        // Modal success + confetti
        document.getElementById("success-cand-name").textContent = candidateName;
        openModal("modal-success");
        fireConfetti();

        // Phase 5.6 — Success toast với nhân vật
        showToast("🎉 Phiếu của bạn đã được ghi", "Cảm ơn bạn đã bỏ phiếu cho " + candidateName + ". Lá phiếu này sẽ tồn tại mãi trên blockchain.", "success", 6000);

        await loadCandidates();
        await checkVoterStatus();
        await loadTransactionHistory();

    } catch(err) {
        console.error("[App] confirmAndVote:", err);
        closeModal("modal-pending");

        // Tắt cable pulse khi tx fail
        try { setCablePending(false); } catch(e) { /* non-fatal */ }

        // Phase 4.2 — Rollback optimistic UI
        rollbackOptimisticVote(candidateId);

        // Phase 6.1 — Toast với action retry
        showToast("Bỏ phiếu thất bại", friendlyError(err), "error", 0, [
            { label: "Thử lại", onclick: function() { openVoteConfirm(); } },
            { label: "Đóng",    onclick: function(){}, ghost: true }
        ]);
    } finally {
        setBtnLoading("btn-vote", false);
        pendingVoteCandidateId   = null;
        pendingVoteCandidateName = null;
    }
}

/**
 * Phase 4.3 — Set progress modal stage (0-3)
 */
function setProgressStage(stage) {
    var widths = ["10%", "33%", "66%", "100%"];
    var bar = document.getElementById("progress-bar");
    if (bar) bar.style.width = widths[stage] || "0";

    // Step indicators
    for (var i = 1; i <= 3; i++) {
        var stepEl = document.getElementById("step-" + i);
        if (!stepEl) continue;
        stepEl.classList.remove("is-done", "is-active");
        if (i < stage)        stepEl.classList.add("is-done");
        else if (i === stage) stepEl.classList.add("is-active");
        // (stage 3+ — tất cả done)
        if (stage >= 3 && i <= 3) {
            stepEl.classList.remove("is-active");
            stepEl.classList.add("is-done");
        }
    }
    // Step 1 active khi stage = 0 (đang chờ ký)
    if (stage === 0) {
        document.getElementById("step-1").classList.add("is-active");
    }

    // Title + body từ getLoadingMessage
    var msg = getLoadingMessage(stage);
    var titleEl = document.getElementById("modal-pending-title");
    var bodyEl  = document.getElementById("modal-pending-msg");
    if (titleEl) titleEl.textContent = msg.title;
    if (bodyEl)  bodyEl.textContent  = msg.body;
}

/**
 * Phase 4.2 — Optimistic UI: tăng vote count tạm thời
 *  - Bảng: bump số phiếu của ứng viên + flash animation
 *  - Tổng: animateNumber count-up
 *  - Chart bar + doughnut: nhảy số ngay khi user vừa ký (Web3 UX best practice)
 */
function applyOptimisticVote(candidateId) {
    if (!_lastCandidatesState) return;
    var row = document.querySelector('tr[data-cand-id="' + candidateId + '"]');
    if (row) {
        var voteNumEl = row.querySelector(".vote-num");
        if (voteNumEl) {
            var current = Number(voteNumEl.textContent) || 0;
            voteNumEl.textContent = current + 1;
            voteNumEl.classList.remove("is-flashed");
            // Force reflow để re-trigger animation
            void voteNumEl.offsetWidth;
            voteNumEl.classList.add("is-flashed");
        }
    }
    // Update tổng phiếu lạc quan
    var totalEl = document.getElementById("total-votes");
    if (totalEl) animateNumber("total-votes", _lastCandidatesState.total + 1, 300);

    // Wave 4A — Bump dashboard total với count-up animation đồng bộ
    updateHeroDashboard({ total: _lastCandidatesState.total + 1 });

    // Optimistic chart update — bump bar/doughnut ngay khi ký, không chờ on-chain
    // Charts dùng cùng order như _lastCandidatesState.candidates (theo ID gốc, không phải sort theo phiếu)
    var idx = -1;
    for (var i = 0; i < _lastCandidatesState.candidates.length; i++) {
        if (_lastCandidatesState.candidates[i].id === Number(candidateId)) { idx = i; break; }
    }
    if (idx >= 0) {
        if (typeof chartBar !== "undefined" && chartBar && chartBar.data && chartBar.data.datasets[0]) {
            var dBar = chartBar.data.datasets[0].data;
            dBar[idx] = (Number(dBar[idx]) || 0) + 1;
            chartBar.update();
        }
        if (typeof chartDoughnut !== "undefined" && chartDoughnut && chartDoughnut.data && chartDoughnut.data.datasets[0]) {
            var dDo = chartDoughnut.data.datasets[0].data;
            dDo[idx] = (Number(dDo[idx]) || 0) + 1;
            chartDoughnut.update();
        }
    }
}

function rollbackOptimisticVote(candidateId) {
    if (!_lastCandidatesState) return;
    var row = document.querySelector('tr[data-cand-id="' + candidateId + '"]');
    if (row) {
        row.classList.add("is-rolling-back");
        setTimeout(function() { row.classList.remove("is-rolling-back"); }, 800);
    }
    // Reload lại data thật
    loadCandidates();
}

// Giữ lại tên hàm cũ để tương thích nếu code khác đang gọi
async function castVote() { openVoteConfirm(); }

// ════════════════════════════════════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════════════════════════════════════

function openModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    document.body.style.overflow = "hidden";
}

function closeModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = true;
    if (!document.querySelector(".modal-backdrop:not([hidden])")) {
        document.body.style.overflow = "";
    }
}

function initModalCloseHandlers() {
    document.addEventListener("click", function(e) {
        // Click vào backdrop có data-close
        if (e.target.matches(".modal-backdrop[data-close]")) {
            e.target.hidden = true;
            document.body.style.overflow = "";
            return;
        }
        // Click vào nút có data-close-trigger
        if (e.target.closest("[data-close-trigger]")) {
            var modal = e.target.closest(".modal-backdrop");
            if (modal) {
                modal.hidden = true;
                document.body.style.overflow = "";
            }
        }
    });

    // ESC để đóng modal
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") {
            var open = document.querySelectorAll(".modal-backdrop:not([hidden])");
            open.forEach(function(m) {
                if (m.hasAttribute("data-close") || m.id !== "modal-pending") {
                    m.hidden = true;
                    document.body.style.overflow = "";
                }
            });
        }
    });
}

// ════════════════════════════════════════════════════════════════════════
// CONFETTI (CSS-only, không cần thư viện)
// ════════════════════════════════════════════════════════════════════════

function fireConfetti() {
    var container = document.getElementById("confetti-container");
    if (!container) return;

    // Phase 8.6 — Reduced motion / low-end devices skip confetti
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    var colors = isDark
        ? ["#E8C268", "#F4D88A", "#FBE9B3", "#B58F3D", "#FAF6EC", "#5C8DFF"]
        : ["#2962FF", "#0A2540", "#5A8AFF", "#C9A961", "#00875A", "#7C3AED"];
    // Mobile/low-end → ít pieces hơn
    var isMobile = window.innerWidth <= 640;
    var lowMem   = navigator.deviceMemory && navigator.deviceMemory < 4;
    var pieces   = (isMobile || lowMem) ? 25 : 60;

    for (var i = 0; i < pieces; i++) {
        var p = document.createElement("div");
        var size = 6 + Math.random() * 8;
        var left = Math.random() * 100;
        var delay = Math.random() * 0.6;
        var duration = 2.5 + Math.random() * 1.5;
        var rotate = Math.random() * 360;
        var horiz = (Math.random() - 0.5) * 200;

        p.style.cssText =
            'position:absolute;top:-20px;left:' + left + '%;'
          + 'width:' + size + 'px;height:' + (size*1.6) + 'px;'
          + 'background:' + colors[Math.floor(Math.random() * colors.length)] + ';'
          + 'border-radius:1px;opacity:1;'
          + 'transform:rotate(' + rotate + 'deg);'
          + 'animation: confetti-fall ' + duration + 's ' + delay + 's ease-in forwards;';
        p.style.setProperty('--horiz', horiz + 'px');

        container.appendChild(p);

        setTimeout((function(el) {
            return function() { if (el && el.parentNode) el.remove(); };
        })(p), (delay + duration) * 1000 + 100);
    }

    // Inject keyframes một lần duy nhất
    if (!document.getElementById("confetti-keyframes")) {
        var style = document.createElement("style");
        style.id = "confetti-keyframes";
        style.textContent =
            "@keyframes confetti-fall {"
          + "  0% { transform: translate(0,0) rotate(0); opacity: 1; }"
          + "  100% { transform: translate(var(--horiz), 110vh) rotate(720deg); opacity: 0; }"
          + "}";
        document.head.appendChild(style);
    }
}

// ════════════════════════════════════════════════════════════════════════
// COUNTDOWN
// ════════════════════════════════════════════════════════════════════════

function startCountdown() {
    clearInterval(countdownId);
    var el = document.getElementById("countdown");
    if (!el) return;

    countdownId = setInterval(function() {
        if (!window._timingEnabled) {
            el.textContent = "∞";
            clearInterval(countdownId);
            return;
        }

        var now    = Math.floor(Date.now() / 1000);
        var target = (window._electionStatus === "DANG_MO")
            ? window._endTime : window._startTime;
        var diff   = target - now;

        if (diff <= 0) {
            el.textContent = "Hết giờ";
            clearInterval(countdownId);
            return;
        }

        var d = Math.floor(diff / 86400);
        var h = Math.floor((diff % 86400) / 3600);
        var m = Math.floor((diff % 3600) / 60);
        var s = diff % 60;
        if (d > 0) el.textContent = d + "d " + pad(h) + ":" + pad(m);
        else        el.textContent = pad(h) + ":" + pad(m) + ":" + pad(s);
    }, 1000);
}

function pad(n) { return String(n).padStart(2, "0"); }

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════

function shortAddr(addr) {
    if (!addr) return "—";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function show(id) { var el = document.getElementById(id); if (el) el.hidden = false; }
function hide(id) { var el = document.getElementById(id); if (el) el.hidden = true; }

function refreshLucide() {
    if (window.lucide && lucide.createIcons) {
        try { lucide.createIcons(); } catch(e) { /* ignore */ }
    }
}

// Hook scroll cho topbar (border khi cuộn) + mobile FAB show/hide
window.addEventListener("scroll", function() {
    var bar = document.querySelector(".topbar");
    if (bar) {
        if (window.scrollY > 4) bar.classList.add("scrolled");
        else                     bar.classList.remove("scrolled");
    }

    // Phase 8.1 — Mobile FAB: show sau khi scroll qua hero
    updateMobileFab();
});

// ════════════════════════════════════════════════════════════════════════
// PHASE 8.1 — MOBILE FAB VOTE BUTTON
// ════════════════════════════════════════════════════════════════════════

function initMobileFab() {
    updateMobileFab();
    window.addEventListener("resize", updateMobileFab);
}

function updateMobileFab() {
    var fab = document.getElementById("vote-fab");
    if (!fab) return;

    // Chỉ hiện trên mobile + đã connect + chưa vote + có vote-form
    var isMobile = window.innerWidth <= 640;
    var voteForm = document.getElementById("vote-form-section");
    var canVote  = voteForm && !voteForm.hidden && account;
    var heroEl   = document.querySelector(".hero");
    var pastHero = heroEl ? (window.scrollY > heroEl.offsetTop + heroEl.offsetHeight - 100) : false;

    if (isMobile && canVote && pastHero) {
        fab.hidden = false;
        fab.classList.add("is-visible");
    } else {
        fab.classList.remove("is-visible");
        // Keep hidden=false để CSS quyết định display
        if (!isMobile || !canVote) fab.hidden = true;
    }
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 0.2 — ONBOARDING TOUR
// ════════════════════════════════════════════════════════════════════════

var _tourStep = 0;
var _tourSteps = [
    { title: "Mỗi ví chỉ được bầu một lần",
      body: "Smart contract đảm bảo bạn không thể bỏ phiếu trùng — kể cả khi đổi tab hay refresh trang." },
    { title: "Phiếu của bạn ghi vĩnh viễn",
      body: "Một khi đã bỏ, lá phiếu sẽ tồn tại mãi trên blockchain. Không ai (kể cả admin) có thể sửa." },
    { title: "Bạn cần một ít ETH",
      body: "Mỗi giao dịch tốn ~0.001 ETH phí gas. Trên Localhost, MetaMask đã có sẵn 10000 ETH demo." }
];

function startOnboardingTour() {
    _tourStep = 0;
    showTourStep();
    var overlay = document.getElementById("tour-overlay");
    if (overlay) overlay.hidden = false;
}

function showTourStep() {
    var step = _tourSteps[_tourStep];
    if (!step) return;
    document.getElementById("tour-title").textContent = step.title;
    document.getElementById("tour-body").textContent  = step.body;

    // Update dots
    var dots = document.querySelectorAll(".tour-dot");
    for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle("active", i === _tourStep);
    }

    // Last step → label "Bắt đầu"
    var nextLabel = document.getElementById("tour-next-label");
    if (nextLabel) nextLabel.textContent = (_tourStep === _tourSteps.length - 1) ? "Bắt đầu bỏ phiếu" : "Tiếp theo";
}

function nextTour() {
    _tourStep++;
    if (_tourStep >= _tourSteps.length) {
        finishTour();
    } else {
        showTourStep();
    }
}

function skipTour() { finishTour(); }

function finishTour() {
    var overlay = document.getElementById("tour-overlay");
    if (overlay) overlay.hidden = true;
    localStorage.setItem("votechain.hasConnectedBefore", "1");
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 7.1 — FOOTER TRUST BLOCK
// ════════════════════════════════════════════════════════════════════════

function initFooterTrustBlock() {
    var addrEl = document.getElementById("footer-contract-addr");
    if (addrEl) addrEl.textContent = CONTRACT_ADDRESS;

    var linkEl = document.getElementById("footer-contract-link");
    // Sẽ update sau khi detectNetwork() có info
    setTimeout(updateFooterExplorerLink, 1500);
}

function updateFooterExplorerLink() {
    var linkEl = document.getElementById("footer-contract-link");
    if (!linkEl || !window._networkInfo) return;
    if (window._networkInfo.explorer) {
        linkEl.href = window._networkInfo.explorer + "/address/" + CONTRACT_ADDRESS;
        linkEl.hidden = false;
    } else {
        linkEl.hidden = true;
        linkEl.title = "Local network — không có block explorer";
    }
}

function initFooterCopyContract() {
    var btn = document.getElementById("btn-copy-contract");
    if (!btn) return;
    btn.addEventListener("click", function() {
        try {
            navigator.clipboard.writeText(CONTRACT_ADDRESS);
            showToast("Đã sao chép contract", shortAddr(CONTRACT_ADDRESS), "success", 2000);
        } catch(e) {
            showToast("Không thể sao chép", "Trình duyệt không hỗ trợ.", "warning");
        }
    });
}

// Auto-update footer block number mỗi 5s
setInterval(async function() {
    if (!provider) return;
    try {
        var bn = await provider.getBlockNumber();
        var el = document.getElementById("footer-block-num");
        if (el) el.textContent = bn;
    } catch(e) {}
}, 5000);

// ════════════════════════════════════════════════════════════════════════
// PHASE 7.4 — QUORUM INDICATOR
// ════════════════════════════════════════════════════════════════════════

async function updateQuorum(totalVotes) {
    var block = document.getElementById("quorum-block");
    if (!block) return;

    if (!window._whitelistEnabled) {
        block.hidden = true;
        return;
    }

    block.hidden = false;
    try {
        // Đếm số address whitelisted qua events
        var filter = contract.filters.VoterWhitelisted();
        var addedEvents = await contract.queryFilter(filter, 0, "latest");
        var removedFilter = contract.filters.VoterRemovedFromWhitelist();
        var removedEvents = await contract.queryFilter(removedFilter, 0, "latest");

        var whitelistSet = new Set();
        addedEvents.forEach(function(ev) {
            whitelistSet.add(ev.args[0].toLowerCase());
        });
        removedEvents.forEach(function(ev) {
            whitelistSet.delete(ev.args[0].toLowerCase());
        });

        var totalWl = whitelistSet.size;
        var pct = totalWl > 0 ? (totalVotes / totalWl * 100) : 0;

        document.getElementById("quorum-voted").textContent = totalVotes;
        document.getElementById("quorum-total").textContent = totalWl;
        document.getElementById("quorum-pct").textContent   = pct.toFixed(0) + "%";
        document.getElementById("quorum-fill").style.width  = Math.min(pct, 100) + "%";
    } catch(e) {
        console.warn("[App] updateQuorum:", e.message);
        block.hidden = true;
    }
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 5.6 — SHARE VOTE (copy link)
// ════════════════════════════════════════════════════════════════════════

function shareVote() {
    var url = window.location.href;
    try {
        navigator.clipboard.writeText(url);
        showToast("Đã sao chép link", "Chia sẻ với bạn bè để cùng bầu cử.", "success", 2500);
    } catch(e) {
        showToast("Không thể sao chép", "Trình duyệt không hỗ trợ.", "warning");
    }
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 3.6 — ADMIN TABS KEYBOARD NAV (Arrow Left/Right + Home/End)
// ════════════════════════════════════════════════════════════════════════

document.addEventListener("keydown", function(e) {
    var active = document.activeElement;
    if (!active || !active.classList.contains("admin-tab")) return;

    var tabs = Array.prototype.slice.call(document.querySelectorAll(".admin-tab"));
    var idx = tabs.indexOf(active);
    if (idx === -1) return;

    var newIdx = -1;
    if (e.key === "ArrowRight")     newIdx = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") newIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home")      newIdx = 0;
    else if (e.key === "End")       newIdx = tabs.length - 1;

    if (newIdx !== -1) {
        e.preventDefault();
        tabs[newIdx].focus();
        tabs[newIdx].click();
    }
});

// ════════════════════════════════════════════════════════════════════════
// WAVE 4C — SMART CONNECT DROPDOWN (Singapore-style profile menu)
//   Click chevron trong wallet-bar → menu xổ ra hiển thị:
//     • Full address + role + copy
//     • ETH balance + network
//     • Personal vote (đã bỏ phiếu cho ai, hoặc Chưa bỏ phiếu)
//     • Action: explorer, disconnect
// ════════════════════════════════════════════════════════════════════════

function toggleWalletDropdown() {
    var panel  = document.getElementById("wallet-dropdown");
    var btn    = document.getElementById("btn-wallet-expand");
    if (!panel || !btn) return;

    var isOpen = !panel.hidden;
    if (isOpen) {
        closeWalletDropdown();
    } else {
        panel.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        loadWalletDropdownData();
        // Defer document click handler để không tự đóng ngay lúc mở
        setTimeout(function() {
            document.addEventListener("click", _walletDropdownOutsideClick);
            document.addEventListener("keydown", _walletDropdownEscClose);
        }, 0);
    }
}

function closeWalletDropdown() {
    var panel = document.getElementById("wallet-dropdown");
    var btn   = document.getElementById("btn-wallet-expand");
    if (panel) panel.hidden = true;
    if (btn)   btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", _walletDropdownOutsideClick);
    document.removeEventListener("keydown", _walletDropdownEscClose);
}

function _walletDropdownOutsideClick(e) {
    var panel = document.getElementById("wallet-dropdown");
    var btn   = document.getElementById("btn-wallet-expand");
    if (!panel) return;
    if (panel.contains(e.target)) return;
    if (btn && btn.contains(e.target)) return;
    closeWalletDropdown();
}

function _walletDropdownEscClose(e) {
    if (e.key === "Escape") closeWalletDropdown();
}

/**
 * Load dữ liệu vào Smart Profile dropdown:
 *  - Full address (hash dài)
 *  - Role (Cử tri / Quản trị viên)
 *  - ETH balance (provider.getBalance)
 *  - Network name
 *  - Personal vote: nếu đã vote, query votedEvent để tìm candidate
 */
async function loadWalletDropdownData() {
    if (!account) return;

    // Address full
    var addrEl = document.getElementById("wallet-dropdown-addr");
    if (addrEl) addrEl.textContent = account;

    // Role mirror từ wallet-bar
    var roleEl = document.getElementById("wallet-dropdown-role");
    var roleSrc = document.getElementById("wallet-role");
    if (roleEl && roleSrc) roleEl.textContent = roleSrc.textContent;

    // Network name
    var netEl = document.getElementById("wallet-dropdown-network");
    if (netEl) {
        netEl.textContent = (window._networkInfo && window._networkInfo.name) || "Localhost";
    }

    // ETH balance — provider.getBalance
    var balEl = document.getElementById("wallet-dropdown-balance");
    if (balEl && provider) {
        try {
            var wei = await provider.getBalance(account);
            var eth = ethers.formatEther(wei);
            // Format: 4 chữ số sau dấu chấm, bỏ trailing zeros
            var num = Number(eth);
            var formatted;
            if (num >= 1000)      formatted = num.toFixed(2);
            else if (num >= 1)    formatted = num.toFixed(4);
            else if (num >= .001) formatted = num.toFixed(6);
            else                  formatted = num.toExponential(2);
            // Strip trailing zeros sau dấu chấm
            if (formatted.indexOf(".") !== -1 && formatted.indexOf("e") === -1) {
                formatted = formatted.replace(/\.?0+$/, "");
            }
            balEl.textContent = formatted + " ETH";
        } catch(e) {
            balEl.textContent = "— ETH";
        }
    }

    // Personal vote info
    var voteWrap = document.querySelector(".wallet-dropdown-vote");
    var voteEl   = document.getElementById("wallet-dropdown-vote");
    var voteIcon = document.getElementById("wallet-dropdown-vote-icon");
    if (voteEl && contract) {
        try {
            var voted = await contract.checkHasVoted(account);
            if (voted) {
                if (voteWrap) voteWrap.classList.add("is-voted");
                if (voteIcon) voteIcon.innerHTML = '<i data-lucide="check-circle-2"></i>';
                voteEl.textContent = "Đang truy vấn ứng viên…";
                // Lazy: query votedEvents để tìm candidate đã vote
                try {
                    var filter = contract.filters.votedEvent();
                    var events = await contract.queryFilter(filter, 0, "latest");
                    var myEvent = null;
                    for (var i = events.length - 1; i >= 0; i--) {
                        var tx = await provider.getTransaction(events[i].transactionHash);
                        if (tx && tx.from && tx.from.toLowerCase() === account.toLowerCase()) {
                            myEvent = events[i];
                            break;
                        }
                    }
                    if (myEvent) {
                        var cId = myEvent.args[0];
                        var c = await contract.getCandidate(cId);
                        voteEl.textContent = "Đã bỏ phiếu cho " + c.name;
                    } else {
                        voteEl.textContent = "Đã bỏ phiếu";
                    }
                } catch(qe) {
                    voteEl.textContent = "Đã bỏ phiếu";
                }
            } else {
                if (voteWrap) voteWrap.classList.remove("is-voted");
                if (voteIcon) voteIcon.innerHTML = '<i data-lucide="circle-dashed"></i>';
                voteEl.textContent = "Chưa bỏ phiếu";
            }
            refreshLucide();
        } catch(e) {
            voteEl.textContent = "Không xác định";
        }
    }
}

function openWalletExplorer() {
    var explorer = window._networkInfo && window._networkInfo.explorer;
    if (!explorer || !account) {
        showToast("Không có explorer", "Mạng hiện tại không có block explorer công khai.", "info");
        return;
    }
    window.open(explorer + "/address/" + account, "_blank", "noopener,noreferrer");
}

function disconnectWallet() {
    closeWalletDropdown();
    try { removeRealtimeListener(); } catch(e) { /* non-fatal */ }
    if (typeof countdownId !== "undefined") clearInterval(countdownId);
    resetWalletUI();
    showToast(
        "Đã ngắt kết nối",
        "VoteChain đã quên ví của bạn. Muốn revoke quyền hoàn toàn? Mở MetaMask → Connected sites.",
        "info",
        6000
    );
}

// ════════════════════════════════════════════════════════════════════════
// LIVE LEDGER — vertical chain of 3D blocks bên trái panel hero
// ════════════════════════════════════════════════════════════════════════

/**
 * Drop một block mới vào ledger rail với drop-in animation + glow burst.
 * Giữ tối đa 7 blocks (oldest fall off khi quá).
 * Gọi từ: votedEvent listener, optimistic vote (optional).
 */
function dropLedgerBlock() {
    var stack = document.getElementById("hero-ledger-stack");
    if (!stack) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // Vẫn add block nhưng không animate
    }

    // Convert 1 ghost block thành real, hoặc append new
    var firstGhost = stack.querySelector(".ledger-mini--ghost");
    var block;
    if (firstGhost) {
        block = firstGhost;
        block.classList.remove("ledger-mini--ghost");
    } else {
        block = document.createElement("span");
        block.className = "ledger-mini";
        block.innerHTML = '<span class="ledger-mini-bar"></span>';
        // Insert ở đầu (top of stack), oldest sẽ ở dưới
        stack.insertBefore(block, stack.firstChild);
    }
    // Re-trigger drop-in animation
    block.classList.remove("ledger-mini--new");
    void block.offsetWidth;
    block.classList.add("ledger-mini--new");

    // Cap at 7 — remove oldest (last child) nếu quá
    var realBlocks = stack.querySelectorAll(".ledger-mini:not(.ledger-mini--ghost)");
    if (realBlocks.length > 7) {
        var oldest = realBlocks[realBlocks.length - 1];
        if (oldest) oldest.remove();
    }
}

// ════════════════════════════════════════════════════════════════════════
// IMMUTABLE BADGE — tx hash verifying → immutable (Item 3a)
// ════════════════════════════════════════════════════════════════════════

/**
 * Update tx hash badge dưới Votes Confirmed.
 *   hash:  full 0x... hash, sẽ rút gọn thành 0xabcd…1234
 *   state: "verifying" | "immutable"
 */
function updateImmutableBadge(hash, state) {
    var badge = document.getElementById("hero-immutable");
    var hashEl = document.getElementById("hero-immutable-hash");
    var labelEl = document.getElementById("hero-immutable-label");
    if (!badge || !hashEl || !labelEl) return;

    if (hash) {
        var short = hash.length > 12
            ? hash.slice(0, 6) + "…" + hash.slice(-4)
            : hash;
        hashEl.textContent = short;
        hashEl.title = hash; // full hash on hover
    }
    badge.dataset.state = state || "immutable";
    labelEl.textContent = state === "verifying" ? "VERIFYING…" : "IMMUTABLE";
    badge.hidden = false;
}

/**
 * Auto-hide badge sau N giây (dùng khi muốn fade về state mặc định).
 * Hiện tại không dùng — giữ badge persistent là trust signal mạnh.
 */

// ════════════════════════════════════════════════════════════════════════
// CABLE STATE — pulse khi tx pending, idle khi không
// ════════════════════════════════════════════════════════════════════════

function setCablePending(pending) {
    document.body.classList.toggle("is-tx-pending", !!pending);
}

// ════════════════════════════════════════════════════════════════════════
// WOW EFFECT — card shake + gold burst sau tx success (Item 5a)
// ════════════════════════════════════════════════════════════════════════

/**
 * Trigger wow celebration sau khi tx.wait() thành công:
 *   1. Front card shake 0.65s
 *   2. Gold radial burst overlay 0.9s
 *   3. Confetti (đã có via fireConfetti() — gọi riêng ở caller)
 *   4. Drop ledger block với glow
 */
function triggerWowEffect() {
    var card = document.getElementById("hero-block-confirm");
    if (card) {
        card.classList.remove("is-wow");
        void card.offsetWidth;
        card.classList.add("is-wow");
        setTimeout(function() { card.classList.remove("is-wow"); }, 950);
    }
    try { dropLedgerBlock(); } catch(e) { /* non-fatal */ }
}

// ════════════════════════════════════════════════════════════════════════
// CTA INLINE STATS — skeleton → counting up (Item 2)
// ════════════════════════════════════════════════════════════════════════

/**
 * Update inline stats dưới CTA. Lần đầu có data → switch state="live" để
 * tắt skeleton shimmer, kích hoạt count-up bump animation cho từng số đổi.
 */
function updateCTAStats(opts) {
    opts = opts || {};
    var wrap = document.getElementById("hero-cta-stats");
    if (!wrap) return;

    function setNum(id, value) {
        var el = document.getElementById(id);
        if (!el) return;
        var prev = Number(el.textContent.replace(/[^0-9-]/g, "")) || 0;
        if (typeof value !== "number") return;
        if (prev === value && wrap.dataset.state === "live") return;
        el.textContent = String(value);
        // Bump animation when value changes (not on first set from skeleton)
        if (wrap.dataset.state === "live" && prev !== value) {
            el.classList.remove("is-bumped");
            void el.offsetWidth;
            el.classList.add("is-bumped");
            setTimeout(function() { el.classList.remove("is-bumped"); }, 600);
        }
    }

    if (typeof opts.cands === "number") setNum("hero-cta-stat-cands", opts.cands);
    if (typeof opts.votes === "number") setNum("hero-cta-stat-votes", opts.votes);
    if (typeof opts.quota === "number") setNum("hero-cta-stat-quota", opts.quota);

    // Switch out of skeleton on first data
    if (wrap.dataset.state === "skeleton") {
        wrap.dataset.state = "live";
    }
}

// ════════════════════════════════════════════════════════════════════════
// CANDIDATE HOVER PREVIEW — ghost overlay trên front bar (Item 5b)
// ════════════════════════════════════════════════════════════════════════

/**
 * Khi user hover row ứng viên trong bảng kết quả → hiển thị "ghost overlay"
 * trên hero front bar minh họa: "Nếu bạn vote người này, bar sẽ trông thế này".
 *
 * Tính toán: nếu hiện tại bar fill = X% (do total votes), thì ghost = bar fill mới
 * sau khi +1 vote cho ứng viên đó. Bar formula: 20% + total*3 (capped 95%).
 */
function showCandidatePreview(candidateId) {
    var bar = document.getElementById("hero-dash-front-bar");
    var ghost = document.getElementById("hero-dash-bar-ghost");
    var tag = document.getElementById("hero-dash-preview-tag");
    if (!bar || !ghost || !tag) return;
    if (!_lastCandidatesState) return;

    var total = _lastCandidatesState.total || 0;
    var newTotal = total + 1;
    // Same formula như updateHeroDashboard
    var newPct = newTotal <= 0 ? 0 : Math.min(20 + newTotal * 3, 95);

    // Lookup candidate name
    var name = "ứng viên này";
    var cand = null;
    for (var i = 0; i < _lastCandidatesState.candidates.length; i++) {
        if (_lastCandidatesState.candidates[i].id === Number(candidateId)) {
            cand = _lastCandidatesState.candidates[i];
            name = cand.name;
            break;
        }
    }

    ghost.style.width = newPct + "%";
    tag.style.left = newPct + "%";
    tag.textContent = "+1 nếu bạn vote · " + name;
    bar.classList.add("is-previewing");
}

function hideCandidatePreview() {
    var bar = document.getElementById("hero-dash-front-bar");
    if (bar) bar.classList.remove("is-previewing");
}

/**
 * Wire candidate hover preview lên candidates table.
 * Gọi sau khi loadCandidates() render xong rows.
 */
function wireCandidateHoverPreview() {
    var tbody = document.getElementById("candidates-tbody");
    if (!tbody) return;
    // Use event delegation — re-render rows không bị mất handler
    if (tbody.dataset.previewWired === "1") return;
    tbody.dataset.previewWired = "1";

    tbody.addEventListener("mouseover", function(e) {
        var row = e.target.closest("tr[data-cand-id]");
        if (!row) return;
        var id = row.dataset.candId;
        if (id) showCandidatePreview(id);
    });
    tbody.addEventListener("mouseleave", hideCandidatePreview);
    tbody.addEventListener("mouseout", function(e) {
        // Mouseout fires khi rời row — chỉ hide nếu rời tbody hoàn toàn
        var to = e.relatedTarget;
        if (!to || !tbody.contains(to)) hideCandidatePreview();
    });
}
