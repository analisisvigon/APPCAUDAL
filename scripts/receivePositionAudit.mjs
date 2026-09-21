import http from 'node:http';

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (request.method === 'OPTIONS') return response.writeHead(204).end();
  if (request.method !== 'POST' || request.url !== '/audit') return response.writeHead(404).end();
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    response.writeHead(204).end();
    process.stdout.write(`${JSON.stringify(JSON.parse(body), null, 2)}\n`);
    server.close();
  });
});
server.listen(9236, '127.0.0.1', () => process.stdout.write('AUDIT_RECEIVER_READY:9236\n'));
