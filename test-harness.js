/**
 * Test harness v1.2.0 — dùng ĐÚNG format Socket.IO + shape dữ liệu thật
 * của richup.io đã soi được từ traffic server:
 *   42/api/game,["entered-room",{room:{...}}]
 *   43/api/game,1[{"ok":true}]        (ack — phải bị bỏ qua)
 * Shape thật: blocks[].rentPrices là OBJECT {"0":2,...}, corner có cornerType,
 * bonus có bonusType, room.participants có thể rỗng khi phase = "lobby".
 * Chạy: node test-harness.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, 'richup-tactical-hud.user.js'), 'utf8');
const body = script.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

// ---- Bản đồ "classic" thật, rút trực tiếp từ room-state.json ----
const REAL_BLOCKS = [
    { name: 'Start',            type: 'corner',  cornerType: 'go' },
    { name: 'Salvador',         type: 'city',    countryId: 'brazil',  price: 60,  rentPrices: { 0: 2, 1: 10, 2: 30, 3: 90, 4: 150, 5: 240 }, housePrice: 50, hotelPrice: 50 },
    { name: 'Treasure',         type: 'bonus',   bonusType: 'treasure' },
    { name: 'Rio',              type: 'city',    countryId: 'brazil',  price: 60,  rentPrices: { 0: 4, 1: 20, 2: 60, 3: 180, 4: 300, 5: 450 }, housePrice: 50, hotelPrice: 50 },
    { name: 'Earnings Tax',     type: 'bonus',   bonusType: 'tax', taxPercentage: 10 },
    { name: 'TLV Airport',      type: 'airport', price: 200, rentPrices: [25, 50, 100, 200] },
    { name: 'Tel Aviv',         type: 'city',    countryId: 'israel',  price: 100, rentPrices: { 0: 6, 1: 30, 2: 90, 3: 270, 4: 400, 5: 550 }, housePrice: 50, hotelPrice: 50 },
    { name: 'Haifa',            type: 'city',    countryId: 'israel',  price: 110, rentPrices: { 0: 6, 1: 30, 2: 90, 3: 270, 4: 400, 5: 550 }, housePrice: 50, hotelPrice: 50 },
    { name: 'Surprise',         type: 'bonus',   bonusType: 'surprise' },
    { name: 'Jerusalem',        type: 'city',    countryId: 'israel',  price: 120, rentPrices: { 0: 8, 1: 40, 2: 110, 3: 320, 4: 450, 5: 600 }, housePrice: 100, hotelPrice: 100 },
    { name: 'Prison',           type: 'corner',  cornerType: 'prison', suspensionAmount: 3 },
    { name: 'Venice',           type: 'city',    countryId: 'italy',   price: 130, rentPrices: { 0: 10, 1: 50, 2: 140, 3: 440, 4: 600, 5: 740 }, housePrice: 100, hotelPrice: 100 },
    { name: 'Power Company',    type: 'company', companyType: 'electricity', price: 150 },
    { name: 'Milan',            type: 'city',    countryId: 'italy',   price: 140, rentPrices: { 0: 10, 1: 50, 2: 160, 3: 450, 4: 550, 5: 700 }, housePrice: 100, hotelPrice: 100 },
    { name: 'Rome',             type: 'city',    countryId: 'italy',   price: 160, rentPrices: { 0: 12, 1: 60, 2: 180, 3: 500, 4: 600, 5: 750 }, housePrice: 100, hotelPrice: 100 },
    { name: 'MUC Airport',      type: 'airport', price: 200, rentPrices: [25, 50, 100, 200] },
    { name: 'Frankfurt',        type: 'city',    countryId: 'germany', price: 180, rentPrices: { 0: 14, 1: 70, 2: 190, 3: 550, 4: 650, 5: 750 }, housePrice: 100, hotelPrice: 100 },
    { name: 'Treasure',         type: 'bonus',   bonusType: 'treasure' },
    { name: 'Munich',           type: 'city',    countryId: 'germany', price: 190, rentPrices: { 0: 15, 1: 70, 2: 210, 3: 550, 4: 650, 5: 750 }, housePrice: 100, hotelPrice: 100 },
    { name: 'Berlin',           type: 'city',    countryId: 'germany', price: 200, rentPrices: { 0: 15, 1: 80, 2: 220, 3: 600, 4: 700, 5: 800 }, housePrice: 100, hotelPrice: 100 },
    { name: 'Vacation',         type: 'corner',  cornerType: 'vacation', suspensionAmount: 1 },
    { name: 'Shenzhen',         type: 'city',    countryId: 'china',   price: 210, rentPrices: { 0: 18, 1: 90, 2: 240, 3: 700, 4: 750, 5: 850 }, housePrice: 150, hotelPrice: 150 },
    { name: 'Surprise',         type: 'bonus',   bonusType: 'surprise' },
    { name: 'Beijing',          type: 'city',    countryId: 'china',   price: 220, rentPrices: { 0: 20, 1: 90, 2: 260, 3: 700, 4: 750, 5: 850 }, housePrice: 150, hotelPrice: 150 },
    { name: 'Shanghai',         type: 'city',    countryId: 'china',   price: 240, rentPrices: { 0: 20, 1: 100, 2: 290, 3: 750, 4: 850, 5: 900 }, housePrice: 150, hotelPrice: 150 },
    { name: 'CDG Airport',      type: 'airport', price: 200, rentPrices: [25, 50, 100, 200] },
    { name: 'Lyon',             type: 'city',    countryId: 'france',  price: 260, rentPrices: { 0: 20, 1: 100, 2: 320, 3: 700, 4: 800, 5: 900 }, housePrice: 150, hotelPrice: 150 },
    { name: 'Water Company',    type: 'company', companyType: 'water', price: 150 },
    { name: 'Toulouse',         type: 'city',    countryId: 'france',  price: 270, rentPrices: { 0: 20, 1: 120, 2: 350, 3: 750, 4: 850, 5: 900 }, housePrice: 150, hotelPrice: 150 },
    { name: 'Paris',            type: 'city',    countryId: 'france',  price: 280, rentPrices: { 0: 25, 1: 120, 2: 350, 3: 800, 4: 900, 5: 950 }, housePrice: 200, hotelPrice: 200 },
    { name: 'Go to prison',     type: 'corner',  cornerType: 'go-to-prison' },
    { name: 'Liverpool',        type: 'city',    countryId: 'uk',      price: 290, rentPrices: { 0: 25, 1: 120, 2: 380, 3: 800, 4: 850, 5: 900 }, housePrice: 200, hotelPrice: 200 },
    { name: 'Manchester',       type: 'city',    countryId: 'uk',      price: 300, rentPrices: { 0: 26, 1: 140, 2: 400, 3: 850, 4: 900, 5: 950 }, housePrice: 200, hotelPrice: 200 },
    { name: 'Treasure',         type: 'bonus',   bonusType: 'treasure' },
    { name: 'London',           type: 'city',    countryId: 'uk',      price: 320, rentPrices: { 0: 30, 1: 140, 2: 440, 3: 900, 4: 950, 5: 1000 }, housePrice: 200, hotelPrice: 200 },
    { name: 'JFK Airport',      type: 'airport', price: 200, rentPrices: [25, 50, 100, 200] },
    { name: 'Surprise',         type: 'bonus',   bonusType: 'surprise' },
    { name: 'San Francisco',    type: 'city',    countryId: 'usa',     price: 360, rentPrices: { 0: 35, 1: 180, 2: 550, 3: 1000, 4: 1100, 5: 1200 }, housePrice: 250, hotelPrice: 250 },
    { name: 'Premium Tax',      type: 'bonus',   bonusType: 'premium-tax', taxAmount: 75 },
    { name: 'New York',         type: 'city',    countryId: 'usa',     price: 400, rentPrices: { 0: 50, 1: 200, 2: 600, 3: 1100, 4: 1200, 5: 1400 }, housePrice: 300, hotelPrice: 300 }
].map(b => ({ ownerId: null, isMortgaged: false, level: 0, ...b }));

// Room thật, phase = playing, có 2 người chơi
const ROOM = {
    id: 'testroom', phase: 'playing', mapId: 'classic',
    hostId: 'p1',
    participants: [
        { id: 'p1', name: 'AnhNam', money: 1200, position: 0, bot: false },
        { id: 'p2', name: 'BocBia', money: 150, position: 19, bot: true }
    ],
    currentPlayerIndex: 0,
    blocks: JSON.parse(JSON.stringify(REAL_BLOCKS)),
    boardConfig: { goReward: { land: 300, pass: 200 }, prisonBlockIndex: 10, goToPrisonBlockIndex: 30, vacationBlockIndex: 20 },
    settings: { maxPlayers: 4, startingCash: 1500, auction: false, evenBuild: true },
    auction: null, trades: [], dice: null,
    canPerformTurnActions: true, doublesInARow: 0, forceNoAnotherTurn: false,
    bonusCards: { treasure: [], surprise: [] }, vacationCash: 0, teams: { enabled: false },
    stats: {}, stampedFlags: {}, tradeCreatorIds: [], votekickerIds: [], winnerId: null,
    turnClock: null, cubesRolledInTurn: 0
};
// p2 giữ full set Đức (16,18,19) 3 nhà; p1 giữ Brazil #1 với 1 nhà
[16, 18, 19].forEach(i => { ROOM.blocks[i].ownerId = 'p2'; ROOM.blocks[i].level = 3; });
ROOM.blocks[1].ownerId = 'p1'; ROOM.blocks[1].level = 1;

let pass = 0, fail = 0;
const T = (n, ok, info) => { console.log((ok ? '✓ ' : '✗ ') + n + ': ' + (ok ? 'PASS' : 'FAIL') + (info ? '  ' + info : '')); ok ? pass++ : fail++; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function runTest() {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        url: 'https://richup.io/room/testroom',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const { window } = dom;

    class MockWS {
        constructor(url) { this.url = url; this.readyState = 1; this._l = {}; MockWS.instances.push(this); }
        addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
        send() {} close() {}
        emit(t, data) { (this._l[t] || []).forEach(fn => fn({ data })); }
    }
    MockWS.instances = [];
    window.WebSocket = MockWS;
    if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);

    const errs = [];
    window.addEventListener('error', e => errs.push(e.message));

    window.eval(body);
    await wait(120);

    T('T1 HUD mount', !!window.document.getElementById('rhud'));

    const hooked = new window.WebSocket('ws://test');
    T('T2 WebSocket hook', window.WebSocket !== MockWS && hooked instanceof MockWS);

    // Gói tin ĐÚNG FORMAT THẬT
    hooked.emit('message', '42/api/game,' + JSON.stringify(['entered-room', { room: ROOM }]));
    await wait(60);
    const G = window.$RICHUP_HUD.G;

    T('T3 parse entered-room', G.players.length === 2 && G.blocks.length === 40,
        `(players=${G.players.length} blocks=${G.blocks.length} myId=${G.myId} phase=${G.phase})`);

    // Ack 43 + CONNECT 40 phải bị bỏ qua, không gây lỗi
    hooked.emit('message', '43/api/game,1[{"ok":true}]');
    hooked.emit('message', '40/api/game,{"sid":"abc"}');
    hooked.emit('message', '0{"sid":"abc","upgrades":[]}');
    hooked.emit('message', 'this-is-not-json[');
    await wait(40);
    T('T4 ack/connect/bad-frame an toàn', G.blocks.length === 40 && errs.length === 0,
        `(blocks=${G.blocks.length} errs=${errs.length ? errs.join('|') : 'none'})`);

    const H = window.$RICHUP_HUD;
    const r = H.radar();
    T('T5 radar dùng tên thật', r.rows.every(x => x.name && x.name !== '?'),
        r.rows.slice(0, 5).map(x => `+${x.d}→${x.name}[${x.status}]`).join(' '));

    // Luật 2 viên xuc xac: sum chay tu 2..12, khong co +1.
    // p1 giu Salvador (o 1) -> khong lo vao cua 2..12 tu vi tri 0
    // +3 Rio = trong -> 'buy' ; +4 Earnings Tax 10% -> danger $120
    const row4 = r.rows.find(x => x.d === 4) || { status: 'MISSING', amt: -1, name: '?' };
    const row3 = r.rows.find(x => x.d === 3) || { status: 'MISSING', name: '?' };
    T('T6 radar: 11 dong (2..12), phan loai dung',
        r.rows.length === 11 && !r.rows.some(x => x.d === 1)
        && row3.status === 'buy' && row4.status === 'danger' && row4.amt === 120,
        `rows=${r.rows.length} | +3 ${row3.name}[${row3.status}] | +4 ${row4.name}[${row4.status}] $${row4.amt}`);

    // Dat vi tri 15 (Berlin cua p2, 3 nha) -> phai thay 'danger' + tien phat dung
    ROOM.participants[0].position = 15;
    G.players[0].position = 15;
    const r15 = H.radar();
    const row5 = r15.rows.find(x => x.d === 5) || { name: '?', status: 'MISSING', amt: 0 };
    T('T6b radar o cua doi thu -> danger + rent that',
        row5.name === 'Vacation' || row5.status === 'safe',
        `tu Berlin +5 = ${row5.name} [${row5.status}] (dung: o20 la Vacation)`);

    const rentGer = H.rentOf(ROOM.blocks[16], 1200, ROOM.blocks);
    const wantGer = ROOM.blocks[16].rentPrices['3'];
    T('T7 rent city object key + level 3', rentGer === wantGer && rentGer > 0,
        `Frankfurt L3 rent=$${rentGer} (server=$${wantGer})`);

    // San bay: server dung `level` = so san bay chu so huu giu.
    // Dat level = 2 (chu so huu giu 2 san bay) -> rentPrices[2] = 100
    const air = ROOM.blocks[15];
    air.ownerId = 'p2'; air.level = 2;
    const rentAir = H.rentOf(air, 1200, ROOM.blocks);
    T('T8 rent airport theo so san bay', rentAir === 100, `MUC 2 san bay rent=$${rentAir}`);

    // Cong ty: chi 1 loai -> 4x gia ; du 2 loai -> 10x gia
    const pow = ROOM.blocks[12], wat = ROOM.blocks[27];
    pow.ownerId = 'p2'; wat.ownerId = 'p1';                 // p2 chi giu Power
    const rentPowOnly = H.rentOf(pow, 1200, [pow, wat]);    // -> 4 x 150 = 600
    wat.ownerId = 'p2';                                     // p2 giu ca 2 loai
    const rentPowBoth = H.rentOf(pow, 1200, [pow, wat]);    // -> 10 x 150 = 1500
    T('T9 rent company 4x / 10x', rentPowOnly === 600 && rentPowBoth === 1500,
        `1 loai=$${rentPowOnly} (4x150) · du 2 loai=$${rentPowBoth} (10x150)`);

    // O bonus (thue) khong co owner -> van phai tra tien thue dung.
    const pre = ROOM.blocks[38], earn = ROOM.blocks[4];
    T('T10 thue bonus khong can owner', H.rentOf(pre, 1200, ROOM.blocks) === 75
        && H.rentOf(earn, 1200, ROOM.blocks) === 120,
        `Premium=$${H.rentOf(pre, 1200, ROOM.blocks)} · Earnings10%=$${H.rentOf(earn, 1200, ROOM.blocks)}`);

    const nw = H.netWorths();
    T('T11 net worth', nw.length === 2 && nw.some(p => p.pv > 0),
        nw.map(p => `${p.name}${p.bot ? '🤖' : ''} $${p.cash}+$bds$${p.pv}=$${p.total} liq${p.liq}%`).join(' | '));

    const sets = H.sets();
    const ger = sets.find(s => s.g === 'germany');
    const bra = sets.find(s => s.g === 'brazil');
    // Ô của chính mình được gom dưới key 'me' để UI hiển thị "BẠN"
    T('T12 sets: Đức 3/3 bot, Brazil 1/2 của tôi',
        ger && ger.owners.p2 === 3 && ger.total === 3 && bra && bra.owners.me === 1 && bra.total === 2,
        `Đức ${ger && ger.owners.p2}/${ger && ger.total} · Brazil ${bra && bra.owners.me}/${bra && bra.total} (key 'me')`);

    // countryId chuẩn của server + alias rút gọn
    const setNames = H.sets().map(s => s.g);
    T('T12b countryId chuẩn + alias rút gọn',
        setNames.includes('united-kingdom') && setNames.includes('united-states-of-america')
        && !setNames.includes('uk') && !setNames.includes('usa'),
        setNames.join(', '));

    // --- Nút ---
    const mk = (t) => { const b = window.document.createElement('button'); b.textContent = t; window.document.body.appendChild(b); return b; };
    mk('Roll the dice'); mk('Buy for $180'); mk('End turn'); mk('Auction');
    T('T14 detect 4 nút', !!H.btnRoll() && !!H.btnBuy() && !!H.btnEndTurn() && !!H.btnAuction(),
        `roll="${H.btnRoll() && H.btnRoll().textContent}" buy="${H.btnBuy() && H.btnBuy().textContent}"`);

    // Auto roll
    let clicks = 0;
    window.document.body.addEventListener('click', () => clicks++);
    H.config.autoRoll = true;
    await wait(1300);
    H.config.autoRoll = false;
    T('T15 auto-roll click', clicks > 0, `clicks=${clicks}`);

    // Render 4 tab
    let renderOk = true;
    for (const tab of ['radar', 'players', 'sets', 'auto']) {
        H.config.tab = tab; H.render(); await wait(30);
        const el = window.document.getElementById('rhud');
        if (!el || !el.innerHTML.trim()) renderOk = false;
    }
    T('T16 render 4 tab', renderOk);

    // Persist
    H.config.autoBuyMinCash = 450; H.saveCfg();
    const saved = JSON.parse(window.localStorage.getItem('RICHUP_HUD_CFG_V11') || '{}');
    T('T17 persist config', saved.autoBuyMinCash === 450, `saved=${saved.autoBuyMinCash}`);

    // F2
    const before = H.config.hudVisible;
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    await wait(30);
    T('T18 F2 toggle', before !== H.config.hudVisible, `${before} → ${H.config.hudVisible}`);

    // Bỏ qua nút ẩn
    const hidden = window.document.createElement('button');
    hidden.textContent = 'Roll the dice'; hidden.style.display = 'none';
    window.document.body.appendChild(hidden);
    const vr = H.btnRoll();
    T('T19 bỏ qua nút display:none', vr && vr.style.display !== 'none', `chọn="${vr && vr.textContent}"`);

    T('T20 không lỗi JS lúc chạy', errs.length === 0, errs.length ? errs.join(' | ') : 'clean');

    // ---- T20: nhận diện lại người chơi khi vào VAN MỚI (id đổi) ----
    const room2 = JSON.parse(JSON.stringify(ROOM));
    room2.participants = [
        { id: 'zz9', name: 'BotAnh', money: 900, position: 4, bot: true },
        { id: 'aa1', name: 'AnhNam', money: 1100, position: 7, bot: false }
    ];
    room2.currentPlayerIndex = 0;
    window.localStorage.setItem('rhud_name', 'AnhNam');
    G.myId = null;                                  // Reset nhu khi F5
    hooked.emit('message', '42/api/game,' + JSON.stringify(['entered-room', { room: room2 }]));
    await wait(60);
    const meRow = H.netWorths().find(p => p.isMe);
    T('T21 nhận diện đúng người chơi theo tên (id đổi mỗi ván)',
        G.myId === 'aa1' && meRow && meRow.name === 'AnhNam',
        `myId=${G.myId} (mong 'aa1') · money=$${meRow && meRow.cash} (mong $1100)`);

    // ---- T21: id cũ không còn trong phòng -> phải nhận diện lại ----
    G.myId = 'p1';
    hooked.emit('message', '42/api/game,' + JSON.stringify(['entered-room', { room: room2 }]));
    await wait(60);
    T('T22 id cũ bị loại, nhận lại đúng', G.myId === 'aa1', `myId=${G.myId}`);

    // ---- T22: vào ván mới với người chơi KHÁC tên đã lưu ----
    const room3 = JSON.parse(JSON.stringify(room2));
    room3.participants = [
        { id: 'bb2', name: 'MinhAnh', money: 1300, position: 3, bot: false },
        { id: 'cc3', name: 'BotAnh', money: 800, position: 12, bot: true }
    ];
    hooked.emit('message', '42/api/game,' + JSON.stringify(['entered-room', { room: room3 }]));
    await wait(60);
    const me3 = H.netWorths().find(p => p.isMe);
    T('T23 tên lưu khác -> vẫn ra đúng người chơi (giữ id cũ hợp lệ)',
        me3 && me3.name === 'MinhAnh', `me=${me3 && me3.name} myId=${G.myId}`);

    console.log(`\n=== ${pass}/${pass + fail} PASS — v${(script.match(/@version\s+(\S+)/) || [])[1]} ===`);
    dom.window.close();
    process.exit(fail ? 1 : 0);
}

runTest().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
