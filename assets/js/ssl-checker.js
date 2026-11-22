/**
 * SSL Checker Module
 *
 * Two modes:
 *  - Local: parse PEM/DER certificates in the browser with PKI.js
 *  - Online: try the self-hosted TLS API first, then the free Cert Spotter
 *    Certificate Transparency API as a fallback
 *
 * The API used for online checks is always shown in the UI.
 */

(function () {
    'use strict';

    const CT_API_URL = 'https://api.certspotter.com/v1/issuances';
    const OWN_API_DEFAULT = 'api/check';
    const FETCH_TIMEOUT_MS = 15000;
    const CT_TIMEOUT_MS = 20000;

    const DN_NAMES = {
        '2.5.4.3': 'CN',
        '2.5.4.4': 'SN',
        '2.5.4.5': 'serialNumber',
        '2.5.4.6': 'C',
        '2.5.4.7': 'L',
        '2.5.4.8': 'ST',
        '2.5.4.9': 'street',
        '2.5.4.10': 'O',
        '2.5.4.11': 'OU',
        '2.5.4.12': 'title',
        '2.5.4.17': 'postalCode',
        '2.5.4.42': 'GN',
        '1.2.840.113549.1.9.1': 'emailAddress'
    };

    const SIG_ALG_NAMES = {
        '1.2.840.113549.1.1.4': 'MD5 with RSA',
        '1.2.840.113549.1.1.5': 'SHA-1 with RSA',
        '1.2.840.113549.1.1.11': 'SHA-256 with RSA',
        '1.2.840.113549.1.1.12': 'SHA-384 with RSA',
        '1.2.840.113549.1.1.13': 'SHA-512 with RSA',
        '1.2.840.113549.1.1.10': 'RSASSA-PSS',
        '1.2.840.10045.4.1': 'ECDSA with SHA-1',
        '1.2.840.10045.4.3.2': 'ECDSA with SHA-256',
        '1.2.840.10045.4.3.3': 'ECDSA with SHA-384',
        '1.2.840.10045.4.3.4': 'ECDSA with SHA-512',
        '1.3.101.112': 'Ed25519',
        '1.3.101.113': 'Ed448',
        '1.2.840.10040.4.3': 'DSA with SHA-1',
        '2.16.840.1.101.3.4.3.2': 'DSA with SHA-256'
    };

    const KEY_ALG_NAMES = {
        '1.2.840.113549.1.1.1': 'RSA',
        '1.2.840.113549.1.1.10': 'RSA-PSS',
        '1.2.840.10045.2.1': 'ECDSA',
        '1.2.840.10040.4.1': 'DSA',
        '1.3.101.112': 'Ed25519',
        '1.3.101.113': 'Ed448'
    };

    const EKU_NAMES = {
        '1.3.6.1.5.5.7.3.1': 'serverAuth',
        '1.3.6.1.5.5.7.3.2': 'clientAuth',
        '1.3.6.1.5.5.7.3.3': 'codeSigning',
        '1.3.6.1.5.5.7.3.4': 'emailProtection',
        '1.3.6.1.5.5.7.3.8': 'timeStamping',
        '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
        '2.5.29.37.0': 'anyExtendedKeyUsage'
    };

    const KU_NAMES = [
        'digitalSignature',
        'contentCommitment',
        'keyEncipherment',
        'dataEncipherment',
        'keyAgreement',
        'keyCertSign',
        'cRLSign',
        'encipherOnly',
        'decipherOnly'
    ];

    let initialized = false;
    let currentResult = null;
    let pkiCrypto = null;
    let defaultApiNote = '';
    let liveBusy = false;
    let inspectBusy = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function init() {
        if (initialized) return;
        const section = byId('ssl-checker-section');
        if (!section) return;
        initialized = true;

        setupEngine();
        bindEvents();

        const note = byId('ssl-api-note');
        if (note) defaultApiNote = note.textContent.replace(/\s+/g, ' ').trim();

        if (!window.pkijs || typeof window.pkijs.Certificate !== 'function') {
            showError('The certificate parsing library could not be loaded. Reload the page and try again.');
        }
    }

    function setupEngine() {
        if (!window.pkijs || typeof window.pkijs.CryptoEngine !== 'function') return;
        try {
            const engine = new window.pkijs.CryptoEngine({
                name: 'webcrypto',
                crypto: window.crypto
            });
            window.pkijs.setEngine('webcrypto', engine);
        } catch (error) {
            console.warn('Could not initialise PKI.js crypto engine:', error);
        }
    }

    function getPkiCrypto() {
        if (pkiCrypto) return pkiCrypto;
        if (!window.pkijs || typeof window.pkijs.getCrypto !== 'function') return null;
        try {
            pkiCrypto = window.pkijs.getCrypto(true);
        } catch (error) {
            pkiCrypto = null;
        }
        return pkiCrypto;
    }

    function bindEvents() {
        const liveForm = byId('ssl-live-form');
        const inspectForm = byId('ssl-inspect-form');
        const copyPemBtn = byId('ssl-copy-pem');
        const copyChainBtn = byId('ssl-copy-chain');
        const downloadPemBtn = byId('ssl-download-pem');
        const clearBtn = byId('ssl-clear');

        if (liveForm) liveForm.addEventListener('submit', handleLiveSubmit);
        if (inspectForm) inspectForm.addEventListener('submit', handleInspectSubmit);
        if (copyPemBtn) copyPemBtn.addEventListener('click', () => copyResult(copyPemBtn, 'leaf'));
        if (copyChainBtn) copyChainBtn.addEventListener('click', () => copyResult(copyChainBtn, 'chain'));
        if (downloadPemBtn) downloadPemBtn.addEventListener('click', downloadResult);
        if (clearBtn) clearBtn.addEventListener('click', clearResults);
    }

    /* ---------------------------------------------------------------------
     * Live check
     * ------------------------------------------------------------------ */

    async function handleLiveSubmit(event) {
        event.preventDefault();
        if (liveBusy) return;

        hideError();
        hideResults();

        const hostInput = byId('ssl-live-host');
        const portInput = byId('ssl-live-port');
        const button = byId('ssl-live-btn');
        const target = parseTarget(hostInput ? hostInput.value : '', portInput ? portInput.value : '443');

        if (!target) {
            showError('Enter a valid domain name or IP address and a port between 1 and 65535.');
            return;
        }

        const apiBase = getApiBase();
        const useOwnApi = !!(apiBase && apiBase !== 'off');

        liveBusy = true;
        setBusy(button, true, 'Checking…');
        setApiNote(
            useOwnApi ? 'Contacting the self-hosted TLS API…' : 'Using the free Cert Spotter CT API…',
            'is-info'
        );

        try {
            let data = null;
            let source = null;

            if (useOwnApi) {
                try {
                    data = await checkViaOwnApi(apiBase, target);
                    source = 'own';
                } catch (error) {
                    if (error && error.fatal) throw error;
                }
            }

            if (!data) {
                setApiNote(
                    useOwnApi
                        ? 'Self-hosted API unavailable — using the free Cert Spotter CT API…'
                        : 'Using the free Cert Spotter CT API…',
                    'is-warning'
                );
                data = await checkViaCertSpotter(target);
                source = 'ct';
            }

            if (source === 'own') {
                setApiNote('Online check completed with the self-hosted TLS API (live TLS handshake).', 'is-success');
            } else {
                setApiNote('Online check completed with the free Cert Spotter CT API (Certificate Transparency — not a live handshake).', 'is-warning');
            }

            await renderOnlineResult(data, source, target);
        } catch (error) {
            console.warn('SSL live check failed:', error && error.message ? error.message : error);
            setApiNote(defaultApiNote, 'is-info');
            showError(error && error.message ? error.message : 'The SSL check failed.');
        } finally {
            liveBusy = false;
            setBusy(button, false, 'Check Live SSL');
        }
    }

    function getApiBase() {
        if (typeof window.SSL_CHECKER_API_BASE === 'string') {
            return window.SSL_CHECKER_API_BASE.trim();
        }
        return OWN_API_DEFAULT;
    }

    function buildOwnApiUrl(apiBase, target) {
        const url = new URL(apiBase, window.location.href);
        url.searchParams.set('host', target.host);
        url.searchParams.set('port', String(target.port));
        return url.toString();
    }

    async function checkViaOwnApi(apiBase, target) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let response;

        try {
            response = await fetch(buildOwnApiUrl(apiBase, target), {
                method: 'GET',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: controller.signal
            });
        } catch (error) {
            const wrapped = new Error('The self-hosted TLS API is not reachable.');
            wrapped.cause = error;
            throw wrapped;
        } finally {
            clearTimeout(timer);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
            let message = 'The self-hosted TLS API returned HTTP ' + response.status + '.';
            if (contentType.indexOf('application/json') !== -1) {
                try {
                    const body = await response.json();
                    if (body && body.error) message = body.error;
                } catch (error) {
                    /* ignore invalid error body */
                }
            }
            const wrapped = new Error(message);
            wrapped.status = response.status;
            // 400/403/422 mean the API rejected the target (for example a private IP).
            // Do not silently fall back for those; surface the reason instead.
            wrapped.fatal = response.status === 400 || response.status === 403 || response.status === 422;
            throw wrapped;
        }

        if (contentType.indexOf('application/json') === -1) {
            throw new Error('The self-hosted TLS API returned an unexpected response.');
        }

        let data;
        try {
            data = await response.json();
        } catch (error) {
            throw new Error('The self-hosted TLS API returned invalid JSON.');
        }

        if (!data || typeof data !== 'object') {
            throw new Error('The self-hosted TLS API returned an unexpected response.');
        }

        const chainPem = Array.isArray(data.chainPem) && data.chainPem.length
            ? data.chainPem
            : (data && data.certificatePem ? [data.certificatePem] : []);

        if (!chainPem.length) {
            throw new Error('The self-hosted TLS API response did not include a certificate.');
        }

        return Object.assign({}, data, {
            certificatePem: data.certificatePem || chainPem[0],
            chainPem: chainPem
        });
    }

    async function checkViaCertSpotter(target) {
        if (target.port !== 443) {
            throw new Error('The free Certificate Transparency fallback only checks port 443. Use the self-hosted TLS API for a custom port.');
        }
        if (isIp(target.host)) {
            throw new Error('The free Certificate Transparency fallback only supports domain names. Use the self-hosted TLS API for IP addresses.');
        }

        const url = new URL(CT_API_URL);
        url.searchParams.set('domain', target.host);
        url.searchParams.set('include_subdomains', 'false');
        url.searchParams.set('match_wildcards', 'true');
        url.searchParams.append('expand', 'dns_names');
        url.searchParams.append('expand', 'cert_der');
        url.searchParams.append('expand', 'issuer');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CT_TIMEOUT_MS);
        let response;

        try {
            response = await fetch(url.toString(), {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: controller.signal
            });
        } catch (error) {
            throw new Error('The Cert Spotter CT API could not be reached. Try again or use the self-hosted TLS API.');
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('The free Cert Spotter CT API rate limit was reached. Try again later or use the self-hosted TLS API.');
            }
            throw new Error('The Cert Spotter CT API returned HTTP ' + response.status + '.');
        }

        let list;
        try {
            list = await response.json();
        } catch (error) {
            throw new Error('The Cert Spotter CT API returned invalid JSON.');
        }

        if (!Array.isArray(list)) {
            throw new Error('The Cert Spotter CT API returned an unexpected response.');
        }

        const now = Date.now();
        const candidates = list
            .filter((item) => {
                if (!item || !item.cert_der || item.revoked) return false;
                const notBefore = new Date(item.not_before).getTime();
                const notAfter = new Date(item.not_after).getTime();
                return Number.isFinite(notBefore) && Number.isFinite(notAfter) &&
                    notBefore <= now && notAfter > now;
            })
            .sort((a, b) => new Date(b.not_before).getTime() - new Date(a.not_before).getTime());

        if (!candidates.length) {
            throw new Error('No unexpired certificate was found in Certificate Transparency logs for ' + target.host + '.');
        }

        const chosen = candidates[0];
        let parsed;
        try {
            parsed = await parseCertificate(base64ToBytes(chosen.cert_der));
        } catch (error) {
            throw new Error('The certificate returned by the Cert Spotter CT API could not be parsed.');
        }

        return {
            source: 'ct',
            host: target.host,
            port: target.port,
            checkedAt: new Date().toISOString(),
            tls: null,
            certificatePem: parsed.pem,
            chainPem: [parsed.pem],
            authorized: null,
            ct: {
                id: chosen.id,
                issuer: chosen.issuer && chosen.issuer.friendly_name ? chosen.issuer.friendly_name : '',
                dnsNames: chosen.dns_names || [],
                notBefore: chosen.not_before,
                notAfter: chosen.not_after
            }
        };
    }

    async function renderOnlineResult(data, source, target) {
        const chainPems = (Array.isArray(data.chainPem) && data.chainPem.length)
            ? data.chainPem
            : [data.certificatePem];
        const entries = [];

        for (const pem of chainPems) {
            try {
                const parsed = await parseCertificatePem(pem);
                entries.push(parsed);
            } catch (error) {
                console.warn('Skipping unparseable certificate in the online chain:', error);
            }
        }

        if (!entries.length) {
            throw new Error('The online check returned a certificate that could not be parsed.');
        }

        const ordered = orderChain(entries);
        const leaf = ordered[0];
        const hostnameCheck = checkHostname(target.host, leaf);
        const authorized = data.authorized !== undefined ? data.authorized : (data.tls ? data.tls.authorized : null);
        const chainCheck = await evaluateChain(ordered, { trusted: authorized === true });
        const warnings = buildWarnings({
            entries: ordered,
            chainCheck: chainCheck,
            hostnameCheck: hostnameCheck,
            source: source,
            tls: data.tls,
            authorized: authorized
        });

        renderResult({
            entries: ordered,
            leaf: leaf,
            chainCheck: chainCheck,
            hostnameCheck: hostnameCheck,
            warnings: warnings,
            source: source,
            tls: data.tls,
            authorized: authorized,
            title: target.host,
            subtitle: 'Live check on ' + target.host + ':' + target.port
        });
    }

    /* ---------------------------------------------------------------------
     * Local inspection
     * ------------------------------------------------------------------ */

    async function handleInspectSubmit(event) {
        event.preventDefault();
        if (inspectBusy) return;

        hideError();
        hideResults();

        const fileInput = byId('ssl-cert-file');
        const pemInput = byId('ssl-cert-pem');
        const hostnameInput = byId('ssl-hostname-check');
        const button = byId('ssl-inspect-btn');
        const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
        const pasted = pemInput ? pemInput.value.trim() : '';

        if (!files.length && !pasted) {
            showError('Upload a certificate file or paste PEM content first.');
            return;
        }

        inspectBusy = true;
        setBusy(button, true, 'Inspecting…');

        try {
            const entries = [];

            for (const file of files) {
                const parsed = await parseCertificateFile(file);
                entries.push.apply(entries, parsed);
            }

            if (pasted) {
                const parsed = await parsePemText(pasted);
                entries.push.apply(entries, parsed);
            }

            if (!entries.length) {
                throw new Error('No X.509 certificate could be found in the supplied content.');
            }

            const ordered = orderChain(entries);
            const leaf = ordered[0];
            const hostnameRaw = hostnameInput ? hostnameInput.value.trim() : '';
            const hostnameCheck = hostnameRaw ? checkHostname(hostnameRaw, leaf) : null;
            if (hostnameRaw && !hostnameCheck) {
                throw new Error('The hostname to verify is not valid.');
            }

            const chainCheck = await evaluateChain(ordered);
            const warnings = buildWarnings({
                entries: ordered,
                chainCheck: chainCheck,
                hostnameCheck: hostnameCheck,
                source: 'local',
                tls: null
            });

            renderResult({
                entries: ordered,
                leaf: leaf,
                chainCheck: chainCheck,
                hostnameCheck: hostnameCheck,
                warnings: warnings,
                source: 'local',
                tls: null,
                authorized: null,
                title: leaf.info.cn || 'Certificate',
                subtitle: 'Local certificate inspection'
            });
        } catch (error) {
            console.warn('Certificate inspection failed:', error && error.message ? error.message : error);
            showError(error && error.message ? error.message : 'The certificate could not be inspected.');
        } finally {
            inspectBusy = false;
            setBusy(button, false, 'Inspect Certificate');
        }
    }

    async function parseCertificateFile(file) {
        let buffer;
        try {
            buffer = await file.arrayBuffer();
        } catch (error) {
            throw new Error('Could not read ' + (file.name || 'the selected file') + '.');
        }

        const bytes = new Uint8Array(buffer);
        let text = '';
        try {
            text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        } catch (error) {
            text = '';
        }

        if (/-----BEGIN (?:TRUSTED )?CERTIFICATE-----/.test(text)) {
            try {
                return await parsePemText(text);
            } catch (error) {
                throw new Error('Could not parse ' + (file.name || 'the selected file') + ': ' + error.message);
            }
        }

        if (bytes.length > 1 && bytes[0] === 0x30) {
            try {
                return [await parseCertificate(bytes)];
            } catch (error) {
                throw new Error('Could not parse ' + (file.name || 'the selected file') + ' as a DER certificate.');
            }
        }

        try {
            return await parsePemText(text);
        } catch (error) {
            throw new Error('Could not parse ' + (file.name || 'the selected file') + '. Use a PEM or DER X.509 certificate.');
        }
    }

    async function parsePemText(text) {
        const blocks = [];
        const pattern = /-----BEGIN (?:TRUSTED )?CERTIFICATE-----([\s\S]*?)-----END (?:TRUSTED )?CERTIFICATE-----/g;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            blocks.push(match[1]);
        }

        if (!blocks.length) {
            const cleaned = String(text || '').replace(/\s+/g, '');
            if (cleaned.length > 32 && /^[A-Za-z0-9+/=]+$/.test(cleaned)) {
                blocks.push(cleaned);
            }
        }

        if (!blocks.length) {
            throw new Error('No PEM certificate block was found.');
        }

        const entries = [];
        for (const block of blocks) {
            try {
                entries.push(await parseCertificate(base64ToBytes(block)));
            } catch (error) {
                throw new Error('One of the certificate blocks could not be parsed.');
            }
        }
        return entries;
    }

    /* ---------------------------------------------------------------------
     * Certificate parsing and information
     * ------------------------------------------------------------------ */

    async function parseCertificatePem(pem) {
        const match = /-----BEGIN (?:TRUSTED )?CERTIFICATE-----([\s\S]*?)-----END (?:TRUSTED )?CERTIFICATE-----/.exec(String(pem || ''));
        if (!match) throw new Error('Invalid PEM certificate.');
        return parseCertificate(base64ToBytes(match[1]));
    }

    async function parseCertificate(der) {
        if (!window.pkijs || typeof window.pkijs.Certificate !== 'function') {
            throw new Error('The certificate parsing library is not available.');
        }

        const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const cert = window.pkijs.Certificate.fromBER(buffer);
        const info = await readCertificateInfo(cert, bytes);

        return {
            cert: cert,
            der: bytes,
            pem: derToPem(bytes),
            info: info
        };
    }

    async function readCertificateInfo(cert, der) {
        const subjectCN = getAttribute(cert.subject, '2.5.4.3');
        const issuerCN = getAttribute(cert.issuer, '2.5.4.3');
        const sans = getSubjectAltNames(cert);
        const keyUsage = getKeyUsage(cert);
        const extendedKeyUsage = getExtendedKeyUsage(cert);
        const basicConstraints = getBasicConstraints(cert);
        const publicKey = getPublicKeyInfo(cert);
        const notBefore = toDate(cert.notBefore && cert.notBefore.value);
        const notAfter = toDate(cert.notAfter && cert.notAfter.value);
        const now = Date.now();
        const daysRemaining = Math.ceil((notAfter.getTime() - now) / 86400000);

        let validity = 'valid';
        if (notBefore.getTime() > now) validity = 'not-yet-valid';
        else if (notAfter.getTime() < now) validity = 'expired';
        else if (daysRemaining <= 30) validity = 'expiring';

        const sigAlgOid = cert.signatureAlgorithm && cert.signatureAlgorithm.algorithmId
            ? cert.signatureAlgorithm.algorithmId
            : '';

        return {
            subjectDN: dnToString(cert.subject),
            issuerDN: dnToString(cert.issuer),
            cn: subjectCN,
            issuerCN: issuerCN,
            organization: getAttribute(cert.subject, '2.5.4.10'),
            organizationalUnit: getAttribute(cert.subject, '2.5.4.11'),
            locality: getAttribute(cert.subject, '2.5.4.7'),
            state: getAttribute(cert.subject, '2.5.4.8'),
            country: getAttribute(cert.subject, '2.5.4.6'),
            email: getAttribute(cert.subject, '1.2.840.113549.1.9.1'),
            issuerOrganization: getAttribute(cert.issuer, '2.5.4.10'),
            sans: sans,
            keyUsage: keyUsage,
            extendedKeyUsage: extendedKeyUsage,
            basicConstraints: basicConstraints,
            publicKey: publicKey,
            notBefore: notBefore,
            notAfter: notAfter,
            daysRemaining: daysRemaining,
            validity: validity,
            serialHex: getSerialHex(cert),
            signatureAlgorithm: SIG_ALG_NAMES[sigAlgOid] || sigAlgOid || 'Unknown',
            signatureAlgorithmOid: sigAlgOid,
            fingerprint256: await getFingerprint(der),
            subjectKeyId: getSubjectKeyId(cert),
            authorityKeyId: getAuthorityKeyId(cert),
            isSelfSigned: cnAndDnEqual(cert)
        };
    }

    function cnAndDnEqual(cert) {
        try {
            return cert.issuer.isEqual(cert.subject);
        } catch (error) {
            return dnToString(cert.issuer) === dnToString(cert.subject);
        }
    }

    function toDate(value) {
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) return date;
        }
        return new Date(0);
    }

    function getAttribute(dn, oid) {
        if (!dn || !Array.isArray(dn.typesAndValues)) return '';
        const attr = dn.typesAndValues.find((item) => item.type === oid);
        return attr ? attributeValue(attr) : '';
    }

    function attributeValue(attr) {
        const value = attr && attr.value;
        const block = value && value.valueBlock;
        if (!block) return '';

        if (typeof block.value === 'string') return block.value;
        if (block.value instanceof Uint8Array) {
            try {
                return new TextDecoder('utf-8', { fatal: false }).decode(block.value);
            } catch (error) {
                return '';
            }
        }
        if (block.valueHexView) {
            try {
                return new TextDecoder('utf-8', { fatal: false }).decode(block.valueHexView);
            } catch (error) {
                return '';
            }
        }
        if (typeof block.toString === 'function') {
            const text = block.toString();
            if (text && text.indexOf('[object') === -1) return text;
        }
        return '';
    }

    function dnToString(dn) {
        if (!dn || !Array.isArray(dn.typesAndValues)) return '';
        return dn.typesAndValues
            .map((attr) => {
                const name = DN_NAMES[attr.type] || attr.type;
                return name + '=' + attributeValue(attr);
            })
            .join(', ');
    }

    function getSerialHex(cert) {
        try {
            const view = cert.serialNumber && cert.serialNumber.valueBlock && cert.serialNumber.valueBlock.valueHexView;
            if (view) return toHex(view, '');
        } catch (error) {
            /* fall through */
        }
        return cert.serialNumber ? String(cert.serialNumber.valueBlock.value) : '';
    }

    function getExtension(cert, oid) {
        if (!cert || !Array.isArray(cert.extensions)) return null;
        return cert.extensions.find((extension) => extension.extnID === oid) || null;
    }

    function getSubjectAltNames(cert) {
        const extension = getExtension(cert, '2.5.29.17');
        const altNames = extension && extension.parsedValue && Array.isArray(extension.parsedValue.altNames)
            ? extension.parsedValue.altNames
            : [];
        const result = [];

        altNames.forEach((name) => {
            if (!name) return;
            if (name.type === 2 && typeof name.value === 'string') {
                result.push({ type: 'DNS', value: name.value });
            } else if (name.type === 7) {
                const bytes = name.value && name.value.valueBlock && name.value.valueBlock.valueHexView;
                const ip = ipFromBytes(bytes);
                if (ip) result.push({ type: 'IP', value: ip });
            } else if (name.type === 1 && typeof name.value === 'string') {
                result.push({ type: 'Email', value: name.value });
            } else if (name.type === 6 && typeof name.value === 'string') {
                result.push({ type: 'URI', value: name.value });
            }
        });

        return result;
    }

    function getKeyUsage(cert) {
        const extension = getExtension(cert, '2.5.29.15');
        const view = extension && extension.parsedValue && extension.parsedValue.valueBlock
            ? extension.parsedValue.valueBlock.valueHexView
            : null;
        if (!view) return [];

        const usages = [];
        for (let i = 0; i < KU_NAMES.length; i++) {
            const byte = view[Math.floor(i / 8)] || 0;
            if (byte & (0x80 >> (i % 8))) usages.push(KU_NAMES[i]);
        }
        return usages;
    }

    function getExtendedKeyUsage(cert) {
        const extension = getExtension(cert, '2.5.29.37');
        const purposes = extension && extension.parsedValue && Array.isArray(extension.parsedValue.keyPurposes)
            ? extension.parsedValue.keyPurposes
            : [];
        return purposes.map((oid) => EKU_NAMES[oid] || oid);
    }

    function getBasicConstraints(cert) {
        const extension = getExtension(cert, '2.5.29.19');
        const parsed = extension && extension.parsedValue;
        if (!parsed) return { ca: false, pathLen: null };

        let pathLen = null;
        try {
            if (parsed.pathLenConstraint && parsed.pathLenConstraint.valueBlock) {
                pathLen = parsed.pathLenConstraint.valueBlock.value;
            }
        } catch (error) {
            pathLen = null;
        }

        return {
            ca: parsed.cA === true,
            pathLen: typeof pathLen === 'number' ? pathLen : null
        };
    }

    function getPublicKeyInfo(cert) {
        const spki = cert.subjectPublicKeyInfo || {};
        const algorithmOid = spki.algorithm && spki.algorithm.algorithmId ? spki.algorithm.algorithmId : '';
        const parsedKey = spki.parsedKey || null;
        const algorithm = KEY_ALG_NAMES[algorithmOid] || algorithmOid || 'Unknown';
        let bits = 0;
        let curve = '';

        if (parsedKey && parsedKey.modulus) {
            try {
                const bytes = new Uint8Array(parsedKey.modulus.valueBlock.valueHexView);
                let offset = 0;
                while (offset < bytes.length - 1 && bytes[offset] === 0) offset++;
                let first = bytes[offset] || 0;
                let firstBits = 0;
                while (first > 0) {
                    firstBits++;
                    first >>= 1;
                }
                bits = (bytes.length - offset - 1) * 8 + firstBits;
            } catch (error) {
                bits = 0;
            }
        } else if (parsedKey && parsedKey.namedCurve) {
            curve = parsedKey.namedCurve;
            bits = curveBits(curve);
        } else if (algorithmOid === '1.3.101.112') {
            bits = 256;
        } else if (algorithmOid === '1.3.101.113') {
            bits = 448;
        } else if (parsedKey && parsedKey.p && parsedKey.p.valueBlock) {
            try {
                bits = parsedKey.p.valueBlock.valueHexView.length * 8;
            } catch (error) {
                bits = 0;
            }
        }

        return {
            algorithm: algorithm,
            algorithmOid: algorithmOid,
            bits: bits,
            curve: curve
        };
    }

    function curveBits(curve) {
        const map = {
            'P-192': 192,
            'P-224': 224,
            'P-256': 256,
            'P-384': 384,
            'P-521': 521,
            'secp256k1': 256
        };
        return map[curve] || 0;
    }

    function getSubjectKeyId(cert) {
        const extension = getExtension(cert, '2.5.29.14');
        const view = extension && extension.parsedValue && extension.parsedValue.valueBlock
            ? extension.parsedValue.valueBlock.valueHexView
            : null;
        return view ? toHex(view, ':') : '';
    }

    function getAuthorityKeyId(cert) {
        const extension = getExtension(cert, '2.5.29.35');
        const keyId = extension && extension.parsedValue ? extension.parsedValue.keyIdentifier : null;
        const view = keyId && keyId.valueBlock ? keyId.valueBlock.valueHexView : null;
        return view ? toHex(view, ':') : '';
    }

    async function getFingerprint(der) {
        const subtle = window.crypto && window.crypto.subtle;
        if (!subtle) return '';
        try {
            const digest = await subtle.digest('SHA-256', der);
            return toHex(new Uint8Array(digest), ':');
        } catch (error) {
            return '';
        }
    }

    /* ---------------------------------------------------------------------
     * Chain ordering and verification
     * ------------------------------------------------------------------ */

    function entryKey(entry) {
        return (entry && entry.info && entry.info.fingerprint256) || (entry && entry.pem) || '';
    }

    function orderChain(entries) {
        const unique = [];
        const seen = new Set();

        entries.forEach((entry) => {
            const id = entryKey(entry);
            if (!id || seen.has(id)) return;
            seen.add(id);
            unique.push(entry);
        });

        if (unique.length <= 1) return unique;

        const leafCandidates = unique.filter((entry) => {
            return !unique.some((other) => {
                return other !== entry &&
                    other.info.issuerDN === entry.info.subjectDN;
            });
        });

        let current = leafCandidates.find((entry) => !entry.info.isSelfSigned) || leafCandidates[0] || unique[0];
        const ordered = [current];
        const used = new Set([entryKey(current)]);

        while (ordered.length < unique.length) {
            const parent = unique.find((entry) => {
                return !used.has(entryKey(entry)) &&
                    entry.info.subjectDN === current.info.issuerDN;
            });
            if (!parent) break;
            ordered.push(parent);
            used.add(entryKey(parent));
            current = parent;
        }

        unique.forEach((entry) => {
            if (!used.has(entryKey(entry))) ordered.push(entry);
        });

        return ordered;
    }

    async function evaluateChain(entries, options) {
        const trusted = !!(options && options.trusted);
        const result = {
            links: [],
            complete: false,
            broken: false,
            trustedAnchor: false,
            rootSelfSigned: false,
            rootSignatureValid: null,
            issues: []
        };

        for (let i = 0; i < entries.length; i++) {
            const child = entries[i];

            if (i < entries.length - 1) {
                const parent = entries[i + 1];
                let issuerMatch = false;
                try {
                    issuerMatch = child.cert.issuer.isEqual(parent.cert.subject);
                } catch (error) {
                    issuerMatch = child.info.issuerDN === parent.info.subjectDN;
                }

                if (!issuerMatch) {
                    result.broken = true;
                    result.issues.push('Certificate ' + (i + 1) + ' issuer does not match certificate ' + (i + 2) + ' subject.');
                }

                let signatureValid = null;
                if (issuerMatch) {
                    try {
                        signatureValid = await verifySignature(child, parent);
                    } catch (error) {
                        signatureValid = null;
                    }
                }

                if (signatureValid === false) {
                    result.broken = true;
                    result.issues.push('Signature verification failed for certificate ' + (i + 1) + '.');
                }

                if (parent.info.basicConstraints && !parent.info.basicConstraints.ca) {
                    result.broken = true;
                    result.issues.push('Certificate ' + (i + 2) + ' is used as an issuer but is not marked as a CA.');
                }

                result.links.push({
                    childIndex: i,
                    parentIndex: i + 1,
                    issuerMatch: issuerMatch,
                    signatureValid: signatureValid
                });
            } else {
                let selfSigned = false;
                try {
                    selfSigned = child.cert.issuer.isEqual(child.cert.subject);
                } catch (error) {
                    selfSigned = child.info.isSelfSigned;
                }

                result.rootSelfSigned = selfSigned;

                if (selfSigned) {
                    result.complete = true;
                    try {
                        result.rootSignatureValid = await verifySignature(child, child);
                    } catch (error) {
                        result.rootSignatureValid = null;
                    }
                    if (result.rootSignatureValid === false) {
                        result.broken = true;
                        result.issues.push('The self-signed root certificate signature is invalid.');
                    }
                } else if (trusted) {
                    // The server did not include its root (common). The backend
                    // already validated the chain against its CA store.
                    result.complete = true;
                    result.trustedAnchor = true;
                } else {
                    result.issues.push('The chain is incomplete: the last certificate is not self-signed.');
                }
            }
        }

        return result;
    }

    async function verifySignature(child, parent) {
        const crypto = getPkiCrypto();
        if (!crypto || !child || !child.cert || !parent || !parent.cert) return null;
        return await child.cert.verify(parent.cert, crypto);
    }

    function allSignaturesValid(chainCheck) {
        if (!chainCheck) return null;
        if (chainCheck.links.some((link) => link.signatureValid === false || !link.issuerMatch)) return false;
        if (chainCheck.links.some((link) => link.signatureValid === null)) return null;
        if (chainCheck.rootSignatureValid === false) return false;
        if (chainCheck.trustedAnchor) return true;
        if (chainCheck.rootSignatureValid === true) return true;
        if (chainCheck.rootSignatureValid === null) return null;
        return true;
    }

    /* ---------------------------------------------------------------------
     * Hostname checking
     * ------------------------------------------------------------------ */

    function checkHostname(hostRaw, entry) {
        const host = normalizeHostname(hostRaw);
        if (!host) return null;

        const ip = isIp(host);
        const type = ip ? 'IP' : 'DNS';
        const sans = entry.info.sans.filter((san) => san.type === type).map((san) => san.value);
        let names = sans;
        let matchedBy = 'SAN';

        if (!names.length && !ip && entry.info.cn) {
            names = [entry.info.cn];
            matchedBy = 'CN fallback';
        }

        const matched = names.some((name) => {
            if (ip) return canonicalIp(name) === canonicalIp(host);
            return dnsNameMatches(host, name);
        });

        return {
            host: host,
            ip: ip,
            matched: matched,
            matchedBy: matchedBy,
            names: names
        };
    }

    function dnsNameMatches(host, pattern) {
        if (!pattern) return false;
        const normalized = String(pattern).toLowerCase().replace(/\.$/, '');
        if (normalized === host) return true;

        if (normalized.indexOf('*.') === 0) {
            const base = normalized.slice(2);
            if (!base) return false;
            const hostLabels = host.split('.');
            const baseLabels = base.split('.');
            return hostLabels.length === baseLabels.length + 1 &&
                host.slice(-(base.length + 1)) === '.' + base;
        }

        return false;
    }

    function normalizeHostname(raw) {
        let host = String(raw || '').trim().toLowerCase();
        if (!host) return '';

        if (host.indexOf('://') !== -1) {
            try {
                host = new URL(host).hostname;
            } catch (error) {
                return '';
            }
        }

        host = host.split('/')[0].split('?')[0].split('#')[0].replace(/\.$/, '');

        if (host.charAt(0) === '[') {
            const end = host.indexOf(']');
            if (end === -1) return '';
            host = host.slice(1, end);
        } else if ((host.match(/:/g) || []).length === 1) {
            const parts = host.split(':');
            if (/^\d+$/.test(parts[1])) host = parts[0];
        }

        if (!isIp(host)) {
            try {
                host = new URL('https://' + host).hostname;
            } catch (error) {
                return '';
            }
        }

        return host;
    }

    function parseTarget(hostRaw, portRaw) {
        let host = String(hostRaw || '').trim();
        let port = String(portRaw || '').trim() === '' ? 443 : Number(portRaw);

        if (!host) return null;

        if (host.indexOf('://') !== -1) {
            try {
                const url = new URL(host);
                host = url.hostname;
                if (url.port) port = Number(url.port);
            } catch (error) {
                return null;
            }
        } else {
            host = host.split('/')[0].split('?')[0].split('#')[0];

            if (host.charAt(0) === '[') {
                const end = host.indexOf(']');
                if (end === -1) return null;
                const rest = host.slice(end + 1);
                host = host.slice(1, end);
                if (rest.charAt(0) === ':') port = Number(rest.slice(1));
            } else if ((host.match(/:/g) || []).length === 1) {
                const parts = host.split(':');
                if (/^\d+$/.test(parts[1])) {
                    host = parts[0];
                    port = Number(parts[1]);
                }
            }
        }

        host = host.trim().toLowerCase().replace(/\.$/, '');
        if (!host || host.length > 253) return null;
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

        if (!isIp(host)) {
            try {
                host = new URL('https://' + host).hostname;
            } catch (error) {
                return null;
            }
            if (!/^[a-z0-9.-]+$/.test(host)) return null;
            const labels = host.split('.');
            if (labels.some((label) => !label || label.length > 63 || label.charAt(0) === '-' || label.charAt(label.length - 1) === '-')) {
                return null;
            }
        }

        return { host: host, port: port };
    }

    function isIp(value) {
        const text = String(value || '');
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(text)) {
            return text.split('.').every((part) => Number(part) <= 255);
        }
        return text.indexOf(':') !== -1;
    }

    function canonicalIp(value) {
        const ip = String(value || '').toLowerCase();
        if (ip.indexOf(':') === -1) return ip;
        try {
            return new URL('http://[' + ip + ']').hostname.slice(1, -1);
        } catch (error) {
            return ip;
        }
    }

    /* ---------------------------------------------------------------------
     * Warnings
     * ------------------------------------------------------------------ */

    function buildWarnings(options) {
        const entries = options.entries || [];
        const chainCheck = options.chainCheck;
        const hostnameCheck = options.hostnameCheck;
        const source = options.source;
        const tls = options.tls;
        const leaf = entries[0];
        const warnings = [];
        const now = Date.now();

        if (source === 'local') {
            warnings.push({
                level: 'info',
                text: 'Public trust was not checked locally. Upload the full chain or run a live check to inspect the served chain.'
            });
        }

        if (source === 'ct') {
            warnings.push({
                level: 'warning',
                text: 'This certificate came from Certificate Transparency logs, not from a live TLS handshake. The chain may be incomplete and the certificate currently served may differ.'
            });
        }

        entries.forEach((entry, index) => {
            if (entry.info.notAfter.getTime() < now) {
                warnings.push({
                    level: index === 0 ? 'danger' : 'warning',
                    text: (index === 0 ? 'The leaf certificate' : 'Certificate ' + (index + 1) + ' in the chain') +
                        ' expired on ' + formatDateTime(entry.info.notAfter) + '.'
                });
            } else if (entry.info.notBefore.getTime() > now) {
                warnings.push({
                    level: index === 0 ? 'danger' : 'warning',
                    text: (index === 0 ? 'The leaf certificate' : 'Certificate ' + (index + 1) + ' in the chain') +
                        ' is not valid before ' + formatDateTime(entry.info.notBefore) + '.'
                });
            } else if (index === 0 && entry.info.daysRemaining <= 30) {
                warnings.push({
                    level: 'warning',
                    text: 'The leaf certificate expires in ' + entry.info.daysRemaining + ' day(s).'
                });
            }
        });

        if (chainCheck) {
            chainCheck.issues.forEach((issue) => {
                warnings.push({ level: 'warning', text: issue });
            });

            if (chainCheck.complete && chainCheck.rootSelfSigned &&
                allSignaturesValid(chainCheck) === true && options.authorized !== true) {
                warnings.push({
                    level: 'info',
                    text: 'The chain signatures are valid, but the root is self-signed and is not publicly trusted.'
                });
            }
        }

        if (hostnameCheck && !hostnameCheck.matched) {
            warnings.push({
                level: 'danger',
                text: 'The hostname ' + hostnameCheck.host + ' does not match the certificate ' +
                    (hostnameCheck.matchedBy === 'CN fallback' ? 'Common Name' : 'Subject Alternative Names') + '.'
            });
        } else if (hostnameCheck && hostnameCheck.matchedBy === 'CN fallback') {
            warnings.push({
                level: 'warning',
                text: 'The hostname ' + hostnameCheck.host + ' matches only the certificate Common Name. ' +
                    'Modern browsers require the name in Subject Alternative Names.'
            });
        }

        if (leaf && !leaf.info.sans.length) {
            warnings.push({
                level: 'warning',
                text: 'The certificate has no Subject Alternative Names. Modern browsers will not trust it for HTTPS.'
            });
        }

        if (!window.crypto || !window.crypto.subtle) {
            warnings.push({
                level: 'warning',
                text: 'WebCrypto is unavailable in this context. Signature verification and SHA-256 fingerprints need HTTPS or localhost.'
            });
        }

        if (leaf) {
            if (leaf.info.signatureAlgorithmOid === '1.2.840.113549.1.1.5' ||
                leaf.info.signatureAlgorithmOid === '1.2.840.10045.4.1' ||
                leaf.info.signatureAlgorithmOid === '1.2.840.113549.1.1.4') {
                warnings.push({
                    level: 'warning',
                    text: 'The certificate uses a weak signature algorithm (' + leaf.info.signatureAlgorithm + ').'
                });
            }

            if (leaf.info.publicKey.algorithm === 'RSA' && leaf.info.publicKey.bits > 0 && leaf.info.publicKey.bits < 2048) {
                warnings.push({
                    level: 'danger',
                    text: 'The RSA public key is only ' + leaf.info.publicKey.bits + ' bits. Use at least 2048 bits.'
                });
            }

            if (leaf.info.publicKey.algorithm === 'ECDSA' && leaf.info.publicKey.bits > 0 && leaf.info.publicKey.bits < 256) {
                warnings.push({
                    level: 'warning',
                    text: 'The ECDSA key uses a curve smaller than 256 bits (' + leaf.info.publicKey.curve + ').'
                });
            }
        }

        if (tls) {
            if (tls.authorized === false) {
                warnings.push({
                    level: 'danger',
                    text: 'The backend could not validate the served chain: ' + friendlyTlsError(tls.authorizationError)
                });
            }
            if (tls.protocol && /^TLSv1(\.0|\.1)?$/.test(tls.protocol)) {
                warnings.push({
                    level: 'warning',
                    text: 'The server negotiated an obsolete TLS version (' + tls.protocol + ').'
                });
            }
        }

        return warnings;
    }

    function friendlyTlsError(error) {
        const text = String(error || 'unknown error');
        const map = {
            'CERT_HAS_EXPIRED': 'the certificate has expired.',
            'CERT_NOT_YET_VALID': 'the certificate is not valid yet.',
            'DEPTH_ZERO_SELF_SIGNED_CERT': 'the certificate is self-signed.',
            'SELF_SIGNED_CERT_IN_CHAIN': 'the chain contains a self-signed certificate.',
            'UNABLE_TO_VERIFY_LEAF_SIGNATURE': 'the leaf signature could not be verified.',
            'UNABLE_TO_GET_ISSUER_CERT': 'the issuer certificate is missing.',
            'UNABLE_TO_GET_ISSUER_CERT_LOCALLY': 'the issuer certificate is missing from the trust store.',
            'ERR_TLS_CERT_ALTNAME_INVALID': 'the certificate hostname does not match.',
            'CERT_UNTRUSTED': 'the certificate is not trusted.'
        };
        return map[text] || text;
    }

    /* ---------------------------------------------------------------------
     * Rendering
     * ------------------------------------------------------------------ */

    function renderResult(result) {
        const results = byId('ssl-results');
        const title = byId('ssl-result-title');
        const subtitle = byId('ssl-result-sub');
        const badges = byId('ssl-badges');
        const sourceEl = byId('ssl-source');
        const warningsEl = byId('ssl-warnings');
        const infoEl = byId('ssl-info');
        const chainEl = byId('ssl-chain');
        const pemEl = byId('ssl-pem');

        if (!results || !title || !subtitle || !badges || !sourceEl || !warningsEl || !infoEl || !chainEl || !pemEl) {
            return;
        }

        const leaf = result.leaf;
        const chainCheck = result.chainCheck || { links: [], complete: false, rootSelfSigned: false, issues: [] };
        const allValid = allSignaturesValid(chainCheck);
        const info = leaf.info;

        currentResult = {
            leafPem: leaf.pem,
            chainPem: result.entries.map((entry) => entry.pem),
            fileName: baseFileName(result.title)
        };

        title.textContent = result.title || 'Certificate details';
        subtitle.textContent = result.subtitle || '';

        badges.innerHTML = '';
        if (info.validity === 'expired') {
            addBadge(badges, 'Expired', 'is-danger');
        } else if (info.validity === 'not-yet-valid') {
            addBadge(badges, 'Not yet valid', 'is-danger');
        } else if (info.validity === 'expiring') {
            addBadge(badges, 'Expires in ' + info.daysRemaining + ' days', 'is-warning');
        } else {
            addBadge(badges, 'Valid', 'is-success');
        }

        if (result.source === 'own') {
            addBadge(badges, 'Live TLS', 'is-info');
            if (result.authorized === true) {
                addBadge(badges, 'Trusted chain', 'is-success');
            } else if (result.authorized === false) {
                addBadge(badges, 'Untrusted', 'is-danger');
            } else {
                addBadge(badges, 'Trust unknown', 'is-warning');
            }
        } else if (result.source === 'ct') {
            addBadge(badges, 'CT fallback', 'is-warning');
            addBadge(badges, 'Not live-verified', 'is-warning');
        } else {
            addBadge(badges, 'Local inspection', 'is-info');
        }

        if (chainCheck.complete && allValid === true) {
            addBadge(badges, 'Chain verified', 'is-success');
        } else if (chainCheck.broken || allValid === false) {
            addBadge(badges, 'Chain errors', 'is-danger');
        } else if (!chainCheck.complete) {
            addBadge(badges, 'Chain incomplete', 'is-warning');
        } else {
            addBadge(badges, 'Chain not verified', 'is-warning');
        }

        sourceEl.className = 'ssl-source' + (result.source === 'ct' ? ' is-ct' : '') + (result.source === 'local' ? ' is-local' : '');
        if (result.source === 'own') {
            sourceEl.textContent = 'Online result source: self-hosted TLS API — live TLS handshake.';
        } else if (result.source === 'ct') {
            sourceEl.textContent = 'Online result source: free Cert Spotter CT API (SSLMate) — Certificate Transparency lookup, not a live TLS handshake.';
        } else {
            sourceEl.textContent = 'Source: local certificate inspection. The certificate never left your browser.';
        }

        renderWarnings(warningsEl, result.warnings || []);
        renderInfo(infoEl, info, result);
        renderChain(chainEl, result.entries, chainCheck, result);

        pemEl.textContent = leaf.pem.trim();
        results.classList.remove('ssl-hidden');
        results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderWarnings(container, warnings) {
        container.innerHTML = '';
        if (!warnings.length) {
            container.classList.add('ssl-hidden');
            return;
        }

        const list = document.createElement('ul');
        warnings.forEach((warning) => {
            const item = document.createElement('li');
            item.className = 'ssl-warning ' + (warning.level || 'info');
            item.textContent = warning.text;
            list.appendChild(item);
        });
        container.appendChild(list);
        container.classList.remove('ssl-hidden');
    }

    function renderInfo(container, info, result) {
        container.innerHTML = '';

        addInfoRow(container, 'Common Name', info.cn || '—');
        addInfoRow(container, 'Subject Alternative Names', info.sans.length ? info.sans.map((san) => san.type + ': ' + san.value) : '—', true);
        addInfoRow(container, 'Subject', info.subjectDN || '—', true);
        addInfoRow(container, 'Issuer', info.issuerDN || '—', true);
        addInfoRow(container, 'Organization', info.organization || '—');
        addInfoRow(container, 'Organizational Unit', info.organizationalUnit || '—');
        addInfoRow(container, 'Locality', info.locality || '—');
        addInfoRow(container, 'State / Province', info.state || '—');
        addInfoRow(container, 'Country', info.country || '—');
        addInfoRow(container, 'Valid From', formatDateTime(info.notBefore));
        addInfoRow(container, 'Valid To', formatDateTime(info.notAfter));
        addInfoRow(container, 'Expires In', formatExpiry(info.notAfter));
        addInfoRow(container, 'Serial Number', info.serialHex || '—', true);
        addInfoRow(container, 'Signature Algorithm', info.signatureAlgorithm || '—');
        addInfoRow(container, 'Public Key', formatPublicKey(info.publicKey));
        addInfoRow(container, 'Key Usage', info.keyUsage.length ? info.keyUsage.join(', ') : '—');
        addInfoRow(container, 'Extended Key Usage', info.extendedKeyUsage.length ? info.extendedKeyUsage.join(', ') : '—');
        addInfoRow(container, 'Basic Constraints', formatBasicConstraints(info.basicConstraints));
        addInfoRow(container, 'SHA-256 Fingerprint', info.fingerprint256 || 'Unavailable', true);

        if (result.hostnameCheck) {
            addInfoRow(
                container,
                'Hostname Verification',
                result.hostnameCheck.matched
                    ? 'Matches ' + result.hostnameCheck.host + ' (' + result.hostnameCheck.matchedBy + ')'
                    : 'Does not match ' + result.hostnameCheck.host,
                true
            );
        }

        if (result.tls) {
            addInfoRow(container, 'TLS Protocol', result.tls.protocol || '—');
            addInfoRow(container, 'Cipher Suite', result.tls.cipher || '—');
            addInfoRow(container, 'ALPN', result.tls.alpn || '—');
            addInfoRow(container, 'Chain Trust', result.authorized === true ? 'Trusted by backend CA store' : result.authorized === false ? 'Not trusted by backend CA store' : 'Unknown');
        }
    }

    function addInfoRow(container, label, value, wide) {
        const row = document.createElement('div');
        row.className = 'ssl-info-row' + (wide ? ' ssl-info-wide' : '');

        const labelEl = document.createElement('span');
        labelEl.className = 'ssl-info-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'ssl-info-value';

        if (Array.isArray(value)) {
            valueEl.classList.add('ssl-san-list');
            value.forEach((item) => {
                const chip = document.createElement('span');
                chip.className = 'ssl-san';
                chip.textContent = item;
                valueEl.appendChild(chip);
            });
        } else {
            valueEl.textContent = value === undefined || value === null || value === '' ? '—' : value;
        }

        row.appendChild(labelEl);
        row.appendChild(valueEl);
        container.appendChild(row);
    }

    function renderChain(container, entries, chainCheck, result) {
        container.innerHTML = '';

        entries.forEach((entry, index) => {
            const info = entry.info;
            const card = document.createElement('div');
            card.className = 'ssl-chain-item';

            const head = document.createElement('div');
            head.className = 'ssl-chain-head';

            const label = document.createElement('span');
            label.className = 'ssl-chain-index';
            label.textContent = index === 0
                ? 'Leaf'
                : (info.isSelfSigned ? 'Root' : 'Intermediate');

            const name = document.createElement('strong');
            name.textContent = info.cn || info.subjectDN || 'Certificate ' + (index + 1);

            head.appendChild(label);
            head.appendChild(name);

            if (info.notAfter.getTime() < Date.now()) {
                addBadge(head, 'Expired', 'is-danger');
            } else if (info.notBefore.getTime() > Date.now()) {
                addBadge(head, 'Not yet valid', 'is-danger');
            } else {
                addBadge(head, 'Valid', 'is-success');
            }

            card.appendChild(head);

            const meta = document.createElement('div');
            meta.className = 'ssl-chain-meta';
            addChainLine(meta, 'Subject', info.subjectDN);
            addChainLine(meta, 'Issuer', info.issuerDN);
            addChainLine(meta, 'Validity', formatDateTime(info.notBefore) + ' → ' + formatDateTime(info.notAfter));
            addChainLine(meta, 'Public Key', formatPublicKey(info.publicKey));
            addChainLine(meta, 'Signature', info.signatureAlgorithm);
            addChainLine(meta, 'Basic Constraints', formatBasicConstraints(info.basicConstraints));

            if (index < entries.length - 1) {
                const link = chainCheck.links[index];
                let linkText = 'Not checked';
                if (link) {
                    if (!link.issuerMatch) linkText = 'Issuer / subject mismatch';
                    else if (link.signatureValid === true) linkText = 'Signature verified';
                    else if (link.signatureValid === false) linkText = 'Signature verification failed';
                }
                addChainLine(meta, 'Link to next certificate', linkText);
            } else if (info.isSelfSigned) {
                let rootText = 'Self-signed';
                if (chainCheck.rootSignatureValid === true) rootText += ' (self-signature verified)';
                else if (chainCheck.rootSignatureValid === false) rootText += ' (self-signature invalid)';
                addChainLine(meta, 'Root', rootText);
            } else if (chainCheck.trustedAnchor) {
                addChainLine(meta, 'Trust anchor', 'Backend CA store (root not sent by the server)');
            }

            card.appendChild(meta);
            container.appendChild(card);
        });
    }

    function addChainLine(container, label, value) {
        const line = document.createElement('div');
        line.className = 'ssl-chain-line';
        const labelEl = document.createElement('span');
        labelEl.textContent = label + ': ';
        const valueEl = document.createElement('span');
        valueEl.textContent = value || '—';
        line.appendChild(labelEl);
        line.appendChild(valueEl);
        container.appendChild(line);
    }

    function addBadge(container, text, tone) {
        const badge = document.createElement('span');
        badge.className = 'ssl-badge ' + (tone || 'is-info');
        badge.textContent = text;
        container.appendChild(badge);
    }

    function formatPublicKey(publicKey) {
        if (!publicKey) return '—';
        if (publicKey.algorithm === 'ECDSA' && publicKey.curve) {
            return 'ECDSA ' + publicKey.curve;
        }
        if (publicKey.algorithm === 'RSA' && publicKey.bits) {
            return 'RSA ' + publicKey.bits + '-bit';
        }
        if (publicKey.algorithm === 'Ed25519') return 'Ed25519 (256-bit)';
        if (publicKey.algorithm === 'Ed448') return 'Ed448 (448-bit)';
        return publicKey.algorithm || '—';
    }

    function formatBasicConstraints(basicConstraints) {
        if (!basicConstraints) return '—';
        if (!basicConstraints.ca) return 'CA: FALSE';
        return 'CA: TRUE' + (basicConstraints.pathLen !== null ? ' (path length ' + basicConstraints.pathLen + ')' : '');
    }

    function formatDateTime(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '—';
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) + ', ' + date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatExpiry(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '—';
        const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
        if (days < 0) return 'Expired ' + Math.abs(days) + ' day(s) ago';
        if (days === 0) return 'Expires today';
        return 'Expires in ' + days + ' day(s)';
    }

    /* ---------------------------------------------------------------------
     * Copy / download / clear
     * ------------------------------------------------------------------ */

    async function copyResult(button, mode) {
        if (!currentResult) return;
        const text = mode === 'chain' ? currentResult.chainPem.join('\n') : currentResult.leafPem;
        const copied = await copyText(text);
        if (!copied) {
            showError('Could not copy to the clipboard. Select the PEM text and copy it manually.');
            return;
        }

        const original = button.textContent;
        button.textContent = 'Copied';
        button.classList.add('copied');
        setTimeout(() => {
            button.textContent = original;
            button.classList.remove('copied');
        }, 1800);
    }

    function downloadResult() {
        if (!currentResult) return;
        const content = currentResult.chainPem.join('\n');
        downloadText(content, currentResult.fileName + '-chain.pem');
    }

    async function copyText(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (error) {
            /* fall through */
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.top = '-1000px';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            textarea.remove();
            return ok;
        } catch (error) {
            return false;
        }
    }

    function downloadText(text, fileName) {
        const blob = new Blob([text], { type: 'application/x-pem-file' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function clearResults() {
        currentResult = null;
        hideResults();
        hideError();

        const fileInput = byId('ssl-cert-file');
        const pemInput = byId('ssl-cert-pem');
        const hostnameInput = byId('ssl-hostname-check');
        if (fileInput) fileInput.value = '';
        if (pemInput) pemInput.value = '';
        if (hostnameInput) hostnameInput.value = '';
        setApiNote(defaultApiNote, 'is-info');
    }

    /* ---------------------------------------------------------------------
     * UI helpers
     * ------------------------------------------------------------------ */

    function showError(message) {
        const errorEl = byId('ssl-checker-error');
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.classList.remove('ssl-hidden');
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideError() {
        const errorEl = byId('ssl-checker-error');
        if (!errorEl) return;
        errorEl.textContent = '';
        errorEl.classList.add('ssl-hidden');
    }

    function hideResults() {
        const results = byId('ssl-results');
        if (results) results.classList.add('ssl-hidden');
    }

    function setApiNote(message, tone) {
        const note = byId('ssl-api-note');
        if (!note) return;
        note.textContent = message;
        note.className = 'checker-note ssl-api-note ' + (tone || 'is-info');
    }

    function setBusy(button, busy, label) {
        if (!button) return;
        button.disabled = busy;
        if (label) button.textContent = label;
    }

    /* ---------------------------------------------------------------------
     * Utilities
     * ------------------------------------------------------------------ */

    function base64ToBytes(value) {
        const clean = String(value || '').replace(/\s+/g, '');
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function derToPem(der) {
        const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const lines = base64.match(/.{1,64}/g) || [];
        return '-----BEGIN CERTIFICATE-----\n' + lines.join('\n') + '\n-----END CERTIFICATE-----\n';
    }

    function toHex(bytes, separator) {
        return Array.from(bytes || [])
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(separator || '')
            .toUpperCase();
    }

    function ipFromBytes(bytes) {
        if (!bytes) return '';
        const octets = Array.from(bytes);
        if (octets.length === 4) return octets.join('.');
        if (octets.length !== 16) return '';

        const groups = [];
        for (let i = 0; i < octets.length; i += 2) {
            groups.push(((octets[i] << 8) | octets[i + 1]).toString(16));
        }

        let bestStart = -1;
        let bestLength = 0;
        let currentStart = -1;
        let currentLength = 0;

        groups.forEach((group, index) => {
            if (group === '0') {
                if (currentStart === -1) currentStart = index;
                currentLength++;
                if (currentLength > bestLength) {
                    bestLength = currentLength;
                    bestStart = currentStart;
                }
            } else {
                currentStart = -1;
                currentLength = 0;
            }
        });

        if (bestLength > 1) {
            const left = groups.slice(0, bestStart).join(':');
            const right = groups.slice(bestStart + bestLength).join(':');
            return left + '::' + right;
        }

        return groups.join(':');
    }

    function baseFileName(value) {
        const safe = String(value || 'certificate')
            .replace(/[^a-z0-9._-]+/gi, '-')
            .replace(/^[.-]+|[.-]+$/g, '')
            .slice(0, 80);
        return safe || 'certificate';
    }

    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState !== 'loading') init();
})();
