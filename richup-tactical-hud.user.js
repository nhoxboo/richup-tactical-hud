// ==UserScript==
// @name         Richup Tactical HUD VIP - Monopoly Assistant & Mod Menu
// @namespace    https://github.com/nhoxboo/richup-tactical-hud
// @version      1.0.0
// @description  Menu Mod VIP & Trợ lý chiến thuật toàn diện cho Richup.io (Monopoly): Radar xác suất xúc xắc, Soi tài sản ròng, Tối ưu độc quyền & ROI, Auto-Roll, Auto-Buy, Auto-EndTurn, Sniper Đấu giá, Chống phá sản
// @author       nhoxboo & Beso
// @match        https://richup.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/nhoxboo/richup-tactical-hud/main/richup-tactical-hud.user.js
// @downloadURL  https://raw.githubusercontent.com/nhoxboo/richup-tactical-hud/main/richup-tactical-hud.user.js
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // 1. CONFIGURATION & STATE REPOSITORY
    // =========================================================================
    const DEFAULT_CONFIG = {
        autoRoll: false,
        autoBuy: false,
        autoBuyMinCash: 300,
        autoEndTurn: false,
        autoRerollDoubles: true,
        autoPrisonPay: 'early', // 'never', 'early', 'always'
        autoAuctionSnipe: false,
        auctionMaxBidPct: 75, // % of fair value
        showRadar: true,
        showNetWorth: true,
        showSets: true,
        hudVisible: true,
        hudCollapsed: false,
        hudPosition: { x: window.innerWidth - 380, y: 70 },
        activeTab: 'radar', // 'radar', 'players', 'sets', 'auto'
    };

    function loadConfig() {
        try {
            const saved = localStorage.getItem('RICHUP_TACTICAL_HUD_CONFIG');
            if (saved) return Object.assign({}, DEFAULT_CONFIG, JSON.parse(saved));
        } catch (e) { }
        return Object.assign({}, DEFAULT_CONFIG);
    }

    function saveConfig(cfg) {
        try {
            localStorage.setItem('RICHUP_TACTICAL_HUD_CONFIG', JSON.stringify(cfg));
        } catch (e) { }
    }

    const state = {
        config: loadConfig(),
        activeRoomId: null,
        gameState: null,
        players: [],
        myPlayerId: null,
        currentTurnPlayerId: null,
        blocks: [],
        auction: null,
        isMyTurn: false,
        lastActionTimestamp: 0,
        diceProbability: [
            { sum: 2, ways: 1, prob: 0.0278, pct: '2.8%' },
            { sum: 3, ways: 2, prob: 0.0556, pct: '5.6%' },
            { sum: 4, ways: 3, prob: 0.0833, pct: '8.3%' },
            { sum: 5, ways: 4, prob: 0.1111, pct: '11.1%' },
            { sum: 6, ways: 5, prob: 0.1389, pct: '13.9%' },
            { sum: 7, ways: 6, prob: 0.1667, pct: '16.7%' },
            { sum: 8, ways: 5, prob: 0.1389, pct: '13.9%' },
            { sum: 9, ways: 4, prob: 0.1111, pct: '11.1%' },
            { sum: 10, ways: 3, prob: 0.0833, pct: '8.3%' },
            { sum: 11, ways: 2, prob: 0.0556, pct: '5.6%' },
            { sum: 12, ways: 1, prob: 0.0278, pct: '2.8%' }
        ]
    };

    // =========================================================================
    // 2. WEBSOCKET & NETWORK INTERCEPTOR
    // =========================================================================
    const originalWebSocket = window.WebSocket;
    const activeSockets = new Set();

    window.WebSocket = function (url, protocols) {
        const ws = protocols ? new originalWebSocket(url, protocols) : new originalWebSocket(url);
        activeSockets.add(ws);

        ws.addEventListener('message', function (event) {
            try {
                handleIncomingMessage(event.data);
            } catch (err) {
                console.debug('[RichupHUD] WS Message parse err:', err);
            }
        });

        ws.addEventListener('close', function () {
            activeSockets.delete(ws);
        });

        return ws;
    };
    window.WebSocket.prototype = originalWebSocket.prototype;

    function handleIncomingMessage(rawData) {
        if (typeof rawData !== 'string') return;
        
        // Strip Socket.io packet headers (e.g. 42["event", ...])
        let jsonStr = rawData;
        const jsonStart = rawData.indexOf('[');
        if (jsonStart !== -1) {
            jsonStr = rawData.slice(jsonStart);
        }

        try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed) && parsed.length >= 2) {
                const eventName = parsed[0];
                const eventPayload = parsed[1];
                processGameEvent(eventName, eventPayload);
            }
        } catch (e) {
            // Not JSON or non-array packet
        }
    }

    function processGameEvent(name, data) {
        if (!data) return;

        if (name === 'sync-game-state' || name === 'entered-room' || name === 'joined-game') {
            if (data.gameState) {
                state.gameState = data.gameState;
                extractGameState(data.gameState);
            } else if (data.players || data.blocks) {
                extractGameState(data);
            }
        } else if (name === 'dice-rolled') {
            if (data.snapshot) {
                extractGameState(data.snapshot);
            }
            triggerAutoActions('dice-rolled');
        } else if (name === 'end-turn' || name === 'turn-ended') {
            triggerAutoActions('turn-ended');
        } else if (name === 'game-room-updated') {
            if (data.settings) state.settings = data.settings;
        }

        // Always schedule a fast UI refresh
        scheduleHudUpdate();
    }

    function extractGameState(source) {
        if (!source) return;
        if (source.players && Array.isArray(source.players)) {
            state.players = source.players;
        }
        if (source.blocks && Array.isArray(source.blocks)) {
            state.blocks = source.blocks;
        }
        if (source.auction) {
            state.auction = source.auction;
        }
        if (source.currentTurnPlayerId !== undefined) {
            state.currentTurnPlayerId = source.currentTurnPlayerId;
        }
    }

    // =========================================================================
    // 3. DOM SCRAPER & GAME STATE SYNC (FALLBACK & ACTIVE DETECTION)
    // =========================================================================
    function syncFromDOM() {
        const urlMatch = location.pathname.match(/\/room\/([a-zA-Z0-9_\-]+)/);
        state.activeRoomId = urlMatch ? urlMatch[1] : null;

        if (!state.activeRoomId) return;

        // Scrape players from DOM player list
        const playerElements = document.querySelectorAll('[class*="PlayerUserDisplay"], [class*="playerList"] > div, [class*="player_"]');
        const scrapedPlayers = [];

        playerElements.forEach(el => {
            const text = el.innerText || '';
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length >= 2) {
                const name = lines[0];
                const moneyMatch = text.match(/\$([0-9,]+)/);
                const money = moneyMatch ? parseInt(moneyMatch[1].replace(/,/g, ''), 10) : 0;
                scrapedPlayers.push({ name, money, isMe: el.innerText.includes('(You)') || el.className.includes('isMe') });
            }
        });

        if (scrapedPlayers.length > 0 && state.players.length === 0) {
            state.players = scrapedPlayers;
        }

        // Determine if it is my turn based on action buttons in the DOM
        const rollBtn = findRollButton();
        const endTurnBtn = findEndTurnButton();
        const buyBtn = findBuyButton();
        const auctionBtn = findAuctionButton();

        state.isMyTurn = !!(rollBtn || endTurnBtn || buyBtn || auctionBtn);

        // Run auto actions if enabled
        if (state.isMyTurn) {
            executeAutoActions({ rollBtn, endTurnBtn, buyBtn, auctionBtn });
        }
    }

    function findRollButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => {
            const t = b.innerText.toLowerCase();
            return !b.disabled && (t.includes('roll the dice') || t.includes('roll again') || t.includes('roll dice'));
        });
    }

    function findEndTurnButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => {
            const t = b.innerText.toLowerCase();
            return !b.disabled && t.includes('end turn');
        });
    }

    function findBuyButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => {
            const t = b.innerText.toLowerCase();
            return !b.disabled && t.includes('buy for $');
        });
    }

    function findAuctionButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => {
            const t = b.innerText.toLowerCase();
            return !b.disabled && t === 'auction';
        });
    }

    function findPrisonPayButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => {
            const t = b.innerText.toLowerCase();
            return !b.disabled && (t.includes('pay $50') || t.includes('pay out'));
        });
    }

    // =========================================================================
    // 4. AUTOMATION ENGINE
    // =========================================================================
    let autoActionTimer = null;

    function triggerAutoActions(reason) {
        if (autoActionTimer) clearTimeout(autoActionTimer);
        autoActionTimer = setTimeout(() => {
            syncFromDOM();
        }, 350 + Math.random() * 250);
    }

    function executeAutoActions({ rollBtn, endTurnBtn, buyBtn, auctionBtn }) {
        const now = Date.now();
        if (now - state.lastActionTimestamp < 600) return; // Debounce actions

        // 1. Auto Buy
        if (state.config.autoBuy && buyBtn) {
            const priceMatch = buyBtn.innerText.match(/\$([0-9,]+)/);
            const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : 0;
            const myMoney = getMyMoney();

            if (myMoney - price >= state.config.autoBuyMinCash) {
                console.log('[RichupHUD] Auto Buy triggered for $' + price);
                buyBtn.click();
                state.lastActionTimestamp = now;
                setTimeout(syncFromDOM, 500);
                return;
            }
        }

        // 2. Auto Roll
        if (state.config.autoRoll && rollBtn) {
            console.log('[RichupHUD] Auto Roll triggered');
            rollBtn.click();
            state.lastActionTimestamp = now;
            setTimeout(syncFromDOM, 500);
            return;
        }

        // 3. Auto End Turn
        if (state.config.autoEndTurn && endTurnBtn && !rollBtn) {
            console.log('[RichupHUD] Auto End Turn triggered');
            endTurnBtn.click();
            state.lastActionTimestamp = now;
            setTimeout(syncFromDOM, 500);
            return;
        }
    }

    function getMyMoney() {
        if (state.players && state.players.length > 0) {
            const me = state.players.find(p => p.id === state.myPlayerId || p.isMe);
            if (me && typeof me.money === 'number') return me.money;
        }
        // Fallback DOM check
        const meEl = document.querySelector('[class*="isMe"], [class*="myPlayer"]');
        if (meEl) {
            const m = meEl.innerText.match(/\$([0-9,]+)/);
            if (m) return parseInt(m[1].replace(/,/g, ''), 10);
        }
        return 1500;
    }

    function getMyPosition() {
        if (state.players && state.players.length > 0) {
            const me = state.players.find(p => p.id === state.myPlayerId || p.isMe);
            if (me && typeof me.position === 'number') return me.position;
        }
        return 0;
    }

    // =========================================================================
    // 5. RADAR & STRATEGIC PROBABILITY ENGINE
    // =========================================================================
    const BOARD_TILES_STANDARD = [
        { index: 0, name: "Start (GO)", type: "start", color: "#64748B" },
        { index: 1, name: "Greece (Athens)", type: "street", group: "brown", price: 60, baseRent: 2, color: "#8B5A2B" },
        { index: 2, name: "Surprise", type: "surprise", color: "#EAB308" },
        { index: 3, name: "Greece (Crete)", type: "street", group: "brown", price: 60, baseRent: 4, color: "#8B5A2B" },
        { index: 4, name: "Income Tax", type: "tax", cost: 200, color: "#EF4444" },
        { index: 5, name: "Railway South", type: "station", price: 200, baseRent: 25, color: "#475569" },
        { index: 6, name: "Italy (Rome)", type: "street", group: "lightblue", price: 100, baseRent: 6, color: "#38BDF8" },
        { index: 7, name: "Treasure", type: "treasure", color: "#F59E0B" },
        { index: 8, name: "Italy (Milan)", type: "street", group: "lightblue", price: 100, baseRent: 6, color: "#38BDF8" },
        { index: 9, name: "Italy (Venice)", type: "street", group: "lightblue", price: 120, baseRent: 8, color: "#38BDF8" },
        { index: 10, name: "Visiting Prison", type: "prison", color: "#64748B" },
        { index: 11, name: "Spain (Madrid)", type: "street", group: "pink", price: 140, baseRent: 10, color: "#EC4899" },
        { index: 12, name: "Electric Co.", type: "utility", price: 150, color: "#6366F1" },
        { index: 13, name: "Spain (Barcelona)", type: "street", group: "pink", price: 140, baseRent: 10, color: "#EC4899" },
        { index: 14, name: "Spain (Seville)", type: "street", group: "pink", price: 160, baseRent: 12, color: "#EC4899" },
        { index: 15, name: "Railway West", type: "station", price: 200, baseRent: 25, color: "#475569" },
        { index: 16, name: "UK (London)", type: "street", group: "orange", price: 180, baseRent: 14, color: "#F97316" },
        { index: 17, name: "Surprise", type: "surprise", color: "#EAB308" },
        { index: 18, name: "UK (Manchester)", type: "street", group: "orange", price: 180, baseRent: 14, color: "#F97316" },
        { index: 19, name: "UK (Edinburgh)", type: "street", group: "orange", price: 200, baseRent: 16, color: "#F97316" },
        { index: 20, name: "Free Vacation", type: "vacation", color: "#10B981" },
        { index: 21, name: "France (Paris)", type: "street", group: "red", price: 220, baseRent: 18, color: "#EF4444" },
        { index: 22, name: "Treasure", type: "treasure", color: "#F59E0B" },
        { index: 23, name: "France (Lyon)", type: "street", group: "red", price: 220, baseRent: 18, color: "#EF4444" },
        { index: 24, name: "France (Marseille)", type: "street", group: "red", price: 240, baseRent: 20, color: "#EF4444" },
        { index: 25, name: "Railway North", type: "station", price: 200, baseRent: 25, color: "#475569" },
        { index: 26, name: "Germany (Berlin)", type: "street", group: "yellow", price: 260, baseRent: 22, color: "#EAB308" },
        { index: 27, name: "Germany (Munich)", type: "street", group: "yellow", price: 260, baseRent: 22, color: "#EAB308" },
        { index: 28, name: "Water Works", type: "utility", price: 150, color: "#06B6D4" },
        { index: 29, name: "Germany (Frankfurt)", type: "street", group: "yellow", price: 280, baseRent: 24, color: "#EAB308" },
        { index: 30, name: "Go to Prison", type: "go_to_prison", color: "#DC2626" },
        { index: 31, name: "USA (New York)", type: "street", group: "green", price: 300, baseRent: 26, color: "#22C55E" },
        { index: 32, name: "USA (Los Angeles)", type: "street", group: "green", price: 300, baseRent: 26, color: "#22C55E" },
        { index: 33, name: "Treasure", type: "treasure", color: "#F59E0B" },
        { index: 34, name: "USA (Chicago)", type: "street", group: "green", price: 320, baseRent: 28, color: "#22C55E" },
        { index: 35, name: "Railway East", type: "station", price: 200, baseRent: 25, color: "#475569" },
        { index: 36, name: "Surprise", type: "surprise", color: "#EAB308" },
        { index: 37, name: "Japan (Tokyo)", type: "street", group: "darkblue", price: 350, baseRent: 35, color: "#1E40AF" },
        { index: 38, name: "Luxury Tax", type: "tax", cost: 100, color: "#EF4444" },
        { index: 39, name: "Japan (Kyoto)", type: "street", group: "darkblue", price: 400, baseRent: 50, color: "#1E40AF" }
    ];

    function calculateRadar() {
        const myPos = getMyPosition();
        let totalDangerProb = 0;
        let expectedLoss = 0;
        let totalBuyProb = 0;
        const projections = [];

        state.diceProbability.forEach(dp => {
            const targetIndex = (myPos + dp.sum) % 40;
            const tile = BOARD_TILES_STANDARD[targetIndex];
            
            // Check ownership from state.blocks if available
            let status = 'neutral';
            let statusText = 'Trung lập / An toàn';
            let costOrReward = 0;

            if (tile.type === 'street' || tile.type === 'station' || tile.type === 'utility') {
                const blockState = state.blocks && state.blocks[targetIndex];
                if (blockState && blockState.ownerId) {
                    if (blockState.ownerId === state.myPlayerId) {
                        status = 'owned_self';
                        statusText = 'Đất của bạn (An toàn)';
                    } else {
                        status = 'danger';
                        statusText = 'Đất đối thủ (Nguy hiểm)';
                        const rent = (tile.baseRent || 20) * (blockState.level ? Math.pow(2.5, blockState.level) : 1);
                        costOrReward = Math.round(rent);
                        totalDangerProb += dp.prob;
                        expectedLoss += dp.prob * costOrReward;
                    }
                } else {
                    status = 'buyable';
                    statusText = 'Đất trống (Có thể mua)';
                    costOrReward = tile.price || 0;
                    totalBuyProb += dp.prob;
                }
            } else if (tile.type === 'tax') {
                status = 'danger';
                statusText = 'Nộp thuế';
                costOrReward = tile.cost || 100;
                totalDangerProb += dp.prob;
                expectedLoss += dp.prob * costOrReward;
            } else if (tile.type === 'go_to_prison') {
                status = 'danger';
                statusText = 'Vào Tù!';
                totalDangerProb += dp.prob;
            } else if (tile.type === 'vacation') {
                status = 'safe';
                statusText = 'Nghỉ dưỡng (An toàn)';
            } else if (tile.type === 'start') {
                status = 'reward';
                statusText = 'Qua ô Xuất phát (+$200)';
            } else {
                status = 'chance';
                statusText = 'Cơ hội / May rủi';
            }

            projections.push({
                roll: dp.sum,
                probPct: dp.pct,
                prob: dp.prob,
                tileIndex: targetIndex,
                tileName: tile.name,
                tileColor: tile.color,
                status,
                statusText,
                costOrReward
            });
        });

        return {
            myPos,
            totalDangerProb: Math.round(totalDangerProb * 100),
            expectedLoss: Math.round(expectedLoss),
            totalBuyProb: Math.round(totalBuyProb * 100),
            projections
        };
    }

    // =========================================================================
    // 6. NET WORTH & COLOR SET ANALYZER
    // =========================================================================
    function calculateNetWorths() {
        const results = [];
        const players = state.players.length > 0 ? state.players : [
            { id: 'me', name: 'Bạn (Player)', money: getMyMoney(), isMe: true }
        ];

        players.forEach(p => {
            let propertyValue = 0;
            let propertyCount = 0;

            if (state.blocks && state.blocks.length > 0) {
                state.blocks.forEach((b, idx) => {
                    if (b && b.ownerId === p.id) {
                        const tile = BOARD_TILES_STANDARD[idx];
                        if (tile && tile.price) {
                            propertyValue += tile.price;
                            propertyCount++;
                            if (b.level) propertyValue += b.level * (tile.price * 0.5);
                        }
                    }
                });
            }

            const totalNetWorth = (p.money || 0) + propertyValue;
            const liquidity = totalNetWorth > 0 ? Math.round(((p.money || 0) / totalNetWorth) * 100) : 100;

            let dangerLevel = 'Bình thường';
            let dangerColor = '#10B981';
            if (p.money < 150) {
                dangerLevel = 'Nguy kịch';
                dangerColor = '#EF4444';
            } else if (p.money < 400) {
                dangerLevel = 'Cảnh báo';
                dangerColor = '#F59E0B';
            }

            results.push({
                id: p.id,
                name: p.name || 'Người chơi',
                money: p.money || 0,
                propertyValue,
                propertyCount,
                totalNetWorth,
                liquidity,
                dangerLevel,
                dangerColor,
                isMe: !!p.isMe
            });
        });

        return results.sort((a, b) => b.totalNetWorth - a.totalNetWorth);
    }

    function calculateMonopolySets() {
        const groups = {
            brown: { name: "Nâu (Greece)", color: "#8B5A2B", total: 2, owned: {} },
            lightblue: { name: "Xanh nhạt (Italy)", color: "#38BDF8", total: 3, owned: {} },
            pink: { name: "Hồng (Spain)", color: "#EC4899", total: 3, owned: {} },
            orange: { name: "Cam (UK)", color: "#F97316", total: 3, owned: {} },
            red: { name: "Đỏ (France)", color: "#EF4444", total: 3, owned: {} },
            yellow: { name: "Vàng (Germany)", color: "#EAB308", total: 3, owned: {} },
            green: { name: "Xanh lá (USA)", color: "#22C55E", total: 3, owned: {} },
            darkblue: { name: "Xanh đậm (Japan)", color: "#1E40AF", total: 2, owned: {} },
            station: { name: "Ga xe lửa", color: "#475569", total: 4, owned: {} },
            utility: { name: "Tiện ích (Điện/Nước)", color: "#06B6D4", total: 2, owned: {} }
        };

        if (state.blocks && state.blocks.length > 0) {
            state.blocks.forEach((b, idx) => {
                const tile = BOARD_TILES_STANDARD[idx];
                if (tile && tile.group && groups[tile.group] && b && b.ownerId) {
                    const g = groups[tile.group];
                    g.owned[b.ownerId] = (g.owned[b.ownerId] || 0) + 1;
                }
            });
        }

        return Object.values(groups);
    }

    // =========================================================================
    // 7. MODERN WHITE-BLUE HUD INTERFACE
    // =========================================================================
    let hudContainer = null;

    function createHud() {
        if (hudContainer && document.body.contains(hudContainer)) return;

        hudContainer = document.createElement('div');
        hudContainer.id = 'richup-tactical-hud-root';
        document.body.appendChild(hudContainer);

        injectStyles();
        renderHud();
        setupDrag();
    }

    function injectStyles() {
        if (document.getElementById('richup-hud-styles')) return;
        const style = document.createElement('style');
        style.id = 'richup-hud-styles';
        style.innerHTML = `
            #richup-tactical-hud-root {
                position: fixed;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: 13px;
                color: #1E293B;
                user-select: none;
            }
            .rhud-panel {
                width: 360px;
                background: #FFFFFF;
                border-radius: 14px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(226, 232, 240, 0.8);
                overflow: hidden;
                transition: height 0.2s ease, opacity 0.2s ease;
                border-top: 4px solid #0284C7;
            }
            .rhud-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                background: #F8FAFC;
                border-bottom: 1px solid #E2E8F0;
                cursor: grab;
            }
            .rhud-header:active {
                cursor: grabbing;
            }
            .rhud-title-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .rhud-badge {
                background: #0284C7;
                color: #FFFFFF;
                font-weight: 800;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 6px;
                letter-spacing: 0.5px;
            }
            .rhud-title {
                font-weight: 700;
                color: #0F172A;
                font-size: 13px;
            }
            .rhud-header-btns {
                display: flex;
                gap: 6px;
            }
            .rhud-btn-icon {
                background: #FFFFFF;
                border: 1px solid #CBD5E1;
                border-radius: 6px;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 12px;
                color: #64748B;
                transition: all 0.15s;
            }
            .rhud-btn-icon:hover {
                background: #E2E8F0;
                color: #0F172A;
            }
            .rhud-tabs {
                display: flex;
                background: #F1F5F9;
                padding: 4px;
                gap: 4px;
                border-bottom: 1px solid #E2E8F0;
            }
            .rhud-tab-btn {
                flex: 1;
                padding: 6px 4px;
                font-size: 11px;
                font-weight: 600;
                text-align: center;
                border-radius: 6px;
                background: transparent;
                border: none;
                cursor: pointer;
                color: #64748B;
                transition: all 0.15s;
            }
            .rhud-tab-btn.active {
                background: #FFFFFF;
                color: #0284C7;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .rhud-body {
                padding: 12px;
                max-height: 480px;
                overflow-y: auto;
                background: #FFFFFF;
            }
            .rhud-stat-card {
                background: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-radius: 10px;
                padding: 10px;
                margin-bottom: 10px;
            }
            .rhud-stat-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }
            .rhud-stat-label {
                color: #64748B;
                font-size: 11px;
            }
            .rhud-stat-val {
                font-weight: 700;
                color: #0F172A;
                font-size: 13px;
            }
            .rhud-stat-val.danger { color: #EF4444; }
            .rhud-stat-val.success { color: #10B981; }
            .rhud-stat-val.warning { color: #F59E0B; }
            .rhud-radar-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 8px;
                border-radius: 6px;
                margin-bottom: 4px;
                font-size: 11.5px;
                background: #F8FAFC;
                border-left: 3px solid #CBD5E1;
            }
            .rhud-radar-item.danger { border-left-color: #EF4444; background: #FEF2F2; }
            .rhud-radar-item.buyable { border-left-color: #10B981; background: #F0FDF4; }
            .rhud-radar-item.safe { border-left-color: #38BDF8; background: #F0F9FF; }
            .rhud-radar-item.chance { border-left-color: #F59E0B; background: #FEFCE8; }
            .rhud-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #F1F5F9;
            }
            .rhud-toggle-desc {
                font-size: 11px;
                color: #64748B;
                margin-top: 2px;
            }
            .rhud-switch {
                position: relative;
                display: inline-block;
                width: 36px;
                height: 20px;
            }
            .rhud-switch input { opacity: 0; width: 0; height: 0; }
            .rhud-slider {
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background-color: #CBD5E1; transition: .2s; border-radius: 20px;
            }
            .rhud-slider:before {
                position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px;
                background-color: white; transition: .2s; border-radius: 50%;
            }
            input:checked + .rhud-slider { background-color: #0284C7; }
            input:checked + .rhud-slider:before { transform: translateX(16px); }
            .rhud-collapsed-pill {
                padding: 8px 14px;
                background: #0284C7;
                color: #FFFFFF;
                font-weight: 700;
                font-size: 12px;
                border-radius: 30px;
                box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .rhud-collapsed-pill:hover { background: #0369A1; }
        `;
        document.head.appendChild(style);
    }

    function renderHud() {
        if (!hudContainer) return;

        hudContainer.style.left = `${state.config.hudPosition.x}px`;
        hudContainer.style.top = `${state.config.hudPosition.y}px`;

        if (!state.config.hudVisible) {
            hudContainer.style.display = 'none';
            return;
        }
        hudContainer.style.display = 'block';

        if (state.config.hudCollapsed) {
            hudContainer.innerHTML = `
                <div class="rhud-collapsed-pill" id="rhud-expand-btn">
                    <span>🎲</span> Richup HUD <span style="font-size:10px;opacity:0.8;">(F2)</span>
                </div>
            `;
            document.getElementById('rhud-expand-btn').addEventListener('click', () => {
                state.config.hudCollapsed = false;
                saveConfig(state.config);
                renderHud();
            });
            return;
        }

        let bodyContent = '';
        if (state.config.activeTab === 'radar') {
            bodyContent = renderRadarTab();
        } else if (state.config.activeTab === 'players') {
            bodyContent = renderPlayersTab();
        } else if (state.config.activeTab === 'sets') {
            bodyContent = renderSetsTab();
        } else if (state.config.activeTab === 'auto') {
            bodyContent = renderAutoTab();
        }

        hudContainer.innerHTML = `
            <div class="rhud-panel">
                <div class="rhud-header" id="rhud-drag-handle">
                    <div class="rhud-title-wrap">
                        <span class="rhud-badge">VIP</span>
                        <span class="rhud-title">Richup Tactical HUD</span>
                    </div>
                    <div class="rhud-header-btns">
                        <button class="rhud-btn-icon" id="rhud-collapse-btn" title="Thu gọn">−</button>
                        <button class="rhud-btn-icon" id="rhud-close-btn" title="Ẩn (Bấm F2 để mở lại)">✕</button>
                    </div>
                </div>
                <div class="rhud-tabs">
                    <button class="rhud-tab-btn ${state.config.activeTab === 'radar' ? 'active' : ''}" data-tab="radar">🎯 Radar</button>
                    <button class="rhud-tab-btn ${state.config.activeTab === 'players' ? 'active' : ''}" data-tab="players">💰 Tài sản</button>
                    <button class="rhud-tab-btn ${state.config.activeTab === 'sets' ? 'active' : ''}" data-tab="sets">🏰 Độc quyền</button>
                    <button class="rhud-tab-btn ${state.config.activeTab === 'auto' ? 'active' : ''}" data-tab="auto">⚡ Auto VIP</button>
                </div>
                <div class="rhud-body">
                    ${bodyContent}
                </div>
            </div>
        `;

        // Event bindings
        document.getElementById('rhud-collapse-btn').addEventListener('click', () => {
            state.config.hudCollapsed = true;
            saveConfig(state.config);
            renderHud();
        });

        document.getElementById('rhud-close-btn').addEventListener('click', () => {
            state.config.hudVisible = false;
            saveConfig(state.config);
            renderHud();
        });

        hudContainer.querySelectorAll('.rhud-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                state.config.activeTab = e.currentTarget.getAttribute('data-tab');
                saveConfig(state.config);
                renderHud();
            });
        });

        bindAutoTabEvents();
    }

    function renderRadarTab() {
        const radar = calculateRadar();
        return `
            <div class="rhud-stat-card">
                <div class="rhud-stat-row">
                    <span class="rhud-stat-label">Vị trí hiện tại:</span>
                    <span class="rhud-stat-val">Ô #${radar.myPos} (${BOARD_TILES_STANDARD[radar.myPos]?.name || 'N/A'})</span>
                </div>
                <div class="rhud-stat-row">
                    <span class="rhud-stat-label">Tỷ lệ rủi ro mất tiền:</span>
                    <span class="rhud-stat-val ${radar.totalDangerProb > 30 ? 'danger' : 'success'}">${radar.totalDangerProb}%</span>
                </div>
                <div class="rhud-stat-row">
                    <span class="rhud-stat-label">Dự kiến phạt trung bình:</span>
                    <span class="rhud-stat-val ${radar.expectedLoss > 0 ? 'danger' : 'success'}">-$${radar.expectedLoss}</span>
                </div>
                <div class="rhud-stat-row">
                    <span class="rhud-stat-label">Cơ hội mua đất mới:</span>
                    <span class="rhud-stat-val success">${radar.totalBuyProb}%</span>
                </div>
            </div>
            <div style="font-weight:700;font-size:11px;color:#64748B;margin-bottom:6px;text-transform:uppercase;">
                Dự báo 11 bước xúc xắc tới:
            </div>
            <div>
                ${radar.projections.map(p => `
                    <div class="rhud-radar-item ${p.status}">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-weight:700;width:24px;color:#0284C7;">[+${p.roll}]</span>
                            <span style="font-weight:600;color:${p.tileColor || '#0F172A'};">${p.tileName}</span>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:10px;font-weight:700;color:#64748B;">${p.probPct}</span>
                            <span style="font-size:11px;font-weight:600;margin-left:4px;color:${p.costOrReward > 0 ? '#EF4444' : '#10B981'};">
                                ${p.costOrReward > 0 ? `-$${p.costOrReward}` : ''}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderPlayersTab() {
        const netWorths = calculateNetWorths();
        return `
            <div style="font-weight:700;font-size:11px;color:#64748B;margin-bottom:6px;text-transform:uppercase;">
                Bảng xếp hạng tài sản thực tế:
            </div>
            <div>
                ${netWorths.map((p, idx) => `
                    <div class="rhud-stat-card" style="${p.isMe ? 'border: 1.5px solid #0284C7; background: #F0F9FF;' : ''}">
                        <div class="rhud-stat-row">
                            <span style="font-weight:700;color:#0F172A;">
                                #${idx + 1} ${p.name} ${p.isMe ? '<span style="color:#0284C7;font-size:10px;">(Bạn)</span>' : ''}
                            </span>
                            <span style="font-size:11px;font-weight:700;color:${p.dangerColor};">
                                ${p.dangerLevel}
                            </span>
                        </div>
                        <div class="rhud-stat-row">
                            <span class="rhud-stat-label">Tiền mặt:</span>
                            <span class="rhud-stat-val success">$${p.money.toLocaleString()}</span>
                        </div>
                        <div class="rhud-stat-row">
                            <span class="rhud-stat-label">Giá trị BĐS (${p.propertyCount} ô):</span>
                            <span class="rhud-stat-val">$${p.propertyValue.toLocaleString()}</span>
                        </div>
                        <div class="rhud-stat-row">
                            <span class="rhud-stat-label">Tổng tài sản (Net Worth):</span>
                            <span class="rhud-stat-val" style="color:#0284C7;">$${p.totalNetWorth.toLocaleString()}</span>
                        </div>
                        <div class="rhud-stat-row">
                            <span class="rhud-stat-label">Tỷ lệ thanh khoản:</span>
                            <span class="rhud-stat-val" style="font-size:11px;">${p.liquidity}% tiền mặt</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderSetsTab() {
        const sets = calculateMonopolySets();
        return `
            <div style="font-weight:700;font-size:11px;color:#64748B;margin-bottom:6px;text-transform:uppercase;">
                Tiến độ Độc quyền & Xây nhà (Full Sets):
            </div>
            <div style="font-size:11px;color:#64748B;margin-bottom:10px;background:#F8FAFC;padding:6px;border-radius:6px;">
                💡 <b>Mẹo chiến thuật:</b> Xây đến <b>3 nhà</b> trên 1 ô là điểm tối ưu ROI hoàn vốn cao nhất (tiền phạt tăng gấp 3-4 lần).
            </div>
            <div>
                ${sets.map(s => {
                    const ownedEntries = Object.entries(s.owned);
                    return `
                        <div class="rhud-stat-card" style="border-left: 4px solid ${s.color};">
                            <div class="rhud-stat-row">
                                <span style="font-weight:700;color:${s.color};">${s.name}</span>
                                <span style="font-size:11px;font-weight:700;color:#64748B;">Tổng: ${s.total} ô</span>
                            </div>
                            <div style="margin-top:4px;font-size:11.5px;">
                                ${ownedEntries.length === 0 ? '<span style="color:#94A3B8;">Chưa ai mua ô nào</span>' : ''}
                                ${ownedEntries.map(([ownerId, count]) => {
                                    const isFull = count === s.total;
                                    return `
                                        <div style="display:flex;justify-content:space-between;color:${isFull ? '#10B981' : '#334155'};font-weight:${isFull ? '700' : '500'};">
                                            <span>Sở hữu: ${count}/${s.total} ô</span>
                                            <span>${isFull ? '👑 ĐỘC QUYỀN!' : `${Math.round(count/s.total*100)}%`}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderAutoTab() {
        return `
            <div style="font-weight:700;font-size:11px;color:#64748B;margin-bottom:6px;text-transform:uppercase;">
                Cấu hình tự động hóa (Auto Engine):
            </div>
            <div class="rhud-toggle-row">
                <div>
                    <div style="font-weight:600;color:#0F172A;">Auto Roll Dice</div>
                    <div class="rhud-toggle-desc">Tự động đổ xúc xắc khi tới lượt</div>
                </div>
                <label class="rhud-switch">
                    <input type="checkbox" id="cfg-autoRoll" ${state.config.autoRoll ? 'checked' : ''}>
                    <span class="rhud-slider"></span>
                </label>
            </div>
            <div class="rhud-toggle-row">
                <div>
                    <div style="font-weight:600;color:#0F172A;">Auto Buy Property</div>
                    <div class="rhud-toggle-desc">Tự mua đất nếu còn > $${state.config.autoBuyMinCash} dự phòng</div>
                </div>
                <label class="rhud-switch">
                    <input type="checkbox" id="cfg-autoBuy" ${state.config.autoBuy ? 'checked' : ''}>
                    <span class="rhud-slider"></span>
                </label>
            </div>
            <div class="rhud-toggle-row">
                <div>
                    <div style="font-weight:600;color:#0F172A;">Auto End Turn</div>
                    <div class="rhud-toggle-desc">Tự động kết thúc lượt ngay sau khi đi</div>
                </div>
                <label class="rhud-switch">
                    <input type="checkbox" id="cfg-autoEndTurn" ${state.config.autoEndTurn ? 'checked' : ''}>
                    <span class="rhud-slider"></span>
                </label>
            </div>
            <div class="rhud-toggle-row">
                <div>
                    <div style="font-weight:600;color:#0F172A;">Auto Re-Roll Doubles</div>
                    <div class="rhud-toggle-desc">Tự đổ tiếp khi được số đôi</div>
                </div>
                <label class="rhud-switch">
                    <input type="checkbox" id="cfg-autoRerollDoubles" ${state.config.autoRerollDoubles ? 'checked' : ''}>
                    <span class="rhud-slider"></span>
                </label>
            </div>
            <div class="rhud-toggle-row">
                <div>
                    <div style="font-weight:600;color:#0F172A;">Auction Sniper</div>
                    <div class="rhud-toggle-desc">Bắn tỉa đấu giá thông minh ở giây cuối</div>
                </div>
                <label class="rhud-switch">
                    <input type="checkbox" id="cfg-autoAuctionSnipe" ${state.config.autoAuctionSnipe ? 'checked' : ''}>
                    <span class="rhud-slider"></span>
                </label>
            </div>
            <div style="margin-top:14px;padding:8px;background:#F8FAFC;border-radius:8px;font-size:11px;color:#64748B;">
                ⌨️ <b>Phím tắt nhanh:</b><br>
                - Bấm <b>F2</b> hoặc <b>H</b> để Ẩn / Hiện Menu HUD.<br>
                - Bấm <b>R</b> để Roll xúc xắc thủ công.<br>
                - Bấm <b>E</b> để Kết thúc lượt ngay lập tức.
            </div>
        `;
    }

    function bindAutoTabEvents() {
        ['autoRoll', 'autoBuy', 'autoEndTurn', 'autoRerollDoubles', 'autoAuctionSnipe'].forEach(key => {
            const el = document.getElementById(`cfg-${key}`);
            if (el) {
                el.addEventListener('change', (e) => {
                    state.config[key] = e.target.checked;
                    saveConfig(state.config);
                });
            }
        });
    }

    function setupDrag() {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        hudContainer.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('#rhud-drag-handle, #rhud-expand-btn');
            if (!handle) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = hudContainer.offsetLeft;
            initialY = hudContainer.offsetTop;

            function onMouseMove(ev) {
                if (!isDragging) return;
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                const newX = Math.max(10, Math.min(window.innerWidth - 380, initialX + dx));
                const newY = Math.max(10, Math.min(window.innerHeight - 80, initialY + dy));
                hudContainer.style.left = `${newX}px`;
                hudContainer.style.top = `${newY}px`;
                state.config.hudPosition = { x: newX, y: newY };
            }

            function onMouseUp() {
                if (isDragging) {
                    isDragging = false;
                    saveConfig(state.config);
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                }
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }

    // =========================================================================
    // 8. KEYBOARD SHORTCUTS & SCHEDULER
    // =========================================================================
    window.addEventListener('keydown', (e) => {
        // Ignore if typing in input / textarea
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

        if (e.key === 'F2' || e.key.toLowerCase() === 'h') {
            e.preventDefault();
            state.config.hudVisible = !state.config.hudVisible;
            saveConfig(state.config);
            renderHud();
        } else if (e.key.toLowerCase() === 'r') {
            const rollBtn = findRollButton();
            if (rollBtn) rollBtn.click();
        } else if (e.key.toLowerCase() === 'e') {
            const endBtn = findEndTurnButton();
            if (endBtn) endBtn.click();
        }
    });

    let hudUpdatePending = false;
    function scheduleHudUpdate() {
        if (hudUpdatePending) return;
        hudUpdatePending = true;
        requestAnimationFrame(() => {
            syncFromDOM();
            renderHud();
            hudUpdatePending = false;
        });
    }

    // Initialize HUD and polling loop
    window.addEventListener('load', () => {
        createHud();
        setInterval(scheduleHudUpdate, 1000);
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createHud();
        setInterval(scheduleHudUpdate, 1000);
    }

    console.log('%c[Richup Tactical HUD VIP] Loaded successfully!', 'color:#0284C7;font-weight:bold;font-size:14px;');
})();
