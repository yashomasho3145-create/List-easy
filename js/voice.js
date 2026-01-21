/**
 * 音声読み上げ管理クラス
 * Web Speech API (SpeechSynthesis) を使用
 */
class VoiceManager {
    constructor() {
        this.enabled = true;
        this.synth = window.speechSynthesis;
        this.speaking = false;
        this.queue = [];
        this.voice = null;

        // 日本語音声を探す
        this._findJapaneseVoice();

        // 音声リストが非同期で読み込まれる場合に対応
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this._findJapaneseVoice();
        }
    }

    /**
     * 日本語音声を検索して設定
     */
    _findJapaneseVoice() {
        const voices = this.synth.getVoices();
        // 日本語音声を優先して探す
        this.voice = voices.find(v => v.lang.includes('ja')) ||
                     voices.find(v => v.lang.includes('JP')) ||
                     voices[0];

        if (this.voice) {
            console.log('音声エンジン: ' + this.voice.name);
        }
    }

    /**
     * テキストを読み上げる
     * @param {string} text - 読み上げるテキスト
     * @param {boolean} priority - 優先フラグ（trueで割り込み）
     */
    speak(text, priority = false) {
        if (!this.enabled || !this.synth) return;

        if (priority) {
            // 優先メッセージは現在の発話をキャンセルして即座に再生
            this.synth.cancel();
            this.queue = [];
            this._utterText(text);
        } else {
            // 通常メッセージはキューに追加（最大3つ）
            if (this.queue.length < 3) {
                this.queue.push(text);
            }
            this._processQueue();
        }
    }

    /**
     * キューを処理
     */
    _processQueue() {
        if (this.speaking || this.queue.length === 0) return;

        const text = this.queue.shift();
        this._utterText(text);
    }

    /**
     * 実際に発話する
     */
    _utterText(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 1.2;  // 少し速め
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (this.voice) {
            utterance.voice = this.voice;
        }

        utterance.onstart = () => {
            this.speaking = true;
        };

        utterance.onend = () => {
            this.speaking = false;
            this._processQueue();
        };

        utterance.onerror = (e) => {
            console.warn('音声エラー:', e);
            this.speaking = false;
            this._processQueue();
        };

        this.synth.speak(utterance);
    }

    /**
     * 数字を「〇回」と読み上げる
     */
    speakNumber(num) {
        this.speak(`${num}回`);
    }

    /**
     * 残り秒数を読み上げ（優先）
     */
    speakRemaining(seconds) {
        this.speak(`残り${seconds}秒`, true);
    }

    /**
     * カウントダウン読み上げ（優先）
     */
    speakCountdown(num) {
        this.speak(String(num), true);
    }

    /**
     * キューをクリア
     */
    clearQueue() {
        this.queue = [];
    }

    /**
     * 音声を停止
     */
    stop() {
        this.synth.cancel();
        this.queue = [];
        this.speaking = false;
    }

    /**
     * 音声機能を切り替え
     */
    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stop();
        }
        return this.enabled;
    }
}

// グローバルインスタンス
const voiceManager = new VoiceManager();
