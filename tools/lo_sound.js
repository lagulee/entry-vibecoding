'use strict';
/**
 * LIGHTS OUT — 효과음 합성기
 * 간단한 신시사이저(사인·삼각파 + 엔벨로프)로 PCM 을 만든 뒤 lamejs 로 MP3 인코딩한다.
 * 사용: node tools/lo_sound.js <출력폴더>   → <이름>.mp3 + sounds.json(길이)
 */
const fs = require('fs');
const path = require('path');

const RATE = 44100;
const note = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI 번호 → Hz

function render(dur, voices) {
    const N = Math.round(dur * RATE);
    const out = new Float32Array(N);
    for (const v of voices) {
        const { f0, f1 = f0, t0 = 0, len, amp = 0.4, wave = 'sine', attack = 0.004, decay = 6 } = v;
        const s0 = Math.round(t0 * RATE);
        const n = Math.round(len * RATE);
        let ph = 0;
        for (let i = 0; i < n && s0 + i < N; i++) {
            const t = i / RATE;
            const f = f0 + (f1 - f0) * (i / n);
            ph += (2 * Math.PI * f) / RATE;
            let x = Math.sin(ph);
            if (wave === 'tri') {
                x = (2 / Math.PI) * Math.asin(Math.sin(ph));
            } else if (wave === 'soft') {
                x = Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph);
            }
            const env = Math.min(1, t / attack) * Math.exp(-decay * t) * Math.min(1, (n - i) / (RATE * 0.01));
            out[s0 + i] += x * env * amp;
        }
    }
    return out;
}

const SOUNDS = {
    // 칸 누름 (사람)
    tick: () => render(0.12, [{ f0: 1180, f1: 820, len: 0.1, amp: 0.35, wave: 'soft', decay: 38 }, { f0: 2400, len: 0.03, amp: 0.08, decay: 90 }]),
    // 칸 누름 (AI)
    aitick: () => render(0.13, [{ f0: 620, f1: 480, len: 0.12, amp: 0.38, wave: 'tri', decay: 30 }]),
    // 버튼
    btn: () => render(0.09, [{ f0: 760, f1: 900, len: 0.08, amp: 0.25, wave: 'soft', decay: 40 }]),
    // 힌트
    hint: () => render(0.5, [{ f0: note(84), len: 0.45, amp: 0.22, decay: 7 }, { f0: note(88), t0: 0.09, len: 0.4, amp: 0.22, decay: 7 }]),
    // 스테이지 클리어
    clear: () => render(1.0, [72, 76, 79, 84].map((m, k) => ({ f0: note(m), t0: k * 0.09, len: 0.7, amp: 0.2, wave: 'soft', decay: 5 }))
        .concat([{ f0: note(96), t0: 0.36, len: 0.5, amp: 0.06, decay: 6 }])),
    // 카운트다운
    beep: () => render(0.2, [{ f0: note(76), len: 0.18, amp: 0.3, wave: 'tri', decay: 12 }]),
    go: () => render(0.45, [{ f0: note(83), len: 0.4, amp: 0.28, wave: 'tri', decay: 5 }, { f0: note(88), len: 0.4, amp: 0.14, wave: 'sine', decay: 5 }]),
    // 라운드 승리 / 패배
    round: () => render(0.55, [{ f0: note(79), len: 0.2, amp: 0.25, wave: 'soft', decay: 8 }, { f0: note(84), t0: 0.12, len: 0.4, amp: 0.25, wave: 'soft', decay: 6 }]),
    // 대전 승리 팡파르 / 패배
    win: () => render(1.4, [
        { f0: note(67), t0: 0, len: 0.2, amp: 0.2, wave: 'soft', decay: 6 },
        { f0: note(72), t0: 0.15, len: 0.2, amp: 0.2, wave: 'soft', decay: 6 },
        { f0: note(76), t0: 0.3, len: 0.2, amp: 0.2, wave: 'soft', decay: 6 },
        { f0: note(79), t0: 0.45, len: 0.9, amp: 0.22, wave: 'soft', decay: 3 },
        { f0: note(84), t0: 0.45, len: 0.9, amp: 0.12, wave: 'sine', decay: 3 },
        { f0: note(76), t0: 0.45, len: 0.9, amp: 0.1, wave: 'sine', decay: 3 },
    ]),
    lose: () => render(1.0, [
        { f0: note(72), t0: 0, len: 0.3, amp: 0.22, wave: 'tri', decay: 5 },
        { f0: note(68), t0: 0.22, len: 0.3, amp: 0.22, wave: 'tri', decay: 5 },
        { f0: note(65), t0: 0.44, len: 0.55, amp: 0.24, wave: 'tri', decay: 4 },
    ]),
};

function toMp3(samples) {
    // lamejs 1.2.1 의 모듈 진입점은 Node 에서 MPEGMode 오류가 나므로, 묶음 빌드(lame.all.js)를 샌드박스에서 불러온다
    const ctx = { console };
    require('vm').runInNewContext(fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8'), ctx);
    const lamejs = ctx.lamejs;
    const enc = new lamejs.Mp3Encoder(1, RATE, 96);
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 32767;
    }
    const chunks = [];
    for (let i = 0; i < pcm.length; i += 1152) {
        const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
        if (b.length) {
            chunks.push(Buffer.from(b));
        }
    }
    const end = enc.flush();
    if (end.length) {
        chunks.push(Buffer.from(end));
    }
    return Buffer.concat(chunks);
}

function build(outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const meta = {};
    for (const [name, fn] of Object.entries(SOUNDS)) {
        const s = fn();
        fs.writeFileSync(path.join(outDir, `${name}.mp3`), toMp3(s));
        meta[name] = { file: `${name}.mp3`, duration: Math.round((s.length / RATE) * 10) / 10 || 0.1 };
    }
    fs.writeFileSync(path.join(outDir, 'sounds.json'), JSON.stringify(meta, null, 1));
    return meta;
}

module.exports = { build, SOUNDS };

if (require.main === module) {
    const m = build(process.argv[2] || 'assets/lights_out/sound');
    console.log('sounds', Object.keys(m).join(', '));
}
