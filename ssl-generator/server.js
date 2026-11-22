/**
 * SSL Checker backend
 *
 * Serves the static SSL Generator app and exposes:
 *   GET /api/check?host=example.com&port=443
 *
 * The endpoint opens a real TLS connection, returns the served certificate
 * chain as PEM plus protocol/cipher/trust information, and blocks private or
 * reserved targets by default to prevent SSRF.
 *
 * Only Node.js built-in modules are used, so there are no npm dependencies.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const dns = require('node:dns').promises;
const tls = require('node:tls');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const STANDALONE_ROOT = __dirname;
const APP_ROOT = path.resolve(__dirname, '..');
const HAS_TOOLS_APP = fs.existsSync(path.join(APP_ROOT, 'index.html'));
const SITE_ROOT = HAS_TOOLS_APP ? APP_ROOT : STANDALONE_ROOT;
const ROOT_FILES = new Set(['/manifest.webmanifest', '/sw.js']);
const ALLOW_PRIVATE_HOSTS = process.env.ALLOW_PRIVATE_HOSTS === '1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN) || 30;
const RATE_WINDOW_MS = 60 * 1000;
const TLS_TIMEOUT_MS = Number(process.env.TLS_TIMEOUT_MS) || 12000;
const CSP_EXTRA_CONNECT = process.env.CSP_EXTRA_CONNECT || '';
const MAX_CHAIN_CERTS = 10;

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8'
};

/* --------------------------------------------------------------------------
 * Rate limiting (in-memory, per client IP)
 * ----------------------------------------------------------------------- */

const rateBuckets = new Map();

function rateLimit(ip) {
    const now = Date.now();
    let bucket = rateBuckets.get(ip);

    if (!bucket || bucket.reset <= now) {
        bucket = { count: 0, reset: now + RATE_WINDOW_MS };
        rateBuckets.set(ip, bucket);
    }

    bucket.count += 1;

    return {
        allowed: bucket.count <= RATE_LIMIT,
        remaining: Math.max(0, RATE_LIMIT - bucket.count),
        reset: bucket.reset
    };
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of rateBuckets) {
        if (bucket.reset <= now) rateBuckets.delete(ip);
    }
}, 5 * 60 * 1000).unref();

function clientIp(req) {
    if (TRUST_PROXY && typeof req.headers['x-forwarded-for'] === 'string') {
        return req.headers['x-forwarded-for'].split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

/* --------------------------------------------------------------------------
 * Address classification (SSRF protection)
 * ----------------------------------------------------------------------- */

function expandIpv6(address) {
    let input = address.toLowerCase().split('%')[0];

    const lastColon = input.lastIndexOf(':');
    if (input.indexOf('.') !== -1 && lastColon !== -1) {
        const v4 = input.slice(lastColon + 1);
        const octets = v4.split('.').map(Number);
        if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
            return null;
        }
        input = input.slice(0, lastColon + 1) +
            ((octets[0] << 8) | octets[1]).toString(16) + ':' +
            ((octets[2] << 8) | octets[3]).toString(16);
    }

    const halves = input.split('::');
    if (halves.length > 2) return null;

    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (halves.length === 2 && missing < 1)) return null;

    const groups = left.concat(new Array(missing).fill('0'), right);
    if (groups.length !== 8) return null;

    const parsed = groups.map((group) => {
        if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
        return parseInt(group, 16);
    });

    return parsed.some((group) => group === null) ? null : parsed;
}

function ipv4IsPrivate(address) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }

    const [a, b, c] = parts;

    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT
    if (a === 169 && b === 254) return true;                     // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;            // private
    if (a === 192 && b === 168) return true;                     // private
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF protocol / TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true;        // benchmarking
    if (a === 198 && b === 51 && c === 100) return true;         // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true;          // TEST-NET-3
    if (a >= 224) return true;                                   // multicast / reserved / broadcast

    return false;
}

function ipv6IsPrivate(address) {
    const groups = expandIpv6(address);
    if (!groups) return true;

    const [g0, g1, g2, g3] = groups;

    // :: and ::1
    if (groups.every((group) => group === 0)) return true;
    if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;

    // IPv4-mapped ::ffff:0:0/96
    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
        return ipv4IsPrivate(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
    }

    // IPv4-translated ::ffff:0:0:0/96
    if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 &&
        groups[4] === 0xffff && groups[5] === 0) {
        return ipv4IsPrivate(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
    }

    // NAT64 64:ff9b::/96 and 64:ff9b:1::/48 embed an IPv4 address
    if (g0 === 0x64 && g1 === 0xff9b && (g2 === 0 || g2 === 1)) {
        if (g2 === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
            return ipv4IsPrivate(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
        }
        return true;
    }

    // 6to4 2002::/16 embeds an IPv4 address in groups 1 and 2
    if (g0 === 0x2002) {
        return ipv4IsPrivate(`${g1 >> 8}.${g1 & 0xff}.${g2 >> 8}.${g2 & 0xff}`);
    }

    // ::/96 IPv4-compatible addresses (deprecated) embed an IPv4 address
    if (groups.slice(0, 6).every((group) => group === 0)) {
        return ipv4IsPrivate(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
    }

    if ((g0 & 0xfe00) === 0xfc00) return true;                    // unique local fc00::/7
    if ((g0 & 0xffc0) === 0xfe80) return true;                    // link-local fe80::/10
    if ((g0 & 0xff00) === 0xff00) return true;                    // multicast ff00::/8
    if (g0 === 0x2001 && g1 === 0x0db8) return true;              // documentation
    if (g0 === 0x3fff) return true;                               // documentation 3fff::/20
    if (g0 === 0x2001 && g1 === 0x0000) return true;              // Teredo
    if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard-only
    if (g0 === 0x2001 && g1 === 0x0002 && g2 === 0) return true;  // benchmarking

    return false;
}

function isPrivateAddress(address) {
    const family = net.isIP(address);
    if (family === 4) return ipv4IsPrivate(address);
    if (family === 6) return ipv6IsPrivate(address);
    return true;
}

/* --------------------------------------------------------------------------
 * Target validation
 * ----------------------------------------------------------------------- */

function normalizeHost(raw) {
    let host = String(raw || '').trim().toLowerCase();

    if (host.startsWith('[') && host.endsWith(']')) {
        host = host.slice(1, -1);
    }

    host = host.replace(/\.$/, '');

    if (!host || host.length > 253) return null;
    if (/[\s/@\\?#]/.test(host)) return null;

    if (net.isIP(host)) return host;

    if (!/^[a-z0-9.-]+$/.test(host)) return null;

    const labels = host.split('.');
    if (labels.some((label) => !label || label.length > 63 ||
        label.startsWith('-') || label.endsWith('-'))) {
        return null;
    }

    return host;
}

function parsePort(raw) {
    if (raw === undefined || raw === null || raw === '') return 443;
    if (!/^\d{1,5}$/.test(String(raw))) return null;

    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return port;
}

/* --------------------------------------------------------------------------
 * TLS handshake
 * ----------------------------------------------------------------------- */

function derToPem(der) {
    const base64 = Buffer.from(der).toString('base64');
    const lines = base64.match(/.{1,64}/g) || [];
    return '-----BEGIN CERTIFICATE-----\n' + lines.join('\n') + '\n-----END CERTIFICATE-----\n';
}

function authorizationErrorText(socket) {
    const error = socket.authorizationError;
    if (!error) return null;
    if (typeof error === 'string') return error;
    return String(error.code || error.message || error);
}

function extractChain(peer) {
    const chain = [];
    const seen = new Set();
    let current = peer;

    while (current && current.raw && chain.length < MAX_CHAIN_CERTS) {
        const fingerprint = current.fingerprint256 || current.fingerprint || current.raw.toString('base64');

        if (seen.has(fingerprint)) break;
        seen.add(fingerprint);
        chain.push(derToPem(current.raw));

        const issuer = current.issuerCertificate;
        if (!issuer || issuer === current) break;
        current = issuer;
    }

    return chain;
}

function tlsCheck(address, host, port) {
    return new Promise((resolve, reject) => {
        const options = {
            host: address,
            port: port,
            rejectUnauthorized: false,
            servername: net.isIP(host) ? undefined : host
        };

        let settled = false;
        let socket;

        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (socket) socket.destroy();
            if (error) reject(error);
            else resolve(value);
        };

        const timer = setTimeout(() => {
            const error = new Error('TLS handshake timed out after ' + Math.round(TLS_TIMEOUT_MS / 1000) + ' seconds.');
            error.statusCode = 504;
            error.code = 'TLS_TIMEOUT';
            finish(error);
        }, TLS_TIMEOUT_MS);

        try {
            socket = tls.connect(options);
        } catch (error) {
            finish(error);
            return;
        }

        socket.once('error', (error) => {
            if (process.env.DEBUG_TLS === '1') {
                console.error('TLS error for', host, address, error.code, error.message);
            }
            finish(error);
        });

        socket.once('secureConnect', () => {
            try {
                const peer = socket.getPeerCertificate(true);
                if (!peer || !peer.raw) {
                    const error = new Error('The server did not present a certificate.');
                    error.statusCode = 502;
                    finish(error);
                    return;
                }

                const chainPem = extractChain(peer);
                const cipher = socket.getCipher ? socket.getCipher() : null;

                finish(null, {
                    host: host,
                    port: port,
                    address: address,
                    checkedAt: new Date().toISOString(),
                    tls: {
                        protocol: socket.getProtocol ? socket.getProtocol() : null,
                        cipher: cipher && (cipher.standardName || cipher.name) ? (cipher.standardName || cipher.name) : null,
                        cipherVersion: cipher && cipher.version ? cipher.version : null,
                        alpn: socket.alpnProtocol || null,
                        authorized: socket.authorized === true,
                        authorizationError: authorizationErrorText(socket)
                    },
                    authorized: socket.authorized === true,
                    certificatePem: chainPem[0],
                    chainPem: chainPem
                });
            } catch (error) {
                finish(error);
            }
        });
    });
}

function blockedAddressError(address) {
    const error = new Error(
        'Refusing to check a private, loopback, or reserved address (' + address + '). ' +
        'Set ALLOW_PRIVATE_HOSTS=1 on the server only if you intentionally need this.'
    );
    error.statusCode = 403;
    error.code = 'PRIVATE_ADDRESS_BLOCKED';
    return error;
}

async function resolveAddresses(host) {
    if (net.isIP(host)) {
        if (!ALLOW_PRIVATE_HOSTS && isPrivateAddress(host)) {
            throw blockedAddressError(host);
        }
        return [host];
    }

    let records;
    try {
        records = await dns.lookup(host, { all: true });
    } catch (error) {
        const wrapped = new Error('Could not resolve ' + host + '. Check that the domain exists.');
        wrapped.statusCode = 400;
        wrapped.code = 'DNS_LOOKUP_FAILED';
        throw wrapped;
    }

    if (!Array.isArray(records) || !records.length) {
        const error = new Error('Could not resolve ' + host + '. Check that the domain exists.');
        error.statusCode = 400;
        error.code = 'DNS_LOOKUP_FAILED';
        throw error;
    }

    const addresses = records.map((record) => record.address);
    const blocked = addresses.filter((address) => isPrivateAddress(address));

    if (!ALLOW_PRIVATE_HOSTS && blocked.length) {
        throw blockedAddressError(blocked[0]);
    }

    // Prefer IPv4 first, then IPv6. Most hosts are reachable either way, and
    // IPv4-first avoids broken IPv6 routes on small VPS instances.
    return addresses.sort((a, b) => net.isIP(a) - net.isIP(b));
}

async function checkTarget(rawHost, rawPort) {
    const host = normalizeHost(rawHost);
    if (!host) {
        const error = new Error('Enter a valid domain name or IP address.');
        error.statusCode = 400;
        throw error;
    }

    const port = parsePort(rawPort);
    if (port === null) {
        const error = new Error('Port must be a number between 1 and 65535.');
        error.statusCode = 400;
        throw error;
    }

    const addresses = await resolveAddresses(host);
    let lastError = null;

    for (const address of addresses.slice(0, 4)) {
        try {
            return await tlsCheck(address, host, port);
        } catch (error) {
            if (error.statusCode === 504) throw error;
            lastError = error;

            // Retry the next address only for connection-level failures.
            if (!['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL', 'ETIMEDOUT', 'EPIPE'].includes(error.code)) {
                break;
            }
        }
    }

    const message = tlsErrorMessage(lastError, host, port);
    const error = new Error(message);
    error.statusCode = 502;
    error.code = 'TLS_CONNECTION_FAILED';
    throw error;
}

function tlsErrorMessage(error, host, port) {
    if (!error) return 'Could not open a TLS connection to ' + host + ':' + port + '.';

    switch (error.code) {
        case 'ECONNREFUSED':
            return 'Connection refused by ' + host + ':' + port + '.';
        case 'ENOTFOUND':
            return 'Host ' + host + ' was not found.';
        case 'EHOSTUNREACH':
        case 'ENETUNREACH':
            return 'No network route to ' + host + ':' + port + '.';
        case 'ETIMEDOUT':
            return 'Connection to ' + host + ':' + port + ' timed out.';
        case 'EPIPE':
        case 'ECONNRESET':
            return 'The TLS connection to ' + host + ':' + port + ' was closed unexpectedly.';
        case 'ERR_SSL_WRONG_VERSION_NUMBER':
            return 'The service on ' + host + ':' + port + ' does not appear to speak TLS.';
        default:
            return 'TLS check failed for ' + host + ':' + port + ': ' + (error.message || error.code || 'unknown error') + '.';
    }
}

/* --------------------------------------------------------------------------
 * HTTP helpers
 * ----------------------------------------------------------------------- */

function corsHeaders(req) {
    const allowed = process.env.ALLOWED_ORIGINS;
    const origin = req.headers.origin;
    const headers = {
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
    };

    if (allowed) {
        const list = allowed.split(',').map((item) => item.trim()).filter(Boolean);
        if (origin && list.includes(origin)) {
            headers['Access-Control-Allow-Origin'] = origin;
        }
    } else {
        headers['Access-Control-Allow-Origin'] = '*';
    }

    return headers;
}

function sendJson(req, res, statusCode, payload, extraHeaders) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    }, corsHeaders(req), extraHeaders || {}));
    res.end(body);
}

function sendError(req, res, statusCode, message) {
    sendJson(req, res, statusCode, { error: message });
}

/* --------------------------------------------------------------------------
 * Static file serving
 * ----------------------------------------------------------------------- */

function resolveWithin(base, relative) {
    const resolved = path.resolve(base, relative.replace(/^\/+/, ''));
    return resolved.startsWith(base + path.sep) ? resolved : null;
}

function staticPath(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath);
    } catch (error) {
        return null;
    }

    if (decoded.indexOf('\0') !== -1) return null;

    if (decoded === '/' || decoded === '/index.html') {
        return HAS_TOOLS_APP
            ? path.join(APP_ROOT, 'index.html')
            : path.join(STANDALONE_ROOT, 'certs_generations.html');
    }

    if (decoded === '/certs_generations.html') {
        return path.join(STANDALONE_ROOT, 'certs_generations.html');
    }

    if (HAS_TOOLS_APP && ROOT_FILES.has(decoded)) {
        return path.join(APP_ROOT, decoded.slice(1));
    }

    if (decoded.startsWith('/assets/')) {
        return resolveWithin(SITE_ROOT, decoded);
    }

    // Keep the standalone SSL generator available for existing links and for
    // deployments that only ship the ssl-generator folder.
    if (decoded === '/ssl-generator' || decoded === '/ssl-generator/' ||
        decoded === '/ssl-generator/index.html' ||
        decoded === '/ssl-generator/certs_generations.html') {
        return path.join(STANDALONE_ROOT, 'certs_generations.html');
    }

    if (decoded.startsWith('/ssl-generator/assets/')) {
        return resolveWithin(STANDALONE_ROOT, decoded.slice('/ssl-generator'.length));
    }

    // Only app shells and their assets are public. Never expose server.js,
    // README, Dockerfile, dotfiles, or anything else that lives in ROOT.
    return null;
}

async function serveStatic(req, res, urlPath) {
    const filePath = staticPath(urlPath);
    if (!filePath) {
        sendError(req, res, 404, 'Not found.');
        return;
    }

    let stats;
    try {
        stats = await fsp.stat(filePath);
    } catch (error) {
        sendError(req, res, 404, 'Not found.');
        return;
    }

    if (!stats.isFile()) {
        sendError(req, res, 404, 'Not found.');
        return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers = {
        'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
        'Content-Length': stats.size,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob:",
            "connect-src 'self' https://api.certspotter.com" + (CSP_EXTRA_CONNECT ? ' ' + CSP_EXTRA_CONNECT : ''),
            "worker-src 'self' blob:",
            "font-src 'self' https://fonts.gstatic.com",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'"
        ].join('; ')
    };

    if (extension === '.html' || urlPath === '/' || urlPath === '/index.html' ||
        urlPath === '/sw.js') {
        headers['Cache-Control'] = 'no-cache';
    } else {
        headers['Cache-Control'] = 'public, max-age=3600';
    }

    if (req.method === 'HEAD') {
        res.writeHead(200, headers);
        res.end();
        return;
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
}

/* --------------------------------------------------------------------------
 * Request routing
 * ----------------------------------------------------------------------- */

async function handleRequest(req, res) {
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
        res.writeHead(204, Object.assign({
            'Content-Length': 0,
            'Cache-Control': 'no-store'
        }, corsHeaders(req), {
            'Access-Control-Max-Age': '86400'
        }));
        res.end();
        return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
        sendError(req, res, 405, 'Method not allowed.');
        return;
    }

    let url;
    try {
        url = new URL(req.url, 'http://localhost');
    } catch (error) {
        sendError(req, res, 400, 'Invalid request URL.');
        return;
    }

    // The standalone checker lives under /ssl-generator/ and calls a relative
    // api/check URL, so accept both /api/* and /ssl-generator/api/*.
    const apiPath = url.pathname.startsWith('/ssl-generator/api/')
        ? url.pathname.slice('/ssl-generator'.length)
        : url.pathname;

    if (apiPath === '/api/health') {
        sendJson(req, res, 200, { status: 'ok', tls: true });
        return;
    }

    if (apiPath === '/api/check') {
        const limit = rateLimit(clientIp(req));
        const rateHeaders = {
            'X-RateLimit-Limit': String(RATE_LIMIT),
            'X-RateLimit-Remaining': String(limit.remaining),
            'X-RateLimit-Reset': String(Math.ceil(limit.reset / 1000))
        };

        if (!limit.allowed) {
            sendJson(req, res, 429, {
                error: 'Rate limit reached. Try again in a minute.'
            }, Object.assign(rateHeaders, { 'Retry-After': '60' }));
            return;
        }

        try {
            const result = await checkTarget(url.searchParams.get('host'), url.searchParams.get('port'));
            sendJson(req, res, 200, result, rateHeaders);
        } catch (error) {
            const statusCode = error.statusCode || 500;
            if (statusCode >= 500) {
                console.error('TLS check failed:', error.message);
            }
            sendJson(req, res, statusCode, {
                error: error.message || 'The SSL check failed.'
            }, rateHeaders);
        }
        return;
    }

    if (apiPath.startsWith('/api/')) {
        sendError(req, res, 404, 'Unknown API endpoint.');
        return;
    }

    await serveStatic(req, res, url.pathname);
}

const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
        console.error('Request failed:', error);
        if (!res.headersSent) {
            sendError(req, res, 500, 'Internal server error.');
        } else {
            res.destroy();
        }
    });
});

server.on('clientError', (error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

if (require.main === module) {
    server.listen(PORT, HOST, () => {
        console.log('SSL Checker server listening on http://' + HOST + ':' + PORT);
        if (ALLOW_PRIVATE_HOSTS) {
            console.warn('ALLOW_PRIVATE_HOSTS=1 — private and loopback targets are allowed.');
        }
    });

    function shutdown(signal) {
        console.log(signal + ' received, shutting down...');
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000).unref();
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
    isPrivateAddress,
    normalizeHost,
    parsePort,
    checkTarget,
    server
};
