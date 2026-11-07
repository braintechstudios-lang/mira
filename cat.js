/* Notch Cat for the web: the same soft-body cat as in Mira (points, springs and gravity), drawn as one furry
   silhouette with ring eyes. Grab any part and pull; let go after a big pull and it slingshots into the notch. */
(function () {
  const stage = document.getElementById('catStage');
  if (!stage) return;
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const notchEl = stage.querySelector('.cnotch');
  const hint = document.getElementById('catHint');

  // ---- sounds (CC0 recordings from freesound.org; the boing is made in code) ----
  const sounds = {};
  let soundOn = true, unlocked = false;
  const soundBtn = document.getElementById('catSound');
  ['chirp', 'meow', 'meow2', 'purr', 'hiss', 'trill', 'boing'].forEach(n => {
    const a = new Audio('shots/sounds/cat-' + n + '.m4a'); a.preload = 'auto'; a.volume = 0.45; sounds[n] = a;
  });
  function play(n) {
    if (!soundOn || !unlocked) return;
    if (n === 'meow' && Math.random() < 0.5) n = 'meow2';
    const a = sounds[n]; if (!a) return;
    try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
  }
  if (soundBtn) soundBtn.addEventListener('click', () => {
    soundOn = !soundOn; unlocked = true;
    soundBtn.textContent = soundOn ? '🔊 Sound on' : '🔈 Sound off';
    if (soundOn) play('chirp');
  });

  // ---- layout ----
  // The cat is drawn bigger than in the app, so she reads on a web page. Physics runs in cat units.
  let W = 0, H = 0, dpr = 1, cx = 0, S = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    S = r.width > 700 ? 1.45 : 1.15;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    W = r.width / S; H = r.height / S;
    cx = W / 2;
  }
  resize();
  window.addEventListener('resize', resize);
  const NOTCH_H = () => notchEl ? notchEl.offsetHeight : 30;

  // ---- the body ----
  const SPINE = 6, TAIL = 11, SPREAD = 36;
  const st = {
    act: 'hang', out: false, speed: 1, anchorY: -190, arm: 30, seg: 12, tailSeg: 7, slid: 0, slinging: false,
    head: null, spine: [], tail: [], grabbed: null, grab: { x: 0, y: 0 }, poofUntil: 0, boopUntil: 0, actStart: 0, last: null,
  };
  const N = (x, y) => ({ x, y, ox: x, oy: y });
  function reset() {
    st.anchorY = -190;
    const y0 = st.anchorY + 30;
    st.head = N(cx, y0);
    st.spine = []; for (let i = 0; i < SPINE; i++) st.spine.push(N(cx, y0 + (i + 1) * 10));
    st.tail = []; for (let i = 0; i < TAIL; i++) st.tail.push(N(cx + 4, y0 + 60 + i * 6));
    st.slid = 0; st.slinging = false; st.poofUntil = 0; st.speed = 1; st.actStart = now(); st.last = null;
  }
  const now = () => performance.now() / 1000;
  const paws = () => [{ x: cx - SPREAD, y: st.anchorY }, { x: cx + SPREAD, y: st.anchorY }];
  const nodeAt = i => i === 0 ? st.head : (i >= 100 ? st.tail[i - 100] : st.spine[i - 1]);
  const poof = () => { st.poofUntil = now() + 1.6; };
  const poofAmt = () => Math.max(0, Math.min(1, (st.poofUntil - now()) / 0.6));

  function link(a, b, rest, k) {
    const A = nodeAt(a), B = nodeAt(b);
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.max(0.001, Math.hypot(dx, dy));
    const diff = (d - rest) / d * k;
    const wa = st.grabbed === a ? 0 : (st.grabbed === b ? 1 : 0.5);
    const wb = st.grabbed === b ? 0 : (st.grabbed === a ? 1 : 0.5);
    A.x += dx * diff * wa; A.y += dy * diff * wa; B.x -= dx * diff * wb; B.y -= dy * diff * wb;
  }
  function holdTo(p, anchor, rest, k) {
    const dx = p.x - anchor.x, dy = p.y - anchor.y, d = Math.max(0.001, Math.hypot(dx, dy));
    if (d <= rest) return;
    const diff = (d - rest) / d * k; p.x -= dx * diff; p.y -= dy * diff;
  }
  function simulate(dt, t) {
    if (st.out && st.act === 'claws') {
      const e = t - st.actStart;
      st.slid = e < 1.2 ? 0 : Math.min(58, (e - 1.2) * 16);
    } else if (!st.out) st.slid = Math.max(0, st.slid - dt * 120);
    let tg;
    if (!st.out) tg = [-190, 10, 2, 2];
    else if (st.act === 'hang') tg = [0, 44, 10, 7.5];
    else if (st.act === 'claws') tg = [st.slid, 40, 10, 7.5];
    else if (st.act === 'tail') tg = [-92, 6, 2, 17];
    else tg = [0, 34, 1.2, 1];
    const k = Math.min(1, dt * (st.out ? 3.2 : 4.5 * st.speed));
    st.anchorY += (tg[0] - st.anchorY) * k; st.arm += (tg[1] - st.arm) * k;
    st.seg += (tg[2] - st.seg) * k; st.tailSeg += (tg[3] - st.tailSeg) * k;

    const g = st.slinging ? -400 : 1500, d2 = dt * dt, damp = 0.985;
    const integ = (n, ex = 0) => {
      const vx = (n.x - n.ox) * damp, vy = (n.y - n.oy) * damp;
      n.ox = n.x; n.oy = n.y; n.x += vx + ex * d2; n.y += vy + g * d2;
    };
    if (st.grabbed !== 0) integ(st.head, Math.sin(t * 0.9) * 60);
    st.spine.forEach((n, i) => { if (st.grabbed !== i + 1) integ(n); });
    st.tail.forEach((n, i) => {
      if (st.grabbed === 100 + i) return;
      integ(n, i > TAIL - 5 ? Math.sin(t * 2.4 + i * 0.5) * (st.act === 'tail' ? 650 : 1100) : 0);
    });
    applyGrab();
    const [pl, pr] = paws();
    const armRest = Math.hypot(SPREAD, st.arm);
    for (let it = 0; it < 6; it++) {
      if (st.grabbed !== 0) {
        const rest = st.slinging ? 8 : armRest, kk = st.slinging ? 0.18 : (st.grabbed !== null ? 0.16 : 0.5);
        holdTo(st.head, pl, rest, kk); holdTo(st.head, pr, rest, kk);
      }
      link(0, 1, st.seg + 8, 0.35);
      for (let i = 0; i < SPINE - 1; i++) link(1 + i, 2 + i, st.seg, 0.35);
      for (let i = 0; i < SPINE - 2; i++) link(1 + i, 3 + i, st.seg * 1.9, 0.06);
      link(SPINE, 100, Math.max(2, st.tailSeg * 0.6), 0.6);
      for (let i = 0; i < TAIL - 1; i++) link(100 + i, 101 + i, st.tailSeg, 0.55);
      for (let i = 0; i < TAIL - 2; i++) link(100 + i, 102 + i, st.tailSeg * 1.85, 0.05);
      const clamp = n => { n.x = Math.max(14, Math.min(W - 14, n.x)); n.y = Math.min(H - 12, n.y); };
      clamp(st.head); st.spine.forEach(clamp); st.tail.forEach(clamp);
    }
  }
  /// Puts the held part where the pointer is (it stretches a lot, but not into spaghetti).
  function applyGrab() {
    if (st.grabbed === null) return;
    const [pl, pr] = paws(), mid = { x: (pl.x + pr.x) / 2, y: pl.y };
    const gi = st.grabbed;
    const reach = gi === 0 ? st.arm * 2.2 + 20 : (gi >= 100 ? 260 : st.arm * 2 + st.seg * gi * 2.4 + 40);
    let gx = st.grab.x, gy = st.grab.y;
    const d = Math.hypot(gx - mid.x, gy - mid.y);
    if (d > reach) { gx = mid.x + (gx - mid.x) / d * reach; gy = mid.y + (gy - mid.y) / d * reach; }
    const n = nodeAt(gi); n.x = gx; n.y = gy;
  }
  function step(t) {
    if (st.last === null) { st.last = t; return; }
    let dt = Math.min(0.05, t - st.last); st.last = t;
    const h = 1 / 120;
    while (dt > 0) { simulate(Math.min(h, dt), t); dt -= h; }
  }

  // ---- drawing ----
  const INK = '#0d0b0d', GLOW = 'rgba(255,255,255,.22)', EYE = '#fad352', BLUSH = 'rgba(255,115,140,.75)';
  let face = 'normal', look = { x: 0, y: 0.3 }, bubble = null, blinkUntil = 0;

  function unit(x, y, fx, fy) { const l = Math.hypot(x, y); return l < 0.001 ? [fx, fy] : [x / l, y / l]; }
  function tube(pts, widths) {
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const [dx, dy] = unit(b.x - a.x, b.y - a.y, 0, 1), nx = -dy, ny = dx;
      const w = (widths[i] ?? widths[widths.length - 1]) / 2;
      L.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w }); R.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
    }
    const p = new Path2D();
    const smooth = (arr, first) => {
      if (first) p.moveTo(arr[0].x, arr[0].y); else p.lineTo(arr[0].x, arr[0].y);
      for (let i = 1; i < arr.length - 1; i++) p.quadraticCurveTo(arr[i].x, arr[i].y, (arr[i].x + arr[i + 1].x) / 2, (arr[i].y + arr[i + 1].y) / 2);
      p.lineTo(arr[arr.length - 1].x, arr[arr.length - 1].y);
    };
    smooth(L, true); smooth(R.reverse(), false); p.closePath();
    // Round ends as their own shapes: in the same path, where they overlap the body in the opposite direction they
    // cancel out and punch a hole in the cat.
    const w0 = widths[0], e = pts[pts.length - 1], wn = widths[Math.min(widths.length, pts.length) - 1];
    const c0 = new Path2D(); c0.arc(pts[0].x, pts[0].y, w0 / 2, 0, Math.PI * 2);
    const c1 = new Path2D(); c1.arc(e.x, e.y, wn / 2, 0, Math.PI * 2);
    return [p, c0, c1];
  }
  function headPath(c, w, h) {
    const l = c.x - w / 2, r = c.x + w / 2, top = c.y - h / 2, bot = c.y + h / 2;
    const up = face === 'annoyed' ? 6 : (face === 'wide' ? 18 : 15), o = face === 'annoyed' ? 6 : 0;
    const p = new Path2D();
    p.moveTo(l + 3, c.y + 4);
    p.bezierCurveTo(l - 2, c.y - 8, l + 1, top + 12, l + 8 - o, top + 4);
    p.bezierCurveTo(l + 9 - o, top - 2, l + 10 - o, top - up + 4, l + 12 - o, top - up);
    p.bezierCurveTo(l + 16, top - up + 3, l + 22, top - 1, l + 28, top + 1);
    p.bezierCurveTo(c.x - 8, top - 3, c.x + 8, top - 3, r - 28, top + 1);
    p.bezierCurveTo(r - 22, top - 1, r - 16, top - up + 3, r - 12 + o, top - up);
    p.bezierCurveTo(r - 10 + o, top - up + 4, r - 9 + o, top - 2, r - 8 + o, top + 4);
    p.bezierCurveTo(r - 1, top + 12, r + 2, c.y - 8, r - 3, c.y + 4);
    p.bezierCurveTo(r - 6, bot + 7, l + 6, bot + 7, l + 3, c.y + 4);
    p.closePath();
    return p;
  }

  function draw(t) {
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const top = NOTCH_H() / S;
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, H - top); ctx.clip(); ctx.translate(0, top);

    const h = st.head, s = st.spine, tl = st.tail, [pl, pr] = paws();
    // Claw marks.
    if (st.slid > 2) {
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      [pl, pr].forEach(p => [-4.5, 0, 4.5].forEach(dx => {
        ctx.beginPath(); ctx.moveTo(p.x + dx, 1); ctx.quadraticCurveTo(p.x + dx + 1.5, p.y / 2, p.x + dx * 1.15, p.y - 2); ctx.stroke();
      }));
    }
    // Shapes: fills (tubes, head, paws) and strokes (arms, legs).
    const fills = [], strokes = [];
    [[pl, -1], [pr, 1]].forEach(([p, side]) => {
      const sh = { x: h.x + side * 24, y: h.y + 14 }, a = new Path2D();
      a.moveTo(p.x, p.y - 2); a.quadraticCurveTo((p.x + sh.x) / 2 + side * 4, (p.y + sh.y) / 2, sh.x, sh.y);
      strokes.push([a, 11]);
      const pw = new Path2D(); pw.ellipse(p.x, p.y - 2.5, 8, 6.5, 0, 0, Math.PI * 2); fills.push(pw);
    });
    const spinePts = [h, ...s];
    let len = 0; for (let i = 1; i < spinePts.length; i++) len += Math.hypot(spinePts[i].x - spinePts[i - 1].x, spinePts[i].y - spinePts[i - 1].y);
    const thin = Math.max(0.5, Math.min(1, 1 / Math.sqrt(Math.max(1, len / Math.max(1, st.seg + 8 + st.seg * (SPINE - 1) + 30)))));
    fills.push(...tube(spinePts, [36, 42, 48, 50, 48, 43, 37].map((w, i) => i === 0 ? w : w * thin)));
    const hips = s[s.length - 1], prev = s[s.length - 2];
    const [dx, dy] = unit(hips.x - prev.x, hips.y - prev.y, 0, 1), sx = -dy, sy = dx;
    [-1, 1].forEach(k => {
      const rx = hips.x + sx * 9 * k, ry = hips.y + sy * 9 * k, l = new Path2D();
      l.moveTo(rx, ry); l.lineTo(rx + dx * 17, ry + dy * 17 + 3); strokes.push([l, 11]);
    });
    const puff = 1 + poofAmt() * 0.9;
    fills.push(...tube([hips, ...tl], [hips, ...tl].map((_, i) => Math.max(5, 10.5 - i * 0.4) * puff)));
    const neck = s[0], tilt = Math.atan2(neck.x - h.x, neck.y - h.y) * -0.6;
    const hc = { x: h.x, y: h.y + 2 };
    const headP = new Path2D(); const m = new DOMMatrix().translate(hc.x, hc.y).rotate(tilt * 180 / Math.PI).translate(-hc.x, -hc.y);
    headP.addPath(headPath(hc, 70, 54), m); fills.push(headP);

    const all = (fn) => { fills.forEach(p => fn(p, 0)); strokes.forEach(([p, w]) => fn(p, w)); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Light rim, soft blurred fur, fine hairs, crisp body.
    all((p, w) => { ctx.strokeStyle = GLOW; ctx.lineWidth = w ? w + 2.5 : 2.2; ctx.stroke(p); });
    const pf = poofAmt();
    ctx.save(); ctx.filter = `blur(${1.1 + pf * 1.5}px)`;
    all((p, w) => { ctx.strokeStyle = INK; ctx.lineWidth = w ? w + 2.4 : 2.4 + pf * 5; ctx.stroke(p); });
    ctx.restore();
    ctx.setLineDash([0.01, 1.5]);
    all((p, w) => { ctx.strokeStyle = INK; ctx.lineWidth = w ? w + 1.3 : 1.3; ctx.stroke(p); });
    ctx.setLineDash([0.01, 3.1 - pf]);
    all((p, w) => { ctx.strokeStyle = 'rgba(13,11,13,.85)'; ctx.lineWidth = w ? w + 2.2 + pf * 6 : 2.2 + pf * 6; ctx.stroke(p); });
    ctx.setLineDash([]);
    ctx.fillStyle = INK; ctx.strokeStyle = INK;
    fills.forEach(p => ctx.fill(p)); strokes.forEach(([p, w]) => { ctx.lineWidth = w; ctx.stroke(p); });

    // Face.
    ctx.save(); ctx.translate(h.x, h.y + 2); ctx.rotate(tilt);
    const bs = st.boopUntil > now() ? 0.88 : 1; ctx.scale(bs, bs);
    eyes(blinkUntil > now() && (face === 'normal' || face === 'wide') ? 'sleepy' : face, t);
    ctx.restore();

    // Speech bubble.
    if (bubble && st.out) {
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Rounded", system-ui, sans-serif';
      const tw = ctx.measureText(bubble).width, bw = tw + 16, bh = 22;
      const bx = Math.min(W - bw - 6, h.x + 38), by = Math.max(4, h.y - 30);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 11); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillText(bubble, bx + 8, by + 15);
    }
    ctx.restore();
  }

  function eyes(f, t) {
    const sp = 26, L = { x: -sp / 2, y: 6.5 }, R = { x: sp / 2, y: 5.5 };
    if (f === 'happy' || f === 'love') {
      ctx.fillStyle = BLUSH; [L.x - 3, R.x + 3].forEach(x => { ctx.beginPath(); ctx.ellipse(x, 6 + 10.5, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill(); });
    }
    ctx.strokeStyle = EYE; ctx.fillStyle = EYE; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    [[L, false], [R, true]].forEach(([p, big]) => {
      if (f === 'happy') { ctx.beginPath(); ctx.moveTo(p.x - 6.5, p.y + 2); ctx.quadraticCurveTo(p.x, p.y - 7, p.x + 6.5, p.y + 2); ctx.stroke(); }
      else if (f === 'sleepy') { ctx.beginPath(); ctx.moveTo(p.x - 6.5, p.y - 1); ctx.quadraticCurveTo(p.x, p.y + 5, p.x + 6.5, p.y - 1); ctx.stroke(); }
      else if (f === 'love') {
        const s = 6.5 + Math.sin(t * 6) * 0.6; ctx.fillStyle = '#ff6b8c';
        ctx.beginPath(); ctx.moveTo(p.x, p.y + s * 0.9);
        ctx.bezierCurveTo(p.x - s * 1.4, p.y - s * 0.1, p.x - s * 0.6, p.y - s * 1.2, p.x, p.y - s * 0.35);
        ctx.bezierCurveTo(p.x + s * 0.6, p.y - s * 1.2, p.x + s * 1.4, p.y - s * 0.1, p.x, p.y + s * 0.9); ctx.fill();
        ctx.fillStyle = EYE;
      } else {
        const r = (f === 'wide' ? 9.5 : 7.6) + (big ? 0.6 : 0), dot = f === 'wide' ? 1.6 : 2.4, reach = r - dot - 2.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x + look.x * reach, p.y + look.y * reach, dot, 0, Math.PI * 2); ctx.fill();
        if (f === 'annoyed') {
          ctx.fillStyle = INK; ctx.fillRect(p.x - r - 2, p.y - r - 2, r * 2 + 4, r + 1.5); ctx.fillStyle = EYE;
          ctx.beginPath(); ctx.moveTo(p.x - r, p.y - 0.5); ctx.lineTo(p.x + r, p.y - 0.5); ctx.stroke();
        }
      }
    });
    if (f === 'happy') {
      ctx.lineWidth = 1.6; ctx.beginPath(); const y = 6 + 11;
      ctx.moveTo(-5, y); ctx.quadraticCurveTo(-2.5, y + 4, 0, y); ctx.quadraticCurveTo(2.5, y + 4, 5, y); ctx.stroke();
    }
  }

  // ---- behaviour ----
  let leaveAt = 0, reacted = false, visible = false, nextVisit = now() + 1.2, learned = false;
  function say(text, f, snd) { bubble = text; face = f; if (snd) play(snd); }
  function come(act) {
    reset(); st.act = act || ['peek', 'hang', 'hang', 'claws', 'tail'][Math.floor(Math.random() * 5)];
    st.out = true; face = 'normal'; bubble = null; reacted = false; look = { x: 0, y: 0.3 };
    leaveAt = now() + (st.act === 'hang' ? 9 : st.act === 'claws' ? 8 : 6);
    if (st.act === 'claws') setTimeout(() => { if (st.out && st.act === 'claws') say('help', 'wide', 'meow'); }, 3200);
    if (hint) hint.classList.toggle('on', st.act !== 'tail' && !learned);
  }
  function leave(fast) { st.out = false; st.speed = fast ? 3 : 1; st.grabbed = null; bubble = null; nextVisit = now() + 2.5 + Math.random() * 4; }

  function hovered() {
    if (!st.out || reacted || st.grabbed !== null) return;
    reacted = true; leaveAt = Math.max(leaveAt, now() + 4);
    const r = Math.random() * 10;
    if (r < 3) say('purrrr', 'happy', 'purr');
    else if (r < 5) { say('!', 'wide', 'hiss'); poof(); st.head.oy += 9; setTimeout(() => { if (st.grabbed === null && st.out) leave(true); }, 600); }
    else if (r < 7) say('♥', 'love', 'trill');
    else if (r < 8) { say('hmph', 'annoyed'); look = { x: Math.random() < 0.5 ? -1 : 1, y: -0.3 }; }
    else say('mrrp?', 'normal', 'chirp');
  }

  // ---- pointer ----
  let downAt = null, moved = false, lastP = null, vel = { x: 0, y: 0 };
  function local(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / S, y: (e.clientY - r.top - NOTCH_H()) / S }; }
  function pick(p) {
    let best = null;
    const consider = (i, n, rad) => { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < rad && (!best || d < best[1])) best = [i, d]; };
    consider(0, st.head, 40); st.spine.forEach((n, i) => consider(1 + i, n, 30)); st.tail.forEach((n, i) => consider(100 + i, n, 18));
    return best ? best[0] : null;
  }
  canvas.addEventListener('pointerdown', e => {
    unlocked = true;
    if (!st.out) return;
    const p = local(e), i = pick(p);
    if (i === null) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    st.grabbed = i; st.grab = p; downAt = p; moved = false; lastP = { ...p, t: now() };
    canvas.classList.add('grabbing');
  });
  canvas.addEventListener('pointermove', e => {
    const p = local(e);
    if (st.grabbed === null) {
      // Hover reactions and eye contact.
      const d = Math.hypot(p.x - st.head.x, p.y - st.head.y);
      canvas.style.cursor = st.out && pick(p) !== null ? 'grab' : 'default';
      if (d < 46) hovered();
      if (reacted && face !== 'annoyed' && face !== 'sleepy') look = { x: Math.max(-1, Math.min(1, (p.x - st.head.x) / 160)), y: Math.max(-1, Math.min(1, (p.y - st.head.y) / 160)) };
      return;
    }
    st.grab = p; applyGrab();
    if (!moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 4) {
      moved = true; reacted = true; poof();
      say(['!!', 'hey!', 'mrow?', 'wheee'][Math.floor(Math.random() * 4)], Math.random() < 0.5 ? 'wide' : 'happy', 'meow');
      if (hint) hint.classList.remove('on');
      learned = true;
    }
    const t = now(); if (lastP && t - lastP.t > 0.005) vel = { x: (p.x - lastP.x) / (t - lastP.t), y: (p.y - lastP.y) / (t - lastP.t) };
    lastP = { ...p, t };
  });
  function release(e) {
    if (st.grabbed === null) return;
    if (e && e.clientX !== undefined) { st.grab = local(e); applyGrab(); }
    const gi = st.grabbed, n = nodeAt(gi), [pl, pr] = paws(), mid = { x: (pl.x + pr.x) / 2, y: pl.y };
    const armRest = Math.hypot(SPREAD, st.arm), spineLen = st.seg + 8 + st.seg * (SPINE - 1);
    const rest = gi === 0 ? armRest : (gi >= 100 ? armRest + spineLen + st.tailSeg * (gi - 99) : armRest + st.seg + 8 + st.seg * (gi - 1));
    const pulled = Math.hypot(n.x - mid.x, n.y - mid.y) / Math.max(20, rest);
    st.grabbed = null; canvas.classList.remove('grabbing');
    if (!moved) {
      st.boopUntil = now() + 0.18; st.head.oy -= 5;
      say(['mew!', 'mrrp!', 'boop', '♥'][Math.floor(Math.random() * 4)], Math.random() < 0.5 ? 'happy' : 'love', 'chirp');
      leaveAt = now() + 3.5; return;
    }
    if (pulled > 1.45) {
      // Slingshot!
      st.slinging = true;
      const pull = Math.min(60, (st.head.y - pl.y) * 0.22);
      st.head.oy = st.head.y + pull; st.spine.forEach(n => n.oy = n.y + pull * 0.8); st.tail.forEach(n => n.oy = n.y + pull * 0.5);
      say(['wheee!', 'boing!', 'yeet'][Math.floor(Math.random() * 3)], 'happy', 'boing');
      setTimeout(() => leave(true), 450);
      setTimeout(() => { if (!st.out && visible) { come('peek'); reacted = true; say(['again!', 'again?', 'mrrp!', '♥'][Math.floor(Math.random() * 4)], Math.random() < 0.5 ? 'happy' : 'love', 'chirp'); } }, 2200);
      return;
    }
    n.ox = n.x - Math.max(-30, Math.min(30, vel.x / 60)); n.oy = n.y - Math.max(-30, Math.min(30, vel.y / 60));
    const f = ['happy', 'love', 'annoyed'][Math.floor(Math.random() * 3)];
    say(f === 'annoyed' ? (Math.random() < 0.5 ? 'rude.' : 'hmph') : ['mrrp!', 'again!', '♥'][Math.floor(Math.random() * 3)], f, f === 'annoyed' ? null : 'chirp');
    leaveAt = now() + 3.5;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // Buttons: call a particular trick.
  document.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
    unlocked = true;
    const act = b.dataset.cat;
    if (st.out) { leave(true); setTimeout(() => come(act), 700); } else come(act);
  }));

  // Only run while the section is on screen.
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible && !st.out) nextVisit = Math.min(nextVisit, now() + 0.8); }), { threshold: 0.25 }).observe(stage);

  reset();
  (function frame() {
    const t = now();
    if (visible || st.out) {
      if (st.out) {
        if (st.grabbed === null && t > leaveAt && !st.slinging) leave(false);
        if (Math.random() < 1 / 160) blinkUntil = t + 0.13;
      } else if (visible && t > nextVisit && !st.slinging) come();
      if (!st.out && st.slinging && st.anchorY < -150) st.slinging = false;
      step(t); draw(t);
    }
    requestAnimationFrame(frame);
  })();
  // Debug hooks for automated checks.
  window.__notchCat = { st, come, leave, pick, release: () => release(), grabAt: (x, y) => { const i = pick({ x, y }); if (i !== null) { st.grabbed = i; st.grab = { x, y }; downAt = { x, y }; moved = false; } return i; }, moveTo: (x, y) => { st.grab = { x, y }; moved = true; }, state: () => ({ out: st.out, act: st.act, face, bubble, slinging: st.slinging, grabbed: st.grabbed }),
    // Where a part of the cat is on screen (CSS pixels, viewport coordinates).
    onScreen: (i = 3) => { const r = canvas.getBoundingClientRect(), n = nodeAt(i); return { x: r.left + n.x * S, y: r.top + NOTCH_H() + n.y * S }; } };
})();
