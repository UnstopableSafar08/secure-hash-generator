/**
 * Crypto Module - Key generation and cryptographic operations
 * Uses node-forge for key operations (browser-compatible UMD build)
 */

const Crypto = (function() {
    'use strict';

    // In-memory storage for keys (never persisted)
    const keyStore = {
        ca: null,
        cert: null
    };

    /**
     * Parse algorithm string to key generation parameters
     */
    function parseAlgorithm(algorithmStr) {
        // Format: "algorithm-size" or "algorithm-size-curve"
        const parts = algorithmStr.split('-');
        const type = parts[0];

        if (type === 'RSA') {
            const size = parts[1] ? parseInt(parts[1]) : 2048;
            return { type: 'RSA', bits: size };
        } else if (type === 'ECDSA') {
            const size = parts[1] ? parseInt(parts[1]) : 256;
            const curve = parts[2] || 'P256';
            return { type: 'ECDSA', size, curve };
        } else {
            throw new Error(`Unsupported algorithm: ${algorithmStr}`);
        }
    }

    /**
     * Generate a key pair using forge
     */
    async function generateKeyPair(algorithmStr) {
        const params = parseAlgorithm(algorithmStr);

        if (params.type === 'RSA') {
            // Use forge's async RSA key generation
            return new Promise((resolve, reject) => {
                forge.pki.rsa.generateKeyPair({ bits: params.bits, workers: -1 }, (err, keypair) => {
                    if (err) reject(err);
                    else resolve(keypair);
                });
            });
        } else if (params.type === 'ECDSA') {
            // For ECDSA, use Web Crypto API and convert to forge format
            const curveMap = {
                '256': 'P-256',
                '384': 'P-384',
                '521': 'P-521'
            };
            const curveName = curveMap[params.size] || 'P-256';
            const webKeyPair = await window.crypto.subtle.generateKey(
                { name: 'ECDSA', namedCurve: curveName },
                true,
                ['sign', 'verify']
            );

            // Export keys as PEM via JWK -> forge
            const privJwk = await window.crypto.subtle.exportKey('jwk', webKeyPair.privateKey);
            const pubJwk = await window.crypto.subtle.exportKey('jwk', webKeyPair.publicKey);

            // For ECDSA, we store the Web Crypto key pair plus curve info
            // forge doesn't natively support ECDSA well, so we use a hybrid approach
            return {
                privateKey: webKeyPair.privateKey,
                publicKey: webKeyPair.publicKey,
                _isECDSA: true,
                _curve: curveName,
                _privJwk: privJwk,
                _pubJwk: pubJwk
            };
        }
    }

    /**
     * Export private key to PKCS#8 PEM format
     */
    async function exportPrivateKeyToPEM(keyPair) {
        if (keyPair._isECDSA) {
            // ECDSA: export via Web Crypto
            const exported = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            const base64 = arrayBufferToBase64(exported);
            return `-----BEGIN PRIVATE KEY-----\n${formatPEM(base64)}\n-----END PRIVATE KEY-----`;
        }
        // RSA: use forge
        const asn1 = forge.pki.privateKeyToAsn1(keyPair);
        const pkcs8 = forge.pki.wrapRsaPrivateKey(asn1);
        return forge.pki.privateKeyInfoToPem(pkcs8);
    }

    /**
     * Export public key to PEM format
     */
    async function exportPublicKeyToPEM(keyPair) {
        if (keyPair._isECDSA) {
            const exported = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
            const base64 = arrayBufferToBase64(exported);
            return `-----BEGIN PUBLIC KEY-----\n${formatPEM(base64)}\n-----END PUBLIC KEY-----`;
        }
        return forge.pki.publicKeyToPem(keyPair);
    }

    /**
     * Convert ArrayBuffer to Base64 string
     */
    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * Format Base64 string for PEM (64 character lines)
     */
    function formatPEM(base64) {
        const lines = [];
        for (let i = 0; i < base64.length; i += 64) {
            lines.push(base64.substring(i, i + 64));
        }
        return lines.join('\n');
    }

    /**
     * Convert PEM to ArrayBuffer
     */
    function pemToArrayBuffer(pem) {
        const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
        const binary = window.atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Store key pair in memory
     */
    function storeKeyPair(type, keyPair) {
        keyStore[type] = keyPair;
    }

    /**
     * Get key pair from memory
     */
    function getKeyPair(type) {
        return keyStore[type];
    }

    /**
     * Clear key pair from memory
     */
    function clearKeyPair(type) {
        if (keyStore[type]) {
            keyStore[type] = null;
        }
    }

    /**
     * Clear all keys from memory
     */
    function clearAllKeys() {
        keyStore.ca = null;
        keyStore.cert = null;
    }

    /**
     * Get hash algorithm name
     */
    function getHashAlgorithm() {
        return 'SHA-256';
    }

    return {
        generateKeyPair,
        exportPrivateKeyToPEM,
        exportPublicKeyToPEM,
        pemToArrayBuffer,
        arrayBufferToBase64,
        formatPEM,
        storeKeyPair,
        getKeyPair,
        clearKeyPair,
        clearAllKeys,
        getHashAlgorithm,
        parseAlgorithm
    };
})();
