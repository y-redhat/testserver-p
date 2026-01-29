const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS設定
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://y-redhat.github.io',
        'http://localhost:8000',
        'http://localhost:5500',
        'file://'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || !origin) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Client');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

// 復号化関数 - クライアントと一致させる
function decryptData(encrypted) {
    try {
        // 1. Base64デコード
        let decoded = Buffer.from(encrypted, 'base64').toString();
        
        // 2. 逆シフト
        const secretKey = 'y-redhat-testserver-2024';
        let unshifted = '';
        for (let i = 0; i < decoded.length; i++) {
            const charCode = decoded.charCodeAt(i);
            const shift = secretKey.charCodeAt(i % secretKey.length) % 10;
            unshifted += String.fromCharCode(charCode - shift);
        }
        
        // 3. 逆順
        const reversed = unshifted.split('').reverse().join('');
        
        // 4. Base64デコード
        return Buffer.from(reversed, 'base64').toString();
        
    } catch (error) {
        throw new Error('復号化失敗');
    }
}

// メインAPIエンドポイント
app.post('/api', async (req, res) => {
    console.log('APIリクエスト受信:', req.body.req);
    
    try {
        const { req: requestType, data, ts, id, v } = req.body;
        
        if (requestType !== 'fetch') {
            return res.json({ error: '無効なリクエストタイプ' });
        }
        
        if (!data) {
            return res.json({ error: 'データがありません' });
        }
        
        // タイムスタンプチェック（5分以内）
        const now = Date.now();
        if (Math.abs(now - ts) > 300000) { // 5分
            return res.json({ error: 'リクエストの有効期限切れ' });
        }
        
        // 1. 暗号化データを復号
        const targetUrl = decryptData(data);
        
        console.log('復号されたURL:', targetUrl.substring(0, 100));
        
        // 2. ターゲットサイトからデータ取得
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            },
            timeout: 20000,
            maxRedirects: 5,
            validateStatus: () => true // すべてのステータスコードを許可
        });
        
        // 3. HTMLを加工（必要に応じて）
        let html = response.data;
        
        // 相対URLを絶対URLに変換（簡易的）
        const baseUrl = new URL(targetUrl);
        html = html.replace(
            /(src|href)="(?!https?:\/\/)(?!data:)(?!javascript:)([^"]*)"/gi,
            (match, attr, value) => {
                try {
                    const absoluteUrl = new URL(value, baseUrl).href;
                    return `${attr}="${absoluteUrl}"`;
                } catch {
                    return match;
                }
            }
        );
        
        // 4. レスポンスを返す
        res.json({
            success: true,
            html: html,
            originalUrl: targetUrl,
            fetchedAt: new Date().toISOString(),
            requestId: id,
            statusCode: response.status
        });
        
    } catch (error) {
        console.error('APIエラー:', error.message);
        
        // エラーメッセージを安全に返す
        let errorMessage = '不明なエラー';
        if (error.message.includes('timeout')) {
            errorMessage = 'タイムアウト: サイトの応答が遅すぎます';
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
            errorMessage = 'サイトが見つかりません';
        } else if (error.message.includes('復号化失敗')) {
            errorMessage = '暗号化データの復号に失敗しました';
        } else {
            errorMessage = error.message.substring(0, 100);
        }
        
        res.json({
            error: errorMessage,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
                        .error-box { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        h2 { color: #ff4757; }
                        .retry-btn { background: #8a2be2; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <h2>⚠️ プロキシエラー</h2>
                        <p><strong>エラー:</strong> ${errorMessage}</p>
                        <p>以下の方法をお試しください:</p>
                        <ul>
                            <li>URLが正しいか確認</li>
                            <li>しばらく待ってから再試行</li>
                            <li>別のサイトを試す</li>
                        </ul>
                        <button class="retry-btn" onclick="window.location.reload()">再試行</button>
                    </div>
                </body>
                </html>
            `
        });
    }
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'encrypted-proxy-server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        server: 'Render'
    });
});

// ルートエンドポイント
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>暗号化プロキシサーバー</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; background: #0a0a0a; color: #00ff88; }
                .container { max-width: 800px; margin: 0 auto; }
                code { background: #222; padding: 2px 6px; border-radius: 3px; }
                a { color: #8a2be2; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 暗号化プロキシサーバー</h1>
                <p>ステータス: <strong style="color: #00ff88;">オンライン</strong></p>
                
                <h2>接続情報</h2>
                <ul>
                    <li>サーバーURL: <code>${req.protocol}://${req.get('host')}</code></li>
                    <li>APIエンドポイント: <code>/api</code></li>
                    <li>GitHub Pages: <a href="https://y-redhat.github.io/testserver-p/">https://y-redhat.github.io/testserver-p/</a></li>
                </ul>
                
                <h2>使い方</h2>
                <ol>
                    <li>GitHub Pagesでクライアントを開く</li>
                    <li>URLを入力して「暗号化して読み込み」をクリック</li>
                    <li>暗号化された通信でサイトにアクセス</li>
                </ol>
                
                <p style="margin-top: 40px; color: #888; font-size: 12px;">
                    暗号化プロキシシステム - y-redhat
                </p>
            </div>
        </body>
        </html>
    `);
});

// 静的ファイル（オプション）
app.use('/client', express.static('public'));

// 404ハンドラー
app.use((req, res) => {
    res.status(404).json({ 
        error: 'エンドポイントが見つかりません',
        available: ['/api', '/health', '/']
    });
});

// グローバルエラーハンドラー
app.use((err, req, res, next) => {
    console.error('サーバーエラー:', err);
    res.status(500).json({ 
        error: '内部サーバーエラー',
        message: process.env.NODE_ENV === 'development' ? err.message : '不明なエラー'
    });
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`
    =========================================
    🔐 暗号化プロキシサーバー起動
    =========================================
    Port: ${PORT}
    Mode: ${process.env.NODE_ENV || 'production'}
    URL: http://localhost:${PORT}
    GitHub: https://y-redhat.github.io/testserver-p/
    =========================================
    `);
});
