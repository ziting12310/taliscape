// 极简 HTTP server —— 替代 python http.server（Windows 上 python 进程不稳定）
// 用法：node server.cjs   然后浏览器打开 http://localhost:8080/
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);

  // 安全检查：不能逃逸 ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + urlPath);
      console.log('[404] ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    // ES Module 需要正确的 MIME
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',  // 开发期禁用缓存，防止更新不生效
    });
    res.end(data);
    console.log('[200] ' + urlPath + '  (' + data.length + 'B)');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('======================================');
  console.log('  逃课记 · 本地服务器已启动');
  console.log('  打开浏览器访问: http://localhost:' + PORT + '/');
  console.log('  按 Ctrl+C 停止');
  console.log('======================================');
});
