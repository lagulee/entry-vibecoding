'use strict';
/**
 * HEX — 효과음 합성기 (코드로 파형을 만들고 lamejs 로 MP3 인코딩)
 * 사용: node tools/hex_sound.js <출력폴더>
 * lamejs 는 선택 의존성: 없으면 저장소의 assets 폴더에 있는 MP3 를 그대로 쓴다.
 */
const fs = require('fs');
const path = require('path');

const RATE = 44100;

function render(dur, fn) {
    const n = Math.floor(dur * RATE);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = fn(i / RATE);
    }
    return out;
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// 나무 돌 "톡"
function tok(freq, dur = 0.16) {
    return render(dur, (t) => {
        const body = Math.sin(2 * Math.PI * freq * t) * env(t, 0.002, 0.035) * 0.8;
        const over = Math.sin(2 * Math.PI * freq * 2.7 * t) * env(t, 0.001, 0.012) * 0.35;
        const click = noise() * env(t, 0.0005, 0.004) * 0.35;
        return body + over + click;
    });
}
// 종소리 음표
function bell(freq, t, len) {
    if (t < 0) {
        return 0;
    }
    const e = env(t, 0.004, len);
    return (Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.22 + Math.sin(2 * Math.PI * freq * 3.01 * t) * 0.1) * e;
}
function arpeggio(notes, gap, len, tail = 0.9) {
    const dur = gap * notes.length + tail;
    return render(dur, (t) => notes.reduce((s, f, k) => s + bell(f, t - k * gap, len) * 0.55, 0));
}
const NOTE = (m) => 440 * 2 ** ((m - 69) / 12);

const SOUNDS = {
    place: () => tok(820),
    place2: () => tok(640),
    click: () => render(0.07, (t) => Math.sin(2 * Math.PI * 1500 * t) * env(t, 0.001, 0.012) * 0.5),
    undo: () => render(0.18, (t) => Math.sin(2 * Math.PI * (900 - 2600 * t) * t) * env(t, 0.004, 0.05) * 0.45),
    win: () => arpeggio([72, 76, 79, 84, 88].map(NOTE), 0.09, 0.35, 1.0),
    lose: () => arpeggio([67, 63, 60, 55].map(NOTE), 0.16, 0.3, 0.8),
    start: () => arpeggio([67, 74, 79].map(NOTE), 0.07, 0.18, 0.4),
};

function encodeMp3(samples) {
    // lamejs 1.2.1 의 모듈 버전은 엄격 모드에서 깨지므로 합본(lame.all.js)을 느슨한 모드로 불러온다
    const vm = require('vm');
    const code = fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8');
    const ctx = {};
    vm.runInNewContext(`${code}\nthis.lamejs = lamejs;`, ctx);
    const lamejs = ctx.lamejs;
    const enc = new lamejs.Mp3Encoder(1, RATE, 128);
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, samples[i] * 0.9)) * 32767;
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
    const manifest = {};
    for (const [name, fn] of Object.entries(SOUNDS)) {
        const s = fn();
        fs.writeFileSync(path.join(outDir, `${name}.mp3`), encodeMp3(s));
        manifest[name] = { file: `${name}.mp3`, duration: Math.round((s.length / RATE) * 10) / 10 };
    }
    fs.writeFileSync(path.join(outDir, 'sounds.json'), JSON.stringify(manifest, null, 1));
    return manifest;
}

module.exports = { build, SOUNDS };

if (require.main === module) {
    const m = build(process.argv[2] || 'assets/hex');
    console.log('sounds', Object.keys(m).join(', '));
}
