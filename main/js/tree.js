/* =============================================
   ムキムキタスくん - 星座ビュー (Canvas)
   引くと星空・寄ると整理 / パン・ピンチズーム / タップで詳細
   ============================================= */
(function () {
    const btnList       = document.getElementById('btnViewList');
    const btnTree       = document.getElementById('btnViewTree');
    const listView      = document.getElementById('listView');
    const treeView      = document.getElementById('treeView');
    const treeContainer = document.getElementById('treeContainer');
    const addBar        = document.querySelector('.list-add-bar');

    if (!btnList || !btnTree) return;

    /* -------- ハッシュ/乱数 -------- */
    const hash = (s) => {
        let h = 0x811c9dc5; s = String(s);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
        return h;
    };
    const rnd  = (s) => (hash(s) >>> 0) / 0xFFFFFFFF;
    const rndS = (s) => rnd(s) * 2 - 1;

    /* -------- キャンバス & サイズ -------- */
    let cv = null, ctx = null, W = 0, H = 0, DPR = 1;
    let animId = null;

    function initCanvas() {
        treeView.style.position = 'relative';
        treeView.style.overflow = 'hidden';
        treeView.style.background = '#06070f';
        cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;';
        treeContainer.style.cssText = 'position:absolute;inset:0;';
        treeContainer.appendChild(cv);
        ctx = cv.getContext('2d');
    }

    function resize() {
        W = treeView.clientWidth  || window.innerWidth;
        H = treeView.clientHeight || window.innerHeight;
        if (W < 10) { W = window.innerWidth; H = window.innerHeight; }
        DPR = Math.min(2.5, window.devicePixelRatio || 1);
        cv.width  = W * DPR;
        cv.height = H * DPR;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        makeStars();
    }

    /* -------- パレット -------- */
    const PAL = {
        space0:'#04050d', space1:'#0b0d22',
        star  :'210,224,255',
        line  :'rgba(150,175,255,0.11)', lineDone:'rgba(255,212,150,0.13)',
        quest :'255,210,138', task:'188,212,255',
        done  :'255,232,170', idle:'130,142,190', core:'255,243,214',
        label :'#e9eeff', labelDim:'rgba(190,201,236,0.62)',
    };

    /* -------- 背景星 -------- */
    let bgStars = [];
    function makeStars() {
        bgStars = [];
        for (let i = 0; i < 160; i++) {
            bgStars.push({
                x : rnd('x'+i) * W, y : rnd('y'+i) * H,
                r : 0.3 + rnd('r'+i) * 1.5,
                a : 0.15 + rnd('a'+i) * 0.7,
                ph: rnd('p'+i) * 6.28,
                sp: 0.4  + rnd('s'+i) * 1.4,
            });
        }
    }

    /* -------- ノード/エッジ -------- */
    let nodes = [], edges = [];

    function buildGraph(data) {
        nodes = []; edges = [];
        const root = {
            id:'root', name:'リスト', type:'core', children:[],
            level:0, wx:0, wy:0, done:false, state:'progress',
            _total:0, _done:0, progress:0, _ph:0, _amp:2, _sp:0.2,
        };

        function conv(api, parent, level) {
            const isQ    = api.task_type === 'mission';
            const isDone = api.complete_at === 1;
            const n = {
                id      : String(api.id),
                name    : api.task_name || '(無題)',
                type    : isQ ? 'quest' : 'task',
                done    : isDone,
                state   : isDone ? 'done' : 'idle',
                children: [],
                parent  : parent,
                level   : level,
                _apiData: api,
                _total:1, _done: isDone ? 1 : 0, progress: isDone ? 1 : 0,
            };
            if (api.children && api.children.length) {
                api.children.forEach(c => n.children.push(conv(c, n, level + 1)));
                const tot = api.children.length;
                const dn  = api.children.filter(c => c.complete_at === 1).length;
                n._total = tot; n._done = dn;
                n.progress = tot ? dn / tot : 0;
                if (!isDone) n.state = dn > 0 ? 'progress' : 'idle';
            }
            nodes.push(n);
            if (parent) edges.push({ a:parent, b:n });
            return n;
        }

        data.forEach(api => root.children.push(conv(api, root, 1)));
        root._total = nodes.filter(n => !n.children.length).length;
        root._done  = nodes.filter(n => !n.children.length && n.done).length;
        nodes.push(root);

        /* 有機放射状レイアウト */
        function place(node, baseAng) {
            const kids = node.children, n = kids.length;
            if (!n) return;
            const isCore = node.type === 'core';
            const spread = isCore ? Math.PI * 2 : Math.min(Math.PI * 1.1, 0.7 + n * 0.34);
            const baseR  = isCore ? 230 : Math.max(110, 190 - node.level * 18);
            kids.forEach((k, i) => {
                let ang;
                if (isCore) {
                    ang = (i / n) * Math.PI * 2 + rndS(k.id) * 0.22 - Math.PI / 2;
                } else {
                    const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
                    ang = baseAng + t * spread + rndS(k.id) * 0.28;
                }
                const r = baseR * (0.82 + rnd(k.id + 'r') * 0.42);
                k.wx = node.wx + Math.cos(ang) * r;
                k.wy = node.wy + Math.sin(ang) * r;
                k._ph  = rnd(k.id + 'p') * Math.PI * 2;
                k._amp = 3 + rnd(k.id + 'a') * 5;
                k._sp  = 0.25 + rnd(k.id + 's') * 0.35;
                place(k, ang);
            });
        }
        place(root, 0);
        fitCamera();
    }

    /* -------- カメラ -------- */
    const cam = { x:0, y:0, zoom:0.4, vx:0, vy:0 };
    let zoomTarget = 0.4, fitting = false, fitTo = null;
    let dragging = false, zooming = false, anchor = null;

    function getFitBox() {
        if (!nodes.length) return { cx:0, cy:0, z:0.4 };
        let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9;
        nodes.forEach(n => { x0=Math.min(x0,n.wx); y0=Math.min(y0,n.wy); x1=Math.max(x1,n.wx); y1=Math.max(y1,n.wy); });
        const cx=(x0+x1)/2, cy=(y0+y1)/2;
        const z = Math.min((W-80)/(x1-x0+1), (H-200)/(y1-y0+1));
        return { cx, cy, z: Math.max(0.28, Math.min(0.7, z)) };
    }
    function fitCamera() {
        const fb = getFitBox();
        fitting = true; fitTo = fb;
        cam.x = fb.cx; cam.y = fb.cy;
    }
    function setZoom(nz, sx, sy) {
        nz = Math.max(0.22, Math.min(2.5, nz));
        const wx = cam.x + (sx - W/2) / cam.zoom;
        const wy = cam.y + (sy - H/2) / cam.zoom;
        zoomTarget = nz; anchor = { wx, wy, sx, sy };
        zooming = true; fitting = false;
    }
    function proj(n, t) {
        const dx = Math.sin(t*(n._sp||0.3) + (n._ph||0)) * (n._amp||0);
        const dy = Math.cos(t*(n._sp||0.3)*0.8 + (n._ph||0)) * (n._amp||0) * 0.7;
        return [W/2 + (n.wx+dx - cam.x)*cam.zoom, H/2 + (n.wy+dy - cam.y)*cam.zoom];
    }

    /* -------- 描画ヘルパー -------- */
    function glow(x, y, r, rgb, a) {
        const g = ctx.createRadialGradient(x,y,0, x,y,r);
        g.addColorStop(0, 'rgba('+rgb+','+a+')');
        g.addColorStop(0.4, 'rgba('+rgb+','+(a*0.45)+')');
        g.addColorStop(1, 'rgba('+rgb+',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x,y,r,0,6.2832); ctx.fill();
    }

    function drawStar(x, y, baseR, rgb, bright, tw, isCore, isDone, isIdle) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(x, y, baseR*4.8, rgb, (isDone ? 0.5 : 0.32)*bright);

        if (!isIdle) {
            const mul   = isCore ? 5.4 : isDone ? 4.6 : 3.2;
            const spLen = baseR * mul * (0.6 + 0.5*tw) * Math.max(0.55, bright);
            const spA   = (isCore ? 0.95 : isDone ? 0.85 : 0.58) * (0.5+0.5*tw) * bright;
            const spike = (ang, len, w) => {
                const ex = x+Math.cos(ang)*len, ey = y+Math.sin(ang)*len;
                const g = ctx.createLinearGradient(x,y,ex,ey);
                g.addColorStop(0, 'rgba(255,255,255,'+spA+')');
                g.addColorStop(0.28, 'rgba('+rgb+','+(spA*0.7)+')');
                g.addColorStop(1, 'rgba('+rgb+',0)');
                ctx.strokeStyle=g; ctx.lineWidth=w; ctx.lineCap='round';
                ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(ex,ey); ctx.stroke();
            };
            spike(0,spLen,1.4); spike(1.5708,spLen,1.4); spike(3.1416,spLen,1.4); spike(4.7124,spLen,1.4);
            const dl = spLen*0.42;
            spike(0.785,dl,0.8); spike(2.356,dl,0.8); spike(3.927,dl,0.8); spike(5.498,dl,0.8);
        } else {
            const spLen = baseR * 1.1 * (0.6+0.4*tw);
            const spA   = 0.3 * (0.55+0.45*tw);
            for (const ang of [0,1.5708,3.1416,4.7124]) {
                ctx.strokeStyle='rgba('+rgb+','+spA+')'; ctx.lineWidth=1.2; ctx.lineCap='round';
                ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(ang)*spLen, y+Math.sin(ang)*spLen); ctx.stroke();
            }
        }

        const cr = Math.max(1, baseR * (isIdle ? 0.78 : 1));
        const cg = ctx.createRadialGradient(x,y,0, x,y,cr);
        cg.addColorStop(0, 'rgba(255,255,255,1)');
        cg.addColorStop(0.55, 'rgba('+rgb+',1)');
        cg.addColorStop(1, 'rgba('+rgb+',0)');
        ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(x,y,cr,0,6.2832); ctx.fill();
        ctx.restore();
    }

    /* -------- アニメーションループ -------- */
    let lastT = performance.now();
    function draw(now) {
        animId = requestAnimationFrame(draw);
        const t  = now / 1000;
        const dt = Math.min(2.5, (now - lastT) / 16.67);
        lastT = now;

        /* カメラ更新 */
        if (fitting && fitTo) {
            cam.zoom += (fitTo.z - cam.zoom) * 0.1 * dt;
            cam.x    += (fitTo.cx - cam.x)   * 0.1 * dt;
            cam.y    += (fitTo.cy - cam.y)    * 0.1 * dt;
            if (Math.abs(cam.zoom - fitTo.z) < 0.003) fitting = false;
        } else if (zooming && anchor) {
            cam.zoom += (zoomTarget - cam.zoom) * 0.3 * dt;
            cam.x = anchor.wx - (anchor.sx - W/2) / cam.zoom;
            cam.y = anchor.wy - (anchor.sy - H/2) / cam.zoom;
            if (Math.abs(cam.zoom - zoomTarget) < 0.002) zooming = false;
        } else if (!dragging) {
            cam.x += cam.vx * dt; cam.y += cam.vy * dt;
            cam.vx *= Math.pow(0.88, dt); cam.vy *= Math.pow(0.88, dt);
        }

        const zoom    = cam.zoom;
        const labelOp = Math.max(0, Math.min(1, (zoom - 0.52) / 0.24));
        const skyOp   = Math.max(0, Math.min(1, (0.48 - zoom) / 0.18));

        /* 背景グラデーション */
        const bg = ctx.createLinearGradient(0,0,0,H);
        bg.addColorStop(0, PAL.space1); bg.addColorStop(1, PAL.space0);
        ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

        /* ネビュラ */
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(W*0.28 - cam.x*0.02, H*0.34 - cam.y*0.02, 220, '90,60,170', 0.10);
        glow(W*0.72 - cam.x*0.02, H*0.62 - cam.y*0.02, 200, '40,90,150', 0.08);
        ctx.restore();

        /* 背景星 */
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        bgStars.forEach(s => {
            const fl = 0.45 + 0.55 * Math.sin(t * s.sp + s.ph);
            if (s.r > 1) glow(s.x, s.y, s.r*4.5, PAL.star, s.a*fl*0.5);
            ctx.fillStyle = 'rgba('+PAL.star+','+Math.min(1, s.a*fl*1.3)+')';
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
        });
        ctx.restore();

        if (!nodes.length) {
            /* 空の星空メッセージ */
            ctx.save();
            ctx.textAlign = 'center';
            ctx.font = '600 15px -apple-system,sans-serif';
            ctx.fillStyle = 'rgba(233,238,255,0.85)';
            ctx.fillText('まだ星がありません', W/2, H/2 - 12);
            ctx.font = '12px -apple-system,sans-serif';
            ctx.fillStyle = 'rgba(190,201,236,0.55)';
            ctx.fillText('タスクを追加すると、あなたの星空が広がります', W/2, H/2 + 12);
            ctx.restore();
            return;
        }

        const sp = new Map();
        nodes.forEach(n => sp.set(n.id, proj(n, t)));

        /* エッジ */
        ctx.save();
        edges.forEach(e => {
            const pa = sp.get(e.a.id), pb = sp.get(e.b.id);
            if (!pa || !pb) return;
            ctx.strokeStyle = e.b.done ? PAL.lineDone : PAL.line;
            ctx.lineWidth   = e.b.done ? 1.1 : 0.9;
            ctx.beginPath(); ctx.moveTo(pa[0],pa[1]); ctx.lineTo(pb[0],pb[1]); ctx.stroke();
        });
        ctx.restore();

        /* ノード */
        nodes.forEach(n => {
            const [x, y] = sp.get(n.id);
            const isCore  = n.type === 'core';
            const isQuest = n.type === 'quest';
            const isIdle  = n.state === 'idle' && !isCore;

            let baseR = isCore ? 13 : isQuest ? (n.level <= 1 ? 9 : 7) : 5;
            baseR = Math.max(isCore ? 7 : 2.4, baseR * zoom * 1.15);

            const bright = n.done ? 1 : isCore ? 1 : n.state === 'progress' ? 0.66 : 0.3;
            const tw  = 0.5 + 0.5 * Math.sin(t * (1.5 + (n._sp||0.3)*1.3) + (n._ph||0)*1.7);
            const rgb = isCore ? PAL.core : n.done ? PAL.done : (n.state==='progress' ? PAL.task : PAL.idle);

            drawStar(x, y, baseR, rgb, bright, tw, isCore, n.done, isIdle);

            /* 移動直後のパルスリング */
            if (n._pulseT0) {
                const age = (now - n._pulseT0) / 1000;
                if (age > 1.6) {
                    n._pulseT0 = 0;
                } else {
                    const k = age / 1.6;
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.strokeStyle = 'rgba(' + PAL.quest + ',' + (0.85 * (1 - k)) + ')';
                    ctx.lineWidth = 2.2 * (1 - k * 0.6);
                    ctx.beginPath(); ctx.arc(x, y, baseR + 5 + k * 46, 0, 6.2832); ctx.stroke();
                    /* 2本目の遅れリング */
                    if (k > 0.25) {
                        const k2 = (k - 0.25) / 0.75;
                        ctx.strokeStyle = 'rgba(' + PAL.quest + ',' + (0.5 * (1 - k2)) + ')';
                        ctx.lineWidth = 1.4;
                        ctx.beginPath(); ctx.arc(x, y, baseR + 5 + k2 * 34, 0, 6.2832); ctx.stroke();
                    }
                    ctx.restore();
                }
            }

            /* コアリング */
            if (isCore) {
                const pulse = 0.5 + 0.5*Math.sin(t*1.2 + (n._ph||0));
                ctx.save(); ctx.globalCompositeOperation='lighter';
                ctx.strokeStyle='rgba('+rgb+','+(0.30+0.18*pulse)+')'; ctx.lineWidth=1;
                ctx.beginPath(); ctx.arc(x,y, baseR*2.3+pulse*3, 0, 6.2832); ctx.stroke();
                ctx.restore();
            }

            /* 進捗アーク（クエスト） */
            if (isQuest && !n.done && labelOp > 0.05 && n.progress > 0) {
                ctx.save();
                ctx.strokeStyle='rgba('+PAL.quest+','+(0.85*labelOp)+')';
                ctx.lineWidth=2; ctx.lineCap='round';
                ctx.beginPath(); ctx.arc(x,y, baseR+5, -Math.PI/2, -Math.PI/2+n.progress*6.2832); ctx.stroke();
                ctx.restore();
            }

            /* ラベル（ズームイン時） */
            if (labelOp > 0.02 && !isCore) {
                ctx.save(); ctx.globalAlpha = labelOp;
                ctx.font = (isQuest ? '600 12' : '11') + 'px -apple-system,sans-serif';
                ctx.fillStyle = n.done ? PAL.labelDim : PAL.label;
                ctx.textBaseline = 'middle';
                ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=6;
                ctx.fillText(n.name, x + baseR + 7, y);
                ctx.restore();
            }

            /* コアラベル */
            if (isCore && labelOp > 0.02) {
                ctx.save(); ctx.globalAlpha = labelOp;
                ctx.font='600 12px -apple-system,sans-serif';
                ctx.fillStyle=PAL.label; ctx.textAlign='center'; ctx.textBaseline='top';
                ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=6;
                ctx.fillText(n.name, x, y+baseR+8);
                ctx.restore();
            }

            /* 星座名（ズームアウト時） */
            if (skyOp > 0.02 && isQuest && n.level === 1) {
                ctx.save(); ctx.globalAlpha = skyOp * 0.75;
                ctx.font='600 11px -apple-system,sans-serif';
                ctx.fillStyle=PAL.labelDim; ctx.textAlign='center'; ctx.textBaseline='top';
                ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=8;
                ctx.fillText(n.name, x, y+baseR+4);
                ctx.restore();
            }
        });
    }

    /* -------- インタラクション -------- */
    let moved=false, vel={x:0,y:0};
    let lastTapT=0, lastTapXY=null;
    const pts = new Map();
    let pinch = null;

    function hitTest(sx, sy) {
        const t = performance.now() / 1000;
        let best=null, bd=999;
        nodes.forEach(n => {
            const [x,y] = proj(n, t);
            const d = Math.hypot(sx-x, sy-y);
            const R = n.type==='core' ? 24 : n.type==='quest' ? 22 : 18;
            if (d<R && d<bd) { bd=d; best=n; }
        });
        return best;
    }

    function onPointerDown(e) {
        try { cv.setPointerCapture(e.pointerId); } catch(_){}
        pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
        if (pts.size === 2) { startPinch(); return; }
        moved = false; cam.vx=0; cam.vy=0; vel={x:0,y:0};
        dragging = true; cv.style.cursor = 'grabbing';
    }
    function onPointerMove(e) {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId);
        pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
        if (pts.size >= 2) { movePinch(); return; }
        const dx = e.clientX-prev.x, dy = e.clientY-prev.y;
        if (!dragging) return;
        if (Math.abs(dx)+Math.abs(dy) > 2) moved = true;
        cam.x -= dx/cam.zoom; cam.y -= dy/cam.zoom;
        vel.x = vel.x*0.6 + (-dx/cam.zoom)*0.4;
        vel.y = vel.y*0.6 + (-dy/cam.zoom)*0.4;
    }
    function onPointerUp(e) {
        const r  = cv.getBoundingClientRect();
        const sx = e.clientX-r.left, sy = e.clientY-r.top;
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (!dragging) return;
        dragging = false; cv.style.cursor = 'grab';
        if (!moved) {
            const nowT = performance.now();
            if (nowT-lastTapT<280 && lastTapXY && Math.hypot(sx-lastTapXY[0],sy-lastTapXY[1])<30) {
                setZoom(cam.zoom<1.0 ? cam.zoom*2.1 : cam.zoom*0.5, sx, sy);
                lastTapT=0; return;
            }
            lastTapT=nowT; lastTapXY=[sx,sy];
            const n = hitTest(sx, sy);
            if (n) {
                if (moveMode) { execMove(n); return; }
                openSheet(n);
            }
        } else {
            cam.vx=vel.x; cam.vy=vel.y;
        }
    }
    function startPinch() {
        const a = [...pts.values()];
        const r = cv.getBoundingClientRect();
        const mx=(a[0].x+a[1].x)/2-r.left, my=(a[0].y+a[1].y)/2-r.top;
        pinch={d:Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y), z:cam.zoom, mx, my};
        dragging=false;
    }
    function movePinch() {
        if (!pinch) return;
        const a = [...pts.values()];
        const r = cv.getBoundingClientRect();
        const nd=Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y);
        const mx=(a[0].x+a[1].x)/2-r.left, my=(a[0].y+a[1].y)/2-r.top;
        setZoom(pinch.z*(nd/pinch.d), mx, my);
    }

    /* -------- ボトムシート -------- */
    const sheetEl = document.createElement('div');
    sheetEl.style.cssText = [
        'position:fixed;left:0;right:0;bottom:0;z-index:500;',
        'transform:translateY(108%);transition:transform .42s cubic-bezier(.32,.72,0,1);',
        'background:rgba(13,15,30,0.93);',
        'backdrop-filter:blur(32px) saturate(1.5);',
        '-webkit-backdrop-filter:blur(32px) saturate(1.5);',
        'border-top:1px solid rgba(160,180,255,0.14);border-radius:22px 22px 0 0;',
        'padding:10px 20px calc(24px + env(safe-area-inset-bottom));',
        'color:#eef1ff;font-family:-apple-system,sans-serif;',
        'box-shadow:0 -16px 48px rgba(0,0,0,0.6);max-height:70vh;overflow-y:auto;',
    ].join('');

    const bdEl = document.createElement('div');
    bdEl.style.cssText = 'position:fixed;inset:0;z-index:499;background:rgba(2,3,10,0);pointer-events:none;transition:background .38s ease;';
    document.body.appendChild(bdEl);
    document.body.appendChild(sheetEl);

    function openSheet(n) {
        if (n.type === 'core') return;
        const isDone  = n.done;
        const isQuest = n.type === 'quest';
        const pct     = isQuest && n._total > 0 ? Math.round(n.progress*100) : 0;

        const progressHtml = isDone
            ? '<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,210,140,0.14);color:#ffd28a;font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;margin-bottom:14px;">✦ 達成済み</div>'
            : isQuest && n._total > 1
                ? '<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(190,200,235,0.6);margin-bottom:6px;"><span>クエスト進捗</span><span style="color:#ffd28a;font-weight:700;">' + n._done + '/' + n._total + ' \xb7 ' + pct + '%</span></div><div style="height:5px;border-radius:3px;background:rgba(120,135,200,0.2);margin-bottom:14px;"><div style="height:100%;width:' + pct + '%;border-radius:3px;background:linear-gradient(90deg,#ffd98a,#ff9f43);"></div></div>'
                : '';

        const actionHtml = !isDone
            ? '<button id="cz-ok" style="width:100%;padding:14px;border:none;border-radius:14px;background:linear-gradient(135deg,#34c759,#30a84a);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px;">✓ 完了にする</button>'
            : '<button id="cz-undo" style="width:100%;padding:14px;border:1px solid rgba(160,180,255,0.2);border-radius:14px;background:transparent;color:rgba(190,200,235,0.8);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:10px;">↩ 未完了に戻す</button>';

        sheetEl.innerHTML =
            '<div style="width:36px;height:5px;border-radius:3px;background:rgba(190,200,235,0.35);margin:0 auto 16px;"></div>' +
            '<div style="font-size:11px;letter-spacing:1.5px;color:rgba(190,200,235,0.6);font-weight:700;margin-bottom:6px;">' + (isQuest ? 'QUEST' : 'TASK') + '</div>' +
            '<div style="font-size:20px;font-weight:700;color:#eef1ff;margin-bottom:14px;line-height:1.3;">' + escHtml(n.name) + '</div>' +
            progressHtml + actionHtml +
            '<button id="cz-del" style="width:100%;padding:12px;border:1px solid rgba(255,80,60,0.3);border-radius:14px;background:transparent;color:rgba(255,100,80,0.8);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">削除</button>';

        sheetEl.querySelector('#cz-ok') && sheetEl.querySelector('#cz-ok').addEventListener('click', async () => {
            haptic(12);
            closeSheet();
            await action('complete', n._apiData.id);
            _tasksCache = null;
            refreshTree();
        });
        sheetEl.querySelector('#cz-undo') && sheetEl.querySelector('#cz-undo').addEventListener('click', async () => {
            closeSheet();
            await action('uncomplete', n._apiData.id);
            _tasksCache = null;
            refreshTree();
        });
        sheetEl.querySelector('#cz-del').addEventListener('click', async () => {
            if (!confirm('「' + n.name + '」を削除しますか？')) return;
            closeSheet();
            await action('delete', n._apiData.id);
            _tasksCache = null;
            refreshTree();
        });

        sheetEl.style.transform  = 'translateY(0)';
        bdEl.style.background    = 'rgba(2,3,10,0.52)';
        bdEl.style.pointerEvents = 'auto';
    }

    function closeSheet() {
        sheetEl.style.transform  = 'translateY(108%)';
        bdEl.style.background    = 'rgba(2,3,10,0)';
        bdEl.style.pointerEvents = 'none';
    }
    bdEl.addEventListener('pointerdown', closeSheet);

    function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* -------- フィットボタン -------- */
    function addFitBtn() {
        const btn = document.createElement('button');
        btn.style.cssText = [
            'position:absolute;right:14px;top:12px;z-index:16;',
            'width:40px;height:40px;border-radius:50%;',
            'border:1px solid rgba(160,180,255,0.14);',
            'background:rgba(9,11,22,0.72);',
            'backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);',
            'color:#eef1ff;font-size:16px;cursor:pointer;',
            'display:flex;align-items:center;justify-content:center;',
        ].join('');
        btn.textContent = '⊛';
        btn.title = '全体を表示';
        btn.onclick = () => {
            fitting=true; fitTo=getFitBox(); zooming=false; cam.vx=0; cam.vy=0;
        };
        treeView.appendChild(btn);
    }

    /* -------- データ読み込み -------- */
    let focusAfterBuild = null; // 再構築後にフォーカス＆パルスさせるノードID
    async function refreshTree() {
        try {
            const data = await apiCall('/tasks/tree?user_id=' + encodeURIComponent(userId));
            if (!data || !data.length) { nodes=[]; edges=[]; return; }
            buildGraph(data);
            if (focusAfterBuild) {
                const n = nodes.find(x => x.id === focusAfterBuild);
                focusAfterBuild = null;
                if (n) {
                    n._pulseT0 = performance.now();
                    fitting = true;
                    fitTo = { cx: n.wx, cy: n.wy, z: Math.max(0.9, cam.zoom) };
                }
            }
        } catch(e) {
            console.error('[constellation] load error:', e);
        }
    }

    /* -------- ビュー切替 -------- */
    let eventsAttached = false;
    function showTree() {
        window._treeViewActive = true;
        listView.style.display = 'none';
        treeView.style.display = '';
        if (addBar) addBar.style.display = 'none';

        if (!cv) { initCanvas(); addFitBtn(); treeView.appendChild(moveBanner); }
        resize();
        if (animId) cancelAnimationFrame(animId);
        lastT = performance.now();
        animId = requestAnimationFrame(draw);

        if (!eventsAttached) {
            eventsAttached = true;
            cv.addEventListener('pointerdown', onPointerDown);
            cv.addEventListener('pointermove', onPointerMove);
            cv.addEventListener('pointerup',   onPointerUp);
            cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch=null; dragging=false; });
            cv.addEventListener('wheel', e => {
                e.preventDefault();
                const r = cv.getBoundingClientRect();
                const base = zooming ? zoomTarget : cam.zoom;
                setZoom(base*(e.deltaY<0?1.12:0.89), e.clientX-r.left, e.clientY-r.top);
            }, {passive:false});
            window.addEventListener('resize', () => {
                if (treeView.style.display !== 'none') resize();
            });
        }
        refreshTree();
    }

    function hideTree() {
        window._treeViewActive = false;
        if (animId) { cancelAnimationFrame(animId); animId=null; }
        closeSheet();
        exitMove();
        if (addBar) addBar.style.display = '';
        listView.style.display = '';
        treeView.style.display = 'none';
    }

    btnList.addEventListener('click', () => {
        btnList.classList.add('active');
        btnTree.classList.remove('active');
        hideTree();
    });
    btnTree.addEventListener('click', () => {
        btnTree.classList.add('active');
        btnList.classList.remove('active');
        showTree();
    });

    /* -------- 移動モード -------- */
    let moveMode = null; // { taskId, taskName }
    const moveBanner = document.createElement('div');
    moveBanner.style.cssText = [
        'position:absolute;left:12px;right:12px;top:12px;z-index:20;display:none;',
        'align-items:center;gap:10px;padding:12px 14px;border-radius:14px;',
        'background:rgba(13,15,30,0.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);',
        'border:1px solid rgba(255,159,67,0.35);color:#eef1ff;',
        'font-family:-apple-system,sans-serif;font-size:13px;line-height:1.4;',
        'box-shadow:0 8px 28px rgba(0,0,0,0.5);',
    ].join('');

    function enterMove(taskId, taskName) {
        moveMode = { taskId: String(taskId), taskName };
        moveBanner.innerHTML =
            '<span style="font-size:18px;">🚀</span>' +
            '<span style="flex:1;">「<b>' + escHtml(taskName) + '</b>」の移動先の星をタップ<br>' +
            '<span style="color:rgba(190,200,235,0.65);font-size:11px;">中心の星をタップでトップ階層へ</span></span>' +
            '<button id="cz-move-cancel" style="flex-shrink:0;padding:8px 14px;border:1px solid rgba(160,180,255,0.25);border-radius:10px;background:transparent;color:#eef1ff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">キャンセル</button>';
        moveBanner.style.display = 'flex';
        moveBanner.querySelector('#cz-move-cancel').addEventListener('click', exitMove);
    }
    function exitMove() {
        moveMode = null;
        moveBanner.style.display = 'none';
    }

    /* 移動先が自分自身/自分の子孫でないか確認（循環防止） */
    function isDescendantOf(node, ancestorId) {
        let p = node;
        while (p) {
            if (String(p.id) === ancestorId) return true;
            p = p.parent;
        }
        return false;
    }

    async function execMove(target) {
        if (!moveMode) return;
        const { taskId, taskName } = moveMode;
        if (String(target.id) === taskId) {
            if (typeof showToast === 'function') showToast('自分自身へは移動できません', 'error');
            return;
        }
        if (target.type !== 'core' && isDescendantOf(target, taskId)) {
            if (typeof showToast === 'function') showToast('自分の配下へは移動できません', 'error');
            return;
        }
        const parentId = target.type === 'core' ? null : Number(target.id);
        exitMove();
        try {
            await apiCall('/tasks/action', 'POST', {
                user_id: userId, action: 'reparent',
                task_id: Number(taskId), parent_task_id: parentId,
            });
            haptic(12);
            _tasksCache = null;
            focusAfterBuild = String(taskId);   // 移動先でパルス＆フォーカス
            refreshTree();
            if (typeof showToast === 'function') {
                const dest = target.type === 'core' ? 'トップ階層' : `「${target.name}」の下`;
                showToast(`🚀 「${taskName}」を${dest}へ移動しました`, 'success');
            }
        } catch (e) {
            console.error('[constellation] move error:', e);
            const msg = String(e).includes('MAX_DEPTH') ? '階層が深すぎるため移動できません' : '移動に失敗しました';
            if (typeof showToast === 'function') showToast(msg, 'error');
        }
    }

    /* -------- 公開API -------- */
    window.refreshTreeIfVisible = () => {
        if (treeView && treeView.style.display !== 'none') refreshTree();
    };
    window.enterMoveMode = (taskId, taskName) => {
        // リスト側のカードの持ち上げ表示を解除
        document.querySelectorAll('.card-lifted').forEach(c => c.classList.remove('card-lifted'));
        btnTree.click();
        enterMove(taskId, taskName);
    };

})();
