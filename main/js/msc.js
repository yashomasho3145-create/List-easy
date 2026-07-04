/* =============================================
   ムキムキタスくん - MSC（ムキムキステータスカード）
   ============================================= */

let mscRadarChart = null;
let userMbti = null;
let selectedMbti = null;
let userMscCustomData = null;

let mscData = {
    level: 1,
    exp: 0,
    totalExp: 1000,
    score: 0,
    radarData: { discipline: 0, purpose: 0, curiosity: 0, reflection: 0, action: 0, consistency: 0 },
    strengths: [],
    weaknesses: [],
    bio: ''
};

/**
 * MSC UI初期化
 */
function bindMscUI() {
    const mscOpenBtn = document.getElementById('mscOpenBtn');
    const mscCardView = document.getElementById('msc-card-view');

    function showMsc() {
        mscCardView.classList.add('active');
        mscOpenBtn.classList.add('active');
        mscOpenBtn.textContent = '← 戻る';
    }

    function hideMsc() {
        mscCardView.classList.remove('active');
        mscOpenBtn.classList.remove('active');
        mscOpenBtn.textContent = 'MSC';
    }

    mscOpenBtn.addEventListener('click', () => {
        if (mscCardView.classList.contains('active')) {
            hideMsc();
        } else {
            showMsc();
        }
    });

    const mscBackdrop = document.getElementById('mscModalBackdrop');
    if (mscBackdrop) {
        mscBackdrop.addEventListener('click', hideMsc);
    }
}

/**
 * MSCデータ読み込み
 */
async function loadMscData() {
    // カスタムデータ読み込み
    try {
        const mscRes = await apiCall(`/msc?user_id=${encodeURIComponent(userId)}`);
        if (mscRes) {
            userMscCustomData = mscRes;
            userMbti = userMscCustomData.mbti_type || null;
        }
    } catch (e) {
        userMscCustomData = null;
    }

    await calculateMscFromHabits();
    applyCustomMscData();
    renderMsc();
}

/**
 * カスタムデータ適用
 */
function applyCustomMscData() {
    if (!userMscCustomData) return;

    if (userMscCustomData.custom_strength) {
        mscData.strengths = [{
            key: 'custom',
            name: userMscCustomData.custom_strength.name,
            icon: userMscCustomData.custom_strength.icon || '💪',
            desc: userMscCustomData.custom_strength.desc || '',
            score: mscData.strengths[0]?.score || 3.5
        }];
    }

    if (userMscCustomData.custom_weakness) {
        mscData.weaknesses = [{
            key: 'custom',
            name: userMscCustomData.custom_weakness.name,
            icon: userMscCustomData.custom_weakness.icon || '📝',
            desc: userMscCustomData.custom_weakness.desc || '',
            score: mscData.weaknesses[0]?.score || 2.0
        }];
    }

    if (userMscCustomData.custom_bio) {
        mscData.bio = userMscCustomData.custom_bio;
    }
}

/**
 * 習慣データからMSCスコア計算（Phase2対応版）
 */
async function calculateMscFromHabits() {
    const now = new Date();

    // 直近3ヶ月分を並列取得（直列awaitだと3倍待たされる）
    const monthlyResults = await Promise.all([0, 1, 2].map(i => {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;
        return apiCall(`/habits/monthly?user_id=${encodeURIComponent(userId)}&year=${year}&month=${month}`)
            .catch(() => null);
    }));
    const allMonthlyData = monthlyResults.flatMap(d => d?.monthly || []);

    // カテゴリ別集計
    const categoryScores = {};
    for (const cat of HABIT_CATEGORIES) categoryScores[cat] = { done: 0, total: 0 };

    // currentHabits（habit.jsで取得済み）を使ってカテゴリマッピング
    const habitsForMapping = typeof currentHabits !== 'undefined' ? currentHabits : [];

    for (const day of allMonthlyData) {
        const completions = day.completions || {};
        for (const [habitId, completed] of Object.entries(completions)) {
            const habit = habitsForMapping.find(h => h.habit_id === habitId);
            const cat = habit?.category;
            if (cat && categoryScores[cat]) {
                categoryScores[cat].total++;
                if (completed) categoryScores[cat].done++;
            }
        }
    }

    // 6軸レーダーデータ
    const radarKeys = ['体力', '知力', '精神力', '節制', '生産性', '活力'];
    const radarValues = radarKeys.map(cat => {
        const s = categoryScores[cat];
        if (!s || s.total === 0) return 0;
        return Math.min(Math.round((s.done / s.total) * 5 * 10) / 10, 5);
    });

    mscData.radarData = {
        discipline: radarValues[3],   // 節制 → 規律力
        purpose: radarValues[4],      // 生産性 → 目的力
        curiosity: radarValues[1],    // 知力 → 探求力
        reflection: radarValues[2],   // 精神力 → 内省力
        action: radarValues[0],       // 体力 → 行動力
        consistency: radarValues[5],  // 活力 → 継続力
    };

    const values = Object.values(mscData.radarData);
    mscData.score = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;

    const totalDone = Object.values(categoryScores).reduce((a, b) => a + b.done, 0);
    mscData.exp = totalDone * 10;
    mscData.level = Math.floor(mscData.exp / 500) + 1;
    mscData.totalExp = mscData.level * 500;

    analyzeMscTraits();
}

/**
 * 強み・弱み分析
 */
function analyzeMscTraits() {
    const traits = [
        { key: 'discipline', name: '規律シールド', icon: '🌅', desc: '早起きと禁酒を継続し、規律正しい生活を送っている。' },
        { key: 'purpose', name: '目的ブースト', icon: '🎯', desc: 'ミッション達成への意識が高く、目標に向かって進んでいる。' },
        { key: 'curiosity', name: '探究パワー', icon: '📚', desc: '読書・学習習慣が根付いており、知的好奇心が旺盛。' },
        { key: 'reflection', name: '内省タイム', icon: '📝', desc: 'ジャーナルで振り返りを行い、自己理解を深めている。' },
        { key: 'action', name: '行動エナジー', icon: '💪', desc: 'トレーニングを継続し、行動力を発揮している。' },
        { key: 'consistency', name: '継続マインド', icon: '🔥', desc: '空白日が少なく、コンスタントに取り組んでいる。' }
    ];

    const scores = traits.map(t => ({ ...t, score: mscData.radarData[t.key] }));
    scores.sort((a, b) => b.score - a.score);

    mscData.strengths = scores.filter(s => s.score >= 2.5).slice(0, 1);
    mscData.weaknesses = scores.filter(s => s.score < 3.0).slice(-1);

    generateBioMemo();
}

/**
 * 生態メモ生成
 */
function generateBioMemo() {
    const topTrait = mscData.strengths[0];

    const bios = [
        `${topTrait ? topTrait.name.replace(/シールド|ブースト|パワー|タイム|エナジー|マインド/, '') : '成長'}への情熱を持ち、日々の積み重ねを大切にしている。`,
        '一歩一歩着実に前進し、自分のペースで成長を続けるタイプ。',
        '困難があっても諦めず、粘り強く取り組む姿勢が光る。'
    ];

    if (mscData.radarData.discipline >= 3.5) {
        bios.push('朝型の生活リズムを好み、コツコツと積み上げることを得意とする。');
    }
    if (mscData.radarData.curiosity >= 3.5) {
        bios.push('知識欲が強く、常に新しいことを学ぼうとする姿勢を持つ。');
    }
    if (mscData.radarData.action >= 3.5) {
        bios.push('思い立ったら即行動。エネルギッシュに動き回るタイプ。');
    }

    mscData.bio = bios.slice(0, 2).join('\n');
}

/**
 * MSCレンダリング
 */
function renderMsc() {
    // MBTI
    const mbtiTag = document.getElementById('mscMbtiTag');
    if (userMbti && MBTI_NAMES[userMbti]) {
        mbtiTag.textContent = `${userMbti} (${MBTI_NAMES[userMbti]})`;
    } else {
        mbtiTag.textContent = 'MBTIを設定';
    }

    // レベル
    const levelTitle = LEVEL_TITLES.find(l => mscData.level >= l.min && mscData.level <= l.max)?.title || '見習い';
    document.getElementById('mscLevelBadge').textContent = `Lv.${mscData.level} ${levelTitle}`;

    // スコア・星
    const score = mscData.score || 0;
    const fullStars = Math.floor(score);
    const halfStar = score % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    document.getElementById('mscStars').textContent = '★'.repeat(fullStars) + (halfStar ? '☆' : '') + '☆'.repeat(emptyStars);
    document.getElementById('mscScore').textContent = score.toFixed(2);

    // EXP
    const expInLevel = mscData.exp % 1000;
    document.getElementById('mscExpFill').style.width = `${(expInLevel / 1000) * 100}%`;
    document.getElementById('mscExpText').textContent = `${expInLevel} / 1000 EXP`;

    renderMscRadarChart();

    // 強み
    const strengthsHtml = mscData.strengths.length > 0
        ? mscData.strengths.map(s => `
            <div class="msc-trait-item">
                <div class="msc-trait-label">STRENGTH</div>
                <div class="msc-trait-icon">${s.icon}</div>
                <div class="msc-trait-content">
                    <div class="msc-trait-header">
                        <span class="msc-trait-name">${s.name}</span>
                        <span class="msc-trait-level">Lv.${s.score.toFixed(1)}</span>
                    </div>
                    <div class="msc-trait-desc">${s.desc}</div>
                </div>
            </div>
        `).join('')
        : '<div class="msc-trait-item"><div class="msc-trait-label">STRENGTH</div><div class="msc-trait-icon">📊</div><div class="msc-trait-content"><div class="msc-trait-desc">データを蓄積中...</div></div></div>';
    document.getElementById('mscStrengths').innerHTML = strengthsHtml;

    // 弱み
    const weaknessesHtml = mscData.weaknesses.length > 0
        ? mscData.weaknesses.map(w => `
            <div class="msc-trait-item">
                <div class="msc-trait-label">WEAKNESS</div>
                <div class="msc-trait-icon">${w.icon}</div>
                <div class="msc-trait-content">
                    <div class="msc-trait-header">
                        <span class="msc-trait-name">${w.name}</span>
                        <span class="msc-trait-level">Lv.${w.score.toFixed(1)}</span>
                    </div>
                    <div class="msc-trait-desc">${w.desc.replace('している', 'が課題')}</div>
                </div>
            </div>
        `).join('')
        : '<div class="msc-trait-item"><div class="msc-trait-label">WEAKNESS</div><div class="msc-trait-icon">📊</div><div class="msc-trait-content"><div class="msc-trait-desc">データを蓄積中...</div></div></div>';
    document.getElementById('mscWeaknesses').innerHTML = weaknessesHtml;

    // 生態メモ
    document.getElementById('mscBioText').textContent = mscData.bio || 'まだデータが少ないです。日々のトレーニングを続けて、あなたの特性を分析しましょう。';

    // 2a アイデンティティカード（インライン）
    renderStatusIdCard();
}

/* ─────────────────────────────────────────────
   2a アイデンティティカード ─ インライン描画
───────────────────────────────────────────── */
function renderStatusIdCard() {
    const data = mscData;
    const levelTitle = (LEVEL_TITLES.find(l => data.level >= l.min && data.level <= l.max) || {}).title || '見習いトレーニー';

    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt('statusIdLv', `Lv.${data.level}`);
    setTxt('statusIdTitle', levelTitle);
    const mbtiEl = document.getElementById('statusIdMbti');
    if (mbtiEl) mbtiEl.textContent = (userMbti && MBTI_NAMES[userMbti]) ? `${userMbti} · ${MBTI_NAMES[userMbti]}` : 'MBTI設定';
    setTxt('statusIdScore', data.score.toFixed(2));
    setTxt('statusIdStars', _idStarsStr(data.score));

    _renderIdExp(data);
    _renderIdRadar(data.radarData);
    _renderIdTraits();

    const cta = document.getElementById('statusLinkCta');
    if (cta && !cta._ctaBound) {
        cta._ctaBound = true;
        cta.onclick = () => {
            if (typeof switchTab === 'function') switchTab('list');
            setTimeout(() => { const btn = document.getElementById('btnViewTree'); if (btn) btn.click(); }, 80);
        };
    }
}

function _idStarsStr(score) {
    const f = Math.min(5, Math.floor(score));
    return '★'.repeat(f) + '☆'.repeat(5 - f);
}

function _renderIdExp(data) {
    const wrap = document.getElementById('statusExpWrap');
    if (!wrap) return;
    const perLv = 500;
    const expInLv = data.exp % perLv;
    const pct = Math.round(expInLv / perLv * 100);
    wrap.innerHTML = `<div class="status-exp-header">
        <span class="status-exp-lv">Lv.${data.level} → ${data.level + 1}</span>
        <span class="status-exp-num">${expInLv} / ${perLv} EXP</span>
    </div>
    <div class="status-exp-track"><div class="status-exp-fill" id="statusExpFill"></div></div>`;
    requestAnimationFrame(() => { const f = document.getElementById('statusExpFill'); if (f) f.style.width = pct + '%'; });
}

function _renderIdTraits() {
    const el = document.getElementById('statusTraitsGroup');
    if (!el) return;
    const mkRow = (t, kind) => {
        const ks = kind === 's', lbl = ks ? 'STRENGTH' : 'WEAKNESS';
        return `<div class="status-trait-row">
            <div class="status-trait-ico ${kind}">${t.icon}</div>
            <div class="status-trait-body">
                <div class="status-trait-kind-row"><span class="status-trait-kind ${kind}">${lbl}</span><span class="status-trait-lv">Lv.${t.score.toFixed(1)}</span></div>
                <div class="status-trait-name">${t.name}</div>
                <div class="status-trait-desc">${t.desc}</div>
            </div>
        </div>`;
    };
    const rows = [];
    if (mscData.strengths[0]) rows.push(mkRow(mscData.strengths[0], 's'));
    if (mscData.weaknesses[0]) rows.push(mkRow(mscData.weaknesses[0], 'w'));
    el.innerHTML = rows.length ? rows.join('') : '<div class="status-trait-row"><div class="status-trait-body"><div class="status-trait-desc" style="padding:4px 0">習慣データを積み上げると分析されます。</div></div></div>';
}

function _renderIdRadar(rd) {
    const wrap = document.getElementById('statusRadarWrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    const SIZE = 290, N = 6;
    const cv = document.createElement('canvas');
    cv.className = 'status-radar-canvas';
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SIZE * DPR; cv.height = SIZE * DPR;
    wrap.appendChild(cv);
    const ctx = cv.getContext('2d');
    ctx.scale(DPR, DPR);

    const cx = SIZE / 2, cy = SIZE / 2, R = SIZE * 0.34;
    const ang = i => -Math.PI / 2 + (i / N) * Math.PI * 2;

    const AXES = [
        { key:'action',      name:'行動力', icon:'💪', star:'肉体を極める' },
        { key:'curiosity',   name:'探求力', icon:'📚', star:'叡智の星座' },
        { key:'reflection',  name:'内省力', icon:'📝', star:'心を鍛える' },
        { key:'discipline',  name:'節制力', icon:'🛡', star:'規律の星座' },
        { key:'purpose',     name:'生産力', icon:'🎯', star:'生活を整える' },
        { key:'consistency', name:'継続力', icon:'🔥', star:'全星座' },
    ];
    const catMap = { action:'体力', curiosity:'知力', reflection:'精神力', discipline:'節制', purpose:'生産性', consistency:'活力' };
    const vals = AXES.map(a => rd[a.key] || 0);

    let animS = 0;
    function draw() {
        ctx.clearRect(0, 0, SIZE, SIZE);
        for (let r = 1; r <= 5; r++) {
            const rr = R * r / 5;
            ctx.beginPath();
            for (let i = 0; i <= N; i++) {
                const a = ang(i % N), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
                i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = r === 5 ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.05)';
            ctx.lineWidth = 1; ctx.stroke();
        }
        AXES.forEach((_, i) => {
            const a = ang(i);
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
            ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; ctx.stroke();
        });
        ctx.beginPath();
        AXES.forEach((_, i) => {
            const a = ang(i), rr = R * (vals[i] / 5) * animS;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, 'rgba(52,199,89,0.30)');
        g.addColorStop(1, 'rgba(52,199,89,0.06)');
        ctx.fillStyle = g; ctx.fill();
        ctx.save();
        ctx.shadowColor = 'rgba(52,199,89,0.6)'; ctx.shadowBlur = 12;
        ctx.strokeStyle = '#34c759'; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.restore();
        AXES.forEach((_, i) => {
            const a = ang(i), rr = R * (vals[i] / 5) * animS;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill();
            ctx.strokeStyle = '#34c759'; ctx.lineWidth = 2.4; ctx.stroke();
        });
    }

    // popover
    const popEl = document.createElement('div');
    popEl.className = 'status-axis-pop';
    wrap.appendChild(popEl);
    function hidePop() { popEl.classList.remove('on'); }
    wrap.addEventListener('click', e => {
        if (!e.target.closest('.status-radar-lbl') && !e.target.closest('.status-axis-pop')) hidePop();
    });

    AXES.forEach((ax, i) => {
        const a = ang(i);
        const lx = cx + Math.cos(a) * R * 1.36;
        const ly = cy + Math.sin(a) * R * 1.36;
        const btn = document.createElement('button');
        btn.className = 'status-radar-lbl';
        btn.style.cssText = `left:${lx}px;top:${ly}px;`;
        btn.innerHTML = `<span class="status-radar-lbl-name">${ax.name}</span><span class="status-radar-lbl-val">${vals[i].toFixed(1)}</span>`;
        btn.onclick = e => {
            e.stopPropagation();
            const habits = (typeof currentHabits !== 'undefined' ? currentHabits : [])
                .filter(h => h.category === catMap[ax.key]).map(h => h.name);
            const habitRows = habits.length
                ? habits.map(h => `<div class="status-axis-pop-habit"><div class="status-axis-pop-dot"></div>${h}</div>`).join('')
                : `<div class="status-axis-pop-habit"><div class="status-axis-pop-dot" style="background:#8a8a8e"></div><span style="color:var(--text-muted)">習慣未設定</span></div>`;
            popEl.innerHTML = `<div class="status-axis-pop-inner">
                <div class="status-axis-pop-head">
                    <span class="status-axis-pop-icon">${ax.icon}</span>
                    <span class="status-axis-pop-name">${ax.name}</span>
                    <span class="status-axis-pop-val">${vals[i].toFixed(1)}<span class="status-axis-pop-vsub">/5</span></span>
                </div>
                <div class="status-axis-pop-habits-label">この力を支える習慣</div>
                <div class="status-axis-pop-habits">${habitRows}</div>
                <div class="status-axis-pop-star">
                    <span>✦</span>
                    <span class="status-axis-pop-star-text">達成が <b style="color:#d98a2b;">「${ax.star}」</b> を灯します</span>
                </div>
            </div>`;
            popEl.style.top = (ly / SIZE < 0.55 ? (ly + 16) : Math.max(4, ly - 172)) + 'px';
            popEl.classList.remove('on');
            void popEl.offsetWidth;
            popEl.classList.add('on');
        };
        wrap.appendChild(btn);
    });

    const t0 = performance.now();
    (function step(now) {
        const k = Math.min(1, (now - t0) / 950);
        animS = 1 - Math.pow(1 - k, 3);
        draw();
        if (k < 1) requestAnimationFrame(step);
    })(performance.now());
}

/**
 * レーダーチャートレンダリング（6軸対応）
 */
function renderMscRadarChart() {
    const ctx = document.getElementById('mscRadarChart').getContext('2d');
    if (mscRadarChart) mscRadarChart.destroy();

    const data = mscData.radarData;
    mscRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['行動力', '探求力', '内省力', '節制力', '生産力', '継続力'],
            datasets: [{
                data: [data.action, data.curiosity, data.reflection, data.discipline, data.purpose, data.consistency],
                backgroundColor: 'rgba(255, 100, 50, 0.18)',
                borderColor: 'rgba(255, 159, 67, 1)',
                borderWidth: 2.5,
                pointBackgroundColor: 'rgba(255, 100, 50, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: { duration: 800, easing: 'easeOutQuart' },
            scales: {
                r: {
                    min: 0,
                    max: 5,
                    ticks: { stepSize: 1, display: false },
                    grid: { color: 'rgba(255, 100, 50, 0.25)', lineWidth: 1 },
                    angleLines: { color: 'rgba(255, 100, 50, 0.2)' },
                    pointLabels: {
                        color: '#ff9966',
                        font: { family: "'M PLUS Rounded 1c', sans-serif", size: 12, weight: '700' },
                        padding: 8
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.raw.toFixed(1)} / 5`
                    }
                }
            }
        }
    });
}

// === MBTI ===
function bindMbtiModalUI() {
    const modal = document.getElementById('mbtiModal');
    const close = () => { modal.classList.remove('visible'); selectedMbti = null; };

    document.getElementById('mbtiBackdrop').onclick = close;
    document.getElementById('mbtiCloseBtn').onclick = close;

    document.querySelectorAll('.mbti-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.mbti-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedMbti = opt.dataset.mbti;
        });
    });

    document.getElementById('mbtiClearBtn').onclick = () => {
        document.querySelectorAll('.mbti-option').forEach(o => o.classList.remove('selected'));
        selectedMbti = null;
    };

    document.getElementById('mbtiSaveBtn').onclick = async () => {
        userMbti = selectedMbti;
        await saveMbti();
        renderMsc();
        close();
    };
}

function openMbtiModal() {
    selectedMbti = userMbti;
    document.querySelectorAll('.mbti-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.mbti === userMbti);
    });
    document.getElementById('mbtiModal').classList.add('visible');
}

async function saveMbti() {
    try {
        await apiCall('/msc', 'POST', { user_id: userId, mbti_type: userMbti });
        if (userMscCustomData) {
            userMscCustomData.mbti_type = userMbti;
        } else {
            userMscCustomData = { mbti_type: userMbti };
        }
    } catch (e) {
        localStorage.setItem(`msc_mbti_${userId}`, userMbti || '');
    }
}

async function saveMscCustomData(data) {
    try {
        const response = await apiCall('/msc', 'POST', { user_id: userId, ...data });
        if (response) {
            if (!userMscCustomData) userMscCustomData = {};
            Object.assign(userMscCustomData, data);
            return true;
        }
    } catch (e) {}
    return false;
}
