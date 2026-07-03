/* =============================================
   ムキムキタスくん - アプリケーション初期化
   ============================================= */

let userId = null;
let isGroupContext = false;
let currentEntitlements = null;
let planData = null;
let _earlyContext = null;
let _idSource = 'none'; // userId の取得元（デバッグ用）
let _openedFromGroup = false; // グループチャットから起動されたか

/**
 * アプリ初期化
 */
async function init() {
    // Edge Functions ウォームアップ（cold start対策）
    fetch(`${API_BASE}/app-config`, { method: 'HEAD', headers: { apikey: SUPABASE_ANON_KEY } }).catch(() => {});

    // checkout成功フラグ
    const urlParams = new URLSearchParams(window.location.search);
    const isCheckoutSuccess = urlParams.get('checkout') === 'success';

    if (isCheckoutSuccess) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    // LIFF初期化
    console.log(`[ムキムキタスくん] ENV=${ENV}, LIFF_ID=${LIFF_ID}`);
    try {
        await liff.init({ liffId: LIFF_ID });

        // グループコンテキストを init 直後に取得（iOS ではプロフィール取得前に確認する必要がある）
        _earlyContext = null;
        try {
            _earlyContext = liff.getContext();
            console.log('[LIFF] context type:', _earlyContext?.type, '/ groupId:', _earlyContext?.groupId || 'none');
        } catch (_) {}

        if (!liff.isLoggedIn()) {
            const loginKey = 'liff_login_attempt';
            const attempts = parseInt(sessionStorage.getItem(loginKey) || '0');
            if (attempts >= 2) {
                // 3回目以降 → ループ防止、案内表示
                sessionStorage.removeItem(loginKey);
                console.warn('[LIFF] ログイン失敗（試行回数超過）');
                const liffUrl = `https://liff.line.me/${LIFF_ID}`;
                document.body.innerHTML = `
                    <div style="text-align:center;padding:60px 20px;font-family:sans-serif;">
                        <div style="font-size:48px;margin-bottom:16px;">💪</div>
                        <div style="font-size:18px;font-weight:700;color:#0d1b2a;margin-bottom:12px;">ムキムキタスくん</div>
                        <div style="font-size:14px;color:#778da9;margin-bottom:24px;line-height:1.6;">
                            LINEログインが完了できませんでした。<br>
                            LINEアプリから以下のリンクを開いてください。
                        </div>
                        <a href="${liffUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#ff9f43,#ff6b6b);color:white;border-radius:25px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(255,107,107,0.3);">
                            LINEで開く
                        </a>
                        <div style="margin-top:24px;font-size:11px;color:#aaa;">ENV: ${ENV} / LIFF: ${LIFF_ID}</div>
                    </div>`;
                return;
            }
            sessionStorage.setItem(loginKey, String(attempts + 1));

            if (liff.isInClient()) {
                // LINEアプリ内ブラウザ → liff.line.me 経由
                console.log('[LIFF] LINEアプリ内 → liff.line.me へリダイレクト');
                window.location.href = `https://liff.line.me/${LIFF_ID}`;
            } else {
                // 外部ブラウザ（PC等）→ liff.login() でOAuth認証
                console.log('[LIFF] 外部ブラウザ → liff.login() でOAuth開始');
                liff.login({ redirectUri: window.location.origin + window.location.pathname });
            }
            return;
        }

        // ログイン成功 → カウンターをクリア
        sessionStorage.removeItem('liff_login_attempt');
        try {
            const profile = await liff.getProfile();
            userId = profile.userId;
            _idSource = 'profile';
        } catch (profileError) {
            // profile scope がない場合は openid の sub で代替
            const token = liff.getDecodedIDToken();
            if (token?.sub) {
                userId = token.sub;
                _idSource = 'idtoken';
            } else {
                sessionStorage.removeItem('liff_login_attempt');
                liff.login({ redirectUri: window.location.origin + window.location.pathname });
                return;
            }
        }

        // グループコンテキスト検出（init 直後の結果を優先、失敗時は再取得）
        try {
            const context = _earlyContext || liff.getContext();
            console.log('[LIFF] final context:', context?.type, '/ userId now:', userId);
            if (context?.type === 'group') {
                _openedFromGroup = true;
                // 2023年2月のLINE仕様変更により context.groupId は Messaging API の
                // グループID（C+32桁hex）ではなく匿名化されたUUIDを返す。
                // C形式のときだけ直接採用し、それ以外はDBの group_id で解決する。
                if (context.groupId && /^C[0-9a-f]{32}$/.test(context.groupId)) {
                    userId = context.groupId;
                    isGroupContext = true;
                    _idSource = 'context-group';
                    console.log('[LIFF] group mode → userId =', userId);
                }
            }
        } catch (_) { /* コンテキスト取得不可（外部ブラウザ等）は無視 */ }

        // DEV環境：開発者以外はブロック
        if (ENV === 'DEV' && DEV_ALLOWED_USER_ID !== '<DEV_ALLOWED_USER_ID>' && userId !== DEV_ALLOWED_USER_ID) {
            document.body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#778da9;font-size:16px;">開発環境のため、アクセスが制限されています。</div>';
            return;
        }
        if (ENV === 'DEV') {
            console.log('[DEV] userId:', userId);
        }
    } catch (e) {
        console.error("LIFF初期化エラー:", e);
        userId = "demo_user";
    }

    // デモモードではデータ読み込みをスキップ
    if (userId === 'demo_user') {
        bindUI();
        return;
    }

    // entitlements を先に取得（group_id の確認が必要なため）
    await loadEntitlements();
    // グループから起動されたが context.groupId が使えない場合（2023年仕様変更後の通常ルート）、
    // または getContext 自体が取得できなかった場合は、DB の group_id でフォールバック
    if (!isGroupContext && currentEntitlements?.group_id && (_openedFromGroup || _earlyContext === null)) {
        userId = currentEntitlements.group_id;
        isGroupContext = true;
        _idSource = 'db-group';
        console.log('[LIFF] group_id from DB → userId =', userId);
        await loadEntitlements(); // グループ側の権限（task_limit等）を取り直す
    } else if (_openedFromGroup && !isGroupContext) {
        // グループ起動だがDBにgroup_id未登録 → 連携手順を案内
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#fff3cd;color:#856404;padding:10px 14px;font-size:13px;text-align:center;line-height:1.5;';
        banner.textContent = 'グループのタスクを表示するには、グループで一度 @ムキムキタスくん にメッセージを送ってから開き直してね！';
        document.body.prepend(banner);
    }
    await Promise.all([loadPlans(), loadAppConfig()]);

    // checkout成功時のリトライ処理
    if (isCheckoutSuccess) {
        await handleCheckoutSuccess();
    }

    bindUI();
    updateTabLockUI();
    initDeveloperMenu();
    await loadAllData();
}

/**
 * UI初期化
 */
function bindUI() {
    // タブナビゲーション
    document.querySelectorAll('.tab-nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // リストタブ
    const navAddBtn = document.getElementById('navAddBtn');
    if (navAddBtn) navAddBtn.onclick = showAddTaskModal;

    // クイック追加バー
    const listAddBarBtn = document.getElementById('listAddBarBtn');
    if (listAddBarBtn) listAddBarBtn.onclick = addTask;
    const newTitleInput = document.getElementById('newTitle');
    if (newTitleInput) {
        newTitleInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); addTask(); }
        });
    }

    // ステータスタブ
    document.getElementById('dailyTaskCard').addEventListener('click', e => {
        if (!e.target.closest('.habit-checkbox') && !e.target.closest('.daily-btn') && !e.target.closest('.habit-date-row')) {
            document.getElementById('dailyTaskCard').classList.toggle('expanded');
        }
    });
    document.getElementById('habitSaveBtn').onclick = saveHabits;
    document.getElementById('habitCancelBtn').onclick = () => {
        document.getElementById('dailyTaskCard').classList.remove('expanded');
    };
    // 日付ピッカー：日付変更時に該当日のデータを再読み込み
    const habitDatePicker = document.getElementById('habitRecordDate');
    if (habitDatePicker) {
        habitDatePicker.addEventListener('change', e => {
            e.stopPropagation();
            loadHabits(habitDatePicker.value);
        });
        // 今日の日付をデフォルト設定
        const t = new Date();
        habitDatePicker.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }
    renderHabitList();

    // ステータスタブの習慣設定ボタン（Phase2）
    const habitSettingsBtn = document.getElementById('habitSettingsBtn');
    if (habitSettingsBtn) habitSettingsBtn.onclick = () => showHabitSettingsModal();

    // ジャーナルタブ（FAB・モーダルバインドは bindJournalDetailModalUI() で行う）

    // テーマ切替
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.dataset.theme = savedTheme;
    updateThemeBtn(savedTheme);
    updateTabIcons(savedTheme);
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.onclick = () => {
            const current = document.documentElement.dataset.theme;
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            localStorage.setItem('theme', next);
            updateThemeBtn(next);
            updateTabIcons(next);
        };
    }

    // 各種モーダルUI初期化
    bindModalUI();
    bindTaskDetailModalUI();
    bindMonthlyAnalysisUI();
    bindJournalDetailModalUI();
    bindPriorityModalUI();
    bindMscUI();
    bindMbtiModalUI();
    bindMissionModalUI();
    bindUpgradeModalUI();
    bindHabitSettingsModalUI();
    bindAddTaskModalUI();
    initPullToRefresh();
    initTabSwipe();
}

/**
 * プルリフレッシュ初期化（SVGアーク版）
 */
function initPullToRefresh() {
    const THRESHOLD = 100;
    const SNAP_MS   = 350;
    const EASE      = 'cubic-bezier(0.25,0.46,0.45,0.94)';

    const ptr = document.getElementById('pullRefreshIndicator');
    const container = document.querySelector('.tab-contents');
    if (!ptr || !container) return;

    // SVGアーク式インジケーターに差し替え
    ptr.innerHTML = `
        <div class="ptr-circle">
            <svg class="ptr-svg" viewBox="0 0 28 28" width="28" height="28">
                <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,159,67,0.22)" stroke-width="2.8"/>
                <circle class="ptr-arc" cx="14" cy="14" r="11" fill="none"
                    stroke="#ff9f43" stroke-width="2.8" stroke-linecap="round"
                    stroke-dasharray="0 69.1" transform="rotate(-90 14 14)"/>
            </svg>
        </div>
        <span class="ptr-label">引っ張って更新</span>`;

    const arc = ptr.querySelector('.ptr-arc');
    const C   = 2 * Math.PI * 11;

    let startY       = 0;
    let pullY        = 0;
    let isPulling    = false;
    let isRefreshing = false;
    let startedScroll = false;

    function setPtr(offset, progress, label) {
        ptr.style.transform = `translateY(${offset - THRESHOLD}px)`;
        ptr.style.opacity   = String(Math.min(progress * 1.5, 1));
        arc.setAttribute('stroke-dasharray', `${C * Math.min(progress, 1)} ${C}`);
        if (label) ptr.querySelector('.ptr-label').textContent = label;
    }

    function resetPtr() {
        ptr.style.transition = `transform ${SNAP_MS}ms ${EASE}, opacity 280ms ease`;
        setPtr(0, 0, '引っ張って更新');
        ptr.classList.remove('ptr-ready', 'ptr-refreshing');
        setTimeout(() => { ptr.style.transition = ''; }, SNAP_MS + 50);
    }

    let startX = 0;
    container.addEventListener('touchstart', e => {
        if (isRefreshing || window._treeViewActive) return;
        if (container.scrollTop > 0) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isPulling = false;
        startedScroll = false;
        pullY = 0;
    }, { passive: true });

    container.addEventListener('touchmove', e => {
        if (isRefreshing || !startY) return;
        const dy = e.touches[0].clientY - startY;
        const dx = e.touches[0].clientX - startX;
        if (!startedScroll && Math.abs(dy) < 12) return;
        startedScroll = true;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 0.8) {
            if (isPulling) resetPtr();
            isPulling = false;
            return;
        }
        isPulling = true;
        pullY = dy;
        const clamped  = Math.min(dy * 0.46, THRESHOLD * 1.2);
        const progress = clamped / THRESHOLD;
        const label    = progress >= 1 ? '放して更新 ↑' : '引っ張って更新';
        ptr.style.transition = 'none';
        setPtr(clamped, progress, label);
        ptr.classList.toggle('ptr-ready', progress >= 1);
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    container.addEventListener('touchend', async () => {
        if (!isPulling) return;
        isPulling = false;
        const clamped = Math.min(pullY * 0.46, THRESHOLD * 1.2);
        if (clamped < THRESHOLD) {
            resetPtr();
            pullY = 0;
            return;
        }
        isRefreshing = true;
        ptr.classList.add('ptr-refreshing');
        ptr.classList.remove('ptr-ready');
        ptr.style.transition = `transform ${SNAP_MS}ms ${EASE}`;
        ptr.style.transform  = `translateY(0)`;
        ptr.querySelector('.ptr-label').textContent = '更新中…';
        arc.setAttribute('stroke-dasharray', `${C} 0`);
        try {
            await refreshActiveTab();
        } catch (_) {}
        await new Promise(r => setTimeout(r, 420));
        resetPtr();
        pullY = 0;
        setTimeout(() => { isRefreshing = false; }, SNAP_MS + 60);
    }, { passive: true });
}

let _tabAnimating = false;

/**
 * タブ間スワイプ移動（画面端のみ発動 · iOS スライドアニメ）
 */
function initTabSwipe() {
    const TAB_ORDER = ['list', 'status', 'journal'];
    const EDGE_ZONE = 28;  // 画面端からこのpx以内のみ発動
    const THRESHOLD = 52;  // 発動に必要な最小ドラッグ距離
    const container = document.querySelector('.tab-contents');
    if (!container) return;

    let sx = 0, sy = 0, locked = null, active = false;

    container.addEventListener('touchstart', e => {
        if (_tabAnimating || e.touches.length !== 1) return;
        if (document.querySelector('.journal-fullscreen-modal.visible')) return;
        if (document.querySelector('.modal-root.visible')) return;
        if (window._treeViewActive) return;

        const tx = e.touches[0].clientX;
        const W  = window.innerWidth;
        if (tx > EDGE_ZONE && tx < W - EDGE_ZONE) return; // 端以外は無視

        sx = tx; sy = e.touches[0].clientY;
        locked = null; active = true;
    }, { passive: true });

    container.addEventListener('touchmove', e => {
        if (!active || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            locked = Math.abs(dx) > Math.abs(dy) * 0.75 ? 'h' : 'v';
        }
        if (locked === 'v') active = false;
    }, { passive: true });

    container.addEventListener('touchend', e => {
        if (!active || locked !== 'h') { active = false; return; }
        const dx = e.changedTouches[0].clientX - sx;
        active = false;
        if (Math.abs(dx) < THRESHOLD) return;

        const isLeft  = sx < EDGE_ZONE;          // 左端から開始
        const isRight = sx > window.innerWidth - EDGE_ZONE; // 右端から開始
        const goLeft  = dx < 0;                  // 指が左へ移動 = 次タブ

        if (isLeft  &&  goLeft) return; // 左端から左スワイプは無効
        if (isRight && !goLeft) return; // 右端から右スワイプは無効

        const curTab = document.querySelector('.tab-nav-item.active')?.dataset.tab;
        const curIdx = TAB_ORDER.indexOf(curTab);
        if (curIdx < 0) return;
        const nextIdx = goLeft ? curIdx + 1 : curIdx - 1;
        if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;

        _switchTabAnimated(curTab, TAB_ORDER[nextIdx], goLeft ? 'left' : 'right');
    }, { passive: true });
}

/**
 * iOS風タブスライドアニメーション
 */
function _switchTabAnimated(fromId, toId, direction) {
    if (_tabAnimating) return;
    _tabAnimating = true;

    const container = document.querySelector('.tab-contents');
    const fromEl    = document.getElementById(`tab-${fromId}`);
    const toEl      = document.getElementById(`tab-${toId}`);
    if (!fromEl || !toEl || !container) {
        _tabAnimating = false; switchTab(toId); return;
    }

    const W    = container.offsetWidth;
    const H    = container.offsetHeight;
    const ease = 'cubic-bezier(0.32,0.72,0,1)';
    const dur  = 310;

    container.style.overflow = 'hidden'; // スクロール抑制

    // 来るタブを画面外に配置（absolute）
    toEl.style.cssText = [
        'display:block', 'position:absolute', 'top:0', 'left:0',
        `width:${W}px`, `height:${H}px`, 'overflow-y:auto',
        `transform:translateX(${direction === 'left' ? W : -W}px)`,
        'transition:none', 'z-index:2',
    ].join(';');

    // 現タブは normal flow のまま transform のみ
    fromEl.style.position  = 'relative';
    fromEl.style.zIndex    = '1';
    fromEl.style.transform = 'translateX(0)';
    fromEl.style.transition = 'none';

    requestAnimationFrame(() => requestAnimationFrame(() => {
        toEl.style.transition   = `transform ${dur}ms ${ease}`;
        fromEl.style.transition = `transform ${dur}ms ${ease}`;
        toEl.style.transform    = 'translateX(0)';
        // 旧タブは少し奥へ（iOS パララックス）
        fromEl.style.transform  = `translateX(${direction === 'left' ? -Math.round(W * 0.28) : Math.round(W * 0.28)}px)`;

        setTimeout(() => {
            [fromEl, toEl].forEach(el => el.removeAttribute('style'));
            container.style.overflow = '';
            _tabAnimating = false;
            switchTab(toId);
        }, dur + 20);
    }));
}

async function refreshActiveTab() {
    const activeTab = document.querySelector('.tab-nav-item.active')?.dataset.tab;
    if (activeTab === 'list') await loadList();
    else if (activeTab === 'status') { await loadHabits(); await loadMscData(); }
    else if (activeTab === 'journal') await loadJournals();
}

function updateThemeBtn(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function updateTabIcons(theme) {
    document.querySelectorAll('.tab-icon-light').forEach(el => {
        el.style.display = theme === 'dark' ? 'none' : 'block';
    });
    document.querySelectorAll('.tab-icon-dark').forEach(el => {
        el.style.display = theme === 'dark' ? 'block' : 'none';
    });
}

/* --------------------------------------------------
   Toast通知（alert()の代替）
-------------------------------------------------- */
function showToast(message, type = 'info') {
    let el = document.querySelector('.toast-notification');
    if (el) { clearTimeout(el._hideTimer); el.remove(); }
    el = document.createElement('div');
    el.className = `toast-notification toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add('show'));
    });
    el._hideTimer = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => { if (el.parentNode) el.remove(); }, 320);
    }, 2600);
}

/**
 * タブ切り替え
 */
function showGroupLockToast() {
    const existing = document.getElementById('groupLockToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'groupLockToast';
    toast.className = 'group-lock-toast';
    toast.textContent = 'グループモードでは使用できません';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function switchTab(tabId) {
    // グループモード：ステータス/ジャーナルはロック
    if (isGroupContext && (tabId === 'status' || tabId === 'journal')) {
        showGroupLockToast();
        return;
    }

    // gating_enabled が true の場合のみ権限チェック
    const gatingOn = typeof isGatingEnabled === 'function' && isGatingEnabled();

    if (gatingOn && tabId === 'status' && currentEntitlements && !currentEntitlements.can_status) {
        showUpgradeModal('ステータス機能');
        return;
    }
    if (gatingOn && tabId === 'journal' && currentEntitlements && !currentEntitlements.can_journal) {
        showUpgradeModal('ジャーナル機能');
        return;
    }

    document.querySelectorAll('.tab-nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-nav-item[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // スワイプを閉じる
    closeAllSwipeRows();

    // タブ切り替え時に自動データ読み込み
    if (userId && userId !== 'demo_user') {
        if (tabId === 'status') { loadHabits(); loadMscData(); }
        if (tabId === 'journal') loadJournals();
    }
}

/**
 * タブのロック表示更新
 */
function updateTabLockUI() {
    const statusTab = document.querySelector('.tab-nav-item[data-tab="status"]');
    const journalTab = document.querySelector('.tab-nav-item[data-tab="journal"]');
    const gatingOn = typeof isGatingEnabled === 'function' && isGatingEnabled();

    // innerHTML を使うとアイコン画像が消えるため、span のみ更新する
    const statusSpan = statusTab.querySelector('span');
    const journalSpan = journalTab.querySelector('span');

    // グループモードロック（課金ロックより優先）
    if (isGroupContext) {
        if (statusSpan) statusSpan.innerHTML = 'ステータス<span class="lock-icon">👥</span>';
        statusTab.classList.add('group-locked');
        statusTab.classList.remove('locked');
        if (journalSpan) journalSpan.innerHTML = 'ジャーナル<span class="lock-icon">👥</span>';
        journalTab.classList.add('group-locked');
        journalTab.classList.remove('locked');
        return;
    }

    if (gatingOn && currentEntitlements && !currentEntitlements.can_status) {
        if (statusSpan) statusSpan.innerHTML = 'ステータス<span class="lock-icon">🔒</span>';
        statusTab.classList.add('locked');
    } else {
        if (statusSpan) statusSpan.textContent = 'ステータス';
        statusTab.classList.remove('locked');
    }

    if (gatingOn && currentEntitlements && !currentEntitlements.can_journal) {
        if (journalSpan) journalSpan.innerHTML = 'ジャーナル<span class="lock-icon">🔒</span>';
        journalTab.classList.add('locked');
    } else {
        if (journalSpan) journalSpan.textContent = 'ジャーナル';
        journalTab.classList.remove('locked');
    }
}

/**
 * 全データ読み込み
 */
async function loadAllData() {
    const promises = [loadList(), loadMissionTask()];

    // グループモードはステータス・ジャーナルをロードしない
    if (!isGroupContext) {
        if (currentEntitlements?.can_status) {
            promises.push(loadHabits(), loadMscData());
        }
        if (currentEntitlements?.can_journal) {
            promises.push(loadJournals());
        }
    }

    await Promise.all(promises);

    if (!isGroupContext) checkWeeklyReflectionBanner();
}

// ===== 週次振り返りバナー（Phase1） =====
function checkWeeklyReflectionBanner() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isWindow = (day === 0 && hour >= 18) || (day === 1 && hour < 12);
    if (!isWindow) return;
    const skipKey = 'weekly_banner_skip_' + getWeekKey();
    if (sessionStorage.getItem(skipKey)) return;
    if (journalsData && journalsData.length > 0) {
        const weekStart = getWeekStart();
        const hasJournal = journalsData.some(j => new Date(j.date) >= weekStart);
        if (hasJournal) return;
    }
    showWeeklyReflectionBanner();
}

function getWeekKey() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function getWeekStart() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0,0,0,0);
    return d;
}

function showWeeklyReflectionBanner() {
    const banner = document.getElementById('weeklyReflectionBanner');
    if (!banner) return;
    banner.style.display = 'flex';
    document.getElementById('weeklyBannerWriteBtn').onclick = () => {
        banner.style.display = 'none';
        switchTab('journal');
        const content = document.getElementById('journalContent');
        if (content) content.focus();
    };
    document.getElementById('weeklyBannerLaterBtn').onclick = () => {
        banner.style.display = 'none';
        sessionStorage.setItem('weekly_banner_skip_' + getWeekKey(), '1');
    };
}

// アプリ起動
init();
