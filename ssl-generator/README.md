# SSL Certificate Generator

A production-grade SSL certificate generator and X.509 toolkit that runs fully client-side in the browser, with an optional Node.js endpoint for live TLS checks. Certificate generation and local inspection need no backend and no server-side storage.

The SSL Checker is also embedded in the main **Secure Tools** app at the repository root (**SSL → SSL Checker**, deep link `#/ssl`). This folder remains the standalone generator/checker and provides the shared Node.js TLS backend.

## Overview

This application provides a secure X.509 toolkit for generating:
- Root Certificate Authorities (CA)
- CA-signed certificates
- Certificate Signing Requests (CSR)
- Subject Alternative Names (SAN) support
- DevOps-ready export formats
- Local and live SSL certificate inspection

## Architecture

### Client-Only Cryptography

All cryptographic operations are performed entirely in the browser using:
- **WebCrypto API** - For secure key generation and signing
- **pkijs + asn1js** - For X.509 certificate structure handling
- **JSZip** - For bundling artifacts

### Security Model

- **Client-side by default** - Generation and local inspection happen in the browser
- **Optional backend** - Only the live TLS check uses `server.js`; it receives a domain and port, nothing else
- **No data persistence** - Private keys and inspected certificates are held only in memory
- **Secure wipe** - Keys are cleared on page unload
- **No secret logging** - Private keys and uploaded certificate contents are never logged

## Features

### CA Generator
- Generate self-signed Root CA certificates
- Support for RSA (2048, 4096) and ECDSA (P-256, P-384)
- Configurable validity period
- Proper CA extensions (BasicConstraints, KeyUsage)

### Certificate Generator
- Generate certificates signed by your CA
- Dynamic SAN (Subject Alternative Names) support
- DNS and IP address entries
- Optional CSR generation
- Configurable validity period

### DevOps Export Panel
- **Kubernetes Secrets** - Ready-to-use YAML for TLS and CA secrets
- **OpenSSL Commands** - Equivalent commands for reference
- **PEM Viewer** - View and copy generated certificates and keys
- **ZIP Bundle** - Download all artifacts at once
- **Email Delivery** - Optional client-side email via EmailJS

### SSL Checker
- **Local inspection** - Upload PEM/DER files or paste a PEM chain. Parsing and chain checks run entirely in the browser.
- **Live domain check** - Enter a domain or IP and port. The checker tries the self-hosted TLS API first, then falls back to the free Cert Spotter Certificate Transparency API.
- **Certificate details** - Subject, issuer, SANs, serial, signature algorithm, key size/curve, key usage, EKU, basic constraints, validity, and SHA-256 fingerprint.
- **Chain view** - Leaf, intermediates, and root with per-link signature verification, CA checks, and expiry warnings.
- **Visible source** - Every online result states which API produced it and whether it was a live TLS handshake or CT data.

## Usage

### Local Development

For local certificate inspection, either serve the folder or open `certs_generations.html` directly in a browser.

For live domain checks, run the bundled Node.js server (no dependencies to install):

```bash
node ssl-generator/server.js
```

Then open:

- `http://localhost:8080` — the integrated **Secure Tools** app; choose **SSL → SSL Checker** in the sidebar.
- `http://localhost:8080/ssl-generator/` — the standalone generator/checker.

The server detects the main app next to this folder and serves both. When only the `ssl-generator` folder is deployed (for example the Docker image), `/` serves the standalone app instead. The SSL Checker calls `/api/check` on the same origin.

To use a separate API host, set `window.SSL_CHECKER_API_BASE` before `ssl-checker.js` loads, or use the default same-origin `api/check`.

### Docker

```bash
# Build the image
docker build -t ssl-generator .

# Run the container (static app + self-hosted TLS API)
docker run -p 8080:8080 ssl-generator

# Access at http://localhost:8080
```

### GitHub Pages

1. Push the code to your repository
2. Enable GitHub Pages in repository settings
3. Select the `main` branch as source
4. Access at `https://username.github.io/repo/`

GitHub Pages only hosts static files, so live checks automatically use the free Cert Spotter CT API. Deploy `server.js` separately if you want real TLS handshakes on the hosted site, then set `window.SSL_CHECKER_API_BASE` to that API URL.

## DevOps Usage Examples

### Kubernetes TLS Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: example-tls
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-cert>
  tls.key: <base64-encoded-key>
```

### Nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate /path/to/example.com.crt;
    ssl_certificate_key /path/to/example.com.key;
}
```

### Apache Configuration

```apache
<VirtualHost *:443>
    ServerName example.com
    SSLEngine on
    SSLCertificateFile /path/to/example.com.crt
    SSLCertificateKeyFile /path/to/example.com.key
</VirtualHost>
```

## SSL Checker Backend

`server.js` serves the static app and provides the live TLS check endpoint:

```http
GET /api/check?host=example.com&port=443
```

The response contains the served chain plus handshake details:

```json
{
  "host": "example.com",
  "port": 443,
  "address": "93.184.216.34",
  "checkedAt": "2026-01-01T00:00:00.000Z",
  "tls": {
    "protocol": "TLSv1.3",
    "cipher": "TLS_AES_256_GCM_SHA384",
    "alpn": "h2",
    "authorized": true,
    "authorizationError": null
  },
  "authorized": true,
  "certificatePem": "-----BEGIN CERTIFICATE-----\n...",
  "chainPem": ["-----BEGIN CERTIFICATE-----\n..."]
}
```

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP listen address |
| `ALLOWED_ORIGINS` | unset (`*`) | Comma-separated CORS origins, useful when the static app is hosted separately |
| `ALLOW_PRIVATE_HOSTS` | unset | Set to `1` to allow private/loopback/reserved targets. Only for intentional internal use |
| `TRUST_PROXY` | unset | Set to `1` to read the client IP from `X-Forwarded-For` behind a reverse proxy |
| `RATE_LIMIT_PER_MIN` | `30` | Per-IP live check limit |
| `TLS_TIMEOUT_MS` | `12000` | TLS handshake timeout |
| `CSP_EXTRA_CONNECT` | unset | Extra space-separated `connect-src` origins when `SSL_CHECKER_API_BASE` points at a different host |

### Security

- Private, loopback, link-local, CGNAT, multicast, documentation, and reserved IPv4/IPv6 ranges are blocked by default.
- DNS is resolved once, the resolved address is validated, and the TLS socket connects to that address while the domain is still used for SNI. This closes the usual DNS-rebinding gap.
- Requests are rate limited per IP. The API is read-only and does not store targets or certificates.
- Static file serving is limited to `certs_generations.html` and `/assets/`; source files, dotfiles, and `server.js` are never exposed.
- The TLS check uses `rejectUnauthorized: false` so expired or self-signed certificates can still be inspected. The response reports `authorized` and `authorizationError` instead of failing the request.

### Online check sources

1. **Self-hosted TLS API** — real TLS handshake, full served chain, protocol/cipher, and trust result. Shown as “live TLS handshake”.
2. **Cert Spotter CT API** (free fallback) — looks up recently issued certificates in Certificate Transparency logs over CORS. Shown as “Certificate Transparency — not a live handshake”.

The fallback only supports port `443` and domain names (not IP addresses). If the self-hosted API is unavailable and the CT lookup cannot find an unexpired certificate, the checker reports the error instead of pretending the check succeeded.

## EmailJS Setup (Optional)

To enable email delivery:

1. Sign up at [emailjs.com](https://www.emailjs.com/)
2. Create a service using your Zoho SMTP:
   - SMTP Host: smtp.zoho.com
   - Port: 465
   - Username: admin@sagarmalla.info.np
   - Password: Your Zoho app password
3. Create an email template
4. Add EmailJS SDK to `certs_generations.html`:
   ```html
   <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>
   <script type="text/javascript">
       emailjs.init("YOUR_PUBLIC_KEY");
   </script>
   ```

## Limitations

- **Not publicly trusted** - Generated certificates are for development/testing only
- **No revocation** - No CRL or OCSP support
- **Browser compatibility** - Validity > 825 days may have issues
- **Self-signed** - Requires manual trust installation
- **Local checker trust** - Local inspection verifies signatures inside the uploaded chain but cannot prove public browser trust without the full chain and a live server
- **CT fallback** - Certificate Transparency data is not a live handshake and may not match the certificate currently served
- **No expiry alerts** - The checker reports expiry and key-strength warnings but does not monitor certificates over time

## Security Considerations

- Keep private keys (.key files) secure
- Never share private keys
- Use strong key sizes (RSA 2048 minimum)
- Consider using ECDSA for better performance
- These certificates are NOT for production use
- The live checker API intentionally blocks private/internal addresses. Do not disable that protection unless you understand the SSRF risk
- Certificates uploaded for inspection never leave the browser; only a domain and port are sent to the online APIs

## File Structure

```
ssl-generator/
├── certs_generations.html    # Main HTML file
├── server.js                 # Static server + /api/check TLS endpoint
├── assets/
│   ├── css/
│   │   └── styles.css        # Styles
│   ├── js/
│   │   ├── app.js            # App bootstrap
│   │   ├── crypto.js         # Cryptographic operations
│   │   ├── cert.js           # Certificate generation
│   │   ├── ssl-checker.js    # Local inspection + live/CT checks
│   │   ├── ui.js             # UI interactions
│   │   └── zip.js            # File bundling
│   ├── img/
│   │   └── favicon.ico       # Favicon
│   └── vendor/
│       ├── pkijs.browser.js  # X.509 library (browser bundle)
│       └── jszip.min.js      # ZIP library
├── Dockerfile                # Docker configuration
├── .dockerignore            # Docker ignore file
└── README.md                # This file
```

## Dependencies

- [pkijs](https://pkijs.org/) - X.509 certificate parsing and signature verification
- [asn1js](https://github.com/PeculiarVentures/asn1js) - ASN.1 parsing (bundled into `pkijs.browser.js`)
- [JSZip](https://stuk.github.io/jszip/) - ZIP file creation
- [EmailJS](https://www.emailjs.com/) - Optional email delivery
- [Cert Spotter](https://sslmate.com/ct_search_api/) - Free Certificate Transparency fallback for live checks
- Node.js 20+ - Only for the optional self-hosted TLS API; no npm packages required

## License

MIT License - Use at your own risk for development and testing purposes only.

## Support

For issues and questions, please open an issue on GitHub.
