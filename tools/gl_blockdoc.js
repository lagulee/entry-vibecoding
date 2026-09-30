'use strict';
/**
 * project.json → 엔트리 블록 표기 문서(Markdown)
 * 엔트리 한국어 블록 문구(tools/entry_block_templates.ko.json)를 그대로 써서
 * "어떤 블록을 어떻게 연결하는지"를 사람이 따라 만들 수 있게 보여 준다.
 *
 *   [명령 블록]   (값 블록)   <판단 블록>
 */
const TPL = require('./entry_block_templates.ko.json');

const KEY_NAMES = { 32: '스페이스', 78: 'n', 82: 'r', 13: '엔터' };

function makeRenderer(project, meta) {
    const names = {};
    for (const v of project.variables) {
        names[v.id] = v.name;
    }
    for (const m of project.messages) {
        names[m.id] = m.name;
    }
    for (const o of project.objects) {
        names[o.id] = o.name;
        for (const p of o.sprite.pictures || []) {
            names[p.id] = p.name;
        }
    }
    const funcs = {};
    const paramNames = {};
    for (const f of project.functions) {
        for (const lv of f.localVariables || []) {
            names[lv.id] = lv.name;
        }
        const m = meta.functions[f.id] || {};
        funcs[f.id] = m;
        for (const [pn, type] of Object.entries(m.paramTypes || {})) {
            paramNames[type] = pn;
        }
    }

    function funcTitle(id, args) {
        const m = funcs[id];
        if (!m) {
            return `함수 ${id}`;
        }
        let k = 0;
        return m.spec.map((s) => (typeof s === 'string' ? s : (args ? args[k++] : `(${s.param})`))).join(' ');
    }

    function value(b) {
        if (b === null || b === undefined) {
            return '';
        }
        if (typeof b !== 'object') {
            return String(b);
        }
        if (b.type === 'number' || b.type === 'text' || b.type === 'angle') {
            const t = String(b.params[0]).replace(/\n/g, '⏎');
            return `(${t})`;
        }
        if (b.type === 'True') {
            return '<참>';
        }
        if (b.type === 'color' || b.type === 'text_color') {
            return `(색 ${b.params[0]})`;
        }
        if (b.type.startsWith('stringParam_')) {
            return `(${paramNames[b.type] || '매개변수'})`;
        }
        if (b.type.startsWith('func_')) {
            return `[${funcTitle(b.type.slice(5), b.params.slice(0, -1).map(value))}]`;
        }
        const body = fill(b);
        const kind = TPL[b.type] && /boolean/.test(TPL[b.type].skeleton || '') ? 'bool' : 'val';
        return kind === 'bool' ? `<${body}>` : `(${body})`;
    }

    function fill(b) {
        const t = TPL[b.type];
        if (!t) {
            return `${b.type} ${(b.params || []).map(value).join(' ')}`;
        }
        let s = t.template;
        (t.params || []).forEach((p, i) => {
            const raw = b.params ? b.params[i] : null;
            let out = '';
            switch (p.type) {
                case 'Indicator':
                case 'LineBreak':
                case 'Output':
                    out = '';
                    break;
                case 'Text':
                    out = p.text || '';
                    break;
                case 'Dropdown': {
                    const o = (p.options || []).find((x) => x[1] === raw);
                    out = o ? o[0] : String(raw ?? '');
                    break;
                }
                case 'DropdownDynamic':
                    out = raw === 'self' ? '자신' : (names[raw] || String(raw ?? ''));
                    out = `[${out}]`;
                    break;
                case 'Keyboard':
                    out = KEY_NAMES[raw] || String(raw);
                    break;
                case 'TextInput':
                    out = String(raw ?? '');
                    break;
                default:
                    out = value(raw);
            }
            s = s.replace(`%${i + 1}`, out);
        });
        return s.replace(/%\d+/g, '').replace(/\s+/g, ' ').trim();
    }

    function stmt(b, depth, lines) {
        const pad = '  '.repeat(depth);
        let text;
        if (b.type.startsWith('func_')) {
            text = funcTitle(b.type.slice(5), b.params.slice(0, -1).map(value));
        } else {
            text = fill(b);
            if (b.type === 'if_else') {
                text = text.replace(/\s*아니면$/, '');
            }
        }
        lines.push(`${pad}[${text}]`);
        (b.statements || []).forEach((st, k) => {
            if (k > 0) {
                lines.push(`${pad}[아니면]`);
            }
            for (const c of st || []) {
                stmt(c, depth + 1, lines);
            }
        });
    }

    function thread(t) {
        const lines = [];
        t.forEach((b, i) => stmt(b, i === 0 ? 0 : 1, lines));
        return lines.join('\n');
    }
    return { thread, funcTitle };
}

function renderProjectDoc(project, meta, title = 'GRAVITY LAB', builder = 'tools/build_gravity_lab.js') {
    const R = makeRenderer(project, meta);
    const out = [];
    out.push(`# ${title} — 전체 블록 목록 (자동 생성)`);
    out.push('');
    out.push(`\`${builder}\` 가 만든 작품의 모든 스크립트를 엔트리 블록 문구로 옮긴 것입니다.`);
    out.push('표기: `[명령 블록]` · `(값 블록)` · `<판단 블록>` · 들여쓰기 = 블록 안쪽에 끼워 넣기, `[아니면]` = 만약-아니면 블록의 아래칸.');
    out.push('');
    out.push('## 오브젝트별 스크립트');
    for (const o of project.objects) {
        const threads = JSON.parse(o.script);
        out.push('');
        out.push(`### ${o.name} (${o.objectType === 'textBox' ? '글상자' : '오브젝트'})`);
        threads.forEach((t, i) => {
            out.push('');
            out.push(`스크립트 ${i + 1}`);
            out.push('```');
            out.push(R.thread(t));
            out.push('```');
        });
    }
    out.push('');
    out.push('## 사용자 정의 함수');
    for (const f of project.functions) {
        const m = meta.functions[f.id] || {};
        const content = JSON.parse(f.content)[0][0];
        const locals = (f.localVariables || []).map((l) => l.name);
        out.push('');
        out.push(`### [${R.funcTitle(f.id)}]`);
        if (locals.length) {
            out.push(`지역 변수: ${locals.join(', ')}`);
        }
        out.push('```');
        out.push(`[함수 정의하기 ${m.spec ? m.spec.map((s) => (typeof s === 'string' ? s : `(${s.param})`)).join(' ') : ''}]`);
        const body = [];
        for (const b of (content.statements && content.statements[0]) || []) {
            body.push(b);
        }
        const lines = R.thread([{ type: '__head', params: [] }, ...body]).split('\n').slice(1);
        out.push(lines.join('\n'));
        out.push('```');
    }
    return out.join('\n');
}

module.exports = { renderProjectDoc };
