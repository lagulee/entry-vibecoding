/* LIGHTS OUT — 그림 설계(Figma 빌드 + 로컬 미리보기 공용)
 *
 * buildSpecs(L) → [{ name, w, h, component?, items: [...] }]
 *   items: { t:'svg', svg, x, y }                       → Figma 벡터 (createNodeFromSvg)
 *          { t:'text', s, x, y, w, size, font, color, align, lh, runs?, shadow? } → Figma 텍스트 레이어
 *          { t:'inst', of, x, y, k }                     → 컴포넌트 인스턴스 (칸 그림 재사용)
 * 좌표는 각 그림의 왼쪽 위 기준(px). 이 파일은 require 없이 Figma 플러그인 환경에서도 그대로 실행된다.
 */
function buildSpecs(L) {
    // ---------- 팔레트: 밤 동네 + 크림색 종이 + 잉크 선 ----------
    const K = {
        ink: '#1E2235', night: '#2B3150', night2: '#343B5C', night3: '#232842', ground: '#1B1F33',
        cream: '#F4EBD8', paper: '#FBF5E8', line: '#D9CDB2', muted: '#6B6F82',
        yellow: '#FFCF5A', yellow2: '#FFE7A3', coral: '#F08A7E', coralD: '#D9634F', lilac: '#A99BE0', lilacL: '#DCD4F5',
        sky: '#7EC4E8', mint: '#79C8A6', frame: '#3B4266', pane: '#262B45', wood: '#C98A4B',
    };
    const PC = { p1: K.sky, p2: K.coral, ai: K.lilac };
    const specs = [];
    const add = (name, w, h, items, extra = {}) => specs.push({ name, w, h, items, ...extra });

    // ---------- SVG 도우미 ----------
    const f = (n) => Math.round(n * 100) / 100;
    const svg = (w, h, inner, x = 0, y = 0) => ({ t: 'svg', x, y, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${inner}</svg>` });
    const rect = (x, y, w, h, o = {}) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${o.rx || 0}" fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 2}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.op != null ? ` opacity="${o.op}"` : ''}/>`;
    const circ = (cx, cy, r, o = {}) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 2}"` : ''}${o.op != null ? ` opacity="${o.op}"` : ''}/>`;
    const path = (d, o = {}) => `<path d="${d}" fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 2}" stroke-linecap="round" stroke-linejoin="round"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.op != null ? ` opacity="${o.op}"` : ''}/>`;
    // 스티커: 잉크 테두리 + 번지지 않는 그림자(아래로 sh px)
    const sticker = (x, y, w, h, rx, fill, sh = 3, sw = 2) =>
        (sh ? rect(x, y + sh, w, h, { rx, fill: K.ink }) : '') + rect(x, y, w, h, { rx, fill, stroke: K.ink, sw });
    const starD = (cx, cy, R, r) => {
        let d = '';
        for (let k = 0; k < 10; k++) {
            const a = -Math.PI / 2 + (k * Math.PI) / 5;
            const rr = k % 2 ? r : R;
            d += `${k ? 'L' : 'M'}${f(cx + rr * Math.cos(a))} ${f(cy + rr * Math.sin(a))}`;
        }
        return `${d}Z`;
    };
    const star = (cx, cy, R, on) => path(starD(cx, cy, R, R * 0.48), on ? { fill: K.yellow, stroke: K.ink, sw: Math.max(1.2, R / 7) } : { fill: K.paper, stroke: K.line, sw: Math.max(1.2, R / 7) });
    // 결정적 난수
    const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

    // 텍스트 (글꼴: Jua = 제목/숫자, Gaegu = 손글씨 메모, Gowun = 본문)
    // Gaegu(손글씨)는 같은 크기에서 글자가 작게 보여 1.22배로 맞춘다
    const T = (s, x, y, w, size, o = {}) => ({ t: 'text', s, x, y, w, size: f(/^Gaegu/.test(o.font || '') ? size * 1.22 : size), font: o.font || 'Jua', color: o.color || K.ink, align: o.align || 'center', lh: o.lh || 1.2, runs: o.runs, shadow: o.shadow });
    const tw = (s, size) => [...s].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? size * 0.92 : ch === ' ' ? size * 0.28 : size * 0.56), 0);

    // ---------- 아이콘 (24×24 기준, 잉크 선) ----------
    const ICON = {
        back: path('M14 6l-6 6 6 6M8 12h11', { stroke: K.ink, sw: 2.6 }),
        retry: path('M18.5 9A7 7 0 1 0 19 14', { stroke: K.ink, sw: 2.6 }) + path('M19 4v5h-5', { stroke: K.ink, sw: 2.6 }),
        list: path('M8 7h11M8 12h11M8 17h11', { stroke: K.ink, sw: 2.6 }) + circ(4.5, 7, 1.3, { fill: K.ink }) + circ(4.5, 12, 1.3, { fill: K.ink }) + circ(4.5, 17, 1.3, { fill: K.ink }),
        play: path('M8 5.5v13l10-6.5z', { fill: K.ink, stroke: K.ink, sw: 1.6 }),
        help: circ(12, 12, 9, { fill: K.yellow, stroke: K.ink, sw: 2 }) + path('M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4', { stroke: K.ink, sw: 2 }) + circ(12, 16.8, 1.2, { fill: K.ink }),
        star: path(starD(12, 12.5, 10, 4.8), { fill: K.yellow, stroke: K.ink, sw: 1.8 }),
        bulb: path('M12 3.5a6 6 0 0 0-3.4 11c.6.4.9 1 .9 1.7v.8h5v-.8c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3.5z', { fill: K.yellow, stroke: K.ink, sw: 1.8 }) + path('M10 20h4', { stroke: K.ink, sw: 2 }),
        eye: path('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', { fill: K.paper, stroke: K.ink, sw: 1.8 }) + circ(12, 12, 3.2, { fill: K.ink }),
        lock: rect(5, 11, 14, 10, { rx: 2.5, fill: K.muted }) + path('M8 11V8.5a4 4 0 0 1 8 0V11', { stroke: K.muted, sw: 2.4 }),
    };
    const icon = (k, x, y, s = 12) => svg(s, s, `<g transform="scale(${s / 24})">${ICON[k]}</g>`, x, y);

    // ---------- 칸 그림 (64×64) — 컴포넌트로 만들어 미리보기에서 재사용 ----------
    const cellInner = (skin, on) => {
        if (skin === 1) { // 창문: 꺼지면 어두운 유리, 켜지면 노란 불빛 + 커튼 + 화분
            const pane = on ? K.yellow : K.pane;
            let s = rect(5, 5, 54, 54, { rx: 7, fill: K.frame, stroke: K.ink, sw: 2.5 }) + rect(11, 11, 42, 42, { rx: 3, fill: pane });
            if (on) {
                s += path('M14 14l9 0-9 9z', { fill: K.yellow2 }) // 유리 반사
                    + path('M11 11h9c-1 9-4 15-9 19z', { fill: K.coral, stroke: K.ink, sw: 1.5 })
                    + path('M53 11h-9c1 9 4 15 9 19z', { fill: K.coral, stroke: K.ink, sw: 1.5 })
                    + rect(40, 44, 8, 7, { rx: 1.5, fill: K.wood, stroke: K.ink, sw: 1.2 })
                    + path('M44 44c0-4-3-6-5-7M44 44c0-4 3-7 5-7M44 44v-8', { stroke: '#3F8F67', sw: 1.6 });
            } else {
                s += path('M15 15l6 0-6 6z', { fill: '#353C5E' });
            }
            return s + path('M32 11v42M11 32h42', { stroke: K.frame, sw: 3.5 }) + rect(11, 11, 42, 42, { rx: 3, stroke: K.ink, sw: 1.5 });
        }
        if (skin === 2) { // 알전구
            const bulb = 'M32 13a12 12 0 0 0-6.8 21.9c1.2.8 1.8 2 1.8 3.4V41h10v-2.7c0-1.4.6-2.6 1.8-3.4A12 12 0 0 0 32 13z';
            let s = rect(5, 5, 54, 54, { rx: 12, fill: on ? K.yellow : '#2E3352', stroke: K.ink, sw: 2.5 });
            if (on) {
                s += path('M32 6v4M14 14l3 3M50 14l-3 3M9 30h4M51 30h4', { stroke: K.ink, sw: 2.2 });
            }
            s += path(bulb, on ? { fill: '#FFFDF4', stroke: K.ink, sw: 2.2 } : { fill: '#3A4064', stroke: '#565E86', sw: 2.2 });
            s += rect(27, 43, 10, 3, { rx: 1.5, fill: on ? K.ink : '#565E86' }) + rect(28.5, 48, 7, 3, { rx: 1.5, fill: on ? K.ink : '#565E86' });
            if (on) {
                s += path('M28.5 27c1-3 3-4.5 5.5-4.5', { stroke: K.yellow, sw: 2.2 });
            }
            return s;
        }
        // 별빛
        let s = rect(5, 5, 54, 54, { rx: 12, fill: on ? K.lilac : '#2E2B4C', stroke: K.ink, sw: 2.5 });
        s += path(starD(32, 33.5, 19, 9), on ? { fill: K.yellow, stroke: K.ink, sw: 2.4 } : { fill: '#3A365E', stroke: '#575182', sw: 2.2 });
        if (on) {
            s += circ(15, 16, 2, { fill: K.paper }) + circ(49, 48, 1.6, { fill: K.paper }) + circ(50, 15, 1.2, { fill: K.paper });
        }
        return s;
    };
    for (const sk of [1, 2, 3]) {
        for (const on of [0, 1]) {
            add(`c${sk}_${on}`, 64, 64, [svg(64, 64, cellInner(sk, !!on))], { component: true });
        }
    }
    // 작은 판 그림 (카드·도움말용) — 칸 컴포넌트 인스턴스로 구성
    const miniGrid = (n, lit, x, y, cell, skin = 1, gap = 1) => {
        const out = [];
        for (let k = 0; k < n * n; k++) {
            out.push({ t: 'inst', of: `c${skin}_${lit.includes(k) ? 1 : 0}`, x: x + (k % n) * (cell + gap), y: y + Math.floor(k / n) * (cell + gap), k: cell / 64 });
        }
        return out;
    };

    // ---------- AI 표시 · 커서 · 별 · 자물쇠 ----------
    add('mark', 64, 64, [svg(64, 64, circ(32, 34, 11, { fill: K.ink }) + circ(32, 32, 11, { fill: K.lilac, stroke: K.ink, sw: 2.5 }) + circ(28.5, 28.5, 3, { fill: K.paper }))]);
    add('hint', 64, 64, [
        svg(64, 64, rect(4, 4, 56, 56, { rx: 12, stroke: K.lilac, sw: 5, dash: '9 5' }) + rect(32, 0, 30, 15, { rx: 7, fill: K.lilac, stroke: K.ink, sw: 1.8 })),
        T('여기!', 32, 0.5, 30, 9.5, { font: 'GaeguB' }),
    ]);
    for (const [k, label] of [['p1', '1P'], ['p2', '2P'], ['ai', 'AI']]) {
        const c = PC[k];
        const arm = (d) => path(d, { stroke: K.ink, sw: 7 }) + path(d, { stroke: c, sw: 4 });
        add(`cur_${k}`, 64, 64, [
            svg(64, 64, arm('M5 20V9a4 4 0 0 1 4-4h11') + arm('M44 5h11a4 4 0 0 1 4 4v11') + arm('M59 44v11a4 4 0 0 1-4 4H44') + arm('M20 59H9a4 4 0 0 1-4-4V44')
                + rect(0, 46, 22, 15, { rx: 6, fill: c, stroke: K.ink, sw: 1.8 })),
            T(label, 0, 47.5, 22, 10),
        ]);
    }
    for (let n = 0; n <= 3; n++) {
        add(`stars${n}`, 34, 12, [svg(34, 12, [0, 1, 2].map((k) => star(6 + k * 11, 6.2, 5.2, k < n)).join(''))]);
    }
    add('lock', 34, 12, [svg(34, 12, `<g transform="translate(11.5 0) scale(0.5)">${ICON.lock}</g>`)]);

    // ---------- 버튼 ----------
    const labelRow = (b, color, size) => {
        // 아이콘 + 글자를 가운데 정렬 (글자 폭은 어림값)
        const iw = b.icon ? size * 1.15 : 0;
        const gap = b.icon ? 3 : 0;
        const total = iw + gap + tw(b.label, size);
        const x0 = (b.w - total) / 2;
        const ty = (b.h - 3 - size * 1.2) / 2 + 0.6;
        const out = [];
        if (b.icon) {
            out.push(icon(b.icon, x0, (b.h - 3 - iw) / 2, iw));
        }
        out.push(T(b.label, x0 + iw + gap - 4, ty, total - iw - gap + 8, size, { color }));
        return out;
    };
    for (const b of L.BUTTONS) {
        const { w, h } = b;
        if (b.kind === 'card') {
            const tape = { modePuzzle: -6, modeAI: 4, modePVP: -3 }[b.key];
            const items = [svg(w, h, sticker(2, 2, w - 4, h - 7, 12, K.paper, 4))];
            if (b.icon === 'puzzle') {
                items.push(...miniGrid(3, [0, 2, 4, 6, 8], w / 2 - 16, 8, 10));
            } else {
                items.push(...miniGrid(2, [0, 3], w / 2 - 38, 13, 12));
                items.push(T('vs', w / 2 - 10, 18, 20, 11, { font: 'GaeguB', color: K.muted }));
                if (b.icon === 'ai') {
                    items.push(svg(30, 30, rect(5, 8, 20, 17, { rx: 5, fill: K.lilac, stroke: K.ink, sw: 2 }) + path('M15 8V4', { stroke: K.ink, sw: 2 }) + circ(15, 3.5, 2, { fill: K.coral, stroke: K.ink, sw: 1.5 })
                        + circ(11, 15, 2.2, { fill: K.ink }) + circ(19, 15, 2.2, { fill: K.ink }) + path('M11.5 20.5q3.5 2.5 7 0', { stroke: K.ink, sw: 1.8 }), w / 2 + 10, 8));
                } else {
                    items.push(...miniGrid(2, [1, 2], w / 2 + 13, 13, 12));
                }
            }
            items.push(svg(w, h, `<g transform="rotate(${tape} ${w / 2} 4)">${rect(w / 2 - 18, -1, 36, 10, { fill: b.color, op: 0.85 })}</g>`));
            const tagW = tw(b.tag, 9) + 14;
            items.push(svg(tagW, 13, rect(0.8, 0.8, tagW - 1.6, 11.4, { rx: 5.7, fill: b.color, stroke: K.ink, sw: 1.4 }), (w - tagW) / 2, 41));
            items.push(T(b.tag, (w - tagW) / 2, 41.2, tagW, 9, { font: 'GaeguB' }));
            items.push(T(b.label, 0, 54, w, 17));
            items.push(T(b.desc.join('\n'), 4, 72, w - 8, 7, { font: 'Gowun', color: K.muted, lh: 1.35 }));
            add(`b${b.id}`, w, h, items);
            continue;
        }
        if (b.kind === 'tile') {
            for (const act of [0, 1]) {
                add(`b${b.id}${act ? 'a' : ''}`, w, h, [svg(w, h, sticker(1, 1, w - 2, h - 4, 6, act ? K.yellow : K.paper, 2)), T(String(b.stage), 0, 2.5, w, 13)]);
            }
            continue;
        }
        if (b.kind === 'skincard') {
            const s = b.skin;
            for (const st of ['open', 'a', 'l']) {
                const items = [svg(w, h, sticker(2, 2, w - 4, h - 7, 12, st === 'a' ? '#FFF3CF' : K.paper, 4) + (st === 'a' ? rect(6, 6, w - 12, h - 15, { rx: 9, stroke: K.yellow, sw: 2.5 }) : ''))];
                const grid = miniGrid(3, [0, 2, 4, 6, 8], (w - 70) / 2, 11, 22.5, s.id, 1.2);
                if (st === 'l') {
                    grid.forEach((g) => { g.op = 0.35; });
                }
                items.push(...grid);
                items.push(T(s.name, 0, 85, w, 12));
                const pill = st === 'a' ? [K.yellow, '사용 중'] : st === 'open' ? [K.cream, '이걸로 할래요'] : ['#E2D8C2', `별 ${s.need}개 필요`];
                items.push(svg(w - 24, 18, rect(1, 1, w - 26, 15, { rx: 7.5, fill: pill[0], stroke: st === 'l' ? K.line : K.ink, sw: 1.4 }), 12, 102));
                if (st === 'l') {
                    items.push(icon('lock', 18, 104, 11));
                }
                items.push(T(pill[1], 12 + (st === 'l' ? 8 : 0), 103.5, w - 24 - (st === 'l' ? 8 : 0), st === 'l' ? 8 : 9, { font: 'GaeguB', color: st === 'l' ? K.muted : K.ink }));
                add(st === 'open' ? `b${b.id}` : `b${b.id}${st}`, w, h, items);
            }
            continue;
        }
        if (b.level) {
            const l = b.level;
            for (const act of [0, 1]) {
                const dots = [1, 2, 3].map((k) => circ(w / 2 - 9 + (k - 1) * 9, 36, 2.8, { fill: k <= l.id ? K.ink : 'none', stroke: K.ink, sw: 1.3 })).join('');
                add(`b${b.id}${act ? 'a' : ''}`, w, h, [svg(w, h, sticker(1, 1, w - 2, h - 4, 9, act ? K.lilac : K.paper, 3) + dots), T(l.name, 0, 5, w, 13), T(l.desc, 0, 22, w, 7.5, { font: 'Gowun', color: act ? K.ink : K.muted })]);
            }
            continue;
        }
        const fill = { primary: K.yellow, ai: K.lilac, ghost: K.paper, seg: K.paper }[b.kind];
        const size = Math.min(10.5, h * 0.46);
        const rx = Math.min(9, (h - 4) / 2);
        add(`b${b.id}`, w, h, [svg(w, h, sticker(1, 1, w - 2, h - 4, rx, fill, 2.5)), ...labelRow(b, K.ink, size)]);
        if (b.kind === 'seg') {
            add(`b${b.id}a`, w, h, [svg(w, h, sticker(1, 1, w - 2, h - 4, rx, K.yellow, 2.5)), ...labelRow(b, K.ink, size)]);
        }
    }

    // ---------- 배경 장면 ----------
    const cx = (x) => x + 240; // 무대 좌표 → 그림 좌표
    const cy = (y) => 135 - y;
    const night = (seed, o = {}) => {
        const R = rng(seed);
        let s = rect(0, 0, 480, 270, { fill: K.night });
        s += path('M0 190C90 176 170 186 250 178S400 168 480 176V270H0z', { fill: K.night2 });
        for (let i = 0; i < 46; i++) {
            const x = R() * 480;
            const y = R() * 170;
            s += circ(x, y, 0.5 + R() * 0.9, { fill: K.cream, op: f(0.35 + R() * 0.5) });
        }
        for (let i = 0; i < 6; i++) {
            const x = 20 + R() * 440;
            const y = 10 + R() * 120;
            const r = 2 + R() * 2;
            s += path(`M${f(x)} ${f(y - r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y + r)}Q${f(x)} ${f(y)} ${f(x - r)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y - r)}z`, { fill: K.yellow2, op: 0.9 });
        }
        if (o.moon) {
            const [mx, my] = o.moon;
            s += circ(mx, my, 17, { fill: K.cream }) + circ(mx + 6, my - 4, 17, { fill: K.night }) + circ(mx - 7, my + 5, 2.2, { fill: '#E2D6BB' });
        }
        if (o.skyline !== false) {
            const top = o.skyTop || 196;
            let x = -6;
            while (x < 486) {
                const bw = 26 + Math.floor(R() * 34);
                const bh = (o.skyH || 40) * (0.55 + R() * 0.75);
                const y0 = top + 60 - bh;
                s += rect(x, y0, bw, 280 - y0, { fill: K.night3 });
                if (R() < 0.35) {
                    s += rect(x + bw * 0.25, y0 - 6, bw * 0.3, 6, { fill: K.night3 }); // 옥상 물탱크
                }
                for (let wy = y0 + 6; wy < 262; wy += 9) {
                    for (let wx = x + 5; wx < x + bw - 6; wx += 8) {
                        const lit = R() < (o.lit || 0.2);
                        s += rect(wx, wy, 4, 5, { fill: lit ? K.yellow : '#2C3252', op: lit ? 0.9 : 1 });
                    }
                }
                x += bw + 2;
            }
        }
        s += rect(0, 262, 480, 8, { fill: K.ground });
        return svg(480, 270, s);
    };
    const paperPanel = (x, y, w, h, o = {}) => {
        let s = sticker(x, y, w, h, 10, K.paper, 4);
        if (o.ruled) {
            for (let ly = y + 30; ly < y + h - 6; ly += 14) {
                s += path(`M${x + 10} ${ly}H${x + w - 10}`, { stroke: '#E6DCC6', sw: 1 });
            }
            s += path(`M${x + 28} ${y + 4}V${y + h - 4}`, { stroke: '#F1B9AE', sw: 1.2 });
        }
        return s;
    };
    const tape = (x, y, w, rot, color, op = 0.8) => `<g transform="rotate(${rot} ${x + w / 2} ${y + 5})">${rect(x, y, w, 11, { fill: color, op })}</g>`;
    const heading = (title, sub, y = 8, color = K.cream) => [
        T(title, 40, y, 400, 21, { color, shadow: color === K.cream ? { dx: 0, dy: 2.5, color: K.ink } : null }),
        ...(sub ? [T(sub, 20, y + 29, 440, 12, { font: 'GaeguB', color: color === K.cream ? K.yellow2 : K.muted })] : []),
    ];
    const pill = (x, y, w, h, fill = K.paper) => svg(w + 2, h + 4, sticker(1, 1, w, h, h / 2, fill, 2), x - 1, y - 1);

    // 타이틀
    add('scr_title', 480, 270, [
        night(3, { moon: [444, 30], skyH: 46, lit: 0.22, skyTop: 196 }),
        T('LIGHTS OUT', 40, 14, 400, 52, { runs: [[0, 6, K.yellow], [6, 10, '#8E95B5']], shadow: { dx: 0, dy: 4, color: K.ink } }),
        svg(140, 14, path('M4 8C30 2 52 12 78 6S120 4 136 8', { stroke: K.yellow, sw: 3 }), 170, 76),
        T('누르면 위아래 양옆까지 함께 바뀌어요. 동네 불을 몽땅 꺼 볼까요?', 20, 88, 440, 13, { font: 'GaeguB', color: K.cream }),
        pill(cx(L.TEXT.titleStars.x) - 36, cy(L.TEXT.titleStars.y) - 9, 72, 18),
        T('엔트리로 만든 퍼즐 게임', 8, 254, 160, 7.5, { font: 'Gowun', color: '#8E95B5', align: 'left' }),
    ]);

    // 게임 방법 (공책)
    {
        const items = [night(5, { skyline: false })];
        items.push(svg(480, 270, paperPanel(16, 26, 448, 204, { ruled: true }) + tape(214, 19, 52, -3, K.yellow)));
        items.push(T('게임 방법', 140, 34, 200, 19));
        items.push(svg(480, 270, path('M206 57C226 54 254 55 274 56', { stroke: K.yellow, sw: 5, op: 0.7 })));
        // 왼쪽: 누르기 그림
        items.push(T('가운데를 누르면?', 48, 66, 150, 11, { font: 'GaeguB', color: K.muted }));
        items.push(...miniGrid(3, [0, 4, 8], 52, 84, 18, 1, 2));
        items.push(...miniGrid(3, [0, 1, 3, 5, 7, 8], 140, 84, 18, 1, 2));
        items.push(svg(480, 270, circ(81, 113, 13, { stroke: K.coral, sw: 2.2, dash: '4 3' }) + path('M118 112q6-6 14 0M127 107l5 5-6 3', { stroke: K.ink, sw: 2 })));
        items.push(T('AI는 어떻게 풀까?', 48, 152, 160, 11.5, { font: 'GaeguB', color: K.lilac === '#A99BE0' ? '#6C5BB8' : K.lilac, align: 'left' }));
        items.push(T('같은 칸을 두 번 누르면 원래대로, 누르는 순서도 상관없어요. 그래서 판 전체를 0과 1의 연립방정식으로 바꿀 수 있어요. AI는 가우스 소거법으로 풀고, 그중 가장 적게 누르는 답을 골라요.', 48, 168, 160, 7.2, { font: 'Gowun', color: K.ink, align: 'left', lh: 1.5 }));
        const rules = [
            ['칸을 누르면', '누른 칸과 위·아래·양옆 불이 함께 바뀌어요'],
            ['불을 다 끄면 클리어', 'AI 최소 횟수 안이면 ★★★, 2번 더 쓰면 ★★'],
            ['막히면 AI에게', '힌트는 한 칸(최대 ★★), 풀이는 전부(★)'],
            ['대결은 3판 2선승', '서로 다른 판, 최소 횟수는 같아요. 먼저 끄면 승!'],
            ['조작', '클릭 · 1P: WASD+스페이스 · 2P: 방향키+엔터'],
            ['단축키', 'R 다시하기 · H 힌트 · ESC 메뉴로'],
        ];
        rules.forEach(([h, t], k) => {
            const y = 66 + k * 26;
            items.push(svg(18, 18, circ(9, 9, 7.5, { fill: [K.yellow, K.sky, K.lilac, K.coral, K.mint, K.cream][k], stroke: K.ink, sw: 1.6 }), 232, y));
            items.push(T(String(k + 1), 232, y + 2.5, 18, 9.5));
            items.push(T(h, 256, y, 200, 10, { align: 'left' }));
            items.push(T(t, 256, y + 13, 204, 7.5, { font: 'Gowun', color: K.muted, align: 'left' }));
        });
        add('scr_help', 480, 270, items);
    }
    // 스킨
    add('scr_skin', 480, 270, [
        night(9, { lit: 0.15, skyH: 34 }),
        ...heading('스킨 고르기', '퍼즐 모드에서 모은 별로 새 스킨이 열려요. 어느 모드에서나 적용돼요!'),
        pill(240 - 40, cy(-84) - 9, 80, 18),
    ]);
    // 스테이지 선택
    {
        const items = [night(21, { lit: 0.18, skyH: 30 })];
        items.push(...heading('스테이지 고르기', null, 6));
        items.push(svg(480, 270, paperPanel(4, 44, 472, 182) + tape(30, 38, 40, -8, K.sky) + tape(410, 38, 40, 6, K.coral)));
        const rows = [['3×3', '첫 동네'], ['4×4', '골목길'], ['5×5', '큰 아파트']];
        rows.forEach(([n, t], k) => {
            const y = cy(L.TILE.rows[k]) - 14;
            items.push(T(n, 6, y, 44, 12));
            items.push(T(t, 6, y + 15, 44, 8.5, { font: 'GaeguB', color: K.muted }));
            if (k) {
                items.push(svg(480, 4, path('M14 2H466', { stroke: K.line, sw: 1.2, dash: '3 4' }), 0, y - 13));
            }
        });
        items.push(pill(cx(L.TEXT.stagesStars.x) - 36, cy(L.TEXT.stagesStars.y) - 9, 72, 18));
        items.push(T('★★★ = AI가 찾은 최소 횟수로 끄기 · 앞 스테이지를 깨면 다음이 열려요', 20, 238, 440, 10.5, { font: 'GaeguB', color: K.yellow2 }));
        add('scr_stages', 480, 270, items);
    }
    // 건물 (판 뒤 배경): 판 중심·크기 → 건물 외벽 + 옥상
    // 건물 (판 뒤 배경): 판 중심·크기 → 건물 외벽 + 지붕 (props: 옥상 물탱크·안테나)
    const building = (b, roofColor, sign, props = true) => {
        const x0 = cx(b.x) - b.size / 2 - 9;
        const y0 = cy(b.y) - b.size / 2 - 9;
        const w = b.size + 18;
        let s = '';
        if (props) {
            s += rect(x0 + w * 0.62, y0 - 22, 26, 16, { rx: 3, fill: '#4A5277', stroke: K.ink, sw: 2 }) + path(`M${x0 + w * 0.62 + 4} ${y0 - 6}v6M${x0 + w * 0.62 + 22} ${y0 - 6}v6`, { stroke: K.ink, sw: 2 });
            s += path(`M${x0 + w * 0.2} ${y0 - 8}v-20M${x0 + w * 0.2 - 6} ${y0 - 22}h12M${x0 + w * 0.2 - 4} ${y0 - 16}h8`, { stroke: K.ink, sw: 2 });
        }
        s += sticker(x0, y0, w, 270 - y0 + 6, 4, '#3A4166', 0, 2.5);
        s += sticker(x0 - 6, y0 - 7, w + 12, 9, 3, roofColor, 0, 2.2);
        if (sign) {
            s += rect(x0 + 10, y0 + w + 2, w - 20, 6, { rx: 2, fill: K.night3 });
        }
        return s;
    };
    {
        const P = L.BOARD.puzzle;
        const px0 = cx(L.PX) - 92;
        let s = building(P, K.coral);
        s += sticker(px0, 30, 184, 230, 12, K.paper, 4) + tape(px0 + 70, 24, 44, -4, K.yellow);
        s += path(`M${px0 + 12} ${cy(13)}H${px0 + 172}`, { stroke: K.line, sw: 1.4, dash: '3 4' }) + path(`M${px0 + 12} ${cy(-8)}H${px0 + 172}`, { stroke: K.line, sw: 1.4, dash: '3 4' });
        s += rect(px0 + 8, cy(-9), 168, 30, { rx: 8, fill: K.lilacL, stroke: K.ink, sw: 1.4 });
        add('scr_puzzle', 480, 270, [
            night(4, { moon: [312, 22], skyH: 26, lit: 0.12, skyTop: 206 }),
            svg(480, 270, s),
            T('LIGHTS OUT', 8, 4, 90, 12, { align: 'left', runs: [[0, 6, K.yellow], [6, 10, '#8E95B5']] }),
            T('퍼즐 모드', 8, 18, 90, 9, { font: 'GaeguB', color: K.cream, align: 'left' }),
            T('이동 횟수', cx(L.TEXT.moves.x) - 40, cy(52), 80, 8.5, { font: 'GaeguB', color: K.muted }),
            T('AI 최소', cx(L.TEXT.par.x) - 40, cy(52), 80, 8.5, { font: 'GaeguB', color: '#6C5BB8' }),
        ]);
    }
    // 대전 설정
    for (const mode of ['ai', 'pvp']) {
        const isAI = mode === 'ai';
        const items = [night(isAI ? 13 : 17, { lit: 0.2, skyH: 34 })];
        items.push(...heading(isAI ? 'AI와 대결' : '친구와 대결', '서로 다른 판이지만 최소 횟수는 똑같아요. 먼저 다 끄면 승! (3판 2선승)', 4));
        items.push(T(isAI ? 'AI 난이도' : '조작 방법', 140, 64, 200, 11, { font: 'GaeguB', color: K.cream }));
        if (!isAI) {
            const key = (t, x, y, w = 15) => [svg(w + 2, 18, sticker(1, 1, w, 13, 3, K.paper, 2, 1.4), x, y), T(t, x, y + 2.5, w + 2, 7.5)];
            for (const [k, x, c, keys, press, lab] of [[1, 48, K.sky, ['W', 'A', 'S', 'D'], 'SPACE', '1P · 왼쪽 판'], [2, 252, K.coral, ['↑', '←', '↓', '→'], 'ENTER', '2P · 오른쪽 판']]) {
                items.push(svg(182, 52, sticker(1, 1, 178, 46, 9, K.paper, 3) + rect(1, 1, 8, 46, { rx: 4, fill: c })));
                items[items.length - 1].x = x;
                items[items.length - 1].y = 78;
                items.push(T(lab, x + 14, 83, 160, 10, { align: 'left' }));
                keys.forEach((t, i) => items.push(...key(k === 2 ? ['위', '왼', '아래', '오'][i] : t, x + 14 + i * 18, 100, k === 2 ? 17 : 15)));
                items.push(T('이동', x + 90, 102, 20, 7.5, { font: 'Gowun', color: K.muted }));
                items.push(...key(press, x + 114, 100, 34));
                items.push(T('누르기', x + 151, 102, 26, 7.5, { font: 'Gowun', color: K.muted }));
            }
        }
        items.push(T('판 크기', 140, 140, 200, 11, { font: 'GaeguB', color: K.cream }));
        items.push(T(isAI ? 'AI는 매번 자기 판을 다시 풀어서 한 칸씩 눌러요. 따라 눌러도 소용없어요!' : '마우스로도 누를 수 있어요. 서로 다른 판이라 옆을 봐도 소용없어요!', 20, 252, 440, 9, { font: 'GaeguB', color: K.yellow2 }));
        add(`scr_vsset_${mode}`, 480, 270, items);
    }
    // 대전
    {
        // 대전 화면은 건물 위에 이름·남은 불 글자가 오므로 옥상 소품은 뺀다
        let s = building(L.BOARD.race1, K.sky, false, false) + building(L.BOARD.race2, K.coral, false, false);
        // 가운데 매달린 점수판 (라운드 글자 + 점수)
        s += path('M214 0V6M266 0V6', { stroke: K.ink, sw: 2 }) + sticker(192, 4, 96, 38, 8, K.paper, 3);
        s += sticker(cx(0) - 19, cy(L.TEXT.timer.y) - 8, 38, 16, 8, K.paper, 2, 1.6);
        add('scr_race', 480, 270, [night(8, { skyH: 22, lit: 0.1, skyTop: 214 }), svg(480, 270, s)]);
    }

    // ---------- 오버레이 ----------
    const dim = (op) => svg(480, 270, rect(0, 0, 480, 270, { fill: K.ink, op }));
    for (const n of [1, 2, 3]) {
        add(`ov_clear${n}`, 480, 270, [
            dim(0.55),
            svg(480, 270, sticker(90, 54, 300, 154, 14, K.paper, 5) + tape(214, 47, 52, -3, K.yellow)),
            T('스테이지 클리어', 140, 61, 200, 12, { font: 'GaeguB', color: K.muted }),
            T('불을 다 껐어요!', 120, 76, 240, 21),
            svg(140, 48, star(30, 28, 15, n >= 1) + star(70, 22, 19, n >= 2) + star(110, 28, 15, n >= 3), 170, 102),
        ]);
    }
    for (const t of ['3', '2', '1']) {
        add(`ov_c${t}`, 480, 270, [dim(0.3), svg(104, 108, circ(52, 56, 46, { fill: K.ink }) + circ(52, 52, 46, { fill: K.yellow, stroke: K.ink, sw: 3 }), 188, 81), T(t, 188, 100, 104, 60)]);
    }
    add('ov_cGO', 480, 270, [svg(132, 70, sticker(2, 2, 128, 62, 31, K.mint, 5, 3), 174, 100), T('시작!', 174, 107, 132, 36)]);
    const ribbon = (color) => svg(480, 270, path('M20 108H460L446 135L460 162H20L34 135Z', { fill: K.ink }) + path('M20 104H460L446 131L460 158H20L34 131Z', { fill: color, stroke: K.ink, sw: 2.5 }));
    for (const [k, color, small, big] of [
        ['p1', K.sky, '이번 판은…', '1P가 먼저 껐어요!'],
        ['p2', K.coral, '이번 판은…', '2P가 먼저 껐어요!'],
        ['you', K.yellow, '이번 판은…', '내가 먼저 껐어요!'],
        ['ai', K.lilac, '이번 판은…', 'AI가 먼저 껐어요'],
        ['draw', K.cream, '어머, 동시에!', '무승부! 한 판 더 해요'],
    ]) {
        add(`ov_r_${k}`, 480, 270, [dim(0.35), ribbon(color), T(small, 140, 108, 200, 11, { font: 'GaeguB', color: K.ink }), T(big, 60, 121, 360, 23)]);
    }
    const trophy = (c) => path('M14 8h20v8a10 10 0 0 1-20 0z', { fill: c, stroke: K.ink, sw: 2.2 }) + path('M14 11H8a6 6 0 0 0 6 8M34 11h6a6 6 0 0 1-6 8', { stroke: K.ink, sw: 2.2 })
        + rect(21, 26, 6, 7, { fill: c, stroke: K.ink, sw: 2 }) + rect(15, 33, 18, 6, { rx: 2, fill: K.wood, stroke: K.ink, sw: 2 });
    const sleepy = path('M30 8a16 16 0 1 0 12 26A13 13 0 0 1 30 8z', { fill: K.lilac, stroke: K.ink, sw: 2.2 }) + path('M33 6h6l-6 7h6', { stroke: K.ink, sw: 1.8 });
    for (const [k, color, ic, small, big] of [
        ['p1', K.sky, trophy(K.sky), '최종 결과', '1P 승리!'],
        ['p2', K.coral, trophy(K.coral), '최종 결과', '2P 승리!'],
        ['win', K.yellow, trophy(K.yellow), '최종 결과', 'AI를 이겼어요!'],
        ['lose', K.lilac, sleepy, '최종 결과', '아쉽게 졌어요'],
    ]) {
        add(`ov_m_${k}`, 480, 270, [
            dim(0.55),
            svg(480, 270, sticker(80, 42, 320, 172, 14, K.paper, 5) + tape(214, 35, 52, 3, color)),
            svg(48, 44, ic, 216, 50),
            T(small, 140, 94, 200, 12, { font: 'GaeguB', color: K.muted }),
            T(big, 100, 108, 280, 21),
        ]);
    }
    return specs;
}

/** 시트 배치: 큰 그림(480×270)은 4열 격자, 작은 그림은 아래에 줄 맞춰 채운다 (정수 좌표, 간격 10) */
function layoutSheet(specs) {
    const pos = {};
    const big = specs.filter((s) => s.w === 480);
    const small = specs.filter((s) => s.w !== 480);
    big.forEach((s, i) => { pos[s.name] = { x: (i % 4) * 490, y: Math.floor(i / 4) * 280, w: s.w, h: s.h }; });
    let x = 0;
    let y = Math.ceil(big.length / 4) * 280;
    let rowH = 0;
    const W = 1950;
    for (const s of small) {
        if (x + s.w > W) {
            x = 0;
            y += rowH + 10;
            rowH = 0;
        }
        pos[s.name] = { x, y, w: s.w, h: s.h };
        x += s.w + 10;
        rowH = Math.max(rowH, s.h);
    }
    return { pos, width: W, height: y + rowH };
}

if (typeof module !== 'undefined') {
    module.exports = { buildSpecs, layoutSheet };
}
