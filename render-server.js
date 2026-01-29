const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS設定（制限付き）
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://y-redhat.github.io/testserver-p/', // GitHub Pages
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || !origin) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Request-Type, X-API-Version');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

// 復号化関数
function decryptData(encrypted, mode) {
    try {
        switch(mode) {
            case 'aes':
                // 注: 実際のAES復号はクライアントサイドで行う
                // サーバー側ではBase64のみ復号
                return atob(encrypted);
                
            case 'xor':
                const xorDecoded = atob(encrypted);
                // XOR復号はクライアントで行う前提
                return xorDecoded;
                
            case 'base64':
                let decoded = atob(encrypted);
                decoded = atob(decoded.split('').reverse().join(''));
                return decoded;
                
            default:
                return atob(encrypted);
        }
    } catch(error) {
        throw new Error('復号化エラー');
    }
}

// メインAPIエンドポイント
app.post('/api', async (req, res) => {
    try {
        const { action, data, mode = 'base64' } = req.body;
        
        if (action !== 'get_content') {
            return res.json({ error: '無効なアクション' });
        }
        
        if (!data) {
            return res.json({ error: 'データが必要です' });
        }
        
        // 1. 暗号化データを復号
        const decryptedUrl = decryptData(data, mode);
        
        console.log(`プロキシリクエスト: ${decryptedUrl.substring(0, 50)}...`);
        
        // 2. ターゲットサイトからデータ取得
        const response = await axios.get(decryptedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 15000,
            maxRedirects: 5
        });
        
        // 3. HTMLを返す
        res.json({
            success: true,
            html: response.data,
            originalUrl: decryptedUrl,
            fetchedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('APIエラー:', error.message);
        
        // エラーページを返す
        res.json({
            error: error.message.includes('timeout') ? 'タイムアウト' : 
                   error.message.includes('ENOTFOUND') ? 'サイトが見つかりません' :
                   '取得エラー',
            iframe: `
                <!DOCTYPE html>
                <html>
                <head><style>body{font-family:sans-serif;padding:40px;}</style></head>
                <body>
                    <h2>⚠️ プロキシエラー</h2>
                    <p>${error.message}</p>
                    <p>別の暗号化モードをお試しください。</p>
                </body>
                </html>
            `
        });
    }
});

// ヘルスチェック
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        service: 'encrypted-proxy',
        version: '1.0.0'
    });
});

// ルート
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>暗号化プロキシサーバー</title></head>
        <body>
            <h1>🔐 暗号化プロキシサーバー</h1>
            <p>ステータス: <strong>オンライン</strong></p>
            <p>暗号化モードをサポートしています。</p>
            <p>GitHub Pagesのクライアントから接続してください。</p>
        </body>
        </html>
    `);
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: '見つかりません' });
});

// エラーハンドリング
app.use((err, req, res, next) => {
    console.error('サーバーエラー:', err);
    res.status(500).json({ error: '内部サーバーエラー' });
});

app.listen(PORT, () => {
    console.log(`🔐 暗号化プロキシサーバー起動: ${PORT}`);
    console.log(`モード: ${process.env.NODE_ENV || 'development'}`);
});
