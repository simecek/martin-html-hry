const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../jablka.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Malá náhrada prohlížeče: skutečný herní kód běží bez instalace knihoven.
function game(realMasks = false) {
    const events = {};
    const timers = new Map();
    let nextTimer = 0;
    function image() {
        const img = {
            width: 32, height: 32, style: {}, className: "jablko", dataset: { maska: "jablko" },
            alt: "Padající jablíčko", cloneNode: image,
            remove() {
                this.removed = true;
                const index = nodes.hriste.children.indexOf(this);
                if (index !== -1) nodes.hriste.children.splice(index, 1);
            }
        };
        img.classList = {
            add(name) { img.className += " " + name; },
            contains(name) { return img.className.split(" ").includes(name); }
        };
        return img;
    }
    const buttonEvents = {};
    const touchEvents = {};
    function arrow(id) {
        touchEvents[id] = {};
        return {
            addEventListener(type, fn) { touchEvents[id][type] = fn; },
            setPointerCapture(pointerId) { this.captured = pointerId; }
        };
    }
    const nodes = {
        doleva: arrow("doleva"), doprava: arrow("doprava"),
        hriste: {
            clientWidth: 400, clientHeight: 400, children: [],
            appendChild(child) { this.children.push(child); }
        },
        panacek: { width: 80, height: 80, style: {}, dataset: { maska: "panacek" } },
        skore: { textContent: "0" },
        "pocet-jablek": { textContent: "1" },
        "sablona-jablka": { content: { firstElementChild: image() } },
        "konec-hry": { hidden: true },
        "nova-hra": {
            hidden: true,
            addEventListener(type, fn) { buttonEvents[type] = fn; }
        }
    };
    const math = Object.create(Math);
    math.random = () => 0.5;
    const context = vm.createContext({
        Math: math,
        document: {
            getElementById: id => nodes[id],
            addEventListener(type, fn) { events[type] = fn; }
        },
        window: { addEventListener(type, fn) { events[type] = fn; } },
        setInterval(fn, ms) {
            const id = ++nextTimer;
            timers.set(id, { fn, ms });
            return id;
        },
        clearInterval(id) { timers.delete(id); }
    });
    const run = code => vm.runInContext(code, context);
    // Původní testy pravidel používají plné obdélníky; masky testujeme zvlášť.
    run(realMasks
        ? fs.readFileSync(path.join(__dirname, "../assets/kolizni-masky.js"), "utf8")
        : 'const kolizniMasky={panacek:Array(80).fill("1".repeat(80)),jablko:Array(32).fill("1".repeat(32))}');
    run(script);
    return {
        nodes, timers, run,
        tick: () => run("krok()"),
        press: (key, extra = {}) => events.keydown({ key, preventDefault() {}, ...extra }),
        release: key => events.keyup({ key }),
        blur: () => events.blur(),
        restart: () => buttonEvents.click(),
        hide: () => { context.document.hidden = true; events.visibilitychange(); },
        touch: (id, type, pointerId = 1, button = 0) => touchEvents[id][type]({pointerId, button, preventDefault() {}})
    };
}

function rotten(g, index, position) {
    g.run(`jablka[${index}].zkazSe(); Object.assign(jablka[${index}], ${JSON.stringify(position)})`);
}

test("starts centered with one healthy apple and one timer", () => {
    const g = game();
    assert.equal(g.run("jablka.length"), 1);
    assert.equal(g.run("jablka[0].cervive"), false);
    assert.equal(g.nodes.panacek.style.left, "160px");
    assert.equal(g.nodes.panacek.style.top, "320px");
    assert.equal(g.nodes.hriste.children[0].style.left, "184px");
    assert.equal(g.nodes.hriste.children[0].style.top, "-32px");
    assert.equal(g.timers.size, 1);
    assert.equal([...g.timers.values()][0].ms, 20);
    g.tick();
    assert.equal(g.run("jablka[0].y"), -30);
});

test("A/D movement, uppercase, release, shortcuts and blur", () => {
    const g = game();
    g.press("a"); g.tick();
    assert.equal(g.run("panacek.x"), 155);
    g.release("a"); g.tick();
    assert.equal(g.run("panacek.x"), 155);
    g.press("D"); g.tick();
    assert.equal(g.run("panacek.x"), 160);
    g.press("a"); g.tick();
    assert.equal(g.run("panacek.x"), 160);
    g.blur(); g.tick();
    g.press("a", { ctrlKey: true }); g.tick();
    g.press("d", { metaKey: true }); g.tick();
    assert.equal(g.run("panacek.x"), 160);
});

test("player stays inside both horizontal edges", () => {
    const g = game();
    g.run("panacek.x=1"); g.press("a"); g.tick();
    assert.equal(g.run("panacek.x"), 0);
    g.release("a"); g.run("panacek.x=319"); g.press("d"); g.tick();
    assert.equal(g.run("panacek.x"), 320);
});

test("catch scores once and returns the healthy apple above the board", () => {
    const g = game();
    g.run("panacek.x=100; jablka[0].x=120; jablka[0].y=287");
    g.tick();
    assert.equal(g.run("skore"), 1);
    assert.equal(g.run("jablka[0].y"), -32);
    assert.equal(g.run("jablka[0].cervive"), false);
    g.tick();
    assert.equal(g.run("skore"), 1);
});

test("rectangle contact needs overlap on both axes", () => {
    const g = game();
    g.run("panacek.x=112; jablka[0].x=80; jablka[0].y=300");
    assert.equal(g.run("jablka[0].dotykaSe(panacek)"), false);
    g.run("jablka[0].x=81");
    assert.equal(g.run("jablka[0].dotykaSe(panacek)"), true);
    g.run("jablka[0].y=288");
    assert.equal(g.run("jablka[0].dotykaSe(panacek)"), false);
    g.run("jablka[0].y=289");
    assert.equal(g.run("panacek.dotykaSe(jablka[0])"), true);
});

test("floor contact turns an apple brown and replenishes a healthy one", () => {
    const g = game();
    g.run("panacek.x=0; jablka[0].x=200; jablka[0].y=365");
    g.tick();
    assert.equal(g.run("jablka[0].y"), 367);
    assert.equal(g.run("jablka[0].cervive"), false);
    g.tick();
    assert.equal(g.run("jablka[0].y"), 368);
    assert.equal(g.run("jablka[0].cervive"), true);
    assert.equal(g.nodes.hriste.children[0].classList.contains("cervive"), true);
    assert.equal(g.nodes.hriste.children[0].alt, "Červivé jablíčko");
    assert.equal(g.run("jablka.filter(apple => !apple.cervive).length"), 1);
    assert.equal(g.run("skore"), 0);
    assert.equal(Number(g.nodes["pocet-jablek"].textContent), 2);
});

test("rotten launch goes upward and can choose either horizontal direction", () => {
    const g = game();
    g.run("Math.random=()=>0; jablka[0].zkazSe()");
    assert.equal(g.run("jablka[0].dx"), -2);
    assert.equal(g.run("jablka[0].dy"), -2);
    g.run("Math.random=()=>0.75; jablka[0].zkazSe()");
    assert.equal(g.run("jablka[0].dx"), 3.5);
    assert.equal(g.run("jablka[0].dy"), -3.5);
});

for (const [name, start, expected] of [
    ["left", { x: 1, y: 100, dx: -3, dy: 1 }, { x: 0, dx: 3 }],
    ["right", { x: 367, y: 100, dx: 3, dy: 1 }, { x: 368, dx: -3 }],
    ["top", { x: 100, y: 1, dx: 1, dy: -3 }, { y: 0, dy: 3 }],
    ["bottom", { x: 100, y: 367, dx: 1, dy: 3 }, { y: 368, dy: -3 }],
    ["corner", { x: 1, y: 1, dx: -3, dy: -3 }, { x: 0, y: 0, dx: 3, dy: 3 }]
]) {
    test(`rotten apple bounces inward at ${name}`, () => {
        const g = game();
        rotten(g, 0, start);
        g.run("jablka[0].pohniSe()");
        for (const [key, value] of Object.entries(expected)) {
            assert.equal(g.run(`jablka[0].${key}`), value);
        }
    });
}

test("fatal hit stops the timer, renders impact and blocks further updates", () => {
    const g = game();
    rotten(g, 0, { x: 160, y: 318, dx: 0, dy: 3 });
    g.tick();
    assert.equal(g.run("konecHry"), true);
    assert.equal(g.timers.size, 0);
    assert.equal(g.nodes["konec-hry"].hidden, false);
    assert.equal(g.nodes["nova-hra"].hidden, false);
    assert.equal(g.nodes.hriste.children[0].style.top, "321px");
    const before = g.run("JSON.stringify([skore,panacek.x,jablka.map(apple=>[apple.x,apple.y])])");
    g.press("a"); g.tick(); g.tick();
    assert.equal(g.run("JSON.stringify([skore,panacek.x,jablka.map(apple=>[apple.x,apple.y])])"), before);
});

test("restart removes old images, clears score and keys, and keeps one timer", () => {
    const g = game();
    const old = g.nodes.hriste.children[0];
    rotten(g, 0, { x: 160, y: 320, dx: 0, dy: 0 });
    g.run("skore=8; klavesy.d=true"); g.tick();
    g.restart(); g.restart();
    assert.equal(old.removed, true);
    assert.equal(g.run("skore"), 0);
    assert.equal(g.run("konecHry"), false);
    assert.equal(g.run("klavesy.a || klavesy.d"), false);
    assert.equal(g.run("jablka.length"), 1);
    assert.equal(g.run("jablka[0].cervive"), false);
    assert.equal(g.nodes.hriste.children.length, 1);
    assert.equal(g.nodes["konec-hry"].hidden, true);
    assert.equal(g.nodes["nova-hra"].hidden, true);
    assert.equal(g.timers.size, 1);
});

for (const otherRotten of [false, true]) {
    test(`rotten collision with ${otherRotten ? "rotten removes both" : "healthy keeps the rotten apple"}`, () => {
        const g = game();
        g.run("pridejJablko()");
        const originals = [...g.nodes.hriste.children];
        rotten(g, 0, { x: 100, y: 100, dx: 0, dy: 0 });
        if (otherRotten) rotten(g, 1, { x: 105, y: 100, dx: 0, dy: 0 });
        else g.run("jablka[1].x=105; jablka[1].y=100");
        g.tick();
        assert.equal(Boolean(originals[0].removed), otherRotten);
        assert.equal(originals[1].removed, true);
        assert.equal(g.run("jablka.length"), otherRotten ? 1 : 2);
        assert.equal(g.nodes.hriste.children.length, otherRotten ? 1 : 2);
        if (!otherRotten) assert.equal(g.run("jablka[0].zasahy"), 1);
        assert.equal(g.run("skore"), 0);
    });
}

test("overlapping healthy apples do not destroy each other", () => {
    const g = game();
    g.run("skore=1"); g.tick();
    g.run("jablka.forEach(apple => { apple.x=100; apple.y=100; })");
    const originals = [...g.nodes.hriste.children];
    g.tick();
    assert.equal(g.run("jablka.length"), 2);
    assert.ok(originals.every(img => !img.removed));
});

test("one rotten apple can absorb two red apples in one tick", () => {
    const g = game();
    g.run("skore=3"); g.tick();
    g.run("jablka.forEach(apple => { apple.x=100; apple.y=100; })");
    const originals = [...g.nodes.hriste.children];
    rotten(g, 0, { x: 100, y: 100, dx: 0, dy: 0 });
    g.tick();
    assert.ok(!originals[0].removed);
    assert.equal(originals[1].removed, true);
    assert.equal(originals[2].removed, true);
    assert.equal(g.run("jablka[0].zasahy"), 2);
    assert.equal(g.run("jablka.length"), 4);
});

test("fatal player hit wins over an apple-to-apple collision", () => {
    const g = game();
    g.run("pridejJablko(); jablka[1].x=160; jablka[1].y=320");
    rotten(g, 0, { x: 160, y: 320, dx: 0, dy: 0 });
    g.tick();
    assert.equal(g.run("konecHry"), true);
    assert.equal(g.run("skore"), 0);
    assert.ok(g.nodes.hriste.children.every(img => !img.removed));
});

test("apple destroyed by a rotten one cannot also score a catch", () => {
    const g = game();
    g.run("skore=1"); g.tick();
    g.run("panacek.x=100; jablka[1].x=170; jablka[1].y=300");
    rotten(g, 0, { x: 195, y: 300, dx: 0, dy: 0 });
    const originals = [...g.nodes.hriste.children];
    g.tick();
    assert.equal(g.run("konecHry"), false);
    assert.equal(g.run("skore"), 1);
    assert.ok(!originals[0].removed);
    assert.equal(originals[1].removed, true);
});

test("healthy catch at the floor scores instead of becoming rotten", () => {
    const g = game();
    g.run("jablka[0].y=367");
    g.tick();
    assert.equal(g.run("skore"), 1);
    assert.equal(g.run("jablka[0].cervive"), false);
    assert.equal(g.run("konecHry"), false);
});

test("a newly rotten apple can destroy another apple in the same tick", () => {
    const g = game();
    g.run("panacek.x=0; jablka[0].x=200; jablka[0].y=367; pridejJablko()");
    rotten(g, 1, { x: 200, y: 367, dx: 0, dy: 0 });
    const originals = [...g.nodes.hriste.children];
    g.tick();
    assert.ok(originals.every(img => img.removed));
    assert.equal(g.run("jablka.length"), 1);
});

test("healthy apple count follows cumulative catches and stops at seven", () => {
    const g = game();
    for (const [score, expected] of [
        [0, 1], [1, 2], [2, 2], [3, 3], [5, 3], [6, 4], [9, 4],
        [10, 5], [14, 5], [15, 6], [20, 6], [21, 7], [100, 7]
    ]) {
        g.run(`skore=${score}`); g.tick();
        assert.equal(g.run("jablka.length"), expected, `score ${score}`);
        assert.equal(g.nodes.hriste.children.length, expected);
    }
});

test("rotten apples are extra and do not reduce the healthy supply", () => {
    const g = game();
    rotten(g, 0, { x: 20, y: 100, dx: 1, dy: -1 });
    g.run("skore=21"); g.tick();
    assert.equal(g.run("jablka.filter(apple=>!apple.cervive).length"), 7);
    assert.equal(g.run("jablka.filter(apple=>apple.cervive).length"), 1);
    assert.equal(g.nodes.hriste.children.length, 8);
    assert.equal(Number(g.nodes["pocet-jablek"].textContent), 8);
});

test("simultaneous healthy catches cross the progression threshold once", () => {
    const g = game();
    g.run("skore=1"); g.tick();
    g.run("skore=1; jablka.forEach(apple=>{apple.x=184;apple.y=287;})");
    g.tick();
    assert.equal(g.run("skore"), 3);
    assert.equal(g.run("jablka.length"), 3);
    assert.equal(g.run("jablka[2].y"), -112);
    g.tick();
    assert.equal(g.run("skore"), 3);
    assert.equal(g.run("jablka.length"), 3);
});


test("first catch immediately adds a second healthy apple", () => {
    const g = game();
    g.run("jablka[0].y=287"); g.tick();
    assert.equal(g.run("skore"), 1);
    assert.equal(g.run("jablka.length"), 2);
    assert.equal(g.run("jablka[1].y"), -112);
    g.tick();
    assert.equal(g.run("skore"), 1);
    assert.equal(g.run("jablka.length"), 2);
});

test("real PNG masks ignore transparent margins but detect visible contact", () => {
    const g = game(true);
    g.run("jablka[0].x=130; jablka[0].y=320");
    assert.equal(g.run("jablka[0].dotykaSe(panacek)"), false);
    g.run("jablka[0].x=184; jablka[0].y=340");
    assert.equal(g.run("jablka[0].dotykaSe(panacek)"), true);
    assert.equal(g.run("panacek.dotykaSe(jablka[0])"), true);
});

test("only overlapping opaque pixels collide, including fractional and negative positions", () => {
    const g = game(true);
    g.run('panacek.sirka=panacek.vyska=3; panacek.maska=["000","010","000"]; panacek.x=-0.6;panacek.y=-0.6; jablka[0].sirka=jablka[0].vyska=3;jablka[0].maska=["000","010","000"];jablka[0].x=-0.6;jablka[0].y=-0.6');
    assert.equal(g.run("jablka[0].dotykaSe(panacek)"), true);
    g.run("jablka[0].x=0.6");
    assert.equal(g.run("jablka[0].dotykaSe(panacek)"), false);
    assert.equal(g.run("panacek.dotykaSe(jablka[0])"), false);
    g.run('jablka[0].x=-0.6;jablka[0].maska=["000","000","000"]');
    assert.equal(g.run("jablka[0].dotykaSe(panacek)"), false);
});

test("clones share the original mask and browning preserves it", () => {
    const g = game(true);
    g.run("pridejJablko()");
    assert.equal(g.run("jablka[0].maska===jablka[1].maska"), true);
    g.run("jablka[0].zkazSe()");
    assert.equal(g.run("jablka[0].maska===jablka[1].maska"), true);
});

for (const actualPixels of [false, true]) {
    test(`rotten survives two separate red hits and disappears on the third (pixels=${actualPixels})`, () => {
        const g = game(actualPixels);
        rotten(g, 0, {x:100,y:100,dx:0,dy:0});
        const brown = g.run("jablka[0]");
        for (let hit = 1; hit <= 3; hit++) {
            g.run("pridejJablko(); Object.assign(jablka[jablka.length-1],{x:100,y:100,dx:0,dy:0})");
            g.tick();
            assert.equal(brown.zasahy, hit);
            assert.equal(Boolean(brown.obrazek.removed), hit === 3);
            assert.equal(g.run("skore"), 0);
        }
    });
}

test("a removed red apple cannot hit two rotten apples", () => {
    const g = game();
    g.run("pridejJablko();pridejJablko(); jablka[2].x=100;jablka[2].y=100");
    rotten(g,0,{x:80,y:100,dx:0,dy:0});
    rotten(g,1,{x:120,y:100,dx:0,dy:0});
    const first=g.run("jablka[0]"), second=g.run("jablka[1]");
    g.tick();
    assert.equal(first.zasahy,1);
    assert.equal(second.zasahy,0);
});

test("third simultaneous red hit removes brown before a fourth hit", () => {
    const g=game();
    g.run("skore=6");g.tick();g.run("pridejJablko();jablka.forEach(apple=>{apple.x=100;apple.y=100;})");
    rotten(g,0,{x:100,y:100,dx:0,dy:0});
    const originals=[...g.nodes.hriste.children], brown=g.run("jablka[0]");
    g.tick();
    assert.equal(brown.zasahy,3);
    assert.ok(originals.slice(0,4).every(img=>img.removed));
    assert.ok(!originals[4].removed);
});

test("brown in second array position counts the hit and restart resets counters", () => {
    const g=game();g.run("pridejJablko(); jablka[0].x=100;jablka[0].y=100");
    rotten(g,1,{x:100,y:100,dx:0,dy:0});
    const brown=g.run("jablka[1]");g.tick();
    assert.equal(brown.zasahy,1);
    g.restart();
    assert.equal(g.run("jablka[0].zasahy"),0);
});

for (const [id, delta] of [["doleva", -5], ["doprava", 5]]) {
    test(`holding ${id} moves until release`, () => {
        const g = game();
        g.touch(id, "pointerdown", 8); g.tick(); g.tick();
        assert.equal(g.run("panacek.x"), 160 + delta * 2);
        assert.equal(g.nodes[id].captured, 8);
        g.touch(id, "pointerup", 8); g.tick();
        assert.equal(g.run("panacek.x"), 160 + delta * 2);
    });
}
for (const event of ["pointercancel", "lostpointercapture"]) {
    test(`${event} releases movement`, () => {
        const g = game();
        g.touch("doleva", "pointerdown"); g.tick();
        g.touch("doleva", event); g.tick();
        assert.equal(g.run("panacek.x"), 155);
    });
}
test("opposite arrows cancel and each finger releases independently", () => {
    const g=game();
    g.touch("doleva","pointerdown",1); g.touch("doprava","pointerdown",2);g.tick();
    assert.equal(g.run("panacek.x"),160);
    g.touch("doleva","pointerup",1);g.tick();
    assert.equal(g.run("panacek.x"),165);
    g.touch("doprava","pointerup",2);g.tick();
    assert.equal(g.run("panacek.x"),165);
});
test("two fingers on one arrow keep moving until both lift", () => {
    const g=game();
    g.touch("doleva","pointerdown",1);g.touch("doleva","pointerdown",2);
    g.touch("doleva","pointerup",1);g.tick();
    assert.equal(g.run("panacek.x"),155);
    g.touch("doleva","pointerup",2);g.tick();
    assert.equal(g.run("panacek.x"),155);
});
test("keyboard and pointer releases do not cancel each other", () => {
    const g=game();g.press("a");g.touch("doleva","pointerdown");
    g.release("a");g.tick();
    assert.equal(g.run("panacek.x"),155);
    g.press("a");g.touch("doleva","pointerup");g.tick();
    assert.equal(g.run("panacek.x"),150);
});
for(const action of ["blur","hide","restart"]) {
    test(`${action} clears held touch movement`, () => {
        const g=game();g.touch("doleva","pointerdown");g[action]();
        const x=g.run("panacek.x");g.tick();
        assert.equal(g.run("panacek.x"),x);
        assert.equal(g.run("dotyky.a.size+dotyky.d.size"),0);
    });
}
test("game over clears touches and ignores further pointer presses", () => {
    const g=game();g.touch("doleva","pointerdown");
    g.run("ukonciHru()");g.touch("doprava","pointerdown");g.tick();
    assert.equal(g.run("dotyky.a.size+dotyky.d.size"),0);
});
test("right mouse button does not start movement", () => {
    const g=game();g.touch("doleva","pointerdown",1,2);g.tick();
    assert.equal(g.run("panacek.x"),160);
});

test("Enter restarts during play and after game over without accumulating timers", () => {
    const g=game();g.run("skore=10");g.press("a");
    let prevented=false;
    g.press("Enter",{preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
    assert.equal(g.run("skore"),0);
    assert.equal(g.run("klavesy.a"),false);
    assert.equal(g.run("jablka.length"),1);
    assert.equal(g.timers.size,1);
    g.run("ukonciHru()");g.press("Enter");
    assert.equal(g.run("konecHry"),false);
    assert.equal(g.timers.size,1);
});
test("holding Enter does not repeatedly restart and modifier shortcuts are ignored", () => {
    const g=game();g.run("skore=2");
    const image=g.nodes.hriste.children[0];
    g.press("Enter",{repeat:true});g.press("Enter",{ctrlKey:true});
    assert.equal(g.run("skore"),2);
    assert.equal(g.nodes.hriste.children[0],image);
});
