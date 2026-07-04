/* =============================================
   ムキムキタスくん - 習慣管理
   ============================================= */

let todayHabits = {};
let weekHabitsData = {};
let currentHabits = []; // msc.jsから参照するためグローバルに保持
let recordingDate = ''; // 記録対象日（デフォルトは今日）

/**
 * 習慣リストをレンダリング（引数の habits 配列を使用）
 */
function renderHabitList(habits) {
    const container = document.getElementById('habitList');
    if (!container) return;

    const habitList = habits || currentHabits || HABITS;

    if (habitList === HABITS || (Array.isArray(habitList) && habitList.length > 0 && habitList[0].id !== undefined && habitList[0].habit_id === undefined)) {
        // HABITS定数（後方互換）
        container.innerHTML = HABITS.map(h =>
            `<div class="habit-item" data-habit="${h.id}">
                <div class="habit-checkbox" data-habit="${h.id}"></div>
                <span class="habit-name">${h.name}</span>
                <span class="habit-icon">${h.icon}</span>
            </div>`
        ).join('');
        container.querySelectorAll('.habit-item').forEach(item => {
            item.addEventListener('click', e => {
                e.stopPropagation();
                const id = item.dataset.habit;
                const cb = item.querySelector('.habit-checkbox');
                haptic(8);
                todayHabits[id] = !todayHabits[id];
                cb.classList.toggle('checked', todayHabits[id]);
                cb.textContent = todayHabits[id] ? '✓' : '';
                item.classList.toggle('checked', todayHabits[id]);
            });
        });
    } else {
        // APIから取得した動的データ（ストリーク付き）
        container.innerHTML = habitList.map(h => {
            const streak = h.streak || 0;
            const streakHtml = streak > 0
                ? `<span class="habit-streak">${streak}日連続！🔥</span>`
                : '';
            return `<div class="habit-item" data-habit="${h.habit_id}">
                <div class="habit-checkbox" data-habit="${h.habit_id}"></div>
                <div class="habit-info">
                    <span class="habit-name">${escapeHtml(h.habit_name)}</span>
                    ${streakHtml}
                </div>
                <span class="habit-icon">${h.icon || ''}</span>
            </div>`;
        }).join('');
        container.querySelectorAll('.habit-item').forEach(item => {
            item.addEventListener('click', e => {
                e.stopPropagation();
                const id = item.dataset.habit;
                const cb = item.querySelector('.habit-checkbox');
                haptic(8);
                todayHabits[id] = !todayHabits[id];
                cb.classList.toggle('checked', todayHabits[id]);
                cb.textContent = todayHabits[id] ? '✓' : '';
                item.classList.toggle('checked', todayHabits[id]);
            });
        });
    }
}

/**
 * 習慣データ読み込み
 */
async function loadHabits(date) {
    if (date) recordingDate = date;
    if (!recordingDate) {
        const t = new Date();
        recordingDate = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }
    // 日付ピッカーを同期
    const picker = document.getElementById('habitRecordDate');
    if (picker && picker.value !== recordingDate) picker.value = recordingDate;
    try {
        const data = await apiCall(`/habits?user_id=${encodeURIComponent(userId)}&date=${encodeURIComponent(recordingDate)}`);
        const habits = data.habits || [];
        currentHabits = habits; // グローバルに保持

        // todayHabits を構築
        if (habits.length > 0 && habits[0].habit_id !== undefined) {
            todayHabits = {};
            habits.forEach(h => { todayHabits[h.habit_id] = h.completed || false; });
        } else {
            todayHabits = data.today || {};
        }

        weekHabitsData = data.week || {};

        renderHabitList(habits.length > 0 ? habits : undefined);
        renderStreakBadges(habits);
        renderWeekView(habits, data.week);
        renderHabitAnalysis(data);
        updateHabitCheckboxes();
        checkStreakWarning(habits);
    } catch (e) {
        console.error("習慣データ取得エラー:", e);
        currentHabits = [];
        weekHabitsData = {};
        todayHabits = {};
        renderHabitList();
        renderWeekView();
        renderHabitAnalysis({ week_progress: 0 });
        updateHabitCheckboxes();
    }
}

/**
 * 習慣チェックボックス更新
 */
function updateHabitCheckboxes() {
    document.querySelectorAll('.habit-item').forEach(item => {
        const id = item.dataset.habit;
        const cb = item.querySelector('.habit-checkbox');
        if (!cb) return;
        const isChecked = !!todayHabits[id];
        cb.classList.toggle('checked', isChecked);
        cb.textContent = isChecked ? '✓' : '';
        item.classList.toggle('checked', isChecked);
    });
}

/**
 * 週間ビューレンダリング
 */
function renderWeekView(habits, week) {
    const tbody = document.getElementById('weekTableBody');
    if (!tbody) return;
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const weekData = week || weekHabitsData || {};

    const habitList = (habits && habits.length > 0) ? habits : currentHabits;

    if (habitList && habitList.length > 0 && habitList[0].habit_id !== undefined) {
        // APIデータ（動的）
        tbody.innerHTML = habitList.map(h =>
            `<tr>
                <td>${h.icon || ''} ${escapeHtml(h.habit_name)}</td>
                ${days.map(d =>
                    `<td class="${weekData[d]?.[h.habit_id] ? 'checked' : 'unchecked'}">
                        ${weekData[d]?.[h.habit_id] ? '●' : '○'}
                    </td>`
                ).join('')}
            </tr>`
        ).join('');
    } else {
        // HABITS定数（後方互換）
        tbody.innerHTML = HABITS.map(h =>
            `<tr>
                <td>${h.icon} ${h.name}</td>
                ${days.map(d =>
                    `<td class="${weekData[d]?.[h.id] ? 'checked' : 'unchecked'}">
                        ${weekData[d]?.[h.id] ? '●' : '○'}
                    </td>`
                ).join('')}
            </tr>`
        ).join('');
    }

    // 今日の日付表示（常に表示）
    const today = new Date();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    const dow = ['日','月','火','水','木','金','土'][today.getDay()];
    const label = document.getElementById('dailyRecordLabel');
    if (label) {
        const recordedDays = days.filter(day => {
            const dayData = weekData[day] || {};
            return Object.values(dayData).some(Boolean);
        }).length;
        const badge = document.getElementById('dailyWeekBadge');
        if (badge) {
            badge.textContent = recordedDays > 0 ? `今週${recordedDays}日達成` : '';
            badge.style.display = recordedDays > 0 ? '' : 'none';
        }
        label.textContent = `${m}月${d}日（${dow}）`;
    }
}

/**
 * 習慣分析レンダリング
 */
function renderHabitAnalysis(data) {
    const progress = data.week_progress || 0;
    const weekProgressValue = document.getElementById('weekProgressValue');
    const weekProgressBar = document.getElementById('weekProgressBar');
    if (weekProgressValue) weekProgressValue.textContent = `${progress}%`;
    if (weekProgressBar) weekProgressBar.style.width = `${progress}%`;
}

/**
 * 習慣データ保存
 */
async function saveHabits() {
    try {
        if (!recordingDate) {
            const t = new Date();
            recordingDate = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
        }
        await apiCall('/habits/save', 'POST', { user_id: userId, date: recordingDate, habits: todayHabits });
        document.getElementById('dailyTaskCard').classList.remove('expanded');
        await loadHabits();
        const isToday = recordingDate === (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; })();
        showToast(isToday ? '💪 記録を保存しました！' : `📅 ${recordingDate} の記録を保存しました！`, 'success');
    } catch (e) {
        showToast('保存に失敗しました', 'error');
    }
}

// === ストリークバッジ表示（Phase1） ===
function renderStreakBadges(habits) {
    const container = document.getElementById('streakBadges');
    if (!container) return;
    if (!habits || habits.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = habits.map(h =>
        `<div class="streak-badge ${h.streak > 0 ? '' : 'streak-warning'}">
            ${h.icon || ''} ${escapeHtml(h.habit_name)} 🔥${h.streak || 0}日
        </div>`
    ).join('');
}

// === ストリーク警告（Phase1） ===
function checkStreakWarning(habits) {
    const now = new Date();
    if (now.getHours() < 23) return;
    if (!habits || habits.length === 0) return;
    const incomplete = habits.filter(h => !h.completed && h.streak > 0);
    if (incomplete.length > 0) {
        const names = incomplete.map(h => h.habit_name).join('、');
        showInAppBanner(`⚠️ ${names}のストリークが途切れそうです！`, 'warning');
    }
}

function showInAppBanner(message, type = 'info') {
    const banner = document.createElement('div');
    banner.className = `in-app-banner in-app-banner-${type}`;
    banner.textContent = message;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
}

// === 月間分析 ===
let selectedMonth = new Date();
let monthlyChart = null;

/**
 * 月間分析UI初期化
 */
function bindMonthlyAnalysisUI() {
    const modal = document.getElementById('monthlyAnalysisModal');
    const close = () => modal.classList.remove('visible');

    document.getElementById('openMonthlyAnalysis').onclick = () => {
        selectedMonth = new Date();
        modal.classList.add('visible');
        loadMonthlyData();
    };
    document.getElementById('monthlyAnalysisBackdrop').onclick = close;
    document.getElementById('closeMonthlyAnalysis').onclick = close;

    document.getElementById('prevMonthBtn').onclick = () => {
        selectedMonth.setMonth(selectedMonth.getMonth() - 1);
        loadMonthlyData();
    };
    document.getElementById('nextMonthBtn').onclick = () => {
        const now = new Date();
        if (selectedMonth.getFullYear() < now.getFullYear() ||
            (selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() < now.getMonth())) {
            selectedMonth.setMonth(selectedMonth.getMonth() + 1);
            loadMonthlyData();
        }
    };
}

/**
 * 月間データ読み込み
 */
async function loadMonthlyData() {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    document.getElementById('currentMonthLabel').textContent = `${year}年${month}月`;

    try {
        const data = await apiCall(`/habits/monthly?user_id=${encodeURIComponent(userId)}&year=${year}&month=${month}`);
        renderMonthlyAnalysis(data);
    } catch (e) {
        renderMonthlyAnalysis({ days: {}, monthly: [] });
    }
}

/**
 * 月間分析レンダリング
 */
function renderMonthlyAnalysis(data) {
    // ムキムキタスくん３のレスポンスは monthly 配列形式
    // ムキムキタスくん２の days 形式にも対応（後方互換）
    let days = {};

    if (data.monthly && Array.isArray(data.monthly)) {
        // 新形式: [{date, completions: {habit_id: bool}}]
        data.monthly.forEach(entry => {
            if (entry.date) days[entry.date] = entry.completions || {};
        });
    } else if (data.days) {
        // 旧形式
        days = data.days;
    }

    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    let totalChecks = 0, totalPossible = 0, currentStreak = 0, bestStreak = 0;
    const dailyRates = [];

    const habitCount = currentHabits.length > 0 ? currentHabits.length : HABITS.length;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayData = days[dateStr];

        if (dayData && Object.keys(dayData).length > 0) {
            const checked = Object.values(dayData).filter(v => v).length;
            totalChecks += checked;
            totalPossible += habitCount;
            currentStreak++;
            bestStreak = Math.max(bestStreak, currentStreak);
            dailyRates.push({ day: d, rate: Math.round((checked / habitCount) * 100) });
        } else {
            currentStreak = 0;
            dailyRates.push({ day: d, rate: 0 });
        }
    }

    document.getElementById('monthlyTotalDays').textContent =
        Object.keys(days).filter(k => Object.values(days[k] || {}).some(v => v)).length;
    document.getElementById('monthlyAchievement').textContent =
        `${totalPossible ? Math.round((totalChecks / totalPossible) * 100) : 0}%`;
    document.getElementById('monthlyBestStreak').textContent = bestStreak;

    // テーブル
    const displayHabits = currentHabits.length > 0 ? currentHabits : HABITS;
    const tbody = document.getElementById('monthlyTableBody');
    tbody.innerHTML = Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayData = days[dateStr];
        const dow = ['日','月','火','水','木','金','土'][new Date(dateStr).getDay()];
        const cells = displayHabits.map(h => {
            const hid = h.habit_id || h.id;
            return `<td class="${dayData?.[hid] ? 'cell-check' : 'cell-uncheck'}">${dayData?.[hid] ? '●' : '○'}</td>`;
        }).join('');
        const dayChecked = dayData ? Object.values(dayData).filter(v => v).length : 0;
        return `<tr><td>${month}/${d}(${dow})</td>${cells}<td>${dayChecked}/${habitCount}</td></tr>`;
    }).join('');

    // チャート
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dailyRates.map(d => `${d.day}日`),
            datasets: [{
                label: '達成率',
                data: dailyRates.map(d => d.rate),
                borderColor: '#ff9f43',
                backgroundColor: 'rgba(255,159,67,0.15)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#ff9f43'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { stepSize: 25, callback: v => `${v}%` } },
                x: { ticks: { maxTicksLimit: 10 } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// === 習慣プリセット（Phase2） ===
async function loadHabitPresets() {
    try {
        const data = await apiCall('/habits/presets');
        return data.presets || [];
    } catch (e) { return []; }
}

async function saveHabitSettings(selectedHabits) {
    try {
        await apiCall('/habits/settings', 'POST', { user_id: userId, habits: selectedHabits });
        await loadHabits();
        showToast('💪 習慣設定を保存しました！', 'success');
    } catch (e) { showToast('保存に失敗しました', 'error'); }
}
