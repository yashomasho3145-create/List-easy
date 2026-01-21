/**
 * 筋トレ回数カウンター & 特徴量抽出クラス
 */

// 角度計算ユーティリティ
function calculateAngle(p1, p2, p3) {
    // p2を頂点とする3点の角度を計算
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) -
                    Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
        angle = 360.0 - angle;
    }
    return angle;
}

/**
 * 特徴量抽出クラス
 */
class FeatureExtractor {
    constructor() {
        this.reset();
    }

    reset() {
        this.sessionId = this._generateSessionId();
        this.repData = [];
        this.currentRepFrames = [];
        this.repStartTime = null;
        this.frameCount = 0;
    }

    _generateSessionId() {
        const now = new Date();
        return now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    }

    startRep() {
        this.currentRepFrames = [];
        this.repStartTime = Date.now();
    }

    addFrame(landmarks, exerciseType) {
        if (!landmarks || landmarks.length < 33) return;

        this.frameCount++;
        const frameData = {
            landmarks: landmarks,
            timestamp: Date.now(),
            angles: this._calculateAngles(landmarks, exerciseType)
        };
        this.currentRepFrames.push(frameData);
    }

    _calculateAngles(landmarks, exerciseType) {
        const angles = {};

        if (exerciseType === 'pushup') {
            // 左右の肘角度
            angles.leftElbow = calculateAngle(
                landmarks[11], landmarks[13], landmarks[15]);
            angles.rightElbow = calculateAngle(
                landmarks[12], landmarks[14], landmarks[16]);
            // 体幹の一直線度
            angles.leftBodyLine = calculateAngle(
                landmarks[11], landmarks[23], landmarks[27]);
            angles.rightBodyLine = calculateAngle(
                landmarks[12], landmarks[24], landmarks[28]);
        } else if (exerciseType === 'squat') {
            // 左右の膝角度
            angles.leftKnee = calculateAngle(
                landmarks[23], landmarks[25], landmarks[27]);
            angles.rightKnee = calculateAngle(
                landmarks[24], landmarks[26], landmarks[28]);
            // 体幹角度
            angles.torso = this._calculateTorsoAngle(landmarks);
        } else if (exerciseType === 'situp') {
            // 体幹角度
            angles.leftTorso = calculateAngle(
                landmarks[11], landmarks[23], landmarks[25]);
            angles.rightTorso = calculateAngle(
                landmarks[12], landmarks[24], landmarks[26]);
        }

        return angles;
    }

    _calculateTorsoAngle(landmarks) {
        const shoulderMid = {
            x: (landmarks[11].x + landmarks[12].x) / 2,
            y: (landmarks[11].y + landmarks[12].y) / 2
        };
        const hipMid = {
            x: (landmarks[23].x + landmarks[24].x) / 2,
            y: (landmarks[23].y + landmarks[24].y) / 2
        };

        const dx = shoulderMid.x - hipMid.x;
        const dy = shoulderMid.y - hipMid.y;
        return Math.abs(Math.atan2(dx, -dy) * 180 / Math.PI);
    }

    endRep(exerciseType) {
        if (this.currentRepFrames.length < 2) return null;

        const repIndex = this.repData.length + 1;
        const duration = this.repStartTime ? (Date.now() - this.repStartTime) / 1000 : 0;

        const features = this._calculateRepFeatures(exerciseType);
        features.rep_index = repIndex;
        features.duration_sec = Math.round(duration * 100) / 100;

        this.repData.push(features);
        this.currentRepFrames = [];
        this.repStartTime = null;

        return features;
    }

    _calculateRepFeatures(exerciseType) {
        const features = {
            depth: { value: 0.0, note: '' },
            alignment: { value: 0.0, note: '' },
            symmetry: { value: 0.0, note: '' },
            stability: { value: 0.0, note: '' },
            knee_tracking: { value: null, note: '' },
            torso_angle: { value: null, note: '' },
            rom: { value: null, note: '' },
            control: { value: null, note: '' },
            events: []
        };

        if (this.currentRepFrames.length === 0) return features;

        if (exerciseType === 'pushup') {
            return this._calcPushupFeatures(features);
        } else if (exerciseType === 'squat') {
            return this._calcSquatFeatures(features);
        } else if (exerciseType === 'situp') {
            return this._calcSitupFeatures(features);
        }

        features.stability = this._calcStability();
        return features;
    }

    _calcPushupFeatures(features) {
        const angles = this.currentRepFrames.map(f => f.angles);

        // depth
        const leftElbows = angles.map(a => a.leftElbow || 180);
        const rightElbows = angles.map(a => a.rightElbow || 180);
        const minElbow = Math.min(Math.min(...leftElbows), Math.min(...rightElbows));

        const depthScore = Math.max(0, Math.min(1, (180 - minElbow) / 150));
        if (minElbow > 120) {
            features.events.push('shallow_depth');
            features.depth.note = '動作が浅い';
        } else if (minElbow < 45) {
            features.depth.note = '十分な深さ';
        }
        features.depth.value = Math.round(depthScore * 100) / 100;

        // alignment
        const leftLines = angles.map(a => a.leftBodyLine || 180);
        const rightLines = angles.map(a => a.rightBodyLine || 180);
        const avgLine = (leftLines.reduce((a, b) => a + b, 0) + rightLines.reduce((a, b) => a + b, 0)) /
                        (2 * angles.length);

        const alignmentScore = Math.max(0, Math.min(1, avgLine / 180));
        if (avgLine < 160) {
            features.events.push('hips_sag_at_bottom');
            features.alignment.note = '腰が落ちている';
        } else if (avgLine > 175) {
            features.alignment.note = '良い姿勢';
        }
        features.alignment.value = Math.round(alignmentScore * 100) / 100;

        // symmetry
        const elbowDiffs = leftElbows.map((l, i) => Math.abs(l - rightElbows[i]));
        const avgDiff = elbowDiffs.reduce((a, b) => a + b, 0) / elbowDiffs.length;

        const symmetryScore = Math.max(0, Math.min(1, 1 - avgDiff / 30));
        if (avgDiff > 15) {
            features.events.push('asymmetric_movement');
            features.symmetry.note = '左右差あり';
        } else {
            features.symmetry.note = '左右バランス良好';
        }
        features.symmetry.value = Math.round(symmetryScore * 100) / 100;

        features.stability = this._calcStability();

        return features;
    }

    _calcSquatFeatures(features) {
        const angles = this.currentRepFrames.map(f => f.angles);

        // depth
        const leftKnees = angles.map(a => a.leftKnee || 180);
        const rightKnees = angles.map(a => a.rightKnee || 180);
        const minKnee = Math.min(Math.min(...leftKnees), Math.min(...rightKnees));

        const depthScore = Math.max(0, Math.min(1, (180 - minKnee) / 90));
        if (minKnee > 110) {
            features.events.push('shallow_squat');
            features.depth.note = 'スクワットが浅い';
        } else if (minKnee < 80) {
            features.depth.note = '十分な深さ';
        }
        features.depth.value = Math.round(depthScore * 100) / 100;

        // knee_tracking
        const kneeDiffs = leftKnees.map((l, i) => Math.abs(l - rightKnees[i]));
        const avgKneeDiff = kneeDiffs.reduce((a, b) => a + b, 0) / kneeDiffs.length;
        const kneeTrackingScore = Math.max(0, Math.min(1, 1 - avgKneeDiff / 20));
        if (avgKneeDiff > 10) {
            features.events.push('knee_valgus');
            features.knee_tracking.note = '膝が内側に入っている';
        } else {
            features.knee_tracking.note = '膝の追跡良好';
        }
        features.knee_tracking.value = Math.round(kneeTrackingScore * 100) / 100;

        // torso_angle
        const torsos = angles.map(a => a.torso || 0);
        const avgTorso = torsos.reduce((a, b) => a + b, 0) / torsos.length;

        let torsoScore;
        if (avgTorso < 15) {
            torsoScore = avgTorso / 15;
            features.torso_angle.note = '体幹が立ちすぎ';
        } else if (avgTorso > 45) {
            torsoScore = Math.max(0, 1 - (avgTorso - 45) / 30);
            features.events.push('torso_collapse');
            features.torso_angle.note = '前傾しすぎ';
        } else {
            torsoScore = 1.0;
            features.torso_angle.note = '適切な体幹角度';
        }
        features.torso_angle.value = Math.round(torsoScore * 100) / 100;

        features.alignment.value = Math.round(kneeTrackingScore * 100) / 100;
        features.symmetry.value = Math.round(kneeTrackingScore * 100) / 100;
        features.stability = this._calcStability();

        return features;
    }

    _calcSitupFeatures(features) {
        const angles = this.currentRepFrames.map(f => f.angles);

        // rom
        const leftTorsos = angles.map(a => a.leftTorso || 90);
        const rightTorsos = angles.map(a => a.rightTorso || 90);
        const avgTorsos = leftTorsos.map((l, i) => (l + rightTorsos[i]) / 2);

        const angleRange = Math.max(...avgTorsos) - Math.min(...avgTorsos);
        const romScore = Math.max(0, Math.min(1, angleRange / 60));
        if (angleRange < 40) {
            features.events.push('incomplete_lowering');
            features.rom.note = '可動域が狭い';
        } else {
            features.rom.note = '良い可動域';
        }
        features.rom.value = Math.round(romScore * 100) / 100;

        // control
        if (avgTorsos.length > 1) {
            const velocities = [];
            for (let i = 1; i < avgTorsos.length; i++) {
                velocities.push(Math.abs(avgTorsos[i] - avgTorsos[i - 1]));
            }
            const velocityStd = this._std(velocities);
            const controlScore = Math.max(0, Math.min(1, 1 - velocityStd / 10));
            if (velocityStd > 5) {
                features.events.push('momentum_bounce');
                features.control.note = '勢いで動いている';
            } else {
                features.control.note = '制御された動き';
            }
            features.control.value = Math.round(controlScore * 100) / 100;
        }

        // symmetry
        const torsoDiffs = leftTorsos.map((l, i) => Math.abs(l - rightTorsos[i]));
        const avgDiff = torsoDiffs.reduce((a, b) => a + b, 0) / torsoDiffs.length;
        const symmetryScore = Math.max(0, Math.min(1, 1 - avgDiff / 20));
        features.symmetry.value = Math.round(symmetryScore * 100) / 100;

        features.depth.value = features.rom.value;
        features.alignment.value = features.control.value || 0.5;
        features.stability = this._calcStability();

        return features;
    }

    _calcStability() {
        if (this.currentRepFrames.length < 2) {
            return { value: 0.5, note: 'データ不足' };
        }

        const shoulderPositions = [];
        for (const frame of this.currentRepFrames) {
            const lm = frame.landmarks;
            if (lm.length > 12) {
                shoulderPositions.push({
                    x: (lm[11].x + lm[12].x) / 2,
                    y: (lm[11].y + lm[12].y) / 2
                });
            }
        }

        if (shoulderPositions.length < 2) {
            return { value: 0.5, note: '' };
        }

        const xStd = this._std(shoulderPositions.map(p => p.x));
        const yStd = this._std(shoulderPositions.map(p => p.y));
        const totalJitter = Math.sqrt(xStd ** 2 + yStd ** 2);

        const stabilityScore = Math.max(0, Math.min(1, 1 - totalJitter / 0.1));
        const note = stabilityScore > 0.7 ? '安定した動き' : 'ブレが大きい';

        return { value: Math.round(stabilityScore * 100) / 100, note };
    }

    _std(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const squareDiffs = arr.map(v => (v - mean) ** 2);
        return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / arr.length);
    }

    generatePayload(exerciseType, fps = 30) {
        if (this.repData.length === 0) return null;

        const overallStats = this._calculateOverallStats();
        const highlights = this._calculateHighlights();

        return {
            meta: {
                user_id: 'anonymous',
                session_id: this.sessionId,
                timestamp: new Date().toISOString(),
                camera_view: 'webcam',
                fps: fps
            },
            exercise: exerciseType,
            goal: {
                priority: 'form_and_safety',
                context: 'home_training_no_equipment'
            },
            reps: this.repData.length,
            rep_summaries: this.repData,
            overall_stats: overallStats,
            highlights: highlights,
            notes: {
                visibility_quality: 'ok',
                warnings: []
            }
        };
    }

    _calculateOverallStats() {
        const stats = {
            tempo: { mean_sec_per_rep: 0.0, cv: 0.0 },
            depth: { mean: 0.0, min: 0.0, max: 0.0 },
            alignment: { mean: 0.0, min: 0.0, max: 0.0 },
            symmetry: { mean: 0.0, min: 0.0, max: 0.0 },
            stability: { mean: 0.0, min: 0.0, max: 0.0 }
        };

        if (this.repData.length === 0) return stats;

        // テンポ統計
        const durations = this.repData.map(r => r.duration_sec).filter(d => d > 0);
        if (durations.length > 0) {
            const meanDur = durations.reduce((a, b) => a + b, 0) / durations.length;
            const stdDur = this._std(durations);
            const cv = meanDur > 0 ? stdDur / meanDur : 0;
            stats.tempo = {
                mean_sec_per_rep: Math.round(meanDur * 100) / 100,
                cv: Math.round(cv * 100) / 100
            };
        }

        // 各特徴量の統計
        for (const key of ['depth', 'alignment', 'symmetry', 'stability']) {
            const values = this.repData
                .map(r => r[key]?.value)
                .filter(v => v !== null && v !== undefined);

            if (values.length > 0) {
                stats[key] = {
                    mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100,
                    min: Math.round(Math.min(...values) * 100) / 100,
                    max: Math.round(Math.max(...values) * 100) / 100
                };
            }
        }

        return stats;
    }

    _calculateHighlights() {
        if (this.repData.length === 0) {
            return { best_rep_index: 0, worst_rep_index: 0, trend: [] };
        }

        // 総合スコアを計算
        const calcTotalScore = (rep) => {
            const scores = [];
            for (const key of ['depth', 'alignment', 'symmetry', 'stability']) {
                if (rep[key]?.value !== null && rep[key]?.value !== undefined) {
                    scores.push(rep[key].value);
                }
            }
            return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        };

        const scores = this.repData.map((r, i) => ({ index: i + 1, score: calcTotalScore(r) }));
        const best = scores.reduce((a, b) => a.score > b.score ? a : b);
        const worst = scores.reduce((a, b) => a.score < b.score ? a : b);

        // トレンド分析
        const trend = [];
        if (scores.length >= 3) {
            const half = Math.floor(scores.length / 2);
            const firstHalf = scores.slice(0, half).reduce((a, b) => a + b.score, 0) / half;
            const secondHalf = scores.slice(half).reduce((a, b) => a + b.score, 0) / (scores.length - half);

            if (secondHalf < firstHalf - 0.1) {
                trend.push('後半でフォームが崩れている');
            } else if (secondHalf > firstHalf + 0.1) {
                trend.push('後半に向けて改善している');
            }
        }

        return {
            best_rep_index: best.index,
            worst_rep_index: worst.index,
            trend: trend
        };
    }
}

/**
 * 筋トレ回数カウンタークラス
 */
class ExerciseCounter {
    constructor(featureExtractor) {
        this.featureExtractor = featureExtractor;
        this.count = 0;
        this.stage = null;
        this.prevStage = null;
        this.exerciseType = null;
        this.targetCount = 0;
        this.announcedAlmost = false;
        this.announcedComplete = false;
    }

    reset() {
        this.count = 0;
        this.stage = null;
        this.prevStage = null;
        this.announcedAlmost = false;
        this.announcedComplete = false;
        if (this.featureExtractor) {
            this.featureExtractor.reset();
        }
    }

    setTarget(target) {
        this.targetCount = target;
        this.announcedAlmost = false;
        this.announcedComplete = false;
        if (target > 0) {
            voiceManager.speak(`目標${target}回に設定しました`);
        }
    }

    _onCountUp() {
        if (this.targetCount > 0) {
            const remaining = this.targetCount - this.count;

            if (this.count >= this.targetCount && !this.announcedComplete) {
                voiceManager.speak('目標回数を達成しました！おめでとうございます！', true);
                this.announcedComplete = true;
            } else if (remaining <= this.targetCount * 0.2 && remaining > 0 && !this.announcedAlmost) {
                voiceManager.speak('もう少しです。頑張ってください！', true);
                this.announcedAlmost = true;
            } else if (!this.announcedAlmost) {
                voiceManager.speakNumber(this.count);
            }
        } else {
            voiceManager.speakNumber(this.count);
        }
    }

    countPushup(landmarks) {
        if (!landmarks || landmarks.length < 17) return null;

        const shoulder = landmarks[11];
        const elbow = landmarks[13];
        const wrist = landmarks[15];

        const angle = calculateAngle(shoulder, elbow, wrist);

        // 特徴量抽出
        if (this.featureExtractor && this.stage !== null) {
            this.featureExtractor.addFrame(landmarks, 'pushup');
        }

        this.prevStage = this.stage;

        // 状態遷移でカウント
        if (angle > 160) {
            this.stage = 'up';
            if (this.prevStage === 'down' && this.featureExtractor) {
                this.featureExtractor.endRep('pushup');
            }
        }
        if (angle < 90 && this.stage === 'up') {
            this.stage = 'down';
            if (this.featureExtractor) {
                this.featureExtractor.startRep();
            }
            this.count++;
            this._onCountUp();
        }

        return angle;
    }

    countSitup(landmarks) {
        if (!landmarks || landmarks.length < 27) return null;

        const shoulder = landmarks[11];
        const hip = landmarks[23];
        const knee = landmarks[25];

        const angle = calculateAngle(shoulder, hip, knee);

        // 特徴量抽出
        if (this.featureExtractor && this.stage !== null) {
            this.featureExtractor.addFrame(landmarks, 'situp');
        }

        this.prevStage = this.stage;

        // 状態遷移でカウント
        if (angle > 140) {
            this.stage = 'down';
            if (this.prevStage === 'up' && this.featureExtractor) {
                this.featureExtractor.endRep('situp');
            }
        }
        if (angle < 70 && this.stage === 'down') {
            this.stage = 'up';
            if (this.featureExtractor) {
                this.featureExtractor.startRep();
            }
            this.count++;
            this._onCountUp();
        }

        return angle;
    }

    countSquat(landmarks) {
        if (!landmarks || landmarks.length < 27) return null;

        const hip = landmarks[23];
        const knee = landmarks[25];
        const ankle = landmarks[27];

        const angle = calculateAngle(hip, knee, ankle);

        // 特徴量抽出
        if (this.featureExtractor && this.stage !== null) {
            this.featureExtractor.addFrame(landmarks, 'squat');
        }

        this.prevStage = this.stage;

        // 状態遷移でカウント
        if (angle > 160) {
            this.stage = 'up';
            if (this.prevStage === 'down' && this.featureExtractor) {
                this.featureExtractor.endRep('squat');
            }
        }
        if (angle < 90 && this.stage === 'up') {
            this.stage = 'down';
            if (this.featureExtractor) {
                this.featureExtractor.startRep();
            }
            this.count++;
            this._onCountUp();
        }

        return angle;
    }
}

/**
 * 自動メニュー判定クラス
 */
class ExerciseDetector {
    constructor() {
        this.detectionHistory = [];
        this.historySize = 30;
    }

    detectExercise(landmarks) {
        if (!landmarks || landmarks.length < 33) return null;

        const scores = {
            pushup: this._scorePushup(landmarks),
            situp: this._scoreSitup(landmarks),
            squat: this._scoreSquat(landmarks)
        };

        // 最もスコアが高いメニューを選択
        let detected = Object.keys(scores).reduce((a, b) =>
            scores[a] > scores[b] ? a : b);

        // 履歴に追加
        this.detectionHistory.push(detected);
        if (this.detectionHistory.length > this.historySize) {
            this.detectionHistory.shift();
        }

        // 履歴の60%以上が同じメニューなら確定
        if (this.detectionHistory.length >= 10) {
            const counts = {};
            for (const d of this.detectionHistory) {
                counts[d] = (counts[d] || 0) + 1;
            }
            const mostCommon = Object.keys(counts).reduce((a, b) =>
                counts[a] > counts[b] ? a : b);

            if (counts[mostCommon] >= this.detectionHistory.length * 0.6) {
                return mostCommon;
            }
        }

        return null;
    }

    _scorePushup(landmarks) {
        const shoulderY = landmarks[11].y;
        const ankleY = landmarks[27].y;
        const wristY = landmarks[15].y;

        const horizontalScore = 100 - Math.abs(shoulderY - ankleY) * 200;
        const handsDown = wristY > shoulderY ? 50 : 0;
        return Math.max(0, horizontalScore + handsDown);
    }

    _scoreSitup(landmarks) {
        const shoulderY = landmarks[11].y;
        const hipY = landmarks[23].y;
        const kneeY = landmarks[25].y;

        const kneeBent = kneeY < hipY ? 50 : 0;
        const lyingDown = shoulderY > hipY * 0.8 ? 50 : 0;
        return kneeBent + lyingDown;
    }

    _scoreSquat(landmarks) {
        const shoulderX = landmarks[11].x;
        const ankleX = landmarks[27].x;

        const verticalScore = 100 - Math.abs(shoulderX - ankleX) * 200;
        return Math.max(0, verticalScore);
    }

    reset() {
        this.detectionHistory = [];
    }
}
