'use strict';
/**
 * entrygen — 엔트리(Entry) 작품(project.json)을 코드로 생성하는 작은 DSL.
 *
 * 엔트리 블록 JSON 구조(entryjs 소스 기준):
 *   { id, type, params: [...], statements: [[...블록]] }
 * 스레드(스크립트 묶음)는 블록 배열이고, 첫 블록이 이벤트 블록이다.
 * 오브젝트의 script 는 스레드 배열을 JSON 문자열로 저장한다.
 */

const usedIds = new Set();
function hash(len = 4) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (;;) {
        let s = '';
        for (let i = 0; i < len; i++) {
            s += chars[Math.floor(Math.random() * chars.length)];
        }
        if (!/^[0-9]/.test(s) && !usedIds.has(s)) {
            usedIds.add(s);
            return s;
        }
    }
}

let P = null; // 현재 빌드 중인 프로젝트

function blk(type, params = [], statements) {
    const b = { id: hash(), type, params };
    if (statements) {
        b.statements = statements;
    }
    return b;
}

/** JS 값 → 엔트리 값 블록 */
function val(x) {
    if (x === undefined || x === null) {
        throw new Error('undefined value block');
    }
    if (typeof x === 'number') {
        if (!Number.isFinite(x)) {
            throw new Error('non-finite number');
        }
        return blk('number', [String(x)]);
    }
    if (typeof x === 'string') {
        return blk('text', [x]);
    }
    if (typeof x === 'boolean') {
        return blk(x ? 'True' : 'False', [null]);
    }
    if (x && x.type) {
        return x;
    }
    throw new Error(`bad value: ${JSON.stringify(x)}`);
}

// ---------- 계산 ----------
const calc = (a, op, b) => blk('calc_basic', [val(a), op, val(b)]);
const add = (a, b) => calc(a, 'PLUS', b);
const sub = (a, b) => calc(a, 'MINUS', b);
const mul = (a, b) => calc(a, 'MULTI', b);
const div = (a, b) => calc(a, 'DIVIDE', b);
const mathOp = (op, a) => blk('calc_operation', [null, val(a), null, op]);
const sqrt = (a) => mathOp('root', a);
const abs = (a) => mathOp('abs', a);
const floor = (a) => mathOp('floor', a);
const round = (a) => mathOp('round', a);
const sq = (a) => mathOp('square', a);
const mod = (a, b) => blk('quotient_and_mod', [null, val(a), null, val(b), null, 'MOD']);
const quot = (a, b) => blk('quotient_and_mod', [null, val(a), null, val(b), null, 'QUOTIENT']);
const join = (...parts) => {
    if (parts.length === 1) {
        return val(parts[0]);
    }
    let acc = val(parts[parts.length - 1]);
    for (let i = parts.length - 2; i >= 0; i--) {
        acc = blk('combine_something', [null, val(parts[i]), null, acc, null]);
    }
    return acc;
};
const mouseX = () => blk('coordinate_mouse', [null, 'x', null]);
const mouseY = () => blk('coordinate_mouse', [null, 'y', null]);
const answer = () => blk('get_canvas_input_value', [null]);
const isNumber = (a) => blk('is_type', [val(a), null, 'number', null]);
const lenStr = (a) => blk('length_of_string', [null, val(a), null]);
/** 정수 두 개면 양 끝을 포함한 정수 난수, 하나라도 소수면 소수 둘째 자리 난수 */
const rand = (a, b) => blk('calc_rand', [null, val(a), null, val(b), null]);
/** 글자 추출(1부터). 범위를 벗어나면 엔트리가 오류를 낸다 */
const charAt = (s, i) => blk('char_at', [null, val(s), null, val(i), null]);
const sin = (deg) => mathOp('sin', deg);

// ---------- 판단 ----------
const cmp = (a, op, b) => blk('boolean_basic_operator', [val(a), op, val(b)]);
const eq = (a, b) => cmp(a, 'EQUAL', b);
const ne = (a, b) => cmp(a, 'NOT_EQUAL', b);
const gt = (a, b) => cmp(a, 'GREATER', b);
const lt = (a, b) => cmp(a, 'LESS', b);
const ge = (a, b) => cmp(a, 'GREATER_OR_EQUAL', b);
const le = (a, b) => cmp(a, 'LESS_OR_EQUAL', b);
const and = (...xs) => xs.reduce((acc, x) => blk('boolean_and_or', [acc, 'AND', x]));
const or = (...xs) => xs.reduce((acc, x) => blk('boolean_and_or', [acc, 'OR', x]));
const not = (a) => blk('boolean_not', [null, a, null]);
const mouseDown = () => blk('is_clicked', [null]);
const keyDown = (code) => blk('is_press_some_key', [String(code), null]);

// ---------- 변수 / 리스트 ----------
function varId(name) {
    const v = P.vars[name];
    if (!v) {
        throw new Error(`unknown variable ${name}`);
    }
    return v.id;
}
function listId(name) {
    const v = P.lists[name];
    if (!v) {
        throw new Error(`unknown list ${name}`);
    }
    return v.id;
}
const v = (name) => blk('get_variable', [varId(name), null]);
const setv = (name, x) => blk('set_variable', [varId(name), val(x), null]);
const chgv = (name, x) => blk('change_variable', [varId(name), val(x), null]);
const item = (list, i) => blk('value_of_index_from_list', [null, listId(list), null, val(i), null]);
const setItem = (list, i, x) => blk('change_value_list_index', [listId(list), val(i), val(x), null]);
const addItem = (list, x) => blk('add_value_to_list', [val(x), listId(list), null]);
const delItem = (list, i) => blk('remove_value_from_list', [val(i), listId(list), null]);
const listLen = (list) => blk('length_of_list', [null, listId(list), null]);
const showList = (list) => blk('show_list', [listId(list), null]);
const hideList = (list) => blk('hide_list', [listId(list), null]);

// ---------- 흐름 ----------
const If = (c, body) => blk('_if', [c, null], [body]);
const IfElse = (c, a, b) => blk('if_else', [c, null, null], [a, b]);
const Forever = (body) => blk('repeat_inf', [null, null], [body]);
const Repeat = (n, body) => blk('repeat_basic', [val(n), null], [body]);
const Until = (c, body) => blk('repeat_while_true', [c, 'until', null], [body]);
const Wait = (s) => blk('wait_second', [val(s), null]);
const WaitUntil = (c) => blk('wait_until_true', [c, null]);
const StopThis = () => blk('stop_object', ['thisThread', null]);
const StopAll = () => blk('stop_object', ['all', null]);
const Clone = (target = 'self') => blk('create_clone', [target, null]);
const DeleteClone = () => blk('delete_clone', [null]);
const Ask = (q) => blk('ask_and_wait', [val(q), null]);
const HideAnswer = () => blk('set_visible_answer', ['HIDE', null]);

// ---------- 신호 ----------
function msgId(name) {
    const m = P.messages[name];
    if (!m) {
        throw new Error(`unknown message ${name}`);
    }
    return m.id;
}
const send = (name) => blk('message_cast', [msgId(name), null]);
const sendWait = (name) => blk('message_cast_wait', [msgId(name), null]);

// ---------- 이벤트 (스레드 시작) ----------
const onStart = (...body) => [blk('when_run_button_click', [null]), ...body];
const onMsg = (name, ...body) => [blk('when_message_cast', [null, msgId(name)]), ...body];
const onClone = (...body) => [blk('when_clone_start', [null]), ...body];
const onKey = (code, ...body) => [blk('when_some_key_pressed', [null, String(code)]), ...body];
const onObjClick = (...body) => [blk('when_object_click', [null]), ...body];
const onMouseDown = (...body) => [blk('mouse_clicked', [null]), ...body];

// ---------- 움직임 / 생김새 / 붓 / 글상자 ----------
const goXY = (x, y) => blk('locate_xy', [val(x), val(y), null]);
const show = () => blk('show', [null]);
const hide = () => blk('hide', [null]);
const setSize = (s) => blk('set_scale_size', [val(s), null]);
const shape = (pictureRef) => blk('change_to_some_shape', [pictureRef, null]);
const shapeByName = (objName, picName) =>
    blk('get_pictures', [P.pictureId(objName, picName)]);
const setEffect = (eff, x) => blk('change_effect_amount', [eff, val(x), null]); // '~효과를 ~(으)로 정하기' (set_effect_amount 는 '더하기')
const clearEffects = () => blk('erase_all_effects', [null]);
const toFront = () => blk('change_object_index', ['FRONT', null]);
const penDown = () => blk('start_drawing', [null]);
const penUp = () => blk('stop_drawing', [null]);
// 문자열(#rrggbb)이면 색 선택 블록, 값 블록이면 그대로 (값 블록을 색 블록으로 감싸면 검은색이 된다)
const penColor = (c) => blk('set_color', [typeof c === 'string' ? blk('color', [c]) : c, null]);
const penSize = (x) => blk('set_thickness', [val(x), null]);
const penAlpha = (x) => blk('set_brush_tranparency', [val(x), null]);
const penClear = () => blk('brush_erase_all', [null]);
const write = (x) => blk('text_write', [val(x), null]);
/** 소리 재생: 오브젝트의 소리 이름(문자열 값 블록도 가능) */
const playSound = (x) => blk('sound_something_with_block', [val(x), null]);
const changeSize = (x) => blk('change_scale_size', [val(x), null]);

// ---------- 함수 ----------
/**
 * 사용자 정의 함수 정의.
 * spec: ['라벨', {param:'이름'}, '라벨', ...]
 * body(params) → 블록 배열. params.이름 으로 매개변수 값 블록을 얻는다.
 */
function defineFunction(name, spec, bodyFn, opt = {}) {
    const id = hash();
    const locals = {};
    for (const ln of opt.locals || []) {
        locals[ln] = `${id}_${hash()}`;
    }
    const paramTypes = {};
    const fields = spec.map((s) => {
        if (typeof s === 'string') {
            return { type: 'function_field_label', value: s };
        }
        const t = `stringParam_${hash()}`;
        paramTypes[s.param] = t;
        return { type: 'function_field_string', paramType: t };
    });
    // 필드 체인(뒤에서부터 연결)
    let next = null;
    for (let i = fields.length - 1; i >= 0; i--) {
        const f = fields[i];
        const b =
            f.type === 'function_field_label'
                ? blk('function_field_label', [f.value, next])
                : blk('function_field_string', [blk(f.paramType, []), next]);
        next = b;
    }
    const paramCount = fields.filter((f) => f.type === 'function_field_string').length;
    const fn = { id, name, spec, paramTypes, paramCount, fieldChain: next, bodyFn, locals };
    P.functions[name] = fn;
    return fn;
}
/** 함수 지역 변수 읽기/쓰기 — 일반 변수와 달리 값 변경 시 화면 표시 비용이 없다 */
function lget(fnName, lname) {
    const fn = P.functions[fnName];
    const id = fn.locals[lname];
    if (!id) {
        throw new Error(`unknown local ${fnName}.${lname}`);
    }
    return blk('get_func_variable', [id, null]);
}
function lset(fnName, lname, x) {
    const fn = P.functions[fnName];
    const id = fn.locals[lname];
    if (!id) {
        throw new Error(`unknown local ${fnName}.${lname}`);
    }
    return blk('set_func_variable', [id, val(x), null]);
}
function param(fnName, pname) {
    const fn = P.functions[fnName];
    return blk(fn.paramTypes[pname], []);
}
function call(fnName, ...args) {
    const fn = P.functions[fnName];
    if (!fn) {
        throw new Error(`unknown function ${fnName}`);
    }
    if (args.length !== fn.paramCount) {
        throw new Error(`function ${fnName} expects ${fn.paramCount} args`);
    }
    return blk(`func_${fn.id}`, [...args.map(val), null]);
}

// ---------- 프로젝트 ----------
class Project {
    constructor() {
        this.vars = {};
        this.lists = {};
        this.messages = {};
        this.functions = {};
        this.objects = [];
        this.sceneId = hash();
        P = this;
    }
    variable(name, value = 0, opt = {}) {
        if (this.vars[name]) {
            throw new Error(`duplicate variable ${name}`); // 이름으로 찾으므로 같은 이름은 덮어써진다
        }
        this.vars[name] = {
            name,
            id: hash(),
            visible: !!opt.visible,
            value: String(value),
            variableType: 'variable',
            isCloud: false,
            isRealTime: false,
            cloudDate: false,
            object: opt.object || null,
            x: opt.x ?? 0,
            y: opt.y ?? 0,
        };
        return this.vars[name].id;
    }
    list(name, array = [], opt = {}) {
        this.lists[name] = {
            name,
            id: hash(),
            visible: !!opt.visible,
            value: 0,
            variableType: 'list',
            isCloud: false,
            isRealTime: false,
            cloudDate: false,
            object: opt.object || null,
            array: array.map((d) => ({ data: String(d) })),
            x: opt.x ?? -230,
            y: opt.y ?? 120,
            width: opt.width ?? 100,
            height: opt.height ?? 120,
        };
        return this.lists[name].id;
    }
    message(name) {
        this.messages[name] = { name, id: hash() };
        return this.messages[name].id;
    }
    /** 오브젝트 id 를 미리 확보(지역 변수 선언용) */
    reserveObject(name) {
        const id = hash();
        this._reserved = this._reserved || {};
        this._reserved[name] = id;
        return id;
    }
    pictureId(objName, picName) {
        const o = this.objects.find((x) => x.name === objName);
        if (!o) {
            throw new Error(`unknown object ${objName}`);
        }
        const p = o.sprite.pictures.find((x) => x.name === picName);
        if (!p) {
            throw new Error(`unknown picture ${objName}/${picName}`);
        }
        return p.id;
    }
    /**
     * pictures: [{name, file, thumb?, width, height}] · sounds: [{name, file, duration}] (file 은 상대 경로)
     */
    sprite({ name, pictures, sounds = [], entity = {}, rotateMethod = 'none' }) {
        const id = (this._reserved && this._reserved[name]) || hash();
        const pics = pictures.map((p) => ({
            id: hash(),
            name: p.name,
            _file: p.file,
            _thumb: p.thumb,
            imageType: 'png',
            dimension: { width: p.width, height: p.height },
        }));
        const first = pictures[0];
        const scale = entity.scale ?? 1;
        const obj = {
            id,
            name,
            script: null,
            objectType: 'sprite',
            rotateMethod,
            scene: this.sceneId,
            sprite: {
                pictures: pics,
                sounds: sounds.map((x) => ({ id: hash(), name: x.name, _file: x.file, ext: '.mp3', duration: x.duration })),
            },
            selectedPictureId: pics[0].id,
            lock: false,
            entity: {
                x: entity.x ?? 0,
                y: entity.y ?? 0,
                regX: first.width / 2,
                regY: first.height / 2,
                scaleX: scale,
                scaleY: scale,
                rotation: 0,
                direction: 90,
                width: first.width,
                height: first.height,
                font: 'undefinedpx ',
                visible: entity.visible ?? true,
            },
            _threads: [],
        };
        this.objects.push(obj);
        return obj;
    }
    textBox({ name, text = '', x = 0, y = 0, width = 100, height = 20, fontSize = 10,
        font = 'Nanum Gothic', bold = false, colour = '#FFFFFF', bgColor = 'transparent',
        align = 1, lineBreak = false, visible = true }) {
        const id = hash();
        const obj = {
            id,
            name,
            script: null,
            objectType: 'textBox',
            rotateMethod: 'none',
            scene: this.sceneId,
            sprite: { pictures: [], sounds: [] },
            text,
            lock: false,
            entity: {
                x,
                y,
                regX: width / 2,
                regY: height / 2,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                direction: 90,
                width,
                height,
                font: `${bold ? 'bold ' : ''}${fontSize}px ${font}`,
                visible,
                colour,
                text,
                textAlign: align,
                lineBreak,
                bgColor,
                underLine: false,
                strike: false,
                fontSize,
            },
            _threads: [],
        };
        this.objects.push(obj);
        return obj;
    }
    /** 오브젝트에 스레드 추가 (자동 배치) */
    addThread(obj, thread) {
        obj._threads.push(thread);
    }
    build() {
        // 함수 본문 생성 (본문에서 다른 함수를 호출할 수 있으므로 모두 정의된 뒤 생성)
        const functions = Object.values(this.functions).map((fn) => {
            const body = fn.bodyFn();
            const create = blk('function_create', [fn.fieldChain, null], [body]);
            create.x = 40;
            create.y = 40;
            return {
                id: fn.id,
                type: 'normal',
                localVariables: Object.entries(fn.locals).map(([name, lid]) => ({ name, value: 0, id: lid })),
                useLocalVariables: Object.keys(fn.locals).length > 0,
                content: JSON.stringify([[create]]),
            };
        });
        const objects = this.objects.map((o) => {
            let y = 40;
            const threads = o._threads.map((t) => {
                t[0].x = 40;
                t[0].y = y;
                y += countBlocks(t) * 30 + 60;
                return t;
            });
            const { _threads, ...rest } = o;
            rest.script = JSON.stringify(threads);
            return rest;
        });
        const variables = [
            {
                name: '초시계',
                id: hash(),
                visible: false,
                value: '0',
                variableType: 'timer',
                isCloud: false,
                isRealTime: false,
                cloudDate: false,
                object: null,
                x: 134,
                y: -70,
            },
            {
                name: '대답',
                id: hash(),
                visible: false,
                value: '0',
                variableType: 'answer',
                isCloud: false,
                isRealTime: false,
                cloudDate: false,
                object: null,
                x: 150,
                y: -100,
            },
            ...Object.values(this.vars),
            ...Object.values(this.lists),
        ];
        return {
            objects,
            scenes: [{ id: this.sceneId, name: '장면 1' }],
            variables,
            messages: Object.values(this.messages),
            functions,
            tables: [],
            speed: 60,
            interface: { canvasWidth: 480, menuWidth: 280, object: objects[0].id },
            expansionBlocks: [],
            aiUtilizeBlocks: [],
            hardwareLiteBlocks: [],
            externalModules: [],
            externalModulesLite: [],
        };
    }
}

function countBlocks(thread) {
    let n = 0;
    for (const b of thread) {
        n += 1;
        if (b.statements) {
            for (const s of b.statements) {
                n += countBlocks(s);
            }
        }
    }
    return n;
}

module.exports = {
    Project, hash, blk, val,
    add, sub, mul, div, mathOp, sqrt, abs, floor, round, sq, mod, quot, join,
    mouseX, mouseY, answer, isNumber, lenStr, rand, charAt, sin,
    eq, ne, gt, lt, ge, le, and, or, not, mouseDown, keyDown,
    v, setv, chgv, item, setItem, addItem, delItem, listLen, showList, hideList,
    If, IfElse, Forever, Repeat, Until, Wait, WaitUntil, StopThis, StopAll, Clone, DeleteClone,
    Ask, HideAnswer, send, sendWait,
    onStart, onMsg, onClone, onKey, onObjClick, onMouseDown,
    goXY, show, hide, setSize, shape, shapeByName, setEffect, clearEffects, toFront,
    penDown, penUp, penColor, penSize, penAlpha, penClear, write, playSound, changeSize,
    defineFunction, param, call, lget, lset,
    countBlocks,
};
