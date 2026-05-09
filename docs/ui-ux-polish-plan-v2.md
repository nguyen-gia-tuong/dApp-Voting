# VoteChain dApp Voting — UI/UX Polish Plan v2

> **Phiên bản**: v2 (merge Phase 0/4/5/6/7/8 vào Phase 1/2/3 cũ)
> **Ngày**: 2026-05-08
> **Deadline**: 2026-05-14 — Bài tập nhóm môn Công nghệ chuỗi khối UEH
> **Mục tiêu**: 9.5/10 + người dùng "muốn quay lại"

---

## 0. Bối cảnh

dApp Voting đã có nền tảng vững: smart contract pass 9 test cases, frontend champagne-gold tinh tế, dark mode, real-time listener, 3 chart Chart.js đồng bộ theme, modal flow + confetti CSS-only, 4 loại toast. Plan này nâng tầm sản phẩm từ "đẹp" lên "dùng cảm thấy được chăm sóc".

### Triết lý áp dụng (mọi quyết định)
- **3-second rule** — User mất >3s hiểu element nào → bug
- **Doherty Threshold** — Phản hồi <400ms (skeleton, optimistic UI)
- **Peak-End Rule** — Khoảnh khắc đỉnh (vote success) + khoảnh khắc cuối (modal đóng) phải đáng nhớ
- **Hick's Law** — Một CTA primary mỗi màn
- **Aesthetic-Usability Effect** — Đầu tư first impression
- **Recovery > Prevention** — Mọi error có lối thoát

---

## 1. Trạng thái hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Smart contract `Voting.sol` (Solidity 0.8.28) | Đầy đủ Admin/Time/Whitelist |
| Test `Voting.test.js` | 9 cases pass |
| Frontend files | `index.html`, `style.css`, `app.js`, `eventHandler.js`, `admin.js`, `contract-config.js` |
| Design tokens | Champagne gold + ivory + ink — chuẩn |
| Dark mode | Hoạt động (smooth) |
| Real-time `votedEvent` | Hoạt động |
| 3 chart sync theme | Hoạt động |
| Modal vote + confetti | Hoạt động |
| 4 loại toast | Hoạt động |

### IDs/functions BẮT BUỘC giữ nguyên
- IDs: `btn-connect`, `wallet-dot`, `wallet-address`, `vote-status-badge`, `election-banner`, `banner-text`, `total-votes`, `candidate-count`, `countdown`, `candidates-tbody`, `candidate-count-badge`, `vote-form-section`, `candidate-select`, `btn-vote`, `voted-message`, `tx-list`, `tx-count`, `toast-container`
- Functions: `connectWallet()`, `castVote()`, `refreshHistory()`, `showToast()`, `setBtnLoading()`, `friendlyError()`

### HARD RULES (KHÔNG được làm)
- ❌ KHÔNG push GitHub khi chưa confirm
- ❌ KHÔNG sửa `contracts/Voting.sol`, `test/Voting.test.js`, `hardhat.config.js`
- ❌ KHÔNG đổi React/Vue/Svelte — giữ vanilla JS ES5
- ❌ KHÔNG đổi accent color khỏi `#C9A961`
- ❌ KHÔNG dùng emoji thay icon — dùng Lucide (chỉ `🎉` ngoại lệ trong success toast)
- ❌ KHÔNG glassmorphism toàn bộ — chỉ topbar/modal/toast
- ❌ KHÔNG drop shadow đậm — chỉ subtle layered
- ❌ KHÔNG "Loading..." text trần — dùng skeleton
- ❌ KHÔNG empty state hiển thị "0"/"—" — message thân thiện

---

## 2. Open Questions (BẮT BUỘC trả lời trước khi code Wave 6)

1. **Tên cuộc bầu cử** cho election banner (Phase 0.1, 7.1)?
2. **Footer GitHub repo URL + tên thành viên nhóm** (Phase 7.1)?
3. **Vị trí Activity Ticker** (Phase 7.3) — sticky bottom / sidebar / top banner?
4. **Sepolia deploy** trong polish pass này (+0.5đ) hay polish frontend trước rồi deploy sau?
5. **Pull-to-refresh** mobile (Phase 8.7) — cần hay không?

---

## 3. Phases — Chi tiết 9 phase

### PHASE 0 — First-Time User Experience 🔴 CRITICAL
> Khi chưa connect, app đang trống. 90% user bỏ đi tại đây.

**Files**: `index.html`, `style.css`, `app.js`

| # | Task | Outcome |
|---|---|---|
| 0.1 | Pre-connect hero — CTA cực to "Kết nối ví để bỏ phiếu" + sample preview qua public RPC ("Có 5 ứng viên · X phiếu") + tooltip "Tại sao cần ví?" | First impression mạnh |
| 0.2 | First-connect onboarding — detect `localStorage.hasConnectedBefore` → 3 popover tour: (1) Mỗi ví bầu 1 lần, (2) Phiếu vĩnh viễn, (3) Cần ETH gas, skip-able | Giảm fear factor |
| 0.3 | "What is dApp Voting?" link — icon `help-circle` topbar/footer → modal 3 paragraph giải thích blockchain voting | Educate người mới |
| 0.4 | Network mismatch hero — sai network → hero state warning + button "Chuyển sang Localhost" gọi `wallet_switchEthereumChain` | One-click recovery |
| 0.5 | MetaMask not installed state — `!window.ethereum` → CTA đổi "Cài MetaMask để bắt đầu" → mở `metamask.io/download` | Không dead-end |

**Verification**: Mở app incognito (chưa có wallet/cache) → 3s sau hiểu được app làm gì + biết click ở đâu.

---

### PHASE 1 — CSS Design System Polish (giữ từ plan cũ)

**Files**: `style.css` (chính), `index.html` (1.3, 1.5, 1.6)

| # | Task | Outcome |
|---|---|---|
| 1.1 | Topbar scroll indicator — `.scrolled` state với border-bottom + shadow nhẹ | Hierarchy rõ |
| 1.2 | Hero entrance animation stagger — eyebrow/title/lead/status fade-in delays | Feel polished |
| 1.3 | Stats card glow indicator — card "Đang mở" có gold pulse | Highlight critical state |
| 1.4 | Top candidate highlight — row #1 có gold tint (`background: var(--gold-soft)`) | Visual ranking |
| 1.5 | Admin tab indicator slide — underline trượt mượt giữa các tab | Premium feel |
| 1.6 | Tx history alternating rows — zebra subtle | Dễ scan |
| 1.7 | Empty states visual upgrade — icon + message bố cục center, có `.empty-state` class chuẩn | Không "dead screen" |
| 1.8 | Modal entrance refinement — scale 0.96→1 + opacity 0→1, ease-out 220ms | Mượt |
| 1.9 | Toast progress bar — 4px bar dưới toast countdown duration | Visual timer |
| 1.10 | Dark mode smooth transition — `.theme-transitioning` class với `transition: bg/color 200ms` toàn body | Không flash |
| 1.11 | Focus-visible styles — gold outline 2px offset 2px cho mọi tabbable | A11y + đẹp |
| 1.12 | Responsive 375px verification — không overflow, stats stack đúng | Mobile chuẩn |
| 1.13 | Print styles — `@media print` ẩn topbar/footer, hiện results table A4-friendly | Bonus |

---

### PHASE 2 — HTML Structure Micro-improvements (giữ từ plan cũ)

**Files**: `index.html`

| # | Task | Outcome |
|---|---|---|
| 2.1 | Semantic ARIA — `aria-label`, `aria-live="polite"` cho stats/countdown, `role="status"` cho status-chip | Screen reader |
| 2.2 | Election banner optional — `<div id="election-banner" hidden><span id="banner-text"></span></div>` đầu main | Cho Phase 0.4 reuse |
| 2.3 | Topbar scroll class — JS toggle `.scrolled` (đã có) | Phase 1.1 |
| 2.4 | Footer tech stack update — Hardhat 3, Solidity 0.8.28, Lucide icons, Chart.js 4 | Trust signal |

---

### PHASE 3 — JavaScript UX Micro-improvements (giữ từ plan cũ)

**Files**: `app.js`, `eventHandler.js`

| # | Task | Outcome |
|---|---|---|
| 3.1 | Stats number animation count-up — `animateNumber(id, target, duration)` dùng `requestAnimationFrame` | Feel alive |
| 3.2 | Confetti optimization — clean up `setTimeout` listener, reuse keyframe injection | Hiệu suất |
| 3.3 | Dark mode smooth transition class — toggle `.theme-transitioning` 250ms | Phase 1.10 trigger |
| 3.4 | Select preview enhancement — `onCandidateSelectChange` hiện preview nhỏ "Bạn sẽ bỏ phiếu cho {tên}" trên nút | Confirmation |
| 3.5 | Toast progress bar — width animation 100% → 0% trong duration | Phase 1.9 trigger |
| 3.6 | Admin tabs keyboard nav — Arrow Left/Right + Home/End | A11y |

---

### PHASE 4 — Perceived Performance 🔴 CRITICAL
> Blockchain chậm 5-15s, UI phải CẢM GIÁC nhanh.

**Files**: `style.css`, `app.js`, `eventHandler.js`, `index.html`

| # | Task | Outcome |
|---|---|---|
| 4.1 | Skeleton screens — 5 row table skeleton có shimmer 1.4s, stats blur thay "—", chart skeleton bar pattern | Perceived 5x faster |
| 4.2 | Optimistic UI cho vote — click → +1 ngay, chart update ngay, rollback nếu fail | Feel instant |
| 4.3 | Multi-stage transaction progress modal — 3 step: signed / waiting / confirming, progress 33→66→100%, hiện tx hash từ step 1 | Trust + transparency |
| 4.4 | Number animation count-up — `animateNumber()` cubic-out 600ms cho stats + vote count thay đổi | Visual feedback |
| 4.5 | Preload critical data — hover `#btn-connect` → fetch `getAllCandidates()` qua public RPC vào `window._preloadedData` | No spinner sau connect |

---

### PHASE 5 — Microcopy Polish 🔴 CRITICAL
> Voice & Tone tiếng Việt thân thiện, có tính cách.

**Files**: `eventHandler.js` (5.1, 5.5), `index.html` + `app.js` (5.2-5.6)

#### 5.1 — Extend `friendlyError()` thêm mappings
```
"execution reverted: ban da bo phieu roi" → "Bạn đã bỏ phiếu trong cuộc bầu cử này rồi"
"execution reverted: chua den thoi gian"  → "Bầu cử chưa mở. Hãy quay lại sau"
"execution reverted: da het thoi gian"    → "Bầu cử đã kết thúc"
"execution reverted: ban khong co trong"  → "Ví của bạn không có trong danh sách cử tri"
"execution reverted: id ung vien khong"   → "Ứng viên không hợp lệ"
"user rejected"                            → "Bạn đã hủy giao dịch"
"insufficient funds"                       → "Số dư ETH không đủ trả phí gas (~0.001 ETH)"
"wrong network"/"chain mismatch"           → "Hãy chuyển MetaMask sang mạng Localhost"
"nonce too low"                            → "Giao dịch trùng. Hãy đợi 5s rồi thử lại"
"network error"/"timeout"                  → "Mạng đang chậm. Hãy thử lại"
"missing revert data"                      → "Giao dịch thất bại. Vui lòng kiểm tra lại"
```

#### 5.2 — Empty states với personality
```
"Chưa kết nối"      → "Sẵn sàng tham gia? Hãy kết nối ví để bắt đầu"
"0 giao dịch"       → "Phiếu đầu tiên đang chờ bạn"
"Đã bỏ phiếu"       → "Phiếu của bạn đã ghi vào lịch sử blockchain"
"Không có ứng viên" → "Owner chưa thêm ứng viên nào. Quay lại sau nhé"
"0 phiếu"           → "Chưa có ai bỏ phiếu cho ứng viên này"
```

#### 5.3 — Top candidate label "Đang dẫn đầu" cạnh medal #1

#### 5.4 — Vote modal copy mới
- Title: "Xác nhận lá phiếu"
- Body: "Bạn sắp bỏ phiếu cho **{tên}**. Hành động này được ghi **vĩnh viễn** trên blockchain và **không thể hoàn tác**."
- Button: "Đồng ý & Ký giao dịch"

#### 5.5 — `getLoadingMessage(stage)` — variation theo stage:
- 0: "Đang chờ chữ ký từ MetaMask..."
- 1: "Đã ký. Đang gửi lên blockchain..."
- 2: "Đang chờ network xác nhận..."
- 3: "Sắp xong! Đang đồng bộ kết quả..."

#### 5.6 — Success toast "🎉 Phiếu của bạn đã được ghi" + body có tên candidate. (Emoji 🎉 là ngoại lệ duy nhất.)

---

### PHASE 6 — Error Recovery Flow 🔴 CRITICAL
> Mọi error có lối thoát. KHÔNG bao giờ "dead-end".

**Files**: `eventHandler.js` (6.1), `app.js` (6.2-6.5), `index.html` (6.3, 6.4)

| # | Task | Outcome |
|---|---|---|
| 6.1 | `showToast()` extend nhận `actions` param array `[{label, onclick}]`, toast có actions không tự đóng (`duration=0`) | Action-oriented errors |
| 6.2 | Mọi catch block → toast có nút "Thử lại"; table fail → empty state có nút "Tải lại" | No dead-end |
| 6.3 | MetaMask not installed modal — `!window.ethereum` → modal: icon wallet + Title "Bạn cần MetaMask để bỏ phiếu" + button "Cài MetaMask" + ghost "Tôi đã cài rồi · Refresh" | Onboarding |
| 6.4 | Wrong network 1-click switch — banner đỏ trên cùng + button "Chuyển ngay" gọi `wallet_switchEthereumChain` (params: `0x539` = 1337), fallback `wallet_addEthereumChain` nếu code 4902 | Recovery |
| 6.5 | Connection lost — listen `disconnect` event → banner "Mất kết nối · [Kết nối lại]" | Resilience |

---

### PHASE 7 — Trust Signals 🟡 IMPORTANT
> User cần "tin" trước khi ký giao dịch.

**Files**: `index.html` (7.1, 7.2, 7.3), `app.js` (7.2, 7.4, 7.5), `eventHandler.js` (7.3, 7.5)

| # | Task | Outcome |
|---|---|---|
| 7.1 | Footer trust block — contract address `0x...` + icon copy + link explorer (or "Localhost" tooltip), badge "Smart contract verified", link "Xem source code" GitHub, stats nhanh "5 ứng viên · X phiếu · Block #Y" auto-update | Credibility |
| 7.2 | Vote modal trust signals — gas estimate (`contract.vote.estimateGas(id) * gasPrice`), confirm time ("~12s Localhost"), contract address mini với external-link icon | Informed consent |
| 7.3 | Real-time activity feed — mini ticker "Vừa có phiếu cho **{tên}** · 3s trước", listen `votedEvent`, max 5 items auto-cycle | Live community feel |
| 7.4 | Quorum indicator (whitelist enabled) — đếm `VoterWhitelisted` events vs số đã vote, hiển thị "12/30 cử tri (40%)" + progress bar trong card Results | Democratic transparency |
| 7.5 | Block explorer integration — `getExplorerUrl(network, txHash)` cho mọi tx hash | Verifiability |

---

### PHASE 8 — Mobile Thumb Zone & Performance 🟡 IMPORTANT
> Test thumb-zone, không chỉ "không vỡ layout".

**Files**: `style.css`, `index.html`, `app.js`

| # | Task | Outcome |
|---|---|---|
| 8.1 | Sticky bottom action bar (mobile) — `≤640px` scroll quá hero → button Vote FAB ở bottom, hide khi đã vote/chưa connect | Thumb-friendly |
| 8.2 | Stats grid responsive nâng cao — ≥901px 1×4 / 641-900 2×2 / 376-640 2×2 / ≤375 1×4 stack | Mobile-first |
| 8.3 | Tx history collapse mobile — render 3 items + "Xem thêm 17 giao dịch", tap expand | Less scroll |
| 8.4 | Modal full-screen mobile — `≤640px`: width/height 100%, border-radius 0, slide-up từ bottom | iOS sheet style |
| 8.5 | Touch target ≥44×44px — `.icon-btn { min-width:44px; min-height:44px }` mobile, hit area `::before` mở rộng nếu cần | Apple HIG |
| 8.6 | Performance trên mobile — confetti detect `deviceMemory<4` hoặc `prefers-reduced-motion` skip; mobile 20 pieces (vs 40 desktop); blur 8px (vs 20px) | Battery |
| 8.7 | Pull-to-refresh (optional) — vuốt xuống đầu trang reload candidates | Nice-to-have |

---

## 4. Implementation Order — 7 Wave

| Wave | Phase | Lý do priority | Effort (h) |
|---|---|---|---|
| 1 | **Phase 0** — FTUE | First impression critical | 3-4 |
| 2 | **Phase 5** — Microcopy | Easy win, high impact | 1-2 |
| 3 | **Phase 4** — Perceived Performance | Trải nghiệm "nhanh" | 3-4 |
| 4 | **Phase 6** — Error Recovery | Không user nào bị stuck | 2-3 |
| 5 | **Phase 1+2+3** — Visual polish | Đã có baseline, refine thêm | 3-4 |
| 6 | **Phase 7** — Trust signals | Cần answer 3 open Qs trước | 2-3 |
| 7 | **Phase 8** — Mobile thumb zone | Test trên thiết bị thật | 2-3 |

**Tổng effort**: ~16-23 giờ.

---

## 5. Verification Plan v2

### Automated
- Lighthouse mobile: Performance ≥85, Accessibility ≥90, Best Practices ≥90
- Console: zero error
- HTML validator: zero error

### Manual — UX Flow Tests
- [ ] **3-second test**: Người không biết blockchain mở app → 3s sau hỏi "đây là app gì?" → trả lời được
- [ ] **5-second test**: "Bạn cần làm gì để bầu?" → chỉ ra được nút Connect
- [ ] **Mom test**: Người không tech connect + vote được không cần hướng dẫn?
- [ ] **Rage-click**: Có chỗ nào click 2-3 lần vì không thấy phản hồi?
- [ ] **Time-to-interactive <3s** trên Fast 3G
- [ ] **Cognitive load**: Số element trong fold đầu ≤5

### Manual — Function Tests
- [ ] Pre-connect: hero CTA + sample preview hiện đúng
- [ ] First-connect: 3 onboarding steps hiện, skip được, không hiện lần 2
- [ ] Connect MetaMask: address + network pill + admin badge nếu owner
- [ ] Owner: thấy admin panel 4 tabs đầy đủ
- [ ] Vote flow: select → confirm modal có gas estimate → sign → multi-stage progress → success modal + confetti
- [ ] Real-time: vote từ terminal → bảng + chart auto-update + activity ticker
- [ ] Optimistic UI: click vote → count tăng ngay, rollback nếu fail
- [ ] Error: vote 2 lần → toast tiếng Việt thân thiện + nút Đóng
- [ ] Wrong network: banner + 1-click switch
- [ ] No MetaMask: modal install
- [ ] Dark mode: smooth transition không flash
- [ ] Mobile 375px: thumb zone Vote button, stats 2×2, modal full-screen
- [ ] Keyboard nav: Tab focus ring vàng visible
- [ ] Account change: UI reset, không leak listener

### Quality Micro-checks
- [ ] Mọi nút loading có spinner + text
- [ ] Mọi error toast có ≥1 action button
- [ ] Mọi destructive action có confirm
- [ ] Mọi address dài có truncate + copy
- [ ] Mọi tx hash có link explorer hoặc tooltip
- [ ] Mọi hover state visible
- [ ] Mọi empty state có message thân thiện
- [ ] Skeleton thay spinner cho mọi data fetch
- [ ] Optimistic UI cho vote action

---

## 6. Risk Notes

| Risk | Mitigation |
|---|---|
| CDN load speed (Lucide/Chart.js/ethers) | Đã preconnect Google Fonts; cân nhắc `<link rel="preload">` cho ethers |
| MetaMask cache cũ giữa các session | Hướng dẫn user `Reset account` trong MetaMask khi gặp nonce error |
| Tx hash explorer logic — Localhost không có explorer | `getExplorerUrl()` trả `null` → render tooltip "Local network" |
| Pre-connect public RPC fail (firewall/CORS) | Try-catch silent + skip sample preview, show CTA only |
| Optimistic UI rollback animation timing | Dùng CSS class `.rolling-back` 600ms trước khi update value |
| `wallet_switchEthereumChain` chưa add chain → code 4902 | Fallback `wallet_addEthereumChain` với chain config Localhost |
| Confetti trên low-end mobile lag | `navigator.deviceMemory < 4` hoặc `prefers-reduced-motion` → skip |
| Multi-stage modal khi tx fail giữa chừng | Cleanup state + close modal + show toast |

**Dependencies mới**: KHÔNG có. Tất cả vanilla — không thêm thư viện nào ngoài CDN đã có.

---

## 7. Final Pre-Submit Checklist (30+ items)

### Functional
1. [ ] Pre-connect: hero CTA hiện rõ, sample preview load
2. [ ] First-connect onboarding tour 3 steps (chỉ lần đầu)
3. [ ] No-MetaMask state: modal install hiện
4. [ ] Wrong-network: banner + 1-click switch
5. [ ] Connect → wallet bar + stats + form vote hiện
6. [ ] Owner login → admin panel 4 tabs đầy đủ
7. [ ] Add candidate (admin) → toast success + list refresh
8. [ ] Set timing (admin) → toggle on/off hoạt động
9. [ ] Add whitelist single + batch
10. [ ] Vote: confirm modal có gas estimate
11. [ ] Vote: multi-stage progress modal hiện 3 step
12. [ ] Vote: success modal + confetti + toast
13. [ ] Vote: optimistic UI tăng số ngay, rollback nếu fail
14. [ ] Vote 2 lần → toast tiếng Việt thân thiện
15. [ ] Real-time: vote từ terminal khác → UI tự update
16. [ ] Activity ticker hiển thị mọi vote mới

### UX
17. [ ] 3-second test pass
18. [ ] Stats animate count-up khi load
19. [ ] Skeleton thay spinner mọi data fetch
20. [ ] Top candidate có gold tint + label "Đang dẫn đầu"
21. [ ] Empty states đều có message thân thiện
22. [ ] Mọi error toast có nút "Thử lại"

### Visual
23. [ ] Dark mode smooth transition (không flash)
24. [ ] Topbar scroll indicator hoạt động
25. [ ] Modal entrance scale + fade smooth
26. [ ] Toast có progress bar countdown
27. [ ] Focus ring gold visible mọi tabbable

### Mobile
28. [ ] 375px không overflow
29. [ ] Stats grid 2×2 đúng
30. [ ] Modal full-screen mobile slide-up
31. [ ] Touch target ≥44×44px
32. [ ] FAB Vote button mobile hiện sau scroll qua hero
33. [ ] Tx history collapse "Xem thêm"
34. [ ] Confetti reduced trên low-end / prefers-reduced-motion

### Trust
35. [ ] Footer có contract address + copy + explorer link
36. [ ] Footer có GitHub link + badge verified
37. [ ] Vote modal có gas estimate + confirm time
38. [ ] Quorum indicator (nếu whitelist on)

### A11y
39. [ ] Tab nav xuyên suốt hoạt động
40. [ ] ARIA labels đầy đủ
41. [ ] Lighthouse Accessibility ≥90

---

## 8. Unresolved Questions

Xem mục 2 — 5 open questions cần user trả lời trước Wave 6.
