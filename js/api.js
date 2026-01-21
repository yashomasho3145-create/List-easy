/**
 * n8n Webhook通信クライアント
 * fetch APIを使用
 */
class FormCoachClient {
    constructor() {
        this.webhookUrl = '';
        this.lastFeedback = null;
        this.lastError = null;
        this.isConnected = false;
    }

    /**
     * Webhook URLを設定
     * @param {string} url - n8n webhook URL
     */
    setWebhookUrl(url) {
        this.webhookUrl = url;
        this.isConnected = false;  // 新しいURLを設定したら接続状態リセット
    }

    /**
     * n8nへの接続をテスト
     * @returns {Promise<boolean>} 接続成功ならtrue
     */
    async checkConnection() {
        if (!this.webhookUrl) {
            this.lastError = 'Webhook URLが設定されていません';
            this.isConnected = false;
            return false;
        }

        try {
            console.log('n8n接続テスト中...', this.webhookUrl);

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ test: true, ping: 'connection_check' })
            });

            console.log('レスポンス:', response.status);

            // レスポンスを受け取れたら接続OK
            this.isConnected = true;
            this.lastError = null;
            return true;

        } catch (error) {
            console.error('接続エラー:', error);

            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                this.lastError = 'CORSエラーまたはネットワークエラー。n8n側でCORSを許可してください。';
            } else {
                this.lastError = `接続エラー: ${error.message}`;
            }

            this.isConnected = false;
            return false;
        }
    }

    /**
     * 接続状態を文字列で取得
     */
    getConnectionStatus() {
        if (!this.webhookUrl) return '未設定';
        return this.isConnected ? '接続済み' : '未接続';
    }

    /**
     * 特徴量をn8nに送信してAI評価を取得
     * @param {object} payload - 特徴量ペイロード
     * @returns {Promise<object|null>} AI評価結果、失敗時はnull
     */
    async sendForEvaluation(payload) {
        if (!payload) {
            this.lastError = 'ペイロードが空です';
            return null;
        }

        if (!this.webhookUrl) {
            this.lastError = 'Webhook URLが設定されていません';
            return null;
        }

        try {
            console.log('n8nに送信中...', this.webhookUrl);
            console.log('ペイロード:', payload);

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const feedback = await response.json();
                this.lastFeedback = feedback;
                this.lastError = null;
                console.log('AI評価を受信:', feedback);
                return feedback;
            } else {
                this.lastError = `HTTPエラー: ${response.status}`;
                console.error(this.lastError);
                return null;
            }

        } catch (error) {
            console.error('送信エラー:', error);

            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                this.lastError = 'CORSエラー。n8n側でCORSを許可してください。';
            } else {
                this.lastError = `送信エラー: ${error.message}`;
            }

            return null;
        }
    }

    /**
     * 最後のエラーメッセージを取得
     */
    getLastError() {
        return this.lastError;
    }

    /**
     * 最後のフィードバックを取得
     */
    getLastFeedback() {
        return this.lastFeedback;
    }
}

// グローバルインスタンス
const formCoachClient = new FormCoachClient();
