// ==UserScript==
// @name         Richup Tactical HUD VIP - Monopoly Assistant & Mod Menu
// @namespace    https://github.com/nhoxboo/richup-tactical-hud
// @version      1.2.0
// @description  Trợ lý chiến thuật cho Richup.io: Radar xác suất xúc xắc (11 bước), theo dõi Net Worth & thanh khoản, bộ độc quyền/ROI, Auto Roll/Buy/EndTurn. Đọc state thật qua WebSocket Socket.IO.
// @author       nhoxboo & Beso
// @match        https://richup.io/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/nhoxboo/richup-tactical-hud/main/richup-tactical-hud.user.js
// @downloadURL  https://raw.githubusercontent.com/nhoxboo/richup-tactical-hud/main/richup-tactical-hud.user.js
// @homepageURL  https://github.com/nhoxboo/richup-tactical-hud
// @supportURL   https://github.com/nhoxboo/richup-tactical-hud/issues
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // 0. BOOTSTRAP: chờ document.body sẵn sàng (fix @run-at document-start)
    // Ở document-start, document.body VÀ document.documentElement có thể
    // đều chưa tồn tại -> observe() ném TypeError. Phải chờ cả hai.
    // =========================================================
    function onBodyReady(fn) {
        if (document.body) { fn(); return; }
        const start = () => {
            if (!document.body) return false;
            fn();
            return true;
        };
        if (start()) return;

        const obs = new MutationObserver(() => { if (start()) obs.disconnect(); });
        // documentElement luôn có sớm nhất; nếu chưa có thì chờ readystatechange
        if (document.documentElement) {
            obs.observe(document.documentElement, { childList: true, subtree: true });
        }
        document.addEventListener('readystatechange', () => { if (start()) obs.disconnect(); });
        window.addEventListener('DOMContentLoaded', () => { if (start()) obs.disconnect(); }, { once: true });
        window.addEventListener('load', () => { if (start()) obs.disconnect(); }, { once: true });
    }

    // =========================================================
    // 1. CẤU HÌNH
    // =========================================================
    const DEFAULT_CONFIG = {
        autoRoll: false,
        autoBuy: false,
        autoBuyMinCash: 300,
        autoEndTurn: false,
        autoReRollDoubles: true,
        autoPrisonPay: 'early',   // never | early | late
        autoAuctionSnipe: false,
        auctionMaxPct: 75,
        showRadar: true,
        hudVisible: true,
        hudCollapsed: false,
        hudPos: null,             // null = tự đặt theo viewport
        tab: 'radar'
    };
    const CFG_KEY = 'RICHUP_HUD_CFG_V11';
    let config = Object.assign({}, DEFAULT_CONFIG);
    try {
        const raw = localStorage.getItem(CFG_KEY);
        if (raw) config = Object.assign(config, JSON.parse(raw));
    } catch (e) {}
    function saveCfg() {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(config)); } catch (e) {}
    }

    // =========================================================
    // 2. STATE TỪ GAME
    // =========================================================
    const G = {
        players: [],
        blocks: [],
        myId: null,
        myName: (() => { try { return localStorage.getItem('rhud_name'); } catch (e) { return null; } })(),
        isMyTurn: false,
        auction: null,
        lastAct: 0,
        gameStarted: false,
        roomId: null
    };

    const DICE = [
        { s: 2, p: 1 / 36 }, { s: 3, p: 2 / 36 }, { s: 4, p: 3 / 36 },
        { s: 5, p: 4 / 36 }, { s: 6, p: 5 / 36 }, { s: 7, p: 6 / 36 },
        { s: 8, p: 5 / 36 }, { s: 9, p: 4 / 36 }, { s: 10, p: 3 / 36 },
        { s: 11, p: 2 / 36 }, { s: 12, p: 1 / 36 }
    ];

    // Bản đồ mặc định (fallback khi không đọc được map từ server)
    // Bản đồ THẬT của Richup.io (mapId "classic"), trích từ gói tin
    // "entered-room" của server. Giá & tiền phạt lấy đúng từ server.
    // Lưu ý: script luôn ưu tiên blocks do server gửi; bảng này chỉ là fallback
    // và cung cấp tên/loại để dự báo khi chưa có state.
    // Bản đồ THẬT của Richup.io (mapId "classic"), trích từ gói tin
    // "entered-room" của server. Dùng ĐÚNG shape của server:
    //   city:  rentPrices là OBJECT {"0":2,"1":10,...}
    //   airport: rentPrices là MẢNG [25,50,100,200]
    // Chỉ dùng làm fallback khi chưa có state từ server.
    // Bản đồ THẬT của Richup.io (mapId "classic"), sinh tự động từ gói tin
    // "entered-room" của server — KHÔNG gõ tay, nên không sai số.
    // Dùng ĐÚNG shape của server:
    //   city:    rentPrices là OBJECT {"0":2,"1":10,...}
    //   airport: rentPrices là MẢNG [25,50,100,200]
    // Chỉ là fallback; script luôn ưu tiên blocks do server gửi.
    const MAP_FALLBACK = [
        { name: "Start", type: "corner", cornerType: "go" },
        { name: "Salvador", type: "city", countryId: "brazil", price: 60, rentPrices: { 0: 2, 1: 10, 2: 30, 3: 90, 4: 150, 5: 240 }, housePrice: 50, hotelPrice: 50 },
        { name: "Treasure", type: "bonus", bonusType: "treasure" },
        { name: "Rio", type: "city", countryId: "brazil", price: 60, rentPrices: { 0: 4, 1: 20, 2: 60, 3: 190, 4: 330, 5: 460 }, housePrice: 50, hotelPrice: 50 },
        { name: "Earnings Tax", type: "bonus", bonusType: "tax", taxPercentage: 10 },
        { name: "TLV Airport", type: "airport", price: 200, rentPrices: [25, 50, 100, 200] },
        { name: "Tel Aviv", type: "city", countryId: "israel", price: 100, rentPrices: { 0: 6, 1: 30, 2: 90, 3: 260, 4: 380, 5: 540 }, housePrice: 50, hotelPrice: 50 },
        { name: "Haifa", type: "city", countryId: "israel", price: 110, rentPrices: { 0: 6, 1: 30, 2: 90, 3: 280, 4: 400, 5: 560 }, housePrice: 50, hotelPrice: 50 },
        { name: "Surprise", type: "bonus", bonusType: "surprise" },
        { name: "Jerusalem", type: "city", countryId: "israel", price: 120, rentPrices: { 0: 8, 1: 40, 2: 110, 3: 300, 4: 460, 5: 610 }, housePrice: 50, hotelPrice: 50 },
        { name: "Prison", type: "corner", cornerType: "prison" },
        { name: "Venice", type: "city", countryId: "italy", price: 130, rentPrices: { 0: 10, 1: 50, 2: 140, 3: 440, 4: 600, 5: 740 }, housePrice: 100, hotelPrice: 100 },
        { name: "Power Company", type: "company", companyType: "electricity", price: 150 },
        { name: "Milan", type: "city", countryId: "italy", price: 140, rentPrices: { 0: 10, 1: 50, 2: 160, 3: 460, 4: 630, 5: 760 }, housePrice: 100, hotelPrice: 100 },
        { name: "Rome", type: "city", countryId: "italy", price: 160, rentPrices: { 0: 12, 1: 60, 2: 180, 3: 500, 4: 700, 5: 900 }, housePrice: 100, hotelPrice: 100 },
        { name: "MUC Airport", type: "airport", price: 200, rentPrices: [25, 50, 100, 200] },
        { name: "Frankfurt", type: "city", countryId: "germany", price: 180, rentPrices: { 0: 14, 1: 70, 2: 190, 3: 540, 4: 760, 5: 950 }, housePrice: 100, hotelPrice: 100 },
        { name: "Treasure", type: "bonus", bonusType: "treasure" },
        { name: "Munich", type: "city", countryId: "germany", price: 190, rentPrices: { 0: 15, 1: 70, 2: 210, 3: 560, 4: 760, 5: 960 }, housePrice: 100, hotelPrice: 100 },
        { name: "Berlin", type: "city", countryId: "germany", price: 200, rentPrices: { 0: 15, 1: 80, 2: 220, 3: 600, 4: 780, 5: 1000 }, housePrice: 100, hotelPrice: 100 },
        { name: "Vacation", type: "corner", cornerType: "vacation" },
        { name: "Shenzhen", type: "city", countryId: "china", price: 210, rentPrices: { 0: 18, 1: 90, 2: 240, 3: 680, 4: 850, 5: 1000 }, housePrice: 150, hotelPrice: 150 },
        { name: "Surprise", type: "bonus", bonusType: "surprise" },
        { name: "Beijing", type: "city", countryId: "china", price: 220, rentPrices: { 0: 20, 1: 90, 2: 260, 3: 710, 4: 900, 5: 1100 }, housePrice: 150, hotelPrice: 150 },
        { name: "Shanghai", type: "city", countryId: "china", price: 240, rentPrices: { 0: 20, 1: 100, 2: 290, 3: 740, 4: 920, 5: 1100 }, housePrice: 150, hotelPrice: 150 },
        { name: "CDG Airport", type: "airport", price: 200, rentPrices: [25, 50, 100, 200] },
        { name: "Lyon", type: "city", countryId: "france", price: 260, rentPrices: { 0: 20, 1: 100, 2: 320, 3: 800, 4: 950, 5: 1100 }, housePrice: 150, hotelPrice: 150 },
        { name: "Water Company", type: "company", companyType: "water", price: 150 },
        { name: "Toulouse", type: "city", countryId: "france", price: 270, rentPrices: { 0: 20, 1: 120, 2: 350, 3: 825, 4: 1000, 5: 1150 }, housePrice: 150, hotelPrice: 150 },
        { name: "Paris", type: "city", countryId: "france", price: 280, rentPrices: { 0: 25, 1: 120, 2: 350, 3: 850, 4: 1000, 5: 1200 }, housePrice: 150, hotelPrice: 150 },
        { name: "Go to prison", type: "corner", cornerType: "go-to-prison" },
        { name: "Liverpool", type: "city", countryId: "united-kingdom", price: 290, rentPrices: { 0: 25, 1: 120, 2: 380, 3: 850, 4: 1050, 5: 1250 }, housePrice: 200, hotelPrice: 200 },
        { name: "Manchester", type: "city", countryId: "united-kingdom", price: 300, rentPrices: { 0: 26, 1: 140, 2: 400, 3: 950, 4: 1150, 5: 1300 }, housePrice: 200, hotelPrice: 200 },
        { name: "Treasure", type: "bonus", bonusType: "treasure" },
        { name: "London", type: "city", countryId: "united-kingdom", price: 320, rentPrices: { 0: 30, 1: 140, 2: 440, 3: 1000, 4: 1200, 5: 1400 }, housePrice: 200, hotelPrice: 200 },
        { name: "JFK Airport", type: "airport", price: 200, rentPrices: [25, 50, 100, 200] },
        { name: "Surprise", type: "bonus", bonusType: "surprise" },
        { name: "San Francisco", type: "city", countryId: "united-states-of-america", price: 360, rentPrices: { 0: 35, 1: 180, 2: 550, 3: 1150, 4: 1350, 5: 1525 }, housePrice: 200, hotelPrice: 200 },
        { name: "Premium Tax", type: "bonus", bonusType: "premium-tax", taxAmount: 75 },
        { name: "New York", type: "city", countryId: "united-states-of-america", price: 400, rentPrices: { 0: 50, 1: 200, 2: 600, 3: 1400, 4: 1700, 5: 2000 }, housePrice: 200, hotelPrice: 200 }
    ];

    // Tên nhóm quốc gia + màu hiển thị.
    // countryId đúng như server trả về (đã soi từ gói tin entered-room).
    const GROUP_INFO = {
        'brazil':                     { name: 'Brazil (nâu)',           color: '#8B5A2B' },
        'israel':                     { name: 'Israel (xanh nhạt)',      color: '#38BDF8' },
        'italy':                      { name: 'Italy (hồng)',            color: '#EC4899' },
        'germany':                    { name: 'Germany (cam)',           color: '#F97316' },
        'china':                      { name: 'China (đỏ)',              color: '#EF4444' },
        'france':                     { name: 'France (vàng)',           color: '#EAB308' },
        'united-kingdom':             { name: 'United Kingdom (xanh lá)', color: '#22C55E' },
        'united-states-of-america':   { name: 'USA (xanh đậm)',          color: '#1E40AF' }
    };

    // Một số bản đồ / build cũ dùng id rút gọn -> chuẩn hóa về id chuẩn.
    const GROUP_ALIAS = {
        uk: 'united-kingdom',
        gb: 'united-kingdom',
        usa: 'united-states-of-america',
        us: 'united-states-of-america',
        'united-states': 'united-states-of-america',
        'united_states_of_america': 'united-states-of-america',
        'united_kingdom': 'united-kingdom'
    };

    function groupIdOf(block, idx) {
        const raw = (block && block.countryId) || MAP_FALLBACK[idx]?.countryId;
        if (!raw) return null;
        return GROUP_ALIAS[raw] || raw;
    }

    function groupInfoOf(gid) {
        return GROUP_INFO[gid] || { name: gid, color: '#94A3B8' };
    }

    // =========================================================
    // 3. WEB SOCKET SNIFFER (chạy Main World vì @grant none)
    // =========================================================
    (function sniffWS() {
        if (window.__RICHUP_HUD_WS_HOOKED__) return;
        window.__RICHUP_HUD_WS_HOOKED__ = true;
        const NativeWS = window.WebSocket;
        window.WebSocket = function (url, protocols) {
            const ws = protocols !== undefined ? new NativeWS(url, protocols) : new NativeWS(url);
            ws.addEventListener('message', (ev) => {
                try { parseWs(ev.data); } catch (e) {}
            });
            return ws;
        };
        window.WebSocket.prototype = NativeWS.prototype;
        Object.assign(window.WebSocket, NativeWS);
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => {
            try { window.WebSocket[k] = i + 1; } catch (e) {}
        });
    })();

    // Gói tin thật của Richup.io (Engine.IO v4 / Socket.IO v5):
    //   42/api/game,["entered-room",{room:{...}}]   <- EVENT (thứ ta cần)
    //   43/api/game,1[{"ok":true}]                  <- ACK (bỏ)
    //   40/api/game,{"sid":"..."}                   <- CONNECT (bỏ)
    //   0{...} / 2 / 3                               <- engine open/ping/pong (bỏ)
    // Chỉ nhận đúng Engine.IO type 4 + Socket.IO type 2.
    function parseWs(raw) {
        if (typeof raw !== 'string' || raw.length < 2) return;
        if (raw.charCodeAt(0) !== 52 /* '4' = Engine.IO MESSAGE */) return;
        if (raw.charCodeAt(1) !== 50 /* '2' = Socket.IO EVENT     */) return;

        const i = raw.indexOf('[');
        if (i === -1) return;
        try {
            const arr = JSON.parse(raw.slice(i));
            if (!Array.isArray(arr) || arr.length < 2) return;
            const evt = arr[0];
            const data = arr[1];
            if (typeof evt !== 'string') return;
            absorb(evt, data);
        } catch (e) {}
    }

    // Sự kiện server -> client có chứa state: các event này luôn mang theo
    // object "room" (đúng như đã soi thấy trong bundle + traffic thật).
    const STATE_EVENTS = new Set([
        'entered-room', 'joined-game', 'player-joined', 'player-left',
        'game-room-updated', 'dice-rolled', 'turn-ended', 'game-started',
        'property-purchased', 'property-mortgaged', 'property-mortgage-lifted',
        'auction-started', 'auction-updated', 'auction-ended', 'player-bankrupted',
        'build-updated', 'trade-updated', 'sync-game-state', 'played-turn',
        'pay-out-of-prison', 'paid-out-of-prison', 'used-pardon-card', 'dice-rolled-dummy'
    ]);

    function absorb(evt, data) {
        if (!data) { schedule(); return; }
        const room = data.room || data.gameState || data;
        if (room && (Array.isArray(room.blocks) || Array.isArray(room.participants))) {
            G.room = room;
            applyRoom(room);
        }
        if (evt === 'dice-rolled' || evt === 'game-started' || evt === 'played-turn') G.gameStarted = true;
        schedule();
    }

    function applyRoom(room) {
        if (Array.isArray(room.blocks)) G.blocks = room.blocks;
        if (Array.isArray(room.participants)) {
            G.players = room.participants.map(p => ({
                id: p.id,
                name: p.name || p.nickname || 'Player',
                money: p.money || 0,
                position: typeof p.position === 'number' ? p.position : (p.blockIndex || 0),
                bot: !!p.bot,
                host: !!p.hostId || p.id === room.hostId
            }));
        }
        // currentPlayerIndex -> id của người đang đi
        if (typeof room.currentPlayerIndex === 'number' && G.players[room.currentPlayerIndex]) {
            G.turnPlayerId = G.players[room.currentPlayerIndex].id;
        }
        // --- Nhận diện người chơi của mình ---
        // Không được cache cứng id qua các ván: id đổi mỗi ván, và người chơi
        // có thể không phải người đầu tiên. Thứ tự ưu tiên:
        //   1) id đã biết và vẫn còn trong phòng
        //   2) khớp tên người chơi đã nhập ở màn hình lobby (lưu lúc tạo/join)
        //   3) người đầu tiên không phải bot
        //   4) người đầu tiên
        if (G.myId && !room.participants.some(p => p.id === G.myId)) G.myId = null;
        if (!G.myId) {
            const byName = G.myName
                ? room.participants.find(p => (p.name || p.nickname) === G.myName)
                : null;
            const me = byName
                || room.participants.find(p => !p.bot)
                || room.participants[0];
            if (me) G.myId = me.id;
        }
        if (G.myId && G.turnPlayerId) G.isMyTurn = (G.turnPlayerId === G.myId);
        if (room.auction) G.auction = room.auction;
        if (room.dice) G.dice = room.dice;
        if (room.canPerformTurnActions !== undefined) G.canAct = room.canPerformTurnActions;
        if (room.doublesInARow !== undefined) G.doubles = room.doublesInARow;
        if (room.phase) G.phase = room.phase;
    }

    // =========================================================
    // 4. SPA ROUTING HOOK (TanStack Router dùng pushState)
    // =========================================================
    (function hookSPA() {
        ['pushState', 'replaceState'].forEach((m) => {
            const orig = history[m];
            history[m] = function () {
                const r = orig.apply(this, arguments);
                window.dispatchEvent(new Event('rhud:loc'));
                return r;
            };
        });
        window.addEventListener('popstate', () => window.dispatchEvent(new Event('rhud:loc')));
    })();

    // =========================================================
    // 4b. GHI NHỚ TÊN NGƯỜI CHƠI (để biết ai là "mình")
    // =========================================================
    (function rememberName() {
        const save = () => {
            // Ô nhập tên ở màn hình lobby: thường là input đầu tiên hiển thị được
            const inp = Array.from(document.querySelectorAll('input'))
                .find(i => i.type === 'text' && i.offsetParent !== null && /name|nick|user/i.test(
                    (i.getAttribute('placeholder') || '') + ' ' + (i.getAttribute('aria-label') || '') + ' ' + (i.name || '')));
            const v = inp && inp.value && inp.value.trim();
            if (v && v !== localStorage.getItem('rhud_name')) {
                try { localStorage.setItem('rhud_name', v); G.myName = v; } catch (e) {}
            }
        };
        window.addEventListener('rhud:loc', save);
        window.addEventListener('rhud:tick', save);
        // Ghi ngay khi blur (người dùng vừa nhập xong tên)
        document.addEventListener('change', (e) => {
            if (e.target && e.target.tagName === 'INPUT') save();
        }, true);
        save();
    })();

    // =========================================================
    // 5. DOM SCRAPER + NÚT ĐIỀU KHIỂN
    // =========================================================
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Chỉ loại bỏ nút thực sự không dùng được.
    // KHÔNG dùng offsetParent: node bên trong container có transform/filter sẽ
    // có offsetParent === null dù vẫn hiển thị -> auto-roll chết âm thầm.
    function isUsable(b) {
        if (!b || b.disabled) return false;
        if (b.getAttribute('aria-hidden') === 'true') return false;
        if (b.hasAttribute('hidden') || b.closest('[hidden]')) return false;
        const st = window.getComputedStyle(b);
        if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
        return true;
    }

    function allButtons() {
        return Array.from(document.querySelectorAll('button')).filter(isUsable);
    }

    function findByText(re) {
        return allButtons().find(b => re.test(label(b))) || null;
    }

    // Nút Richup là <button> nhưng nội dung là JSX icon + text;
    // innerText trong jsdom rỗng nên fallback sang textContent.
    function label(b) {
        const t = (b.innerText || b.textContent || '');
        return norm(t);
    }

    function btnRoll() {
        return findByText(/^(roll the dice|roll again|roll dices?)$/) ||
               findByText(/roll (the )?dice/) || findByText(/roll again/);
    }
    function btnBuy() {
        return findByText(/^buy for \$\s?[\d,]+/) || findByText(/^buy\b/);
    }
    function btnEndTurn() {
        return findByText(/^end turn$/) || findByText(/end turn/);
    }
    function btnAuction() {
        return findByText(/^auction$/);
    }
    function btnPayPrison() {
        return findByText(/pay (out )?\$?50/) || findByText(/pay .*prison/) || findByText(/^pay\b/);
    }

    // React 18 synthetic event chain
    function fire(el) {
        if (!el || el.disabled) return false;
        try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
        try { el.focus({ preventScroll: true }); } catch (e) {}
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => {
            try {
                el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, buttons: t === 'click' ? 0 : 1 }));
            } catch (e) {}
        });
        return true;
    }

    // =========================================================
    // 6. AUTO ENGINE
    // =========================================================
    function me() {
        return G.players.find(x => x.id === G.myId) || G.players[0] || null;
    }

    function myMoney() {
        const p = me();
        if (p && typeof p.money === 'number') return p.money;
        const s = G.room && G.room.settings;
        if (s && typeof s.startingCash === 'number') return s.startingCash;
        return 1500;
    }

    function myPos() {
        const p = me();
        if (p && typeof p.position === 'number') return p.position;
        return 0;
    }

    function autoTick() {
        const now = Date.now();
        if (now - G.lastAct < 700) return;

        // 1) Auto Buy
        if (config.autoBuy) {
            const b = btnBuy();
            if (b) {
                const m = label(b).match(/\$\s?([\d,]+)/);
                const price = m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
                if (myMoney() - price >= config.autoBuyMinCash) {
                    if (fire(b)) { G.lastAct = now; setTimeout(autoTick, 600); return; }
                }
            }
        }

        // 2) Auto Roll
        if (config.autoRoll) {
            const r = btnRoll();
            if (r) {
                if (fire(r)) { G.lastAct = now; setTimeout(autoTick, 600 + Math.random() * 350); return; }
            }
        }

        // 3) Auto End Turn
        if (config.autoEndTurn) {
            const e = btnEndTurn();
            if (e && !btnRoll() && !btnBuy()) {
                if (fire(e)) { G.lastAct = now; setTimeout(autoTick, 600); return; }
            }
        }

        // 4) Prison strategy
        if (config.autoPrisonPay !== 'never') {
            const p = btnPayPrison();
            if (p) {
                const pos = myPos();
                const early = pos < 20;
                const want = (config.autoPrisonPay === 'always') ||
                             (config.autoPrisonPay === 'early' && early) ||
                             (config.autoPrisonPay === 'late' && pos >= 20);
                if (want && fire(p)) { G.lastAct = now; setTimeout(autoTick, 800); }
            }
        }
    }

    // =========================================================
    // 7. RADAR ENGINE
    // =========================================================
    // Đọc giá/rent/tên từ blocks của server nếu có, fallback sang MAP_FALLBACK.
    function tileAt(i) {
        const b = G.blocks[i];
        if (b) return b;
        return MAP_FALLBACK[i] || { name: '?', type: 'unknown' };
    }

    // Tiền phạt — bám sát cách server tính:
    //  - city:    rentPrices là OBJECT, tra theo level (0..5, 5 = khách sạn)
    //  - airport: rentPrices là MẢNG, tra theo SỐ SÂN BAY MÀ CHỦ SỞ HỮU ĐANG GIỮ
    //             (server dùng chính field `level` cho số lượng: 0,1,2,3,4 sân bay)
    //  - company: không có rentPrices -> 4x giá mỗi sân bay (2 công ty),
    //             10x nếu sở hữu CẢ HAI loại (đủ bộ điện+nước)
    //  - bonus:   tax = % tiền mặt, premium-tax = số tiền cố định
    function rentOf(b, myCash, allBlocks) {
        if (!b) return 0;
        if (b.isMortgaged) return 0;
        const lvl = b.level || 0;

        // Ô thuế luôn phải trả, không cần owner
        if (b.type === 'bonus') {
            if (b.bonusType === 'premium-tax') return b.taxAmount || 75;
            if (b.bonusType === 'tax') return Math.round((myCash || 1500) * ((b.taxPercentage || 10) / 100));
            return 0;
        }
        // Ô đất/phi cơ → chỉ phải khi CÓ chủ sở hữu khác mình
        if (!b.ownerId) return 0;

        if (b.type === 'city') {
            const rp = b.rentPrices;
            if (!rp) return 0;
            if (Array.isArray(rp)) return rp[Math.min(lvl, rp.length - 1)];
            const k = String(Math.min(lvl, 5));
            return rp[k] !== undefined ? rp[k] : 0;
        }
        if (b.type === 'airport') {
            const rp = b.rentPrices;
            if (Array.isArray(rp)) return rp[Math.min(lvl, rp.length - 1)] || 0;
            if (rp) { const k = String(Math.min(lvl, 5)); return rp[k] || 0; }
            return 0;
        }
        if (b.type === 'company') {
            const price = b.price || 150;
            // đủ bộ điện + nước -> 10x, mới 1 loại -> 4x
            let owned = 0;
            if (Array.isArray(allBlocks)) {
                owned = allBlocks.filter(x => x && x.ownerId === b.ownerId && x.type === 'company' && !x.isMortgaged).length;
            }
            return price * (owned >= 2 ? 10 : 4);
        }
        return 0;
    }

    function isOwnable(b) {
        return b && (b.type === 'city' || b.type === 'airport' || b.type === 'company');
    }

    function radar() {
        const pos = myPos();
        let dangerP = 0, loss = 0, buyP = 0;
        const cash = myMoney();
        const rows = DICE.map(d => {
            const idx = (pos + d.s) % 40;
            const t = tileAt(idx);
            let status = 'neutral', label = 'Trung lập', amt = 0;

            if (isOwnable(t)) {
                if (t.ownerId) {
                    if (t.ownerId === G.myId) { status = 'safe'; label = 'Đất của bạn'; }
                    else {
                        status = 'danger';
                        label = t.type === 'company' ? 'Công ty đối thủ' : 'Đất đối thủ';
                        amt = rentOf(t, cash, G.blocks);
                        dangerP += d.p; loss += d.p * amt;
                    }
                } else {
                    status = 'buy';
                    label = 'Đất trống';
                    amt = t.price || 0;
                    buyP += d.p;
                }
            } else if (t.type === 'bonus' && (t.bonusType === 'tax' || t.bonusType === 'premium-tax')) {
                status = 'danger'; label = 'Thuế';
                amt = t.bonusType === 'premium-tax' ? (t.taxAmount || 75) : Math.round(cash * ((t.taxPercentage || 10) / 100));
                dangerP += d.p; loss += d.p * amt;
            } else if (t.cornerType === 'go-to-prison') {
                status = 'danger'; label = 'Vào tù'; dangerP += d.p;
            } else if (t.type === 'corner' && t.cornerType === 'go') {
                status = 'safe'; label = '+$' + ((G.room && G.room.boardConfig && G.room.boardConfig.goReward && G.room.boardConfig.goReward.pass) || 200);
                amt = 0;
            } else if (t.type === 'corner') {
                status = 'safe'; label = t.cornerType === 'vacation' ? 'Nghỉ dưỡng' : 'Tù (an toàn)';
            } else if (t.type === 'bonus') {
                status = 'chance'; label = t.bonusType === 'treasure' ? 'Treasure' : 'Surprise';
            }

            return {
                d: d.s, p: d.p, idx,
                name: t.name || t.n || '?',
                status, label, amt
            };
        });
        return { pos, dangerP: Math.round(dangerP * 100), loss: Math.round(loss), buyP: Math.round(buyP * 100), rows };
    }

    function netWorths() {
        const list = G.players.length ? G.players : [{ id: 'me', name: 'Bạn', money: myMoney(), position: myPos() }];
        return list.map(p => {
            let pv = 0, cnt = 0;
            G.blocks.forEach((b, i) => {
                if (b && b.ownerId === p.id) {
                    cnt++;
                    pv += b.price || MAP_FALLBACK[i]?.price || 0;
                    if (b.level) pv += b.level * (b.housePrice || 50);
                }
            });
            const cash = p.money || 0;
            const total = cash + pv;
            const liq = total ? Math.round(cash / total * 100) : 100;
            return {
                name: p.name, cash, pv, cnt, total, liq,
                bot: p.bot,
                isMe: p.id === G.myId
            };
        }).sort((a, b) => b.total - a.total);
    }

    // Nhóm độc quyền: đếm ô theo countryId của server, gom chủ sở hữu.
    function sets() {
        // 1) tổng số ô mỗi nhóm (đếm trên toàn bộ 40 ô)
        const counts = {};
        G.blocks.forEach((b, i) => {
            const g = groupIdOf(b, i);
            if (g) counts[g] = (counts[g] || 0) + 1;
        });
        // 2) ai giữ bao nhiêu ô trong mỗi nhóm
        const out = {};
        G.blocks.forEach((b, i) => {
            const g = groupIdOf(b, i);
            if (!g) return;
            if (!out[g]) {
                const info = groupInfoOf(g);
                out[g] = { g, name: info.name, color: info.color, total: counts[g] || 0, owners: {} };
            }
            if (b && b.ownerId) {
                const key = (b.ownerId === G.myId) ? 'me' : b.ownerId;
                out[g].owners[key] = (out[g].owners[key] || 0) + 1;
            }
        });
        return Object.values(out).sort((a, b) => b.total - a.total);
    }

    // =========================================================
    // 8. HUD RENDER
    // =========================================================
    let root = null;

    const CSS = `#rhud{position:fixed;z-index:2147483000;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial;color:#1E293B}
#rhud .p{width:340px;background:#fff;border-radius:14px;box-shadow:0 10px 30px -8px rgba(2,132,199,.25),0 0 0 1px #E2E8F0;overflow:hidden;border-top:4px solid #0284C7}
#rhud .h{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;cursor:grab}
#rhud .h b{color:#0F172A;font-size:13px}
#rhud .badge{background:#0284C7;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:5px;letter-spacing:.5px}
#rhud .ib{background:#fff;border:1px solid #CBD5E1;border-radius:6px;width:24px;height:24px;cursor:pointer;color:#64748B;font-size:12px;margin-left:4px}
#rhud .ib:hover{background:#E2E8F0}
#rhud .tabs{display:flex;gap:3px;padding:4px;background:#F1F5F9;border-bottom:1px solid #E2E8F0}
#rhud .tb{flex:1;padding:6px 2px;font-size:11px;font-weight:600;border:0;border-radius:6px;background:transparent;color:#64748B;cursor:pointer}
#rhud .tb.on{background:#fff;color:#0284C7;box-shadow:0 1px 3px rgba(0,0,0,.08)}
#rhud .bd{padding:11px;max-height:440px;overflow-y:auto}
#rhud .card{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:9px;margin-bottom:8px}
#rhud .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
#rhud .lb{color:#64748B;font-size:11px}
#rhud .vl{font-weight:700;color:#0F172A;font-size:12.5px}
#rhud .rad{display:flex;justify-content:space-between;align-items:center;padding:5px 7px;border-radius:6px;margin-bottom:3px;font-size:11px;background:#F8FAFC;border-left:3px solid #CBD5E1}
#rhud .rad.danger{border-left-color:#EF4444;background:#FEF2F2}
#rhud .rad.buy{border-left-color:#10B981;background:#F0FDF4}
#rhud .rad.safe{border-left-color:#38BDF8;background:#F0F9FF}
#rhud .rad.chance{border-left-color:#F59E0B;background:#FEFCE8}
#rhud .sw{position:relative;display:inline-block;width:36px;height:20px;flex:none}
#rhud .sw input{opacity:0;width:0;height:0}
#rhud .sl{position:absolute;inset:0;background:#CBD5E1;border-radius:20px;cursor:pointer;transition:.2s}
#rhud .sl:before{content:"";position:absolute;height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}
#rhud input:checked+.sl{background:#0284C7}
#rhud input:checked+.sl:before{transform:translateX(16px)}
#rhud .tog{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F1F5F9}
#rhud .pill{background:#0284C7;color:#fff;font-weight:700;font-size:11px;padding:7px 13px;border-radius:30px;cursor:pointer;display:inline-flex;gap:6px;align-items:center;box-shadow:0 4px 12px rgba(2,132,199,.35)}
#rhud .muted{color:#94A3B8;font-size:11px}
#rhud .ok{color:#10B981;font-weight:700}
#rhud .warn{color:#F59E0B;font-weight:700}
#rhud .bad{color:#DC2626;font-weight:800}`;

    function ensureRoot() {
        if (root && document.body.contains(root)) return root;
        root = document.createElement('div');
        root.id = 'rhud';
        document.body.appendChild(root);
        const st = document.createElement('style');
        st.textContent = CSS;
        document.head.appendChild(st);
        return root;
    }

    function pos() {
        const w = 340;
        const x = config.hudPos ? config.hudPos.x : Math.max(10, window.innerWidth - w - 16);
        const y = config.hudPos ? config.hudPos.y : 64;
        return { x, y };
    }

    function render() {
        if (!document.body) return;
        ensureRoot();
        if (!config.hudVisible) { root.style.display = 'none'; return; }
        root.style.display = 'block';
        const p = pos();
        root.style.left = p.x + 'px';
        root.style.top = p.y + 'px';

        if (config.hudCollapsed) {
            root.innerHTML = '<div class="pill" data-act="expand">🎲 Richup HUD <span style="opacity:.75;font-size:10px">F2</span></div>';
            bind();
            return;
        }

        const inRoom = /\/room\//.test(location.pathname);
        let body;
        if (!inRoom) body = lobbyView();
        else if (config.tab === 'radar') body = radarView();
        else if (config.tab === 'players') body = playersView();
        else if (config.tab === 'sets') body = setsView();
        else body = autoView();

        root.innerHTML = '<div class="p">' +
            '<div class="h" data-drag="1"><span class="badge">VIP</span><b>Richup Tactical HUD</b>' +
            '<span><button class="ib" data-act="collapse">−</button><button class="ib" data-act="hide">✕</button></span></div>' +
            (inRoom ? '<div class="tabs">' +
                ['radar|🎯 Radar', 'players|💰 Tài sản', 'sets|🏰 Độc quyền', 'auto|⚡ Auto'].map(t => {
                    const [k, lbl] = t.split('|');
                    return '<button class="tb ' + (config.tab === k ? 'on' : '') + '" data-tab="' + k + '">' + lbl + '</button>';
                }).join('') + '</div>' : '') +
            '<div class="bd">' + body + '</div></div>';
        bind();
    }

    function lobbyView() {
        return '<div class="card"><div class="row"><span class="lb">Trạng thái</span><span class="vl ok">Sẵn sàng</span></div>' +
            '<div class="row"><span class="lb">Phòng</span><span class="vl">' + (G.roomId || 'Chưa vào phòng') + '</span></div></div>' +
            '<div class="card"><div class="lb" style="margin-bottom:6px">Cấu hình Auto (áp dụng khi vào ván)</div>' +
            toggleHtml('autoRoll', 'Auto Roll Dice', 'Tự đổ xúc xắc khi tới lượt') +
            toggleHtml('autoBuy', 'Auto Buy Property', 'Tự mua đất trống (giữ dự phòng)') +
            toggleHtml('autoEndTurn', 'Auto End Turn', 'Tự kết thúc lượt') + '</div>' +
            '<div class="muted">Vào phòng <code>/room/...</code> để xem Radar & Tài sản. Phím <b>F2</b>/<b>H</b> để ẩn/hiện, <b>R</b> để roll, <b>E</b> để end turn.</div>';
    }

    function radarView() {
        const r = radar();
        // Ngưỡng cảnh báo: <5% là an toàn, 5-20% cẩn thận, >20% nguy hiểm.
        const cls = r.dangerP > 20 ? 'bad' : (r.dangerP >= 5 ? 'warn' : 'ok');
        let h = '<div class="card">' +
            '<div class="row"><span class="lb">Vị trí</span><span class="vl">Ô ' + r.pos + ' · ' + (tileAt(r.pos).name || '') + '</span></div>' +
            '<div class="row"><span class="lb">Rủi ro mất tiền</span><span class="vl ' + cls + '">' + r.dangerP + '%</span></div>' +
            '<div class="row"><span class="lb">Phạt kỳ vọng</span><span class="vl ' + (r.loss > 0 ? cls : 'ok') + '">-$' + r.loss + '</span></div>' +
            '<div class="row"><span class="lb">Cơ hội mua đất</span><span class="vl ok">' + r.buyP + '%</span></div></div>';
        h += '<div class="lb" style="margin:4px 0 6px;text-transform:uppercase">Dự báo 11 bước</div>';
        r.rows.forEach(x => {
            h += '<div class="rad ' + x.status + '"><span><b style="color:#0284C7">+' + x.d + '</b> ' +
                x.name + ' <span class="muted">(' + Math.round(x.p * 1000) / 10 + '%)</span></span>' +
                '<span>' + (x.amt > 0 && x.status !== 'buy'
                    ? '<b style="color:#EF4444">$' + x.amt + '</b>'
                    : (x.amt > 0 ? '<b style="color:#10B981">$' + x.amt + '</b>' : '<span class="muted">' + x.label + '</span>')) +
                '</span></div>';
        });
        return h;
    }

    function playersView() {
        let h = '<div class="lb" style="margin-bottom:6px;text-transform:uppercase">Xếp hạng tài sản</div>';
        const list = netWorths();
        if (list.length <= 1 && !G.blocks.length) {
            h += '<div class="card"><div class="muted">Chưa đọc được dữ liệu người chơi từ server. Hãy vào ván và đợi vài giây.</div></div>';
        }
        list.forEach((p, i) => {
            h += '<div class="card" style="' + (p.isMe ? 'border:1.5px solid #0284C7;background:#F0F9FF' : '') + '">' +
                '<div class="row"><span class="vl">#' + (i + 1) + ' ' + (p.name || '?') + (p.bot ? ' 🤖' : '') + (p.isMe ? ' <span class="muted">(bạn)</span>' : '') + '</span>' +
                '<span style="font-size:11px;font-weight:700;color:' + (p.cash < 150 ? '#EF4444' : p.cash < 400 ? '#F59E0B' : '#10B981') + '">' + p.cash + '</span></div>' +
                '<div class="row"><span class="lb">BĐS (' + p.cnt + ' ô)</span><span class="vl">$' + p.pv + '</span></div>' +
                '<div class="row"><span class="lb">Net Worth</span><span class="vl" style="color:#0284C7">$' + p.total + '</span></div>' +
                '<div class="row"><span class="lb">Thanh khoản</span><span class="lb">' + p.liq + '%</span></div></div>';
        });
        return h;
    }

    function setsView() {
        const list = sets();
        if (!list.length) {
            return '<div class="card"><div class="muted">Chưa đọc được dữ liệu bàn chơi. Vào ván và đợi vài giây.</div></div>';
        }
        let h = '<div class="card"><div class="lb" style="margin-bottom:4px">💡 Mốc 3 nhà là điểm ROI cao nhất: tiền phạt tăng vọt so với chi phí xây.</div></div>';
        list.sort((a, b) => b.total - a.total).forEach(s => {
            const entries = Object.entries(s.owners);
            h += '<div class="card" style="border-left:4px solid ' + s.color + '">' +
                '<div class="row"><span class="vl" style="color:' + s.color + '">' + s.name + '</span>' +
                '<span class="lb">' + s.total + ' ô</span></div>';
            if (!entries.length) {
                h += '<div class="muted" style="margin-top:4px">Chưa ai sở hữu ô nào</div>';
            } else {
                entries.forEach(([oid, cnt]) => {
                    const isMeRow = (oid === 'me') || (oid === G.myId);
                    const owner = G.players.find(p => p.id === oid);
                    const nm = isMeRow ? 'BẠN' : (owner ? owner.name : oid);
                    const full = cnt === s.total;
                    h += '<div class="row" style="margin-top:4px">' +
                        '<span class="lb" style="' + (isMeRow ? 'color:#0284C7;font-weight:700' : '') + '">' +
                        (isMeRow ? '★ ' : '') + nm + (owner && owner.bot ? ' 🤖' : '') + '</span>' +
                        '<span style="font-size:11px;font-weight:700;color:' + (full ? '#10B981' : '#64748B') + '">' +
                        cnt + '/' + s.total + (full ? ' 👑' : '') + '</span></div>';
                });
            }
            h += '</div>';
        });
        return h;
    }

    function toggleHtml(key, title, desc) {
        return '<div class="tog"><div><div style="font-weight:600">' + title + '</div><div class="muted">' + desc + '</div></div>' +
            '<label class="sw"><input type="checkbox" data-tg="' + key + '" ' + (config[key] ? 'checked' : '') + '><span class="sl"></span></label></div>';
    }

    function autoView() {
        return '<div class="lb" style="margin-bottom:6px;text-transform:uppercase">Auto Engine</div>' +
            toggleHtml('autoRoll', 'Auto Roll', 'Tự đổ xúc xắc (ngẫu nhiên 0.6–1s)') +
            toggleHtml('autoBuy', 'Auto Buy', 'Tự mua đất, giữ dự phòng $' + config.autoBuyMinCash) +
            toggleHtml('autoEndTurn', 'Auto End Turn', 'Tự bấm End Turn') +
            toggleHtml('autoReRollDoubles', 'Auto Re-Roll Doubles', 'Tự nhận diện số đôi') +
            toggleHtml('autoAuctionSnipe', 'Auction Sniper', 'Tự theo dõi đấu giá') +
            '<div class="tog"><div><div style="font-weight:600">Chiến lược tù</div><div class="muted">Ra tù sớm / nghỉ trong tù</div></div>' +
            '<select data-sel="autoPrisonPay" style="font-size:11px;padding:4px;border:1px solid #CBD5E1;border-radius:6px">' +
            ['early|Đầu game', 'late|Cuối game', 'always|Luôn', 'never|Không'].map(o => {
                const [v, l] = o.split('|');
                return '<option value="' + v + '" ' + (config.autoPrisonPay === v ? 'selected' : '') + '>' + l + '</option>';
            }).join('') + '</select></div>' +
            '<div class="tog"><div><div style="font-weight:600">Ngưỡng dự phòng</div><div class="muted">Auto Buy giữ lại tối thiểu</div></div>' +
            '<input type="number" data-num="autoBuyMinCash" value="' + config.autoBuyMinCash + '" min="0" step="50" style="width:80px;font-size:11px;padding:4px;border:1px solid #CBD5E1;border-radius:6px"></div>' +
            '<div class="muted" style="margin-top:8px">Phím tắt: <b>F2</b>/<b>H</b> ẩn-hiện · <b>R</b> roll · <b>E</b> end turn</div>';
    }

    function bind() {
        root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
            const a = b.getAttribute('data-act');
            if (a === 'collapse') { config.hudCollapsed = true; saveCfg(); render(); }
            if (a === 'expand') { config.hudCollapsed = false; saveCfg(); render(); }
            if (a === 'hide') { config.hudVisible = false; saveCfg(); render(); }
        }));
        root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
            config.tab = b.getAttribute('data-tab'); saveCfg(); render();
        }));
        root.querySelectorAll('[data-tg]').forEach(cb => cb.addEventListener('change', () => {
            config[cb.getAttribute('data-tg')] = cb.checked; saveCfg();
        }));
        root.querySelectorAll('[data-sel]').forEach(s => s.addEventListener('change', () => {
            config[s.getAttribute('data-sel')] = s.value; saveCfg();
        }));
        root.querySelectorAll('[data-num]').forEach(i => i.addEventListener('change', () => {
            const v = parseInt(i.value, 10);
            if (!isNaN(v)) { config[i.getAttribute('data-num')] = v; saveCfg(); }
        }));
        const h = root.querySelector('[data-drag]');
        if (h) {
            h.addEventListener('mousedown', (e) => {
                const sx = e.clientX, sy = e.clientY;
                const ox = parseInt(root.style.left, 10) || 0, oy = parseInt(root.style.top, 10) || 0;
                const mv = (ev) => {
                    config.hudPos = {
                        x: Math.max(4, Math.min(window.innerWidth - 360, ox + ev.clientX - sx)),
                        y: Math.max(4, Math.min(window.innerHeight - 60, oy + ev.clientY - sy))
                    };
                    root.style.left = config.hudPos.x + 'px';
                    root.style.top = config.hudPos.y + 'px';
                };
                const up = () => {
                    saveCfg();
                    window.removeEventListener('mousemove', mv);
                    window.removeEventListener('mouseup', up);
                };
                window.addEventListener('mousemove', mv);
                window.addEventListener('mouseup', up);
            });
        }
    }

    // =========================================================
    // 9. SCHEDULER + HOTKEYS
    // =========================================================
    let pending = false;
    function schedule() {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            const m = location.pathname.match(/\/room\/([^/]+)/);
            G.roomId = m ? m[1] : null;
            autoTick();
            render();
        });
    }

    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        const k = e.key.toLowerCase();
        if (e.key === 'F2' || k === 'h') { e.preventDefault(); config.hudVisible = !config.hudVisible; saveCfg(); render(); }
        else if (k === 'r') fire(btnRoll());
        else if (k === 'e') fire(btnEndTurn());
    });

    window.addEventListener('rhud:loc', schedule);
    window.addEventListener('resize', schedule);

    // expose cho console debug
    window.$RICHUP_HUD = { G, config, saveCfg, radar, netWorths, sets, tileAt, rentOf, btnRoll, btnBuy, btnEndTurn, btnAuction, btnPayPrison, render };

    onBodyReady(() => {
        render();
        setInterval(autoTick, 900);
        setInterval(schedule, 1500);
    });

    console.log('%c[Richup HUD v1.1.0]', 'color:#0284C7;font-weight:bold;font-size:13px', 'loaded');
})();
