/* =============================================
   ムキムキタスくん - タスク管理
   ============================================= */

// DOM要素
const urgentEl = document.getElementById("urgentList");
const questEl = document.getElementById("questList");
const taskEl = document.getElementById("taskList");
const completedEl = document.getElementById("completed");

/**
 * タスクリスト読み込み
 */
let _tasksCache = null;
let _tasksCacheTs = 0;
const TASKS_CACHE_TTL = 30000;

async function loadList(force = false) {
    const now = Date.now();
    if (!force && _tasksCache && (now - _tasksCacheTs) < TASKS_CACHE_TTL) {
        renderList(_tasksCache);
        return;
    }
    try {
        const data = await apiCall(`/tasks/list?user_id=${encodeURIComponent(userId)}`);
        _tasksCache = data;
        _tasksCacheTs = Date.now();
        renderList(data);
    } catch (e) {
        console.error("タスク取得エラー:", e);
        renderList({ critical: [], high: [], active: [], completed: [] });
    }
}

/**
 * タスクリストをレンダリング
 */
function renderList(payload) {
    urgentEl.innerHTML = '';
    questEl.innerHTML = '';
    taskEl.innerHTML = '';
    completedEl.innerHTML = '';

    const critical = Array.isArray(payload.critical) ? payload.critical : [];
    const high = Array.isArray(payload.high) ? payload.high : [];
    const active = Array.isArray(payload.active) ? payload.active : [];
    const completed = Array.isArray(payload.completed) ? payload.completed : [];

    // 全未完了タスクをマージして、タイプ別に振り分け
    const allActive = [
        ...critical.map(t => ({ ...t, priority_level: 'critical' })),
        ...high.map(t => ({ ...t, priority_level: t.priority_level || 'high' })),
        ...active.map(t => ({ ...t, priority_level: t.priority_level || 'normal' }))
    ];

    const urgent = allActive.filter(t => t.priority_level === 'critical');
    const quest = allActive.filter(t => t.task_type === 'mission' && t.priority_level !== 'critical');
    const tasks = allActive.filter(t => t.task_type !== 'mission' && t.priority_level !== 'critical');

    urgent.forEach(t => urgentEl.appendChild(createTaskCard(t, false, 'critical')));
    quest.forEach(t => questEl.appendChild(createTaskCard(t, false, 'quest')));
    tasks.forEach(t => taskEl.appendChild(createTaskCard(t, false, t.priority_level || 'normal')));
    completed.forEach(t => completedEl.appendChild(createTaskCard(t, true, t.priority_level || 'normal')));

    // セクションラベルの表示/非表示
    document.getElementById('urgentSection').style.display = urgent.length > 0 ? '' : 'none';
    document.getElementById('questSection').style.display = quest.length > 0 ? '' : 'none';
    document.getElementById('taskSection').style.display = tasks.length > 0 ? '' : 'none';

    // セクションカウント更新
    const urgentCountEl = document.getElementById('urgentCount');
    const questCountEl  = document.getElementById('questCount');
    const taskCountEl   = document.getElementById('taskCount');
    if (urgentCountEl) urgentCountEl.textContent = urgent.length > 0 ? `${urgent.length}` : '';
    if (questCountEl)  questCountEl.textContent  = quest.length  > 0 ? `${quest.length}`  : '';
    if (taskCountEl)   taskCountEl.textContent   = tasks.length  > 0 ? `${tasks.length}`  : '';

    // ジャーナル用に今日の達成タスクを保持
    window._completedTasksForJournal = completed;

    // 達成タスクアコーディオン更新
    updateCompletedToggle(completed.length);
}

function updateCompletedToggle(count) {
    const countEl = document.getElementById('completedCount');
    if (countEl) countEl.textContent = count > 0 ? count : '';

    const toggle = document.getElementById('completedToggle');
    const wrap = document.getElementById('completedListWrap');
    if (!toggle || !wrap) return;

    // 初回バインドのみ
    if (!toggle._bound) {
        toggle._bound = true;
        toggle.addEventListener('click', () => {
            const isOpen = toggle.classList.contains('open');
            toggle.classList.toggle('open', !isOpen);
            wrap.classList.toggle('open', !isOpen);
        });
    }
}

function _ringCheckSvg(color = 'rgba(60,60,67,0.3)') {
    return `<svg viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="11" stroke="${color}" stroke-width="1.5"/></svg>`;
}
function _filledCheckSvg(color) {
    return `<svg viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="13" fill="${color}"/><polyline points="7,13.5 11,17.5 19,9" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * タスクカードを作成（スワイプ機能付き）
 */
function createTaskCard(t, isCompleted, priority) {
    const wrap = document.createElement("div");
    wrap.className = `card priority-${priority}`;
    if (isCompleted) wrap.classList.add("completed");
    if (t._new) { wrap.style.animation = 'czRowIn .42s cubic-bezier(.32,.72,0,1) both'; t._new = false; }

    // アクションレール（左右のボタン）
    const rail = document.createElement("div");
    rail.className = "actions-rail";

    // 左側アクション（完了/未完了）
    const left = document.createElement("div");
    left.className = "actions-left";
    if (!isCompleted) {
        left.append(
            mkBtn("完了", () => action("complete", t.id), "btn-complete"),
            mkBtn("通知", () => openRemind(t), "btn-plus2h")
        );
    } else {
        left.append(mkBtn("未完", () => {
            if (checkTaskLimit()) action("uncomplete", t.id);
        }, "btn-complete"));
    }

    // 右側アクション
    const right = document.createElement("div");
    right.className = "actions-right";
    right.append(
        mkBtn("詳細", () => openDetail(t), "btn-detail"),
        mkBtn("⚡", () => openPriorityModal(t), "btn-priority"),
        mkBtn("削除", () => {
            if (t.task_type === 'mission') {
                if (!confirm(`「${t.task_name || 'このクエスト'}」を削除しますか？\n（配下のタスクもすべて削除されます）`)) return;
            }
            action("delete", t.id);
        }, "btn-delete")
    );

    rail.append(left, right);

    // メインコンテンツ（スライド部分）
    const sl = document.createElement("div");
    sl.className = "sl";

    // インラインチェックボックス
    const checkBtn = document.createElement('button');
    checkBtn.className = 'card-check';
    const chkColor = priority === 'critical' ? '#ff3b30' : '#34c759';
    checkBtn.innerHTML = isCompleted ? _filledCheckSvg('#34c759') : _ringCheckSvg(chkColor);
    checkBtn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        checkBtn.style.animation = 'none';
        void checkBtn.offsetHeight;
        checkBtn.style.animation = 'czCheckPop .28s cubic-bezier(.32,.72,0,1)';
        if (isCompleted) {
            if (checkTaskLimit()) action('uncomplete', t.id);
        } else {
            action('complete', t.id);
        }
    });

    // コンテンツエリア（タイトル＋リマインド）
    const contentArea = document.createElement("div");
    contentArea.className = "card-content";

    const titleArea = document.createElement("div");
    titleArea.className = "card-title-area";

    // タスクタイプアイコン
    if (priority === 'critical') {
        const icon = document.createElement("span");
        icon.textContent = "⚡";
        icon.style.cssText = "font-size:13px;flex-shrink:0;";
        titleArea.appendChild(icon);
    } else if (t.task_type === 'mission') {
        const icon = document.createElement("span");
        icon.textContent = "🎯";
        icon.style.cssText = "font-size:13px;flex-shrink:0;";
        titleArea.appendChild(icon);
    }

    const titleEl = document.createElement("span");
    titleEl.className = "title";
    titleEl.textContent = t.task_name || t.title || "(無題)";
    titleArea.appendChild(titleEl);

    // 今日中サブタスクバッジ（クエスト用）
    if (!isCompleted && t.task_type === 'mission' && t.has_urgent_descendant) {
        const urgentBadge = document.createElement("span");
        urgentBadge.className = "quest-urgent-badge";
        urgentBadge.textContent = "⚡今日中";
        titleArea.appendChild(urgentBadge);
    }
    // サブタスク件数バッジ（クエスト用）: 「残N/M」or「M」
    if (!isCompleted && t.task_type === 'mission' && t.subtask_count > 0) {
        const badge = document.createElement("span");
        badge.className = "subtask-count-badge";
        const rem = t.incomplete_subtask_count ?? t.subtask_count;
        badge.textContent = rem < t.subtask_count ? `残${rem}/${t.subtask_count}` : `${t.subtask_count}`;
        titleArea.appendChild(badge);
    }

    contentArea.appendChild(titleArea);

    // リマインド表示（タイトル下に配置）
    if (t.remind_at) {
        const remindEl = document.createElement("div");
        remindEl.className = "remindAt";
        remindEl.textContent = formatRemindLabel(t.remind_at);
        contentArea.appendChild(remindEl);
    }

    // ドラッグハンドル
    const handle = document.createElement("div");
    handle.className = "handle";
    handle.textContent = "☰";

    sl.append(checkBtn, contentArea, handle);
    const editPanel = createCardEditPanel(t);
    const inlineSubs = document.createElement('div');
    inlineSubs.className = 'card-inline-subtasks';
    inlineSubs.style.display = 'none';
    // 子カードのスワイプが親カードに伝播しないよう隔離
    inlineSubs.addEventListener('pointerdown', e => e.stopPropagation());
    wrap.append(rail, sl, editPanel, inlineSubs);

    // === 改良版スワイプ機能を適用 ===
    applySwipeToCard(wrap, t, isCompleted, (actionType, taskId) => {
        if (actionType === 'complete') {
            if (isCompleted) {
                if (checkTaskLimit()) action("uncomplete", taskId);
            } else {
                action("complete", taskId);
            }
        } else if (actionType === 'delete') {
            const td = wrap.__taskData;
            if (td?.task_type === 'mission') {
                if (!confirm(`「${td.task_name || 'このクエスト'}」を削除しますか？\n（配下のタスクもすべて削除されます）`)) {
                    // スワイプを元に戻す
                    const slEl = wrap.querySelector('.sl');
                    if (slEl) { slEl.style.transition = ''; slEl.style.transform = ''; }
                    wrap.classList.remove('open-right', 'open-left');
                    return;
                }
            }
            action("delete", taskId);
        }
    });

    // === ドラッグ（並び替え）===
    setupDragHandle(handle, wrap, sl, t);

    // === タップでインライン編集パネルを開閉 ===
    sl.addEventListener('click', (e) => {
        if (e.target.closest('.handle') || e.target.closest('button')) return;
        if (wrap.classList.contains('open-left') || wrap.classList.contains('open-right')) return;
        toggleCardEditPanel(wrap);
    });

    // === ロングプレス（500ms）→ 移動モード ===
    if (!isCompleted) {
        let longPressTimer = null;
        const startLongPress = (e) => {
            if (e.target.closest('.handle') || e.target.closest('button')) return;
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                wrap.classList.add('card-lifted');
                if (typeof window.enterMoveMode === 'function') {
                    window.enterMoveMode(t.id, t.task_name || t.title || '');
                }
            }, 500);
        };
        const cancelLongPress = () => { clearTimeout(longPressTimer); longPressTimer = null; };
        sl.addEventListener('pointerdown', startLongPress);
        sl.addEventListener('pointerup',   cancelLongPress);
        sl.addEventListener('pointermove', cancelLongPress);
        sl.addEventListener('pointercancel', cancelLongPress);
    }

    // タスクデータを保持
    wrap.__taskData = t;
    wrap.dataset.taskId = t.id;

    return wrap;
}

/**
 * カード展開編集パネルを作成
 */
function createCardEditPanel(t) {
    const panel = document.createElement("div");
    panel.className = "card-edit-panel";

    const isQuest = t.task_type === 'mission';
    const typeLabel = isQuest ? '🎯 クエスト' : '✅ タスク';
    const remindBadge = t.remind_at ? `<span class="card-remind-badge">${formatRemindLabel(t.remind_at)}</span>` : '';
    const reasonHtml = t.reason ? `<div class="card-reason-text">💡 ${escapeHtml(t.reason)}</div>` : '';

    panel.innerHTML = `
        <div class="card-edit-inner">
            <div class="card-info-badges">
                <span class="card-type-badge">${typeLabel}</span>
                ${remindBadge}
            </div>
            ${reasonHtml}
            <div class="form-group" style="margin-bottom:8px;">
                <input type="text" class="form-input card-edit-name" value="${escapeHtml(t.task_name || t.title || '')}" />
            </div>
            <div class="card-type-switcher">
                <button class="card-type-btn${isQuest ? ' active' : ''}" data-type="mission">🎯 クエスト</button>
                <button class="card-type-btn${!isQuest ? ' active' : ''}" data-type="default">✅ タスク</button>
            </div>
            <div class="card-edit-reason-group" style="${isQuest ? '' : 'display:none'}">
                <textarea class="form-input card-edit-reason" rows="2" placeholder="なぜやるの？（任意）" style="resize:none;margin-bottom:8px;">${escapeHtml(t.reason || '')}</textarea>
            </div>
            <div class="card-subtask-section">
                <div class="card-subtask-list" id="subtaskList_${t.id}"></div>
                <div class="card-add-subtask-row">
                    <input type="text" class="form-input card-add-subtask-input" placeholder="サブタスクを追加…" style="flex:1;margin:0;" />
                    <button class="card-add-subtask-btn">＋</button>
                </div>
            </div>
            <div class="card-edit-actions">
                <button class="card-edit-cancel-btn">キャンセル</button>
                <button class="card-edit-save-btn">💪 保存</button>
            </div>
        </div>`;

    panel.querySelectorAll('.card-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.querySelectorAll('.card-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const isM = btn.dataset.type === 'mission';
            const rg = panel.querySelector('.card-edit-reason-group');
            if (rg) rg.style.display = isM ? 'block' : 'none';
            // サブタスクセクションはタイプに関わらず常に表示
        });
    });

    // サブタスク読み込み（パネル開いたときに遅延ロード: toggleCardEditPanelで実行）

    // サブタスク追加（loadListを避けて直接API呼び出し）
    const addSubtaskBtn = panel.querySelector('.card-add-subtask-btn');
    const addSubtaskInput = panel.querySelector('.card-add-subtask-input');
    if (addSubtaskBtn && addSubtaskInput) {
        const doAddSubtask = async () => {
            const name = addSubtaskInput.value.trim();
            if (!name) return;
            addSubtaskInput.value = '';
            try {
                await apiCall('/tasks/action', 'POST', {
                    user_id: userId, action: 'add_subtask',
                    task_name: name, parent_task_id: t.id
                });
                loadSubtasks(t.id, panel.querySelector(`#subtaskList_${t.id}`));
                window.refreshTreeIfVisible?.();
            } catch (e) {
                console.error('サブタスク追加失敗', e);
            }
        };
        addSubtaskBtn.addEventListener('click', (e) => { e.stopPropagation(); doAddSubtask(); });
        addSubtaskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); doAddSubtask(); } });
    }

    panel.querySelector('.card-edit-cancel-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const w = panel.closest('.card');
        if (w) toggleCardEditPanel(w);
    });

    panel.querySelector('.card-edit-save-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const newTitle = panel.querySelector('.card-edit-name').value.trim();
        const newType = panel.querySelector('.card-type-btn.active')?.dataset.type || t.task_type || 'default';
        const newReason = panel.querySelector('.card-edit-reason').value.trim() || null;
        const oldTitle = t.task_name || t.title || '';
        const promises = [];
        if (newTitle && newTitle !== oldTitle) {
            promises.push(action("rename", t.id, { task_name: newTitle }));
        }
        if (newType !== (t.task_type || 'default') || newReason !== (t.reason || null)) {
            promises.push(action("update_type", t.id, { task_type: newType, reason: newReason }));
        }
        if (promises.length > 0) await Promise.all(promises);
        const w = panel.closest('.card');
        if (w) toggleCardEditPanel(w);
    });

    return panel;
}

/**
 * カード編集パネルのトグル
 */
function toggleCardEditPanel(wrap) {
    if (wrap.classList.contains('completed')) return;   // 完了タスクは開かない
    const t = wrap.__taskData;
    const isOpen = wrap.classList.contains('expanded') || wrap.classList.contains('bubble-open');

    // 他の開いているカードを全部閉じる
    document.querySelectorAll('.card.expanded, .card.bubble-open').forEach(c => {
        c.classList.remove('expanded', 'bubble-open');
        const prev = c.querySelector('.card-inline-subtasks');
        if (prev) prev.style.display = 'none';
    });

    if (!isOpen) {
        const inlineSubs = wrap.querySelector('.card-inline-subtasks');
        if (t && t.subtask_count > 0) {
            // サブタスクあり → バブルアップ表示（expanded は使わない＝edit panel が開かない）
            if (inlineSubs) {
                inlineSubs.style.display = '';
                renderBubbleUpSubtasks(t.id, inlineSubs);
            }
            wrap.classList.add('bubble-open');
        } else {
            // サブタスクなし → 従来の編集パネルを開く
            const panel = wrap.querySelector('.card-edit-panel');
            const list  = panel?.querySelector('.card-subtask-list');
            if (list && !list._loaded) {
                list._loaded = true;
                if (t) loadSubtasks(t.id, list);
            }
            wrap.classList.add('expanded');
        }
    }
}

/**
 * ドラッグハンドルのセットアップ
 */
function setupDragHandle(handle, wrap, sl, t) {
    const startDrag = (startEvent) => {
        startEvent.preventDefault();
        startEvent.stopPropagation();

        const card = wrap;
        const list = card.parentElement;
        if (!list) return;

        isDraggingCard = true;
        closeAllSwipeRows(); // 開いているスワイプを閉じる

        card.classList.remove("open-left", "open-right");
        sl.style.transition = "none";
        sl.style.transform = "translateX(0)";

        const cardRect = card.getBoundingClientRect();
        const dragStartY = startEvent.clientY || (startEvent.touches && startEvent.touches[0].clientY);
        const cardStartTop = cardRect.top;
        const cardHeight = cardRect.height;
        const cardWidth = cardRect.width;

        // ドラッグ用クローン
        const dragClone = card.cloneNode(true);
        dragClone.style.cssText = `position:fixed;left:${cardRect.left}px;top:${cardRect.top}px;width:${cardWidth}px;height:${cardHeight}px;pointer-events:none;z-index:1000;opacity:0.95;box-shadow:0 8px 20px rgba(0,0,0,0.3);transition:none;`;
        dragClone.classList.add("dragging");
        document.body.appendChild(dragClone);

        card.style.opacity = "0.3";
        card.style.transition = "none";
        document.body.style.userSelect = "none";

        const getY = ev => ev.touches?.length ? ev.touches[0].clientY : ev.clientY;

        const updatePosition = (y) => {
            const deltaY = y - dragStartY;
            dragClone.style.top = (cardStartTop + deltaY) + "px";

            const cloneCenterY = cardStartTop + deltaY + cardHeight / 2;
            const siblings = Array.from(list.querySelectorAll(".card"));

            for (const sibling of siblings) {
                if (sibling === card) continue;
                const siblingRect = sibling.getBoundingClientRect();
                if (cloneCenterY < siblingRect.top + siblingRect.height / 2) {
                    if (card.nextSibling !== sibling) list.insertBefore(card, sibling);
                    return;
                }
            }
            if (list.lastElementChild !== card) list.appendChild(card);
        };

        const onMove = ev => {
            ev.preventDefault();
            updatePosition(getY(ev));
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("touchmove", onMove);
            document.removeEventListener("touchend", onUp);

            dragClone.remove();
            card.style.opacity = "";
            card.style.transition = "";
            card.classList.remove("open-left", "open-right");

            const slEl = card.querySelector(".sl");
            if (slEl) {
                slEl.style.transition = "";
                slEl.style.transform = "translateX(0)";
            }

            document.body.style.userSelect = "";
            setTimeout(() => isDraggingCard = false, 50);
            saveSortOrder();
        };

        document.addEventListener("pointermove", onMove, { passive: false });
        document.addEventListener("pointerup", onUp);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onUp);
    };

    handle.addEventListener("pointerdown", e => { e.preventDefault(); startDrag(e); });
    handle.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); startDrag(e); }, { passive: false });
}

/**
 * 並び順保存
 */
async function saveSortOrder() {
    if (!userId) return;
    const orders = [];
    [urgentEl, questEl, taskEl, completedEl].forEach((listEl, idx) => {
        const section = ['urgent', 'quest', 'task', 'completed'][idx];
        listEl.querySelectorAll('.card').forEach((card, index) => {
            const t = card.__taskData;
            if (t) orders.push({ id: t.id, sort_order: index, section });
        });
    });
    if (orders.length) await action("sort_update", null, { orders });
}

/**
 * タスク追加（インライン入力）
 */
let _tempIdCounter = -1;

async function addTask() {
    const input = document.getElementById('newTitle');
    const title = input.value.trim();
    if (!title) return;
    if (!checkTaskLimit()) return;

    input.value = '';

    // 楽観的追加：即キャッシュに挿入してアニメ付きで表示
    const tempId = --_tempIdCounter;
    const tempTask = {
        id: tempId, task_name: title,
        task_type: 'default', priority_level: 'normal', _new: true,
    };
    if (_tasksCache) {
        _tasksCache.active = [tempTask, ...(_tasksCache.active || [])];
        renderList(_tasksCache);
    }

    // バックグラウンドでAPIを叩く（レスポンスの最新リストをそのまま反映＝再取得なし）
    apiCall('/tasks/action', 'POST', { user_id: userId, action: 'create', task_name: title })
        .then(list => adoptTaskList(list))
        .catch(e => {
            console.error('[addTask] error:', e);
            if (_tasksCache) {
                _tasksCache.active = (_tasksCache.active || []).filter(t => t.id !== tempId);
                renderList(_tasksCache);
            }
            showToast('追加に失敗しました', 'error');
        });
}

/**
 * 現在の未完了タスク数を取得
 */
function getTodoCount() {
    return urgentEl.querySelectorAll('.card:not(.completed)').length
         + questEl.querySelectorAll('.card:not(.completed)').length
         + taskEl.querySelectorAll('.card:not(.completed)').length;
}

/**
 * タスク枠制限チェック
 */
function checkTaskLimit() {
    // gating_enabled が false なら制限なし
    if (typeof isGatingEnabled === 'function' && !isGatingEnabled()) {
        return true;
    }

    const taskLimit = currentEntitlements?.task_limit ?? 3;
    const role = currentEntitlements?.role || 'user';

    // developer/adminは制限なし
    if (role === 'developer' || role === 'admin') {
        return true;
    }

    const currentCount = getTodoCount();
    if (currentCount >= taskLimit) {
        showUpgradeModal('TODO枠');
        return false;
    }
    return true;
}

/**
 * ボタン作成ヘルパー（アイコン+ラベルレイアウト）
 */
const _SWIPE_ICONS = {
    '完了': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    '未完': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 7v6h6"/><path d="M3 13A9 9 0 1 0 6 5.3"/></svg>',
    '通知': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    '詳細': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    '削除': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    '⚡':  '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
};
function mkBtn(label, onClick, cls) {
    const b = document.createElement("button");
    const icon = _SWIPE_ICONS[label];
    if (icon) {
        b.innerHTML = `<span class="swipe-btn-icon">${icon}</span><span class="swipe-btn-label">${label}</span>`;
    } else {
        b.textContent = label;
    }
    if (cls) b.className = cls;
    b.addEventListener("click", e => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
    });
    return b;
}

/**
 * サブタスクリストを読み込んでレンダリング
 */
async function loadSubtasks(parentId, container) {
    if (!container) return;
    container.innerHTML = '<div class="subtask-loading">…</div>';
    try {
        const data = await apiCall(`/tasks/subtasks?user_id=${encodeURIComponent(userId)}&parent_id=${parentId}`);
        container.innerHTML = '';
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="subtask-empty">サブタスクはまだありません</div>';
            return;
        }
        data.forEach(sub => {
            const row = document.createElement('div');
            row.className = `subtask-row${sub.complete_at === 1 ? ' subtask-done' : ''}`;
            row.innerHTML = `
                <button class="subtask-check-btn" title="${sub.complete_at === 1 ? '未完了に戻す' : '完了'}">
                    ${sub.complete_at === 1 ? '✓' : '○'}
                </button>
                <span class="subtask-name">${escapeHtml(sub.task_name)}</span>
                <button class="subtask-del-btn" title="削除">×</button>`;
            row.querySelector('.subtask-check-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const act = sub.complete_at === 1 ? 'uncomplete' : 'complete';
                try {
                    await apiCall('/tasks/action', 'POST', { user_id: userId, action: act, task_id: sub.id });
                } catch (err) { console.error(err); }
                loadSubtasks(parentId, container);
            });
            row.querySelector('.subtask-del-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await apiCall('/tasks/action', 'POST', { user_id: userId, action: 'delete', task_id: sub.id });
                } catch (err) { console.error(err); }
                loadSubtasks(parentId, container);
            });
            container.appendChild(row);
        });
    } catch (e) {
        container.innerHTML = '<div class="subtask-empty">読み込み失敗</div>';
    }
}

/**
 * バブルアップ式末端タスク表示
 * rootId: 起点タスクID（クエストや親タスク）
 * container: .card-inline-subtasks 要素
 * silent: true の場合ローディング表示をスキップ（楽観的更新用）
 */
async function renderBubbleUpSubtasks(rootId, container, silent = false) {
    if (!silent) container.innerHTML = '<div class="list-subtask-loading">…</div>';
    try {
        const items = [];
        await collectLeafItems(rootId, items, 0);
        container.innerHTML = '';

        if (items.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'list-subtask-empty';
            emptyDiv.textContent = '全タスク完了！🎉';
            container.appendChild(emptyDiv);
            const completeBtn = document.createElement('button');
            completeBtn.className = 'bubble-quest-complete-btn';
            completeBtn.textContent = 'クエスト達成！';
            completeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                completeBtn.disabled = true;
                try {
                    await apiCall('/tasks/action', 'POST', { user_id: userId, action: 'complete', task_id: rootId });
                    loadList();
                } catch (err) {
                    console.error(err);
                    completeBtn.disabled = false;
                }
            });
            container.appendChild(completeBtn);
            return;
        }
        items.forEach(item => container.appendChild(buildLeafCard(item, rootId, container)));
    } catch (e) {
        if (!silent) container.innerHTML = '';
    }
}

/**
 * 再帰的に末端タスクを収集
 * depth: 起点からの中間タスク数（直下=0, 孫=1, …）
 */
async function collectLeafItems(parentId, items, depth) {
    const data = await apiCall(`/tasks/subtasks?user_id=${encodeURIComponent(userId)}&parent_id=${parentId}`);
    const incomplete = (data || []).filter(t => t.complete_at !== 1);
    // 枝ごとに並列取得し、表示順は元の順序を維持
    const branches = await Promise.all(incomplete.map(async task => {
        if (task.subtask_count === 0) {
            // 末端（純粋な葉 or バブルアップ済み）
            return [{
                task,
                leftBadge: depth > 0 ? depth : null,   // 直下は数字なし、孫以降は中間数を表示
                rightBadge: task.completed_subtask_count || null,
            }];
        }
        // 未完了の子がいる → 再帰
        const sub = [];
        await collectLeafItems(task.id, sub, depth + 1);
        return sub;
    }));
    branches.forEach(b => items.push(...b));
}

/**
 * 末端カード構築（SwipeableRow を使った従来と同じスワイプUI）
 */
function buildLeafCard(item, rootId, container) {
    const { task, leftBadge, rightBadge } = item;

    const wrap = document.createElement('div');
    wrap.className = 'card inline-leaf-card' + (task.priority_level === 'critical' ? ' priority-critical' : '');

    // ── アクションレール ──
    const rail = document.createElement('div');
    rail.className = 'actions-rail';

    const actLeft = document.createElement('div');
    actLeft.className = 'actions-left';

    const actRight = document.createElement('div');
    actRight.className = 'actions-right';

    rail.append(actLeft, actRight);

    // ── スライド部分（.sl が SwipeableRow に必須）──
    const sl = document.createElement('div');
    sl.className = 'sl inline-leaf-sl';

    if (leftBadge) {
        const lBadge = document.createElement('div');
        lBadge.className = 'inline-badge-left';
        lBadge.textContent = leftBadge;
        sl.appendChild(lBadge);
    }

    const indent = document.createElement('span');
    indent.className = 'inline-indent';
    indent.textContent = '└';

    const nameEl = document.createElement('span');
    nameEl.className = 'inline-task-name';
    nameEl.textContent = task.task_name || '(無題)';

    sl.append(indent, nameEl);

    if (rightBadge) {
        const rBadge = document.createElement('div');
        rBadge.className = 'inline-badge-right';
        rBadge.textContent = rightBadge;
        sl.appendChild(rBadge);
    }

    wrap.append(rail, sl);

    // ── アクション処理（スワイプ完了 / ボタン両方から呼ばれる）──
    const onAction = async (actionType) => {
        try {
            await apiCall('/tasks/action', 'POST', { user_id: userId, action: actionType, task_id: task.id });
            // 親クエストは自動完了させない。サブタスク欄はそのまま維持
            await renderBubbleUpSubtasks(rootId, container, true);  // silent: ローディング表示なし
            _tasksCache = null;  // 次回loadList時に最新を取得（パネルは閉じない）
        } catch (err) {
            console.error(err);
            renderBubbleUpSubtasks(rootId, container);
        }
    };

    // ── ボタン（スワイプ開いた後にタップして実行できる）──
    actLeft.appendChild(mkBtn('完了', () => onAction('complete'), 'btn-complete'));
    actRight.appendChild(mkBtn('詳細', () => openDetail(task), 'btn-detail'));
    actRight.appendChild(mkBtn('削除', () => onAction('delete'), 'btn-delete'));

    // ── SwipeableRow（従来と同じスワイプライブラリ）──
    applySwipeToCard(wrap, task, false, onAction);

    return wrap;
}


/**
 * HTMLエスケープ
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
