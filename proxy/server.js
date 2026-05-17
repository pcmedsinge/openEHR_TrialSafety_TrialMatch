const httpProxy = require('http-proxy');
const http = require('http');

const SAFETY = 'http://localhost:5173';
const MATCH  = 'http://localhost:5174';

const proxy = httpProxy.createProxyServer({});

proxy.on('error', (err, _req, res) => {
  if (res && res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Gateway error: ' + err.message);
  }
});

const server = http.createServer((req, res) => {
  const target = req.url.startsWith('/match') ? MATCH : SAFETY;
  proxy.web(req, res, { target });
});

// Forward WebSocket upgrades (needed for Vite HMR)
server.on('upgrade', (req, socket, head) => {
  const target = req.url.startsWith('/match') ? MATCH : SAFETY;
  proxy.ws(req, socket, head, { target });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  Gateway running on http://localhost:' + PORT);
  console.log('  /match/* --> TrialMatch  (http://localhost:5174)');
  console.log('  /*       --> TrialSafety (http://localhost:5173)');
  console.log('');
});
