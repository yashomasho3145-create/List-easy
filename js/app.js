/**
 * 筋トレフォーム分析ツール - メインアプリケーション
 */

// アプリケーション状態
const appState = {
    autoDetect: true,
    currentExercise: null,
    isRunning: false,
    lastFeedback: null
};

// インスタンス
let featureExtractor;
let exerciseCounter;
let exerciseDetector;

// DOM要素
const elements = {};

// 種目名マッピング
const exerciseNames = {
    pushup: '腕立て伏せ',
    situp: '腹筋',
    squat: 'スクワット',
    null: '検出中...'
};

/**
 * 初期化
 */
async function initApp() {
    console.log('アプリ初期化開始...');

    // DOM要素取得
    cacheElements();

    // インスタンス作成
    featureExtractor = new FeatureExtractor();
    exerciseCounter = new ExerciseCounter(featureExtractor);
    exerciseDetector = new ExerciseDetector();

    // イベントリスナー設定
    setupEventListeners();

    // MediaPipe初期化
    try {
        await poseDetector.initialize(onPoseResults);
        await poseDetector.startCamera(elements.video);

        // ローディング非表示
        elements.loadingOverlay.classList.add('hidden');

        // 起動メッセージ
        voiceManager.speak('筋トレフォーム分析ツールを起動しました');

        console.log('アプリ初期化完了');
    } catch (error) {
        console.error('初期化エラー:', error);
        elements.loadingOverlay.innerHTML = `
            <p style="color: #ff4444;">エラー: カメラを起動できません</p>
            <p style="color: #aaa; font-size: 0.9rem; margin-top: 10px;">
                カメラへのアクセスを許可してください。<br>
                HTTPSでアクセスしていることを確認してください。
            </p>
        `;
    }
}

/**
 * DOM要素をキャッシュ
 */
function cacheElements() {
    elements.video = document.getElementById('video');
    elements.canvas = document.getElementById('canvas');
    elements.loadingOverlay = document.getElementById('loadingOverlay');

    // 表示要素
    elements.modeDisplay = document.getElementById('modeDisplay');
    elements.exerciseDisplay = document.getElementById('exerciseDisplay');
    elements.countDisplay = document.getElementById('countDisplay');
    elements.targetDisplay = document.getElementById('targetDisplay');
    elements.stageDisplay = document.getElementById('stageDisplay');
    elements.angleDisplay = document.getElementById('angleDisplay');
    elements.repsRecordedDisplay = document.getElementById('repsRecordedDisplay');
    elements.voiceStatus = document.getElementById('voiceStatus');
    elements.n8nStatus = document.getElementById('n8nStatus');
    elements.scoreContainer = document.getElementById('scoreContainer');
    elements.scoreDisplay = document.getElementById('scoreDisplay');

    // ボタン
    elements.btnAuto = document.getElementById('btnAuto');
    elements.btnPushup = document.getElementById('btnPushup');
    elements.btnSitup = document.getElementById('btnSitup');
    elements.btnSquat = document.getElementById('btnSquat');
    elements.btnReset = document.getElementById('btnReset');
    elements.btnVoice = document.getElementById('btnVoice');
    elements.btnEvaluate = document.getElementById('btnEvaluate');
    elements.btnSetTarget = document.getElementById('btnSetTarget');
    elements.btnTestConnection = document.getElementById('btnTestConnection');
    elements.btnCloseEvaluation = document.getElementById('btnCloseEvaluation');

    // 入力
    elements.targetCount = document.getElementById('targetCount');
    elements.webhookUrl = document.getElementById('webhookUrl');

    // 評価パネル
    elements.evaluationPanel = document.getElementById('evaluationPanel');
    elements.evaluationScore = document.getElementById('evaluationScore');
    elements.evaluationComment = document.getElementById('evaluationComment');
}

/**
 * イベントリスナー設定
 */
function setupEventListeners() {
    // 種目選択
    elements.btnAuto.addEventListener('click', () => setAutoMode(true));
    elements.btnPushup.addEventListener('click', () => setExercise('pushup'));
    elements.btnSitup.addEventListener('click', () => setExercise('situp'));
    elements.btnSquat.addEventListener('click', () => setExercise('squat'));

    // アクション
    elements.btnReset.addEventListener('click', resetCounter);
    elements.btnVoice.addEventListener('click', toggleVoice);
    elements.btnEvaluate.addEventListener('click', requestEvaluation);

    // 設定
    elements.btnSetTarget.addEventListener('click', setTarget);
    elements.btnTestConnection.addEventListener('click', testConnection);

    // 評価パネル
    elements.btnCloseEvaluation.addEventListener('click', closeEvaluationPanel);
}

/**
 * 姿勢推定結果コールバック
 */
function onPoseResults(results, landmarks) {
    const ctx = elements.canvas.getContext('2d');
    const width = elements.canvas.width = elements.video.videoWidth || 640;
    const height = elements.canvas.height = elements.video.videoHeight || 480;

    // 骨格描画
    poseDetector.drawSkeleton(ctx, results, width, height);

    // ランドマークがある場合の処理
    if (landmarks && landmarks.length >= 33) {
        // 自動判定モード
        if (appState.autoDetect) {
            const detected = exerciseDetector.detectExercise(landmarks);
            if (detected && detected !== appState.currentExercise) {
                appState.currentExercise = detected;
                exerciseCounter.reset();
                updateExerciseButtons();
            }
        }

        // 回数カウント
        let angle = null;
        if (appState.currentExercise === 'pushup') {
            angle = exerciseCounter.countPushup(landmarks);
        } else if (appState.currentExercise === 'situp') {
            angle = exerciseCounter.countSitup(landmarks);
        } else if (appState.currentExercise === 'squat') {
            angle = exerciseCounter.countSquat(landmarks);
        }

        // 表示更新
        updateDisplay(angle);
    }
}

/**
 * 表示更新
 */
function updateDisplay(angle) {
    // モード
    elements.modeDisplay.textContent = appState.autoDetect ? 'AUTO' : 'MANUAL';

    // 種目
    elements.exerciseDisplay.textContent = exerciseNames[appState.currentExercise] || '検出中...';

    // カウント
    elements.countDisplay.textContent = exerciseCounter.count;

    // 目標
    if (exerciseCounter.targetCount > 0) {
        elements.targetDisplay.textContent = ` / ${exerciseCounter.targetCount}`;

        // 達成時の色変更
        if (exerciseCounter.count >= exerciseCounter.targetCount) {
            elements.countDisplay.parentElement.style.background = 'rgba(0, 100, 100, 0.8)';
            elements.countDisplay.parentElement.style.color = '#00ffff';
        } else {
            elements.countDisplay.parentElement.style.background = 'rgba(0, 80, 0, 0.8)';
            elements.countDisplay.parentElement.style.color = '#00ff00';
        }
    } else {
        elements.targetDisplay.textContent = '';
        elements.countDisplay.parentElement.style.background = 'rgba(0, 80, 0, 0.8)';
        elements.countDisplay.parentElement.style.color = '#00ff00';
    }

    // ステージ
    elements.stageDisplay.textContent = exerciseCounter.stage ?
        exerciseCounter.stage.toUpperCase() : '-';

    // 角度
    elements.angleDisplay.textContent = angle !== null ? Math.round(angle) : '-';

    // 記録されたrep数
    elements.repsRecordedDisplay.textContent = featureExtractor.repData.length;

    // n8n接続状態
    elements.n8nStatus.textContent = formCoachClient.getConnectionStatus();
    elements.n8nStatus.className = formCoachClient.isConnected ? 'status-on' : 'status-off';
}

/**
 * 自動判定モード設定
 */
function setAutoMode(enabled) {
    appState.autoDetect = enabled;
    appState.currentExercise = null;
    exerciseCounter.reset();
    exerciseDetector.reset();
    updateExerciseButtons();
    voiceManager.speak('自動判定モード');
}

/**
 * 種目設定
 */
function setExercise(exercise) {
    appState.autoDetect = false;
    appState.currentExercise = exercise;
    exerciseCounter.reset();
    updateExerciseButtons();
    voiceManager.speak(exerciseNames[exercise] + 'モード');
}

/**
 * 種目ボタンの状態更新
 */
function updateExerciseButtons() {
    // すべてのボタンからactiveクラスを削除
    elements.btnAuto.classList.remove('active');
    elements.btnPushup.classList.remove('active');
    elements.btnSitup.classList.remove('active');
    elements.btnSquat.classList.remove('active');

    // 現在の状態に応じてactiveクラスを追加
    if (appState.autoDetect) {
        elements.btnAuto.classList.add('active');
    } else {
        switch (appState.currentExercise) {
            case 'pushup':
                elements.btnPushup.classList.add('active');
                break;
            case 'situp':
                elements.btnSitup.classList.add('active');
                break;
            case 'squat':
                elements.btnSquat.classList.add('active');
                break;
        }
    }
}

/**
 * カウンターリセット
 */
function resetCounter() {
    exerciseCounter.reset();
    voiceManager.speak('カウントリセット');
}

/**
 * 音声切り替え
 */
function toggleVoice() {
    const enabled = voiceManager.toggle();
    elements.btnVoice.textContent = enabled ? '音声 ON' : '音声 OFF';
    elements.btnVoice.classList.toggle('active', enabled);
    elements.voiceStatus.textContent = enabled ? 'ON' : 'OFF';
    elements.voiceStatus.className = enabled ? 'status-on' : 'status-off';
}

/**
 * 目標回数設定
 */
function setTarget() {
    const target = parseInt(elements.targetCount.value) || 0;
    exerciseCounter.setTarget(target);
}

/**
 * n8n接続テスト
 */
async function testConnection() {
    const url = elements.webhookUrl.value.trim();
    if (!url) {
        alert('Webhook URLを入力してください');
        return;
    }

    formCoachClient.setWebhookUrl(url);
    elements.btnTestConnection.textContent = '接続中...';
    elements.btnTestConnection.disabled = true;

    const success = await formCoachClient.checkConnection();

    elements.btnTestConnection.textContent = '接続テスト';
    elements.btnTestConnection.disabled = false;

    if (success) {
        voiceManager.speak('n8n接続成功');
        alert('接続成功！');
    } else {
        alert('接続失敗: ' + formCoachClient.getLastError());
    }

    updateDisplay(null);
}

/**
 * AI評価リクエスト
 */
async function requestEvaluation() {
    if (!formCoachClient.isConnected) {
        alert('n8nに接続されていません。先にWebhook URLを設定して接続テストを行ってください。');
        voiceManager.speak('n8nに接続されていません');
        return;
    }

    if (!appState.currentExercise) {
        alert('種目が選択されていません。種目を選択してからAI評価を行ってください。');
        voiceManager.speak('種目を選択してください');
        return;
    }

    if (featureExtractor.repData.length === 0) {
        alert('記録されたrepデータがありません。まず運動を行ってください。');
        voiceManager.speak('分析するデータがありません');
        return;
    }

    voiceManager.speak('フォーム分析を開始します');
    elements.btnEvaluate.textContent = '分析中...';
    elements.btnEvaluate.disabled = true;

    // ペイロード生成
    const payload = featureExtractor.generatePayload(appState.currentExercise, 30);

    // AI評価リクエスト
    const feedback = await formCoachClient.sendForEvaluation(payload);

    elements.btnEvaluate.textContent = 'AI評価';
    elements.btnEvaluate.disabled = false;

    if (feedback) {
        appState.lastFeedback = feedback;
        showEvaluationPanel(feedback);
        voiceManager.speak(`分析完了。総合スコアは${feedback.overall_score || 0}点です`, true);
    } else {
        alert('AI評価の取得に失敗しました: ' + formCoachClient.getLastError());
        voiceManager.speak('AI評価の取得に失敗しました');
    }
}

/**
 * 評価パネル表示
 */
function showEvaluationPanel(feedback) {
    elements.evaluationScore.textContent = feedback.overall_score || '-';
    elements.evaluationComment.textContent = feedback.comment || '評価コメントがありません';

    // スコアに応じて色を変更
    const score = feedback.overall_score || 0;
    if (score >= 70) {
        elements.evaluationScore.style.color = '#00ff88';
    } else if (score >= 50) {
        elements.evaluationScore.style.color = '#ffcc00';
    } else {
        elements.evaluationScore.style.color = '#ff6644';
    }

    elements.evaluationPanel.style.display = 'block';

    // 右上にもスコア表示
    elements.scoreContainer.style.display = 'block';
    elements.scoreDisplay.textContent = score;
    elements.scoreDisplay.style.color = elements.evaluationScore.style.color;
}

/**
 * 評価パネルを閉じる
 */
function closeEvaluationPanel() {
    elements.evaluationPanel.style.display = 'none';
}

// 初期化実行
document.addEventListener('DOMContentLoaded', initApp);
