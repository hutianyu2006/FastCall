import { createServer } from 'http';

const PORT = 44143;
let clients = [];

// Create an HTTP server
const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/sse') {       

        if (!req.headers.cookie) {
            res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Credentials': 'true' });
            res.end("Error: No Cookie Found")
        }
        else {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': req.headers.origin,
                'Access-Control-Allow-Credentials': 'true'
            });
            const id = req.headers.cookie.split('=')[1];

            let client = {
                id: id,
                res: res
            }

            // Add the client connection
            clients.push(client);

            let interval = setInterval(() => {
                res.write(': \n\n');
            }, 15 * 1000)


            // Remove client on disconnect
            req.on('close', () => {
                clients = clients.filter(client => client !== res);
                clearInterval(interval);
            });
        }
    }
    else if (req.method === 'POST' && req.url === '/signal') {
        // Handle incoming POST requests
        let body = '';

        // Collect data chunks
        req.on('data', chunk => {
            body += chunk;
        });

        // Broadcast to SSE clients once fully received
        req.on('end', () => {
            if (!req.headers.cookie) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("Error: No Cookie Found")
            }
            else {
                for (const client of clients) {
                    if (!req.headers["cookie"].includes(client.id)) {
                        client.res.write(`data: ${body}\n\n`)
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': req.headers.origin, 'Access-Control-Allow-Credentials': 'true' });
                res.end(JSON.stringify({ status: 'Message broadcasted' }));
            }
        });
    }
    else if (req.method === "GET" && req.url === "/getCredentials") {
        // Create a Cloudflare Calls TURN Service, and you'll find out what the "x"s are.
        const requestInit = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            },
            body: JSON.stringify({
                "ttl": 3600
            })
        };
        fetch("https://rtc.live.cloudflare.com/v1/turn/keys/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/credentials/generate", requestInit)
            .then(res => res.json())
            .then(data => {
                const id= Date.now().toString(36);
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': req.headers.origin,
                    'Access-Control-Allow-Credentials': 'true',
                    'Set-Cookie': `id=${id}; SameSite=None; Secure; Path=/; HttpOnly`
                });
                res.end(JSON.stringify(data));
            });
    }
    else if (req.method === "OPTIONS") {
        // CORS preflight
        res.writeHead(200, {
            'Access-Control-Allow-Origin': req.headers.origin,
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
        });
        res.end();
    }
    else {
        // Fallback for unsupported routes
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
