/* =============================================
   ムキムキタスくん - 設定・定数
   ============================================= */

// === 環境判定 ===
const ENV = (() => {
    const h = window.location.hostname;
    if (h.includes('ngrok-free.dev') || h === 'localhost' || h === '127.0.0.1') return 'DEV';
    return 'PROD';
})();

// === LIFF設定 ===
const LIFF_ID = ENV === 'DEV'
    ? "<DEV_LIFF_ID>"         // 開発用LIFF
    : "2008277838-k2Pzxo0I";  // 本番用LIFF

// === Supabase設定 ===
const SUPABASE_URL = "https://ixsfyxhvwcevsvobsted.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4c2Z5eGh2d2NldnN2b2JzdGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NDEyODMsImV4cCI6MjA4OTIxNzI4M30.1Ib0oPHMJM2CzL2mM7q0QJ6dAxJa_JNAM4mXF4vRBf4";
const API_BASE = `${SUPABASE_URL}/functions/v1`;

// === プラン説明ページ ===
const PLAN_PAGE_URL = "https://taskun-lab.github.io/Planspage/";

// === 開発者制限（DEVのみ）===
const DEV_ALLOWED_USER_ID = "Ue5456da08f02d887957a994c3de73d7b";

// === スワイプ設定（調整可能パラメータ）===
const SWIPE_CONFIG = {
    // 横ロック判定
    LOCK_THRESHOLD: 10,           // 横ロック判定を開始する最小移動量(px)
    LOCK_ANGLE_RATIO: 1.2,        // |dx| > |dy| * この値 で横ロック確定

    // スナップ判定
    SNAP_THRESHOLD_RATIO: 0.1,    // ボタン幅の何%でスナップ判定（距離）
    VELOCITY_THRESHOLD: 0.5,      // フリック判定の速度閾値(px/ms)
    FULL_SWIPE_RATIO: 0.45,       // フルスワイプ発動：画面幅の何%で発動

    // ラバーバンド効果
    RUBBER_BAND_FACTOR: 0.35,     // 上限超過時の減衰率（0.35 = 35%に圧縮）

    // アニメーション
    SNAP_DURATION: 500,           // スナップアニメーション時間(ms)
    SNAP_EASING: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // ease-out相当

    // タップ判定
    TAP_SLOP: 8,                  // これ以下の移動はタップとみなす(px)

    // 速度計算
    VELOCITY_SAMPLE_COUNT: 3,     // 速度計算に使うサンプル数
};

// === タスク関連定数 ===
const STRONG_RATIO = SWIPE_CONFIG.FULL_SWIPE_RATIO;
const SNAP_THRESHOLD = 40; // 後方互換用

// === ハプティクス（対応端末のみ振動・非対応は無視） ===
function haptic(ms = 8) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
}

// === 習慣リスト ===
const HABITS = [
    { id: 'early_wake', name: '早起き', icon: '🌅' },
    { id: 'mission', name: 'ミッション', icon: '🎯' },
    { id: 'reading', name: '読書/学習', icon: '📚' },
    { id: 'journal', name: 'ジャーナル', icon: '📝' },
    { id: 'no_alcohol', name: '禁酒', icon: '🚫' },
    { id: 'workout', name: '今日トレ', icon: '💪' }
];

// === 習慣カテゴリ（Phase2）===
const HABIT_CATEGORIES = ['体力', '知力', '精神力', '節制', '生産性', '活力'];

// === MBTI関連 ===
const MBTI_NAMES = {
    'INTJ': '建築家', 'INTP': '論理学者', 'ENTJ': '指揮官', 'ENTP': '討論者',
    'INFJ': '提唱者', 'INFP': '仲介者', 'ENFJ': '主人公', 'ENFP': '広報運動家',
    'ISTJ': '管理者', 'ISFJ': '擁護者', 'ESTJ': '幹部', 'ESFJ': '領事官',
    'ISTP': '巨匠', 'ISFP': '冒険家', 'ESTP': '起業家', 'ESFP': 'エンターテイナー'
};

// === レベル称号 ===
const LEVEL_TITLES = [
    { min: 1, max: 5, title: '見習いトレーニー' },
    { min: 6, max: 10, title: 'ルーキーファイター' },
    { min: 11, max: 20, title: 'レギュラーウォリアー' },
    { min: 21, max: 35, title: 'シルバーチャンピオン' },
    { min: 36, max: 50, title: 'ゴールドマスター' },
    { min: 51, max: 75, title: 'プラチナエリート' },
    { min: 76, max: 100, title: 'ダイヤモンドレジェンド' },
    { min: 101, max: 999, title: 'ムキムキ神' }
];
