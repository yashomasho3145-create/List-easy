/* =============================================
   ムキムキタスくん - スワイプ機能（iPhone純正品質）
   ============================================= */

// 現在開いているカードをグローバルに1つだけ管理
let currentOpenRow = null;

// ドラッグ中フラグ（並び替えとの競合防止）
let isDraggingCard = false;

/**
 * SwipeableRowクラス
 */
class SwipeableRow {
    constructor(element, options = {}) {
        this.wrap = element;
        this.sl = element.querySelector('.sl');
        this.actionsLeft = element.querySelector('.actions-left');
        this.actionsRight = element.querySelector('.actions-right');

        this.options = {
            onAction:       options.onAction       || (() => {}),
            taskData:       options.taskData       || null,
            isCompleted:    options.isCompleted    || false,
            dataId:         options.dataId         || null,
            rightFlyAction: options.rightFlyAction || 'complete',
            leftFlyAction:  options.leftFlyAction  || 'delete',
        };

        // 状態
        this.state = 'closed';
        this.isLocked = false;
        this.isScrolling = null;
        this.isActive = false;

        // 座標・速度
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.offsetAtStart = 0;
        this.velocitySamples = [];
        this.lastMoveTime = 0;

        // ボタン幅（実測）
        this.leftWidth = 0;
        this.rightWidth = 0;

        // rAF
        this.rafId = null;

        // タップ判定
        this.hasMoved = false;
        this.gestureTarget = null;

        // ボタン参照キャッシュ
        this._leftButtons = [];
        this._rightButtons = [];

        this._init();
    }

    _init() {
        // ボタン幅を測定 & ボタン参照をキャッシュ
        requestAnimationFrame(() => {
            this.leftWidth = this.actionsLeft?.getBoundingClientRect().width || 140;
            this.rightWidth = this.actionsRight?.getBoundingClientRect().width || 140;
            this._leftButtons = this.actionsLeft ? Array.from(this.actionsLeft.querySelectorAll('button')) : [];
            this._rightButtons = this.actionsRight ? Array.from(this.actionsRight.querySelectorAll('button')) : [];
        });

        // Pointer Events
        if (window.PointerEvent) {
            this.wrap.addEventListener('pointerdown', this._onPointerDown.bind(this), { passive: true });
            this.wrap.addEventListener('pointermove', this._onPointerMove.bind(this), { passive: false });
            this.wrap.addEventListener('pointerup', this._onPointerUp.bind(this));
            this.wrap.addEventListener('pointercancel', this._onPointerUp.bind(this));
        } else {
            this.wrap.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: true });
            this.wrap.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
            this.wrap.addEventListener('touchend', this._onTouchEnd.bind(this));
            this.wrap.addEventListener('touchcancel', this._onTouchEnd.bind(this));
        }

        this.wrap.addEventListener('click', this._onClick.bind(this), true);
    }

    // === Pointer Events ===
    _onPointerDown(e) {
        if (isDraggingCard || e.target.closest('.handle')) return;
        if (currentOpenRow && currentOpenRow !== this) {
            currentOpenRow.close();
        }
        this._startGesture(e.clientX, e.clientY, e.pointerId, e.target);
    }

    _onPointerMove(e) {
        if (!this.isActive) return;
        this._moveGesture(e.clientX, e.clientY, e);
    }

    _onPointerUp() {
        if (!this.isActive) return;
        this._endGesture();
    }

    // === Touch Events (fallback) ===
    _onTouchStart(e) {
        if (isDraggingCard || e.target.closest('.handle')) return;
        if (!e.touches.length) return;
        if (currentOpenRow && currentOpenRow !== this) {
            currentOpenRow.close();
        }
        this._startGesture(e.touches[0].clientX, e.touches[0].clientY, null, e.target);
    }

    _onTouchMove(e) {
        if (!this.isActive || !e.touches.length) return;
        this._moveGesture(e.touches[0].clientX, e.touches[0].clientY, e);
    }

    _onTouchEnd() {
        if (!this.isActive) return;
        this._endGesture();
    }

    // === ジェスチャー処理 ===
    _startGesture(x, y, pointerId = null, target = null) {
        this.isActive = true;
        this.startX = x;
        this.startY = y;
        this.offsetAtStart = this.currentX; // 開き状態のオフセットを記憶
        this.gestureTarget = target;
        this.isLocked = false;
        this.isScrolling = null;
        this.hasMoved = false;
        this.velocitySamples = [];
        this.lastMoveTime = performance.now();

        if (pointerId && this.wrap.setPointerCapture) {
            try { this.wrap.setPointerCapture(pointerId); } catch (e) {}
        }

        this.sl.style.transition = 'none';
        // ボタン拡張のtransitionも無効化
        this._setButtonTransitions(false);
    }

    _moveGesture(x, y, event) {
        const dx = x - this.startX;
        const dy = y - this.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // 縦 vs 横 判定
        if (this.isScrolling === null) {
            if (absDx > SWIPE_CONFIG.LOCK_THRESHOLD || absDy > SWIPE_CONFIG.LOCK_THRESHOLD) {
                if (absDx > absDy * SWIPE_CONFIG.LOCK_ANGLE_RATIO) {
                    this.isScrolling = false;
                    this.isLocked = true;
                    // 横スワイプ確定時点でスクロールを完全ブロック
                    if (event && event.cancelable) event.preventDefault();
                } else {
                    this.isScrolling = true;
                }
            }
        }

        if (this.isScrolling === true) return;

        if (this.isLocked) {
            // 横スワイプ中は常にスクロールをブロック
            if (event && event.cancelable) event.preventDefault();

            if (!this.hasMoved) {
                this.wrap.classList.add('swiping');
            }
            this.hasMoved = true;

            const now = performance.now();
            this.velocitySamples.push({ x: dx, time: now });
            if (this.velocitySamples.length > SWIPE_CONFIG.VELOCITY_SAMPLE_COUNT) {
                this.velocitySamples.shift();
            }
            this.lastMoveTime = now;

            // 自由追従（開き状態からの継続 + ラバーバンド）
            this.currentX = this._applyRubberBand(dx + this.offsetAtStart);

            this._scheduleUpdate();
        }
    }

    _endGesture() {
        this.isActive = false;

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        // 縦スクロールだった → 開き位置をそのまま維持
        if (this.isScrolling === true) {
            this.sl.style.transition = '';
            return;
        }

        // タップ判定（ほぼ動いていない）
        const moved = Math.abs(this.currentX - this.offsetAtStart);
        if (!this.hasMoved || moved < SWIPE_CONFIG.TAP_SLOP) {
            // ボタン上のタップ → 位置を維持してクリックに委ねる
            if (this.gestureTarget && this.gestureTarget.closest('button')) {
                this.sl.style.transition = '';
                this.currentX = this.offsetAtStart;
                return;
            }
            // カード上のタップ → 閉じる
            this._resetButtons();
            this._snapTo(0);
            return;
        }

        const velocity = this._calculateVelocity();
        this._determineSnapTarget(velocity);
    }

    // === ラバーバンド（画面端のみ。ボタン幅では止めない）===
    _applyRubberBand(dx) {
        const limit = window.innerWidth * 0.85;
        if (dx > limit) {
            return limit + (dx - limit) * 0.2;
        } else if (dx < -limit) {
            return -limit + (dx + limit) * 0.2;
        }
        return dx;
    }

    // === rAF描画 + ボタン拡張 ===
    _scheduleUpdate() {
        if (this.rafId) return;

        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.sl.style.transform = `translateX(${this.currentX}px)`;
            this._updateButtonExpansion();
        });
    }

    /**
     * ボタン拡張エフェクト
     * 〜50%: 全ボタン均等にストレッチ
     * 50%超: 主要ボタンが副ボタンを押しつぶし支配的になる
     */
    _updateButtonExpansion() {
        const dx = this.currentX;
        const cardWidth = this.wrap.offsetWidth || window.innerWidth;
        const halfCard = cardWidth * 0.5;

        if (dx > 0 && this._leftButtons.length >= 1) {
            const primary = this._leftButtons[0];
            const others = this._leftButtons.slice(1);

            // actions-leftの幅をドラッグ距離に合わせる
            this.actionsLeft.style.width = `${dx}px`;

            if (dx <= halfCard || others.length === 0) {
                // 50%まで: 全ボタン均等にストレッチ
                this._leftButtons.forEach(btn => {
                    btn.style.flex = '1';
                    btn.style.minWidth = '0';
                    btn.style.maxWidth = '';
                    btn.style.opacity = '';
                    btn.style.overflow = '';
                    btn.style.padding = '';
                    btn.style.background = '';
                });
                this.wrap.classList.remove('swipe-commit');
            } else {
                // 50%超: 完了が通知を押しつぶす
                const overRatio = Math.min(1, (dx - halfCard) / (halfCard * 0.2));

                primary.style.flex = '1';
                primary.style.minWidth = '0';

                others.forEach(btn => {
                    btn.style.flex = `${Math.max(0.001, 1 - overRatio)}`;
                    btn.style.minWidth = '0';
                    btn.style.maxWidth = `${Math.max(0, 60 * (1 - overRatio))}px`;
                    btn.style.opacity = String(Math.max(0, 1 - overRatio * 1.5));
                    btn.style.overflow = 'hidden';
                    btn.style.padding = overRatio > 0.5 ? '0' : '';
                    btn.style.background = 'transparent';
                });

                this.wrap.classList.add('swipe-commit');
            }
        } else if (dx < 0 && this._rightButtons.length >= 1) {
            const absDx = Math.abs(dx);
            const primary = this._rightButtons[this._rightButtons.length - 1];
            const others = this._rightButtons.slice(0, -1);

            this.actionsRight.style.width = `${absDx}px`;

            if (absDx <= halfCard || others.length === 0) {
                this._rightButtons.forEach(btn => {
                    btn.style.flex = '1';
                    btn.style.minWidth = '0';
                    btn.style.maxWidth = '';
                    btn.style.opacity = '';
                    btn.style.overflow = '';
                    btn.style.padding = '';
                    btn.style.background = '';
                });
                this.wrap.classList.remove('swipe-commit');
            } else {
                const overRatio = Math.min(1, (absDx - halfCard) / (halfCard * 0.2));

                primary.style.flex = '1';
                primary.style.minWidth = '0';

                others.forEach(btn => {
                    btn.style.flex = `${Math.max(0.001, 1 - overRatio)}`;
                    btn.style.minWidth = '0';
                    btn.style.maxWidth = `${Math.max(0, 60 * (1 - overRatio))}px`;
                    btn.style.opacity = String(Math.max(0, 1 - overRatio * 1.5));
                    btn.style.overflow = 'hidden';
                    btn.style.padding = overRatio > 0.5 ? '0' : '';
                    btn.style.background = 'transparent';
                });

                this.wrap.classList.add('swipe-commit');
            }
        } else {
            this._resetButtonsFull();
        }
    }

    // === ボタンスタイルをリセット（幅はそのまま。_snapToが同期アニメーションする）===
    _resetButtons() {
        this.wrap.classList.remove('swipe-commit');
        [...this._leftButtons, ...this._rightButtons].forEach(btn => {
            btn.style.flex = '';
            btn.style.minWidth = '';
            btn.style.maxWidth = '';
            btn.style.opacity = '';
            btn.style.overflow = '';
            btn.style.padding = '';
            btn.style.background = '';
        });
    }

    // === ボタンスタイル + 幅を完全リセット ===
    _resetButtonsFull() {
        this._resetButtons();
        if (this.actionsLeft) this.actionsLeft.style.width = '';
        if (this.actionsRight) this.actionsRight.style.width = '';
    }

    // === ボタンのtransition制御 ===
    _setButtonTransitions(enabled) {
        const val = enabled ? 'all 200ms ease-out' : 'none';
        [...this._leftButtons, ...this._rightButtons].forEach(btn => {
            btn.style.transition = val;
        });
    }

    // === 速度計算 ===
    _calculateVelocity() {
        if (this.velocitySamples.length < 2) return 0;
        const first = this.velocitySamples[0];
        const last = this.velocitySamples[this.velocitySamples.length - 1];
        const dt = last.time - first.time;
        if (dt <= 0) return 0;
        return (last.x - first.x) / dt;
    }

    // === スナップ先決定（距離のみ判定。速度によるフルスワイプは無し）===
    _determineSnapTarget(velocity) {
        const dx = this.currentX;
        const leftThreshold = this.leftWidth * SWIPE_CONFIG.SNAP_THRESHOLD_RATIO;
        const rightThreshold = this.rightWidth * SWIPE_CONFIG.SNAP_THRESHOLD_RATIO;
        const velocityThreshold = SWIPE_CONFIG.VELOCITY_THRESHOLD;
        const screenW = window.innerWidth;

        // フルスワイプ判定：カード幅の50%を超えた場合のみ（距離のみ、速度は無関係）
        const cardWidth = this.wrap.offsetWidth || screenW;
        const fullSwipeThreshold = cardWidth * 0.5;
        if (dx > fullSwipeThreshold) {
            this._flyOff(screenW, this.options.rightFlyAction);
            return;
        }
        if (dx < -fullSwipeThreshold) {
            this._flyOff(-screenW, this.options.leftFlyAction);
            return;
        }

        // ボタンリセット（スナップ前に戻す）
        this._setButtonTransitions(true);
        this._resetButtons();

        // フリック → ボタン表示（飛び出しはしない。どんなに強くても開くだけ）
        if (Math.abs(velocity) > velocityThreshold) {
            if (velocity > 0) {
                this._openLeft();
            } else {
                this._openRight();
            }
            return;
        }

        // 距離判定 → ボタン表示
        if (dx > leftThreshold) {
            this._openLeft();
        } else if (dx < -rightThreshold) {
            this._openRight();
        } else {
            this.close();
        }
    }

    // === フルスワイプ飛び出し + カード潰しアニメーション ===
    _flyOff(targetX, actionType) {
        let started = false;
        if (typeof haptic === 'function') haptic(14);

        // アクション側のボタンを横いっぱいに広げ、副ボタンを完全に潰す
        const isLeft = targetX > 0;
        const actionsEl = isLeft ? this.actionsLeft : this.actionsRight;
        const buttons = isLeft ? this._leftButtons : this._rightButtons;
        const primary = isLeft ? buttons[0] : buttons[buttons.length - 1];
        const others = isLeft ? buttons.slice(1) : buttons.slice(0, -1);

        actionsEl.style.transition = 'width 400ms ease-out';
        actionsEl.style.width = '100%';

        primary.style.flex = '1';
        primary.style.minWidth = '0';

        others.forEach(btn => {
            btn.style.transition = 'all 350ms ease-out';
            btn.style.flex = '0';
            btn.style.minWidth = '0';
            btn.style.maxWidth = '0';
            btn.style.opacity = '0';
            btn.style.padding = '0';
            btn.style.overflow = 'hidden';
            btn.style.background = 'transparent';
        });

        const startCollapse = () => {
            if (started) return;
            started = true;

            // カード高さを固定してからアニメーションで0にする
            const h = this.wrap.offsetHeight;
            this.wrap.style.height = h + 'px';
            this.wrap.style.transition = 'height 400ms ease-out, opacity 250ms ease-out';

            requestAnimationFrame(() => {
                this.wrap.style.height = '0';
                this.wrap.style.opacity = '0';
                this.wrap.style.borderBottomWidth = '0';
            });

            // 潰れ終わったらアクション実行
            setTimeout(() => {
                this._resetButtonsFull();
                this._executeAction(actionType);
            }, 430);
        };

        this.sl.style.transition = `transform 400ms ${SWIPE_CONFIG.SNAP_EASING}`;
        this.sl.style.transform = `translateX(${targetX}px)`;

        this.sl.addEventListener('transitionend', () => startCollapse(), { once: true });
        setTimeout(startCollapse, 450); // fallback
    }

    // === 状態変更 ===
    _openLeft() {
        this.state = 'open-left';
        this.wrap.classList.add('open-left');
        this.wrap.classList.remove('open-right');
        currentOpenRow = this;
        this._snapTo(this.leftWidth);
    }

    _openRight() {
        this.state = 'open-right';
        this.wrap.classList.add('open-right');
        this.wrap.classList.remove('open-left');
        currentOpenRow = this;
        this._snapTo(-this.rightWidth);
    }

    close() {
        this.state = 'closed';
        this.wrap.classList.remove('open-left', 'open-right', 'swipe-commit', 'swiping');
        if (currentOpenRow === this) {
            currentOpenRow = null;
        }
        this._setButtonTransitions(true);
        this._resetButtons();
        this._snapTo(0);
    }

    // === スナップアニメーション（カード移動とボタン幅を完全同期）===
    _snapTo(targetX) {
        const dur = SWIPE_CONFIG.SNAP_DURATION;
        const ease = SWIPE_CONFIG.SNAP_EASING;
        const trans = `${dur}ms ${ease}`;

        // カード移動
        this.sl.style.transition = `transform ${trans}`;
        this.sl.style.transform = `translateX(${targetX}px)`;
        this.currentX = targetX;

        // ボタン領域の幅も同じ速度でアニメーション
        if (this.actionsLeft) {
            this.actionsLeft.style.transition = `width ${trans}`;
            this.actionsLeft.style.width = targetX > 0 ? `${targetX}px` : '0px';
        }
        if (this.actionsRight) {
            this.actionsRight.style.transition = `width ${trans}`;
            this.actionsRight.style.width = targetX < 0 ? `${Math.abs(targetX)}px` : '0px';
        }

        const cleanup = () => {
            this.sl.style.transition = '';
            if (this.actionsLeft) this.actionsLeft.style.transition = '';
            if (this.actionsRight) this.actionsRight.style.transition = '';
            this.hasMoved = false;
            this.wrap.classList.remove('swiping');
            this.sl.removeEventListener('transitionend', cleanup);
        };
        this.sl.addEventListener('transitionend', cleanup);
        setTimeout(() => {
            cleanup();
        }, dur + 50);
    }

    // === アクション実行 ===
    _executeAction(actionType) {
        const id = this.options.taskData?.id ?? this.options.dataId;
        if (id == null) return;
        this.options.onAction(actionType, id);
    }

    // === クリック抑制 ===
    _onClick(e) {
        // スワイプ操作だった → ボタン含め全クリックをブロック
        if (this.hasMoved) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // タップ：ボタン上ならクリックを通す
        if (e.target.closest('button')) return;

        // タップ：カード上で開いていたら閉じる
        if (this.state !== 'closed') {
            e.preventDefault();
            e.stopPropagation();
            this.close();
        }
    }

    destroy() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        if (currentOpenRow === this) currentOpenRow = null;
    }
}

// === グローバルハンドラー ===
function initGlobalSwipeHandler() {
    document.addEventListener('pointerdown', (e) => {
        if (!currentOpenRow) return;
        if (!e.target.closest('.card')) {
            currentOpenRow.close();
        }
    }, { passive: true });

    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
        if (currentOpenRow) {
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (currentOpenRow) currentOpenRow.close();
            }, 100);
        }
    }, { passive: true });
}

function applySwipeToCard(cardElement, taskData, isCompleted, onAction) {
    const swipeRow = new SwipeableRow(cardElement, {
        taskData, isCompleted, onAction,
    });
    cardElement._swipeRow = swipeRow;
    return swipeRow;
}

function closeAllSwipeRows() {
    if (currentOpenRow) currentOpenRow.close();
}

document.addEventListener('DOMContentLoaded', initGlobalSwipeHandler);
