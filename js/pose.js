/**
 * MediaPipe Pose ラッパークラス
 * Web版MediaPipeを使用した姿勢推定
 */
class PoseDetector {
    constructor() {
        this.pose = null;
        this.camera = null;
        this.landmarks = null;
        this.isReady = false;
        this.onResultsCallback = null;
    }

    /**
     * MediaPipe Poseを初期化
     * @param {function} onResults - 結果コールバック関数
     */
    async initialize(onResults) {
        this.onResultsCallback = onResults;

        // MediaPipe Poseの初期化
        this.pose = new Pose({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
            }
        });

        // オプション設定
        this.pose.setOptions({
            modelComplexity: 1,           // モデルの複雑さ（0:軽量, 1:標準, 2:高精度）
            smoothLandmarks: true,        // ランドマークの平滑化
            enableSegmentation: false,    // セグメンテーション無効（軽量化）
            smoothSegmentation: false,
            minDetectionConfidence: 0.5,  // 検出の最小信頼度
            minTrackingConfidence: 0.5    // 追跡の最小信頼度
        });

        // 結果コールバック設定
        this.pose.onResults((results) => this._onResults(results));

        this.isReady = true;
        console.log('MediaPipe Pose: 初期化完了');
    }

    /**
     * カメラを開始
     * @param {HTMLVideoElement} videoElement - ビデオ要素
     */
    async startCamera(videoElement) {
        this.camera = new Camera(videoElement, {
            onFrame: async () => {
                if (this.pose && this.isReady) {
                    await this.pose.send({ image: videoElement });
                }
            },
            width: 640,
            height: 480
        });

        await this.camera.start();
        console.log('カメラ: 開始');
    }

    /**
     * 結果処理
     */
    _onResults(results) {
        // ランドマークを正規化座標から抽出
        if (results.poseLandmarks) {
            this.landmarks = results.poseLandmarks.map(lm => ({
                x: lm.x,
                y: lm.y,
                z: lm.z,
                visibility: lm.visibility
            }));
        } else {
            this.landmarks = null;
        }

        // コールバック実行
        if (this.onResultsCallback) {
            this.onResultsCallback(results, this.landmarks);
        }
    }

    /**
     * 現在のランドマークを取得
     */
    getLandmarks() {
        return this.landmarks;
    }

    /**
     * 骨格を描画
     * @param {CanvasRenderingContext2D} ctx - キャンバスコンテキスト
     * @param {object} results - MediaPipeの結果
     * @param {number} width - キャンバス幅
     * @param {number} height - キャンバス高さ
     */
    drawSkeleton(ctx, results, width, height) {
        ctx.clearRect(0, 0, width, height);

        if (!results.poseLandmarks) return;

        // 接続線を描画
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;

        // MediaPipeの接続定義
        const connections = [
            // 顔
            [0, 1], [1, 2], [2, 3], [3, 7],
            [0, 4], [4, 5], [5, 6], [6, 8],
            // 胴体
            [11, 12], [11, 23], [12, 24], [23, 24],
            // 左腕
            [11, 13], [13, 15],
            // 右腕
            [12, 14], [14, 16],
            // 左脚
            [23, 25], [25, 27],
            // 右脚
            [24, 26], [26, 28],
            // 足
            [27, 29], [29, 31], [27, 31],
            [28, 30], [30, 32], [28, 32]
        ];

        ctx.beginPath();
        for (const [start, end] of connections) {
            const startLm = results.poseLandmarks[start];
            const endLm = results.poseLandmarks[end];

            if (startLm.visibility > 0.5 && endLm.visibility > 0.5) {
                ctx.moveTo(startLm.x * width, startLm.y * height);
                ctx.lineTo(endLm.x * width, endLm.y * height);
            }
        }
        ctx.stroke();

        // ランドマークを描画
        ctx.fillStyle = '#FF0000';
        for (const lm of results.poseLandmarks) {
            if (lm.visibility > 0.5) {
                ctx.beginPath();
                ctx.arc(lm.x * width, lm.y * height, 5, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }

    /**
     * カメラを停止
     */
    stop() {
        if (this.camera) {
            this.camera.stop();
        }
    }
}

// グローバルインスタンス
const poseDetector = new PoseDetector();
