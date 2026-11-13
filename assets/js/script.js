const inputText = document.getElementById('inputText');
const generateBtn = document.getElementById('generateBtn');
const resultContainer = document.getElementById('resultContainer');
const resultLabel = document.getElementById('resultLabel');
const resultValue = document.getElementById('resultValue');
const copyBtn = document.getElementById('copyBtn');
const algorithmBtns = document.querySelectorAll('.algorithm-btn');
const navBtns = document.querySelectorAll('.nav-btn');
const toolPanels = document.querySelectorAll('.tab-content');
const toolTitle = document.getElementById('toolTitle');
const toolDesc = document.getElementById('toolDesc');
const toolSearch = document.getElementById('toolSearch');

let selectedAlgorithm = 'SHA-256';

// Lucide icons helper (graceful no-op if CDN fails)
function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function setBtn(btn, icon, label) {
    btn.innerHTML = '<i data-lucide="' + icon + '"></i> ' + label;
    refreshIcons();
}

// Hash-routed sidebar navigation (deep-linkable: #/hash, #/base64, ...)
const TOOLS = {
    hash: { title: 'Hash Generator', desc: 'Generate SHA-256, SHA-384, SHA-512, SHA-1 and MD5 digests instantly.' },
    password: { title: 'Password Generator', desc: 'Create strong, cryptographically secure passwords with custom rules.' },
    random: { title: 'Random Strings', desc: 'Generate batches of random strings for API keys, tokens and IDs.' },
    bcrypt: { title: 'Bcrypt', desc: 'Hash passwords with bcrypt and verify hashes against plain text.' },
    base64: { title: 'Base64 Tool', desc: 'Encode and decode Base64 in realtime, including URL-safe output.' },
    charCount: { title: 'Char Count', desc: 'Count characters, words, lines and inspect character frequency.' },
    case: { title: 'Convert Case', desc: 'Convert text between upper, lower, title, sentence and code cases.' },
    image: { title: 'Image Base64', desc: 'Convert images to Base64 data URLs and decode Base64 back into images.' },
    resize: { title: 'Image Resizer', desc: 'Bulk resize, crop and convert images locally with size, percentage and social presets.' },
    pdfToImages: { title: 'PDF to Images', desc: 'Render PDF pages or extract embedded images as JPG, PNG or WebP.' },
    imagesToPdf: { title: 'Images to PDF', desc: 'Combine JPG, PNG, WebP, GIF, BMP or AVIF images into one PDF.' }
};

function currentToolFromHash() {
    const id = (window.location.hash || '').replace(/^#\/?/, '');
    return Object.prototype.hasOwnProperty.call(TOOLS, id) ? id : 'hash';
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Bring the clicked tool's UI in front of the user.
// - Programmatic focus lands on the tool's own section (never on its first input),
//   so mobile browsers do not pop up the on-screen keyboard after a tap.
// - On stacked mobile layouts the sidebar sits above the tools, so the main
//   panel is scrolled into view. No-op when the panel is already fully visible
//   (e.g. desktop sticky-sidebar layout).
function revealActiveTool() {
    const panel = document.getElementById(currentToolFromHash() + 'Tab');
    if (!panel) return;

    panel.setAttribute('tabindex', '-1');
    panel.focus({ preventScroll: true });

    const main = document.querySelector('.main');
    if (!main) return;
    const rect = main.getBoundingClientRect();
    const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!fullyVisible) {
        main.scrollIntoView({
            behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
            block: 'start'
        });
    }
}

function renderRoute() {
    const id = currentToolFromHash();
    navBtns.forEach(b => {
        const active = b.dataset.tool === id;
        b.classList.toggle('active', active);
        if (active) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
    });
    toolPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === id + 'Tab');
    });
    if (toolTitle) toolTitle.textContent = TOOLS[id].title;
    if (toolDesc) toolDesc.textContent = TOOLS[id].desc;
    document.title = TOOLS[id].title + ' · Secure Tools';
    if (firstRender) firstRender = false;
    else revealActiveTool();
}

let firstRender = true;

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = '#/' + btn.dataset.tool;
        if (window.location.hash === target) renderRoute();
        else window.location.hash = target;
    });
});

window.addEventListener('hashchange', renderRoute);

if (toolSearch) {
    toolSearch.addEventListener('input', () => {
        const q = toolSearch.value.trim().toLowerCase();
        navBtns.forEach(b => {
            const hit = (b.dataset.tool + ' ' + b.textContent).toLowerCase().includes(q);
            b.style.display = hit ? '' : 'none';
        });
    });
}

renderRoute();

// Hash Generator
algorithmBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        algorithmBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedAlgorithm = btn.dataset.algo;
        if (resultContainer.classList.contains('visible')) {
            generateHash();
        }
    });
});

async function generateHash() {
    const text = inputText.value;

    if (!text) {
        resultContainer.classList.remove('visible');
        return;
    }

    try {
        let hashHex;

        if (selectedAlgorithm === 'MD5') {
            hashHex = md5(text);
        } else {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const hashBuffer = await crypto.subtle.digest(selectedAlgorithm, data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        resultLabel.textContent = `${selectedAlgorithm} Hash:`;
        resultValue.textContent = hashHex;
        resultContainer.classList.add('visible');
        setBtn(copyBtn, 'copy', 'Copy to Clipboard');
        copyBtn.classList.remove('copied');
    } catch (error) {
        console.error('Error generating hash:', error);
        resultValue.textContent = 'Error generating hash';
        resultContainer.classList.add('visible');
    }
}

// MD5 implementation
function md5(string) {
    function rotateLeft(value, shift) {
        return (value << shift) | (value >>> (32 - shift));
    }

    function addUnsigned(x, y) {
        const lsw = (x & 0xFFFF) + (y & 0xFFFF);
        const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }

    function f(x, y, z) {
        return (x & y) | (~x & z);
    }

    function g(x, y, z) {
        return (x & z) | (y & ~z);
    }

    function h(x, y, z) {
        return x ^ y ^ z;
    }

    function i(x, y, z) {
        return y ^ (x | ~z);
    }

    function ff(a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(f(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function gg(a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(g(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function hh(a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(h(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function ii(a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(i(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function convertToWordArray(string) {
        let lWordCount;
        const lMessageLength = string.length;
        const lNumberOfWords_temp1 = lMessageLength + 8;
        const lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
        const lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
        const lWordArray = Array(lNumberOfWords - 1);
        let lBytePosition = 0;
        let lByteCount = 0;
        while (lByteCount < lMessageLength) {
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
            lByteCount++;
        }
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
        lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
        lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        return lWordArray;
    }

    function wordToHex(lValue) {
        let wordToHexValue = '';
        let wordToHexValue_temp = '';
        let lByte;
        let lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
            lByte = (lValue >>> (lCount * 8)) & 255;
            wordToHexValue_temp = '0' + lByte.toString(16);
            wordToHexValue = wordToHexValue + wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2);
        }
        return wordToHexValue;
    }

    const x = convertToWordArray(string);
    let a = 0x67452301;
    let b = 0xEFCDAB89;
    let c = 0x98BADCFE;
    let d = 0x10325476;
    const S11 = 7;
    const S12 = 12;
    const S13 = 17;
    const S14 = 22;
    const S21 = 5;
    const S22 = 9;
    const S23 = 14;
    const S24 = 20;
    const S31 = 4;
    const S32 = 11;
    const S33 = 16;
    const S34 = 23;
    const S41 = 6;
    const S42 = 10;
    const S43 = 15;
    const S44 = 21;

    let AA = a;
    let BB = b;
    let CC = c;
    let DD = d;

    for (let k = 0; k < x.length; k += 16) {
        AA = a;
        BB = b;
        CC = c;
        DD = d;

        a = ff(a, b, c, d, x[k + 0], S11, 0xD76AA478);
        d = ff(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
        c = ff(c, d, a, b, x[k + 2], S13, 0x242070DB);
        b = ff(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
        a = ff(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
        d = ff(d, a, b, c, x[k + 5], S12, 0x4787C62A);
        c = ff(c, d, a, b, x[k + 6], S13, 0xA8304613);
        b = ff(b, c, d, a, x[k + 7], S14, 0xFD469501);
        a = ff(a, b, c, d, x[k + 8], S11, 0x698098D8);
        d = ff(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
        c = ff(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
        b = ff(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
        a = ff(a, b, c, d, x[k + 12], S11, 0x6B901122);
        d = ff(d, a, b, c, x[k + 13], S12, 0xFD987193);
        c = ff(c, d, a, b, x[k + 14], S13, 0xA679438E);
        b = ff(b, c, d, a, x[k + 15], S14, 0x49B40821);

        a = gg(a, b, c, d, x[k + 1], S21, 0xF61E2562);
        d = gg(d, a, b, c, x[k + 6], S22, 0xC040B340);
        c = gg(c, d, a, b, x[k + 11], S23, 0x265E5A51);
        b = gg(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
        a = gg(a, b, c, d, x[k + 5], S21, 0xD62F105D);
        d = gg(d, a, b, c, x[k + 10], S22, 0x02441453);
        c = gg(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
        b = gg(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
        a = gg(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
        d = gg(d, a, b, c, x[k + 14], S22, 0xC33707D6);
        c = gg(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
        b = gg(b, c, d, a, x[k + 8], S24, 0x455A14ED);
        a = gg(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
        d = gg(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
        c = gg(c, d, a, b, x[k + 7], S23, 0x676F02D9);
        b = gg(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);

        a = hh(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
        d = hh(d, a, b, c, x[k + 8], S32, 0x8771F681);
        c = hh(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
        b = hh(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
        a = hh(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
        d = hh(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
        c = hh(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
        b = hh(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
        a = hh(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
        d = hh(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
        c = hh(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
        b = hh(b, c, d, a, x[k + 6], S34, 0x04881D05);
        a = hh(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
        d = hh(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
        c = hh(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
        b = hh(b, c, d, a, x[k + 2], S34, 0xC4AC5665);

        a = ii(a, b, c, d, x[k + 0], S41, 0xF4292244);
        d = ii(d, a, b, c, x[k + 7], S42, 0x432AFF97);
        c = ii(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
        b = ii(b, c, d, a, x[k + 5], S44, 0xFC93A039);
        a = ii(a, b, c, d, x[k + 12], S41, 0x655B59C3);
        d = ii(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
        c = ii(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
        b = ii(b, c, d, a, x[k + 1], S44, 0x85845DD1);
        a = ii(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
        d = ii(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
        c = ii(c, d, a, b, x[k + 6], S43, 0xA3014314);
        b = ii(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
        a = ii(a, b, c, d, x[k + 4], S41, 0xF7537E82);
        d = ii(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
        c = ii(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
        b = ii(b, c, d, a, x[k + 9], S44, 0xEB86D391);

        a = addUnsigned(a, AA);
        b = addUnsigned(b, BB);
        c = addUnsigned(c, CC);
        d = addUnsigned(d, DD);
    }

    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

generateBtn.addEventListener('click', generateHash);

inputText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        generateHash();
    }
});

copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(resultValue.textContent);
        setBtn(copyBtn, 'check', 'Copied!');
        copyBtn.classList.add('copied');
        setTimeout(() => {
            setBtn(copyBtn, 'copy', 'Copy to Clipboard');
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
});

// Password Generator
const lengthSlider = document.getElementById('lengthSlider');
const lengthInput = document.getElementById('lengthInput');
const lengthValue = document.getElementById('lengthValue');
const lengthError = document.getElementById('lengthError');
const passwordText = document.getElementById('passwordText');
const generatePasswordBtn = document.getElementById('generatePasswordBtn');
const copyPasswordBtn = document.getElementById('copyPasswordBtn');
const strengthMeter = document.getElementById('strengthMeter');
const strengthFill = document.getElementById('strengthFill');
const strengthScore = document.getElementById('strengthScore');

const charSets = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

const MIN_LENGTH = 6;
const MAX_LENGTH = 100;

function validateLength(value) {
    const num = parseInt(value);
    if (isNaN(num)) {
        return { valid: false, error: 'Please enter a number' };
    }
    if (num < MIN_LENGTH) {
        return { valid: false, error: `Minimum length is ${MIN_LENGTH}` };
    }
    if (num > MAX_LENGTH) {
        return { valid: false, error: `Maximum length is ${MAX_LENGTH}` };
    }
    return { valid: true, value: num };
}

function updateLength(value, source) {
    const validation = validateLength(value);

    if (validation.valid) {
        lengthInput.value = validation.value;
        lengthSlider.value = validation.value;
        lengthValue.textContent = validation.value;
        lengthInput.classList.remove('invalid');
        lengthError.textContent = '';
        return validation.value;
    } else {
        if (source === 'input') {
            lengthInput.classList.add('invalid');
            lengthError.textContent = validation.error;
        }
        return null;
    }
}

lengthSlider.addEventListener('input', () => {
    updateLength(lengthSlider.value, 'slider');
});

lengthInput.addEventListener('input', () => {
    updateLength(lengthInput.value, 'input');
});

lengthInput.addEventListener('blur', () => {
    const validation = validateLength(lengthInput.value);
    if (!validation.valid) {
        lengthInput.value = lengthSlider.value;
        lengthInput.classList.remove('invalid');
        lengthError.textContent = '';
    }
});

function generatePassword() {
    const validation = validateLength(lengthInput.value);
    if (!validation.valid) {
        lengthInput.classList.add('invalid');
        lengthError.textContent = validation.error;
        return;
    }

    const length = validation.value;
    const useUppercase = document.getElementById('uppercase').checked;
    const useLowercase = document.getElementById('lowercase').checked;
    const useNumbers = document.getElementById('numbers').checked;
    const useSymbols = document.getElementById('symbols').checked;
    const customSymbols = document.getElementById('passwordCustomSymbols').value.trim();

    let chars = '';
    let password = '';

    if (useUppercase) chars += charSets.uppercase;
    if (useLowercase) chars += charSets.lowercase;
    if (useNumbers) chars += charSets.numbers;
    if (useSymbols) {
        chars += customSymbols || charSets.symbols;
    }

    if (chars === '') {
        passwordText.textContent = 'Select at least one character type';
        strengthMeter.className = 'strength-meter';
        strengthScore.textContent = '-';
        return;
    }

    // Use crypto.getRandomValues for cryptographically secure random
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);

    for (let i = 0; i < length; i++) {
        password += chars[array[i] % chars.length];
    }

    passwordText.textContent = password;
    updateStrength(password);
}

function updateStrength(password) {
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    strengthMeter.className = 'strength-meter';

    if (score <= 2) {
        strengthMeter.classList.add('strength-weak');
        strengthScore.textContent = 'Weak';
    } else if (score <= 4) {
        strengthMeter.classList.add('strength-fair');
        strengthScore.textContent = 'Fair';
    } else if (score <= 5) {
        strengthMeter.classList.add('strength-good');
        strengthScore.textContent = 'Good';
    } else {
        strengthMeter.classList.add('strength-strong');
        strengthScore.textContent = 'Strong';
    }
}

generatePasswordBtn.addEventListener('click', generatePassword);

copyPasswordBtn.addEventListener('click', async () => {
    const password = passwordText.textContent;
    if (password && password !== 'Click generate to create password' && password !== 'Select at least one character type') {
        try {
            await navigator.clipboard.writeText(password);
            setBtn(copyPasswordBtn, 'check', 'Copied!');
            copyPasswordBtn.classList.add('copied');
            setTimeout(() => {
                setBtn(copyPasswordBtn, 'copy', 'Copy');
                copyPasswordBtn.classList.remove('copied');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    }
});

// Generate initial password
generatePassword();

// Random String Generator
const stringLengthSlider = document.getElementById('stringLengthSlider');
const stringLengthInput = document.getElementById('stringLengthInput');
const stringLengthValue = document.getElementById('stringLengthValue');
const stringLengthError = document.getElementById('stringLengthError');
const stringCountSlider = document.getElementById('stringCountSlider');
const stringCountInput = document.getElementById('stringCountInput');
const stringCountValue = document.getElementById('stringCountValue');
const stringCountError = document.getElementById('stringCountError');
const stringsOutput = document.getElementById('stringsOutput');
const generateStringsBtn = document.getElementById('generateStringsBtn');
const copyAllStringsBtn = document.getElementById('copyAllStringsBtn');

const STRING_MIN_LENGTH = 1;
const STRING_MAX_LENGTH = 100;
const STRING_MIN_COUNT = 1;
const STRING_MAX_COUNT = 50;

function validateStringLength(value) {
    const num = parseInt(value);
    if (isNaN(num)) {
        return { valid: false, error: 'Please enter a number' };
    }
    if (num < STRING_MIN_LENGTH) {
        return { valid: false, error: `Minimum length is ${STRING_MIN_LENGTH}` };
    }
    if (num > STRING_MAX_LENGTH) {
        return { valid: false, error: `Maximum length is ${STRING_MAX_LENGTH}` };
    }
    return { valid: true, value: num };
}

function validateStringCount(value) {
    const num = parseInt(value);
    if (isNaN(num)) {
        return { valid: false, error: 'Please enter a number' };
    }
    if (num < STRING_MIN_COUNT) {
        return { valid: false, error: `Minimum count is ${STRING_MIN_COUNT}` };
    }
    if (num > STRING_MAX_COUNT) {
        return { valid: false, error: `Maximum count is ${STRING_MAX_COUNT}` };
    }
    return { valid: true, value: num };
}

function updateStringLength(value, source) {
    const validation = validateStringLength(value);

    if (validation.valid) {
        stringLengthInput.value = validation.value;
        stringLengthSlider.value = validation.value;
        stringLengthValue.textContent = validation.value;
        stringLengthInput.classList.remove('invalid');
        stringLengthError.textContent = '';
        return validation.value;
    } else {
        if (source === 'input') {
            stringLengthInput.classList.add('invalid');
            stringLengthError.textContent = validation.error;
        }
        return null;
    }
}

function updateStringCount(value, source) {
    const validation = validateStringCount(value);

    if (validation.valid) {
        stringCountInput.value = validation.value;
        stringCountSlider.value = validation.value;
        stringCountValue.textContent = validation.value;
        stringCountInput.classList.remove('invalid');
        stringCountError.textContent = '';
        return validation.value;
    } else {
        if (source === 'input') {
            stringCountInput.classList.add('invalid');
            stringCountError.textContent = validation.error;
        }
        return null;
    }
}

stringLengthSlider.addEventListener('input', () => {
    updateStringLength(stringLengthSlider.value, 'slider');
});

stringLengthInput.addEventListener('input', () => {
    updateStringLength(stringLengthInput.value, 'input');
});

stringLengthInput.addEventListener('blur', () => {
    const validation = validateStringLength(stringLengthInput.value);
    if (!validation.valid) {
        stringLengthInput.value = stringLengthSlider.value;
        stringLengthInput.classList.remove('invalid');
        stringLengthError.textContent = '';
    }
});

stringCountSlider.addEventListener('input', () => {
    updateStringCount(stringCountSlider.value, 'slider');
});

stringCountInput.addEventListener('input', () => {
    updateStringCount(stringCountInput.value, 'input');
});

stringCountInput.addEventListener('blur', () => {
    const validation = validateStringCount(stringCountInput.value);
    if (!validation.valid) {
        stringCountInput.value = stringCountSlider.value;
        stringCountInput.classList.remove('invalid');
        stringCountError.textContent = '';
    }
});

function generateRandomString(length, chars) {
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}

function generateRandomStrings() {
    const lengthValidation = validateStringLength(stringLengthInput.value);
    const countValidation = validateStringCount(stringCountInput.value);

    if (!lengthValidation.valid) {
        stringLengthInput.classList.add('invalid');
        stringLengthError.textContent = lengthValidation.error;
        return;
    }

    if (!countValidation.valid) {
        stringCountInput.classList.add('invalid');
        stringCountError.textContent = countValidation.error;
        return;
    }

    const length = lengthValidation.value;
    const count = countValidation.value;

    const useUppercase = document.getElementById('stringUppercase').checked;
    const useLowercase = document.getElementById('stringLowercase').checked;
    const useNumbers = document.getElementById('stringNumbers').checked;
    const useSymbols = document.getElementById('stringSymbols').checked;
    const customSymbols = document.getElementById('stringCustomSymbols').value.trim();

    let chars = '';
    if (useUppercase) chars += charSets.uppercase;
    if (useLowercase) chars += charSets.lowercase;
    if (useNumbers) chars += charSets.numbers;
    if (useSymbols) {
        chars += customSymbols || charSets.symbols;
    }

    if (chars === '') {
        stringsOutput.innerHTML = '<div class="strings-empty">Select at least one character type</div>';
        return;
    }

    stringsOutput.innerHTML = '';
    const strings = [];

    for (let i = 0; i < count; i++) {
        const randomString = generateRandomString(length, chars);
        strings.push(randomString);

        const stringItem = document.createElement('div');
        stringItem.className = 'string-item';
        stringItem.innerHTML = `
            <span class="string-item-text">${randomString}</span>
            <button class="string-item-copy" data-string="${randomString}"><i data-lucide="copy"></i> Copy</button>
        `;
        stringsOutput.appendChild(stringItem);
    }
    refreshIcons();

    // Add copy functionality to individual strings
    document.querySelectorAll('.string-item-copy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const stringToCopy = btn.dataset.string;
            try {
                await navigator.clipboard.writeText(stringToCopy);
                setBtn(btn, 'check', 'Copied!');
                btn.classList.add('copied');
                setTimeout(() => {
                    setBtn(btn, 'copy', 'Copy');
                    btn.classList.remove('copied');
                }, 2000);
            } catch (error) {
                console.error('Failed to copy:', error);
            }
        });
    });
}

generateStringsBtn.addEventListener('click', generateRandomStrings);

copyAllStringsBtn.addEventListener('click', async () => {
    const stringItems = document.querySelectorAll('.string-item-text');
    if (stringItems.length === 0) {
        return;
    }

    const allStrings = Array.from(stringItems).map(item => item.textContent).join('\n');

    try {
        await navigator.clipboard.writeText(allStrings);
        setBtn(copyAllStringsBtn, 'check', 'All Copied!');
        copyAllStringsBtn.classList.add('copied');
        setTimeout(() => {
            setBtn(copyAllStringsBtn, 'copy', 'Copy All');
            copyAllStringsBtn.classList.remove('copied');
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
});

// Base64 Tool (realtime encode/decode, UTF-8 safe)
(function initBase64() {
    const base64Input = document.getElementById('base64Input');
    const base64InputLabel = document.getElementById('base64InputLabel');
    const base64OutputValue = document.getElementById('base64OutputValue');
    const base64ResultLabel = document.getElementById('base64ResultLabel');
    const base64Error = document.getElementById('base64Error');
    const base64CopyBtn = document.getElementById('base64CopyBtn');
    const base64ClearBtn = document.getElementById('base64ClearBtn');
    const base64SwapBtn = document.getElementById('base64SwapBtn');
    const base64UrlSafe = document.getElementById('base64UrlSafe');
    const base64InputCount = document.getElementById('base64InputCount');
    const base64OutputCount = document.getElementById('base64OutputCount');
    const base64ModeBtns = document.querySelectorAll('.base64-mode-btn');

    if (!base64Input || !base64OutputValue) return;

    let base64Mode = 'encode';

    function encodeUnicode(str, urlSafe) {
        const bytes = new TextEncoder().encode(str);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        let out = btoa(binary);
        if (urlSafe) {
            out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        return out;
    }

    function decodeUnicode(input, urlSafeInput) {
        let s = input.trim().replace(/\s+/g, '');
        if (urlSafeInput || /[-_]/.test(s)) {
            s = s.replace(/-/g, '+').replace(/_/g, '/');
        }
        const pad = s.length % 4;
        if (pad === 1) {
            throw new Error('Invalid Base64: incorrect length.');
        }
        if (pad > 0) {
            s += '='.repeat(4 - pad);
        }
        if (s !== '' && !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
            throw new Error('Invalid Base64: contains illegal characters.');
        }
        const binary = atob(s);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }

    function updateBase64() {
        const text = base64Input.value;
        base64InputCount.textContent = `Input: ${text.length} chars`;
        if (base64CopyBtn.classList.contains('copied')) {
            setBtn(base64CopyBtn, 'copy', 'Copy to Clipboard');
            base64CopyBtn.classList.remove('copied');
        }

        if (!text) {
            base64OutputValue.textContent = '';
            base64Error.textContent = '';
            base64OutputCount.textContent = 'Output: 0 chars';
            return;
        }

        try {
            let result;
            if (base64Mode === 'encode') {
                result = encodeUnicode(text, base64UrlSafe.checked);
            } else {
                result = decodeUnicode(text, base64UrlSafe.checked);
            }
            base64OutputValue.textContent = result;
            base64OutputCount.textContent = `Output: ${result.length} chars`;
            base64Error.textContent = '';
        } catch (err) {
            base64OutputValue.textContent = '';
            base64OutputCount.textContent = 'Output: 0 chars';
            base64Error.textContent = err.message || 'Invalid Base64 input.';
        }
    }

    function updateBase64Labels() {
        if (base64Mode === 'encode') {
            base64InputLabel.textContent = 'Enter text to encode:';
            base64Input.placeholder = 'Type or paste your text here...';
            base64ResultLabel.textContent = 'Base64 Output:';
        } else {
            base64InputLabel.textContent = 'Enter Base64 to decode:';
            base64Input.placeholder = 'Paste Base64 string here...';
            base64ResultLabel.textContent = 'Decoded Output:';
        }
    }

    base64ModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            base64ModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            base64Mode = btn.dataset.mode;
            updateBase64Labels();
            updateBase64();
        });
    });

    base64Input.addEventListener('input', updateBase64);
    base64UrlSafe.addEventListener('change', updateBase64);

    base64SwapBtn.addEventListener('click', () => {
        if (base64Error.textContent || !base64OutputValue.textContent) return;
        base64Input.value = base64OutputValue.textContent;
        base64Mode = base64Mode === 'encode' ? 'decode' : 'encode';
        base64ModeBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.mode === base64Mode);
        });
        updateBase64Labels();
        updateBase64();
        base64Input.focus();
    });

    base64ClearBtn.addEventListener('click', () => {
        base64Input.value = '';
        updateBase64();
        base64Input.focus();
    });

    base64CopyBtn.addEventListener('click', async () => {
        const output = base64OutputValue.textContent;
        if (!output) return;
        try {
            await navigator.clipboard.writeText(output);
            setBtn(base64CopyBtn, 'check', 'Copied!');
            base64CopyBtn.classList.add('copied');
            setTimeout(() => {
                setBtn(base64CopyBtn, 'copy', 'Copy to Clipboard');
                base64CopyBtn.classList.remove('copied');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    });

    updateBase64Labels();
    updateBase64();
})();

// Char Count Tool (realtime statistics, Unicode-aware)
(function initCharCount() {
    const charInput = document.getElementById('charCountInput');
    if (!charInput) return;

    const statChars = document.getElementById('statChars');
    const statNoSpaces = document.getElementById('statNoSpaces');
    const statWords = document.getElementById('statWords');
    const statLines = document.getElementById('statLines');
    const statSentences = document.getElementById('statSentences');
    const statParagraphs = document.getElementById('statParagraphs');
    const charComposition = document.getElementById('charComposition');
    const charFreqOutput = document.getElementById('charFreqOutput');
    const charReadingTime = document.getElementById('charReadingTime');
    const charTotalBytes = document.getElementById('charTotalBytes');
    const charCopyBtn = document.getElementById('charCopyBtn');
    const charClearBtn = document.getElementById('charClearBtn');

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function charDisplayName(ch) {
        if (ch === ' ') return 'Space';
        if (ch === '\n') return 'New line';
        if (ch === '\t') return 'Tab';
        if (ch === '\r') return 'CR';
        if (/\s/.test(ch)) return 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        return ch;
    }

    function compRow(label, count, total) {
        const pct = total === 0 ? 0 : (count / total) * 100;
        return '<div class="char-comp-row">' +
            '<span class="char-comp-label">' + label + '</span>' +
            '<div class="char-comp-track"><div class="char-comp-fill" style="width: ' + pct.toFixed(1) + '%;"></div></div>' +
            '<span class="char-comp-count">' + count.toLocaleString() + '</span>' +
        '</div>';
    }

    function updateCharCount() {
        const text = charInput.value;
        const chars = Array.from(text);
        const total = chars.length;

        let noSpaces = 0;
        let upper = 0;
        let lower = 0;
        let otherLetters = 0;
        let digits = 0;
        let spaces = 0;
        let otherWs = 0;
        let symbols = 0;
        const freq = new Map();

        for (const ch of chars) {
            freq.set(ch, (freq.get(ch) || 0) + 1);
            if (/\s/.test(ch)) {
                if (ch === ' ') spaces++;
                else otherWs++;
            } else {
                noSpaces++;
                if (/\p{Lu}/u.test(ch)) upper++;
                else if (/\p{Ll}/u.test(ch)) lower++;
                else if (/\p{L}/u.test(ch)) otherLetters++;
                else if (/\p{N}/u.test(ch)) digits++;
                else symbols++;
            }
        }

        const words = (text.match(/\S+/g) || []).length;
        const lines = text === '' ? 0 : text.split('\n').length;
        const sentences = text.split(/[.!?…]+/).filter(s => s.trim().length > 0).length;
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

        statChars.textContent = total.toLocaleString();
        statNoSpaces.textContent = noSpaces.toLocaleString();
        statWords.textContent = words.toLocaleString();
        statLines.textContent = lines.toLocaleString();
        statSentences.textContent = sentences.toLocaleString();
        statParagraphs.textContent = paragraphs.toLocaleString();

        charComposition.innerHTML =
            compRow('Uppercase', upper, total) +
            compRow('Lowercase', lower, total) +
            compRow('Other letters', otherLetters, total) +
            compRow('Digits', digits, total) +
            compRow('Spaces', spaces, total) +
            compRow('Other whitespace', otherWs, total) +
            compRow('Symbols', symbols, total);

        if (total === 0) {
            charFreqOutput.innerHTML = '<div class="strings-empty">Type something to see per-character counts</div>';
        } else {
            const entries = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
            const shown = entries.slice(0, 100);
            charFreqOutput.innerHTML = shown.map(([ch, count]) => {
                const pct = (count / total) * 100;
                return '<div class="char-freq-item">' +
                    '<span class="char-freq-char">' + escapeHtml(charDisplayName(ch)) + '</span>' +
                    '<div class="char-comp-track"><div class="char-comp-fill" style="width: ' + pct.toFixed(1) + '%;"></div></div>' +
                    '<span class="char-freq-count">' + count.toLocaleString() + '</span>' +
                '</div>';
            }).join('') + (entries.length > 100
                ? '<div class="strings-empty">+' + (entries.length - 100).toLocaleString() + ' more characters</div>'
                : '');
        }

        const seconds = Math.round(words / 200 * 60);
        charReadingTime.textContent = seconds < 60
            ? 'Reading time: ' + seconds + ' sec'
            : 'Reading time: ~' + Math.round(seconds / 60) + ' min';
        charTotalBytes.textContent = 'UTF-8 size: ' + new TextEncoder().encode(text).length.toLocaleString() + ' bytes';

        if (charCopyBtn.classList.contains('copied')) {
            setBtn(charCopyBtn, 'copy', 'Copy Summary');
            charCopyBtn.classList.remove('copied');
        }
    }

    charInput.addEventListener('input', updateCharCount);

    charClearBtn.addEventListener('click', () => {
        charInput.value = '';
        updateCharCount();
        charInput.focus();
    });

    charCopyBtn.addEventListener('click', async () => {
        if (statChars.textContent === '0') return;
        const summary =
            'Characters (with spaces): ' + statChars.textContent + '\n' +
            'Characters (no spaces): ' + statNoSpaces.textContent + '\n' +
            'Words: ' + statWords.textContent + '\n' +
            'Lines: ' + statLines.textContent + '\n' +
            'Sentences: ' + statSentences.textContent + '\n' +
            'Paragraphs: ' + statParagraphs.textContent;
        try {
            await navigator.clipboard.writeText(summary);
            setBtn(charCopyBtn, 'check', 'Copied!');
            charCopyBtn.classList.add('copied');
            setTimeout(() => {
                setBtn(charCopyBtn, 'copy', 'Copy Summary');
                charCopyBtn.classList.remove('copied');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    });

    updateCharCount();
})();

// Convert Case Tool (realtime case conversions, Unicode-aware)
(function initCaseConverter() {
    const caseInput = document.getElementById('caseInput');
    if (!caseInput) return;

    const caseOutput = document.getElementById('caseOutput');
    const caseResultLabel = document.getElementById('caseResultLabel');
    const caseInputCount = document.getElementById('caseInputCount');
    const caseOutputCount = document.getElementById('caseOutputCount');
    const caseCopyBtn = document.getElementById('caseCopyBtn');
    const caseClearBtn = document.getElementById('caseClearBtn');
    const caseModeBtns = document.querySelectorAll('.case-option');

    let caseMode = 'upper';

    function splitWords(text) {
        const spaced = text
            .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
            .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2');
        return spaced.match(/[\p{L}\p{N}]+/gu) || [];
    }

    function capitalizeWord(word) {
        const chars = Array.from(word.toLowerCase());
        if (chars.length === 0) return '';
        return chars[0].toUpperCase() + chars.slice(1).join('');
    }

    function titleCase(text) {
        return text.replace(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu, word => capitalizeWord(word));
    }

    function sentenceCase(text) {
        return text.toLowerCase().replace(
            /(^\s*|[.!?…]\s+|\n\s*)(\p{Ll})/gu,
            (match, prefix, letter) => prefix + letter.toUpperCase()
        );
    }

    function toggleCase(text) {
        return text.replace(/\p{L}/gu, ch =>
            ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()
        );
    }

    function alternatingCase(text) {
        let letterIndex = 0;
        return Array.from(text).map(ch => {
            if (!/\p{L}/u.test(ch)) return ch;
            return letterIndex++ % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase();
        }).join('');
    }

    function lowerWords(text) {
        return splitWords(text).map(word => word.toLowerCase());
    }

    const caseConverters = {
        upper: { label: 'UPPERCASE', convert: text => text.toUpperCase() },
        lower: { label: 'lowercase', convert: text => text.toLowerCase() },
        title: { label: 'Title Case', convert: titleCase },
        sentence: { label: 'Sentence case', convert: sentenceCase },
        toggle: { label: 'tOGGLE cASE', convert: toggleCase },
        alternating: { label: 'aLtErNaTiNg cAsE', convert: alternatingCase },
        camel: {
            label: 'camelCase',
            convert: text => lowerWords(text)
                .map((word, i) => i === 0 ? word : capitalizeWord(word))
                .join('')
        },
        snake: { label: 'snake_case', convert: text => lowerWords(text).join('_') },
        kebab: { label: 'kebab-case', convert: text => lowerWords(text).join('-') },
        constant: {
            label: 'CONSTANT_CASE',
            convert: text => lowerWords(text).map(word => word.toUpperCase()).join('_')
        }
    };

    function updateCase() {
        const text = caseInput.value;
        caseInputCount.textContent = `Input: ${text.length} chars`;

        if (caseCopyBtn.classList.contains('copied')) {
            setBtn(caseCopyBtn, 'copy', 'Copy');
            caseCopyBtn.classList.remove('copied');
        }

        if (!text) {
            caseOutput.value = '';
            caseOutputCount.textContent = 'Output: 0 chars';
            return;
        }

        const converted = caseConverters[caseMode].convert(text);
        caseOutput.value = converted;
        caseOutputCount.textContent = `Output: ${converted.length} chars`;
    }

    caseModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            caseModeBtns.forEach(b => {
                const active = b === btn;
                b.classList.toggle('active', active);
                b.setAttribute('aria-pressed', String(active));
            });
            caseMode = btn.dataset.case;
            caseResultLabel.textContent = caseConverters[caseMode].label + ' Output:';
            updateCase();
        });
    });

    caseInput.addEventListener('input', updateCase);

    caseClearBtn.addEventListener('click', () => {
        caseInput.value = '';
        updateCase();
        caseInput.focus();
    });

    caseCopyBtn.addEventListener('click', async () => {
        if (!caseOutput.value) return;
        try {
            await navigator.clipboard.writeText(caseOutput.value);
            setBtn(caseCopyBtn, 'check', 'Copied!');
            caseCopyBtn.classList.add('copied');
            setTimeout(() => {
                setBtn(caseCopyBtn, 'copy', 'Copy');
                caseCopyBtn.classList.remove('copied');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    });

    updateCase();
})();

// Image <-> Base64 Tool (file encode, realtime decode, magic-byte sniffing)
(function initImageBase64() {
    const dropzone = document.getElementById('imageDropzone');
    if (!dropzone) return;

    const fileInput = document.getElementById('imageFileInput');
    const encodeMode = document.getElementById('imageEncodeMode');
    const decodeMode = document.getElementById('imageDecodeMode');
    const modeBtns = document.querySelectorAll('.image-mode-btn');
    const encodeError = document.getElementById('imageEncodeError');
    const encodeResult = document.getElementById('imageEncodeResult');
    const encodePreview = document.getElementById('imageEncodePreview');
    const encodePreviewBtn = document.getElementById('imageEncodePreviewBtn');
    const encodeInfo = document.getElementById('imageEncodeInfo');
    const encodeOutput = document.getElementById('imageEncodeOutput');
    const encodeOutputLabel = document.getElementById('imageEncodeOutputLabel');
    const dataUrlCheckbox = document.getElementById('imageDataUrl');
    const encodeCopyBtn = document.getElementById('imageEncodeCopyBtn');
    const encodeDownloadBtn = document.getElementById('imageEncodeDownloadBtn');
    const encodeClearBtn = document.getElementById('imageEncodeClearBtn');
    const decodeInput = document.getElementById('imageDecodeInput');
    const decodeError = document.getElementById('imageDecodeError');
    const decodeResult = document.getElementById('imageDecodeResult');
    const decodePreview = document.getElementById('imageDecodePreview');
    const decodePreviewBtn = document.getElementById('imageDecodePreviewBtn');
    const decodeInfo = document.getElementById('imageDecodeInfo');
    const decodeDownloadBtn = document.getElementById('imageDecodeDownloadBtn');
    const decodeClearBtn = document.getElementById('imageDecodeClearBtn');

    let currentDataUrl = '';
    let currentBaseName = 'image';
    let currentFileName = 'image';
    let currentFileSize = 0;
    let currentFileType = '';
    let currentDecodeDataUrl = '';
    let currentDecodeMeta = '';

    function formatBytes(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function infoRow(label, value) {
        return '<div class="image-info-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
    }

    // Identify image type from magic bytes (does not trust extensions/MIME)
    function sniffImageMime(bytes) {
        if (bytes.length >= 8 &&
            bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
            bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
            return 'image/png';
        }
        if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
            return 'image/jpeg';
        }
        if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
            bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
            return 'image/gif';
        }
        if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
            return 'image/webp';
        }
        if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4D) {
            return 'image/bmp';
        }
        return '';
    }

    function mimeToExt(mime) {
        const map = {
            'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
            'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
            'image/avif': 'avif', 'image/x-icon': 'ico'
        };
        return map[mime] || 'img';
    }

    function base64ToBytes(b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function loadPreview(img, src, ok, fail) {
        img.onload = () => ok(img.naturalWidth, img.naturalHeight);
        img.onerror = fail;
        img.src = src;
    }

    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const encode = btn.dataset.mode === 'encode';
            encodeMode.style.display = encode ? 'block' : 'none';
            decodeMode.style.display = encode ? 'none' : 'block';
        });
    });

    // ---- Encode ----
    function handleFile(file) {
        encodeError.textContent = '';
        if (!file) return;
        const looksImage = file.type
            ? file.type.startsWith('image/')
            : /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(file.name || '');
        if (!looksImage) {
            encodeError.textContent = 'Please select an image file (PNG, JPEG, GIF, WebP, SVG…).';
            return;
        }
        currentBaseName = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
        currentFileName = file.name || 'image';
        currentFileSize = file.size;
        currentFileType = file.type || '';
        const reader = new FileReader();
        reader.onload = () => {
            currentDataUrl = reader.result;
            loadPreview(encodePreview, currentDataUrl, (w, h) => {
                const raw = (currentDataUrl.split(',')[1] || '');
                encodeResult.style.display = 'block';
                let info = infoRow('File', file.name || 'pasted image') +
                    infoRow('Type', file.type || 'unknown') +
                    infoRow('Original size', formatBytes(file.size)) +
                    infoRow('Base64 size', raw.length.toLocaleString() + ' chars (~' + Math.round(raw.length / Math.max(file.size, 1) * 100) + '%)') +
                    infoRow('Dimensions', w.toLocaleString() + ' × ' + h.toLocaleString() + ' px');
                if (raw.length > 2000000) {
                    info += infoRow('Note', 'Large output — copying may be slow');
                }
                encodeInfo.innerHTML = info;
                renderEncodeOutput();
                encodeResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, () => {
                encodeError.textContent = 'Could not display that file as an image.';
                encodeResult.style.display = 'none';
            });
        };
        reader.onerror = () => {
            encodeError.textContent = 'Could not read the file.';
        };
        reader.readAsDataURL(file);
    }

    function renderEncodeOutput() {
        const withPrefix = dataUrlCheckbox.checked;
        encodeOutput.value = withPrefix ? currentDataUrl : (currentDataUrl.split(',')[1] || '');
        encodeOutputLabel.textContent = withPrefix ? 'Data URL output:' : 'Raw Base64 output:';
    }

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
    fileInput.addEventListener('change', () => {
        handleFile(fileInput.files[0]);
        fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
    }));
    dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    dataUrlCheckbox.addEventListener('change', renderEncodeOutput);

    encodePreviewBtn.addEventListener('click', () => {
        if (!currentDataUrl) return;
        const dataUrl = currentDataUrl;
        const fileName = currentFileName;
        const dims = encodePreview.naturalWidth && encodePreview.naturalHeight
            ? encodePreview.naturalWidth.toLocaleString() + ' × ' + encodePreview.naturalHeight.toLocaleString() + ' px'
            : '';
        window.ImagePreview.open({
            src: dataUrl,
            name: fileName,
            meta: [currentFileType, dims, currentFileSize ? formatBytes(currentFileSize) : ''].filter(Boolean).join(' · '),
            onDownload: () => {
                const anchor = document.createElement('a');
                anchor.href = dataUrl;
                anchor.download = fileName || 'image';
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
            }
        });
    });

    encodeCopyBtn.addEventListener('click', async () => {
        if (!encodeOutput.value) return;
        try {
            await navigator.clipboard.writeText(encodeOutput.value);
            setBtn(encodeCopyBtn, 'check', 'Copied!');
            setTimeout(() => setBtn(encodeCopyBtn, 'copy', 'Copy'), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    });

    encodeDownloadBtn.addEventListener('click', () => {
        if (!encodeOutput.value) return;
        const blob = new Blob([encodeOutput.value], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentBaseName + '.b64.txt';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    encodeClearBtn.addEventListener('click', () => {
        currentDataUrl = '';
        currentFileName = 'image';
        currentFileSize = 0;
        currentFileType = '';
        encodeOutput.value = '';
        encodeResult.style.display = 'none';
        encodeError.textContent = '';
    });

    // ---- Decode (realtime) ----
    function updateDecode() {
        const rawInput = decodeInput.value.trim();
        decodeError.textContent = '';
        decodeResult.style.display = 'none';
        currentDecodeDataUrl = '';
        currentDecodeMeta = '';
        if (!rawInput) return;

        let mime = '';
        let b64 = rawInput.replace(/\s+/g, '');
        const dm = b64.match(/^data:([^;,]+)?;base64,([\s\S]*)$/);
        if (dm) {
            mime = dm[1] || '';
            b64 = dm[2];
        }
        if (b64.length % 4 === 1 || (b64 !== '' && !/^[A-Za-z0-9+/]*={0,2}$/.test(b64))) {
            decodeError.textContent = 'Invalid Base64: contains illegal characters.';
            return;
        }
        let bytes;
        try {
            bytes = base64ToBytes(b64);
        } catch (err) {
            decodeError.textContent = 'Invalid Base64 input.';
            return;
        }
        if (bytes.length === 0) {
            decodeError.textContent = 'Nothing to decode.';
            return;
        }

        const sniffed = sniffImageMime(bytes);
        if (sniffed) {
            mime = sniffed;
        } else if (!mime || !mime.startsWith('image/')) {
            // Text-based formats (e.g. SVG) have no magic bytes — sniff markup instead
            let isSvg = false;
            if (bytes.length < 2000000) {
                try {
                    isSvg = /^\s*<svg[\s>]/.test(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
                } catch (err) { isSvg = false; }
            }
            if (isSvg) {
                mime = 'image/svg+xml';
            } else {
                decodeError.textContent = 'Decoded data is not a recognized image (PNG, JPEG, GIF, WebP, BMP, SVG).';
                return;
            }
        }

        const dataUrl = 'data:' + mime + ';base64,' + b64;
        loadPreview(decodePreview, dataUrl, (w, h) => {
            currentDecodeDataUrl = dataUrl;
            currentDecodeMeta = [mime, formatBytes(bytes.length), w.toLocaleString() + ' × ' + h.toLocaleString() + ' px'].join(' · ');
            decodeInfo.innerHTML = infoRow('Detected type', mime) +
                infoRow('Decoded size', formatBytes(bytes.length)) +
                infoRow('Dimensions', w.toLocaleString() + ' × ' + h.toLocaleString() + ' px');
            decodeDownloadBtn.href = dataUrl;
            decodeDownloadBtn.download = 'decoded-image.' + mimeToExt(mime);
            decodeResult.style.display = 'block';
        }, () => {
            decodeError.textContent = 'Decoded data could not be displayed as an image.';
        });
    }

    decodeInput.addEventListener('input', updateDecode);

    decodePreviewBtn.addEventListener('click', () => {
        if (!currentDecodeDataUrl) return;
        window.ImagePreview.open({
            src: currentDecodeDataUrl,
            name: 'Decoded image',
            meta: currentDecodeMeta,
            onDownload: () => decodeDownloadBtn.click()
        });
    });

    decodeClearBtn.addEventListener('click', () => {
        decodeInput.value = '';
        updateDecode();
        decodeInput.focus();
    });
})();

// Image Resizer Tool (bulk client-side resizing, conversion and export)
(function initImageResizer() {
    const app = document.getElementById('resizeApp');
    if (!app) return;

    const dropzone = document.getElementById('resizeDropzone');
    const fileInput = document.getElementById('resizeFileInput');
    const addBtn = document.getElementById('resizeAddBtn');
    const emptyAddBtn = document.getElementById('resizeEmptyAddBtn');
    const clearAllBtn = document.getElementById('resizeClearAllBtn');
    const workspace = document.getElementById('resizeWorkspace');
    const grid = document.getElementById('resizeGrid');
    const emptyState = document.getElementById('resizeEmpty');
    const countEl = document.getElementById('resizeCount');
    const workspaceSub = document.getElementById('resizeWorkspaceSub');
    const totalSizeEl = document.getElementById('resizeTotalSize');
    const statusEl = document.getElementById('resizeStatus');
    const errorEl = document.getElementById('resizeError');
    const modeTabs = document.querySelectorAll('.resize-mode-tab');
    const modePanels = document.querySelectorAll('.resize-mode-panel');
    const widthInput = document.getElementById('resizeWidth');
    const heightInput = document.getElementById('resizeHeight');
    const lockAspect = document.getElementById('resizeLockAspect');
    const sizeHint = document.getElementById('resizeSizeHint');
    const percentageInput = document.getElementById('resizePercentage');
    const percentageValue = document.getElementById('resizePercentageValue');
    const percentageBtns = document.querySelectorAll('.resize-percentage-btn');
    const socialSelect = document.getElementById('resizeSocialPreset');
    const socialPreview = document.getElementById('resizeSocialPreview');
    const targetInput = document.getElementById('resizeTargetSize');
    const targetHint = document.getElementById('resizeTargetHint');
    const formatSelect = document.getElementById('resizeFormat');
    const qualityGroup = document.getElementById('resizeQualityGroup');
    const qualityInput = document.getElementById('resizeQuality');
    const qualityValue = document.getElementById('resizeQualityValue');
    const exportBtn = document.getElementById('resizeExportBtn');
    const exportHint = document.getElementById('resizeExportHint');

    const MAX_DIMENSION = 10000;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const MAX_FILES = 50;
    const MAX_TARGET_KB = 51200;
    const FORMAT_LABELS = {
        'image/png': 'PNG',
        'image/jpeg': 'JPG',
        'image/webp': 'WebP',
        'image/gif': 'GIF',
        'image/bmp': 'BMP',
        'image/svg+xml': 'SVG',
        'image/avif': 'AVIF',
        'image/x-icon': 'ICO',
        'image/vnd.microsoft.icon': 'ICO'
    };
    const EXTENSIONS = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/svg+xml': 'svg',
        'image/avif': 'avif',
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico'
    };

    let mode = 'size';
    let items = [];
    let nextId = 1;
    let currentResolved = null;
    let processTimer = null;
    let processGeneration = 0;
    let isExporting = false;
    let errorTimer = null;

    function formatBytes(n) {
        if (!Number.isFinite(n)) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function mimeLabel(mime) {
        return FORMAT_LABELS[mime] || (mime ? mime.replace('image/', '').toUpperCase() : '—');
    }

    function extensionForMime(mime) {
        return EXTENSIONS[mime] || 'png';
    }

    function detectMime(file) {
        const type = (file.type || '').toLowerCase();
        if (type === 'image/jpg') return 'image/jpeg';
        if (type.startsWith('image/')) return type;
        const ext = (file.name || '').split('.').pop().toLowerCase();
        const byExtension = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            gif: 'image/gif',
            bmp: 'image/bmp',
            svg: 'image/svg+xml',
            avif: 'image/avif',
            ico: 'image/x-icon'
        };
        return byExtension[ext] || '';
    }

    function fitWithin(width, height, limit) {
        const scale = Math.min(1, limit / Math.max(width, height));
        return {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale))
        };
    }

    function parseDimension(raw, label) {
        const value = String(raw || '').trim();
        if (value === '') return { value: null, error: '' };
        const number = Number(value);
        if (!Number.isFinite(number) || number < 1) {
            return { value: null, error: label + ' must be at least 1 px.' };
        }
        if (number > MAX_DIMENSION) {
            return { value: null, error: label + ' cannot exceed ' + MAX_DIMENSION.toLocaleString() + ' px.' };
        }
        return { value: Math.round(number), error: '' };
    }

    function getSocialSize() {
        const parts = String(socialSelect.value || '').split('x').map(Number);
        if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) ||
            parts[0] < 1 || parts[1] < 1) {
            return null;
        }
        return { width: parts[0], height: parts[1] };
    }

    function resolveSettings() {
        const settings = {
            mode: mode,
            width: null,
            height: null,
            widthError: '',
            heightError: '',
            sizeError: '',
            targetError: '',
            lock: lockAspect.checked,
            percentage: Number(percentageInput.value),
            socialWidth: 0,
            socialHeight: 0,
            format: formatSelect.value,
            quality: Number(qualityInput.value),
            targetKb: targetInput.value.trim(),
            targetBytes: null,
            error: ''
        };

        if (settings.mode === 'size') {
            const width = parseDimension(widthInput.value, 'Width');
            const height = parseDimension(heightInput.value, 'Height');
            settings.width = width.value;
            settings.height = height.value;
            settings.widthError = width.error;
            settings.heightError = height.error;
            settings.sizeError = width.error || height.error;
        } else if (settings.mode === 'percentage') {
            if (!Number.isFinite(settings.percentage) || settings.percentage < 5 || settings.percentage > 200) {
                settings.sizeError = 'Percentage must be between 5% and 200%.';
            }
        } else {
            const social = getSocialSize();
            if (!social) {
                settings.sizeError = 'Choose a valid social media preset.';
            } else {
                settings.socialWidth = social.width;
                settings.socialHeight = social.height;
            }
        }

        if (settings.format === 'image/jpeg' && settings.targetKb !== '') {
            const kb = Number(settings.targetKb);
            if (!Number.isFinite(kb) || kb < 1) {
                settings.targetError = 'Target file size must be at least 1 KB.';
            } else if (kb > MAX_TARGET_KB) {
                settings.targetError = 'Target file size cannot exceed ' + MAX_TARGET_KB.toLocaleString() + ' KB.';
            } else {
                settings.targetBytes = Math.round(kb * 1024);
            }
        }

        settings.error = settings.sizeError || settings.targetError;
        return settings;
    }

    function computeTarget(item, settings) {
        if (!item.image || !item.width || !item.height || settings.sizeError) return null;

        let width;
        let height;

        if (settings.mode === 'size') {
            const boxWidth = settings.width;
            const boxHeight = settings.height;

            if (boxWidth === null && boxHeight === null) {
                width = item.width;
                height = item.height;
            } else if (boxWidth !== null && boxHeight === null) {
                width = boxWidth;
                height = Math.max(1, Math.round(item.height * boxWidth / item.width));
            } else if (boxWidth === null && boxHeight !== null) {
                height = boxHeight;
                width = Math.max(1, Math.round(item.width * boxHeight / item.height));
            } else if (settings.lock) {
                const scale = Math.min(boxWidth / item.width, boxHeight / item.height);
                width = Math.max(1, Math.round(item.width * scale));
                height = Math.max(1, Math.round(item.height * scale));
            } else {
                width = boxWidth;
                height = boxHeight;
            }
        } else if (settings.mode === 'percentage') {
            width = Math.max(1, Math.round(item.width * settings.percentage / 100));
            height = Math.max(1, Math.round(item.height * settings.percentage / 100));
        } else {
            width = settings.socialWidth;
            height = settings.socialHeight;
        }

        return fitWithin(width, height, MAX_DIMENSION);
    }

    function getSettingsSignature(settings) {
        const parts = [settings.mode, settings.format];
        if (settings.format === 'image/jpeg' || settings.format === 'image/webp') {
            parts.push(settings.quality);
        }
        parts.push(settings.targetBytes);
        if (settings.mode === 'size') {
            parts.push(settings.width, settings.height, settings.lock ? 1 : 0);
        } else if (settings.mode === 'percentage') {
            parts.push(settings.percentage);
        } else {
            parts.push(settings.socialWidth, settings.socialHeight);
        }
        return parts.join('|');
    }

    function showError(message) {
        errorEl.textContent = message || '';
        clearTimeout(errorTimer);
        if (message) {
            errorTimer = setTimeout(() => {
                errorEl.textContent = '';
            }, 9000);
        }
    }

    function setStatus(message, tone) {
        statusEl.textContent = message || '';
        statusEl.className = 'resize-status' + (tone ? ' ' + tone : '');
    }

    function statusInfo(item) {
        if (item.status === 'loading') return { text: 'Loading', className: 'loading' };
        if (item.status === 'processing') return { text: 'Resizing', className: 'processing' };
        if (item.status === 'invalid') return { text: 'Check settings', className: 'warning' };
        if (item.status === 'error') return { text: 'Failed', className: 'error' };
        if (item.status === 'ready') {
            return item.targetMissed
                ? { text: 'Over target', className: 'warning' }
                : { text: 'Ready', className: 'ready' };
        }
        return { text: 'Queued', className: 'queued' };
    }

    function cardHtml(item) {
        const settings = currentResolved || resolveSettings();
        const target = computeTarget(item, settings);
        const newDimensions = target
            ? target.width.toLocaleString() + ' × ' + target.height.toLocaleString()
            : '—';
        const originalDimensions = item.image
            ? item.width.toLocaleString() + ' × ' + item.height.toLocaleString()
            : '—';
        const status = statusInfo(item);
        const thumbUrl = item.outputUrl || item.sourceUrl;
        const format = item.status === 'ready' && item.outputMime
            ? mimeLabel(item.outputMime)
            : (item.mime ? mimeLabel(item.mime) : '—');
        const outputSize = item.status === 'ready' && item.outputBlob
            ? formatBytes(item.outputBlob.size)
            : '—';
        const canDownload = item.status === 'ready' && item.outputBlob && !settings.error;

        return '<article class="resize-card" data-id="' + item.id + '" role="listitem">' +
            '<div class="resize-card-preview">' +
                (thumbUrl
                    ? '<img src="' + escapeHtml(thumbUrl) + '" alt="' + escapeHtml(item.name) + ' preview">' +
                        '<button type="button" class="image-preview-trigger" data-action="preview" aria-label="Preview ' + escapeHtml(item.name) + '" title="Preview image"><i data-lucide="zoom-in"></i></button>'
                    : '<i data-lucide="image"></i>') +
                '<span class="resize-card-format" data-role="format">' + escapeHtml(format) + '</span>' +
                '<button type="button" class="resize-card-remove" data-action="remove" aria-label="Remove ' + escapeHtml(item.name) + '"><i data-lucide="x"></i></button>' +
            '</div>' +
            '<div class="resize-card-info">' +
                '<div class="resize-card-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
                '<div class="resize-card-meta">' +
                    '<div class="resize-card-meta-row"><span>Original</span><strong data-role="original">' + originalDimensions + '</strong></div>' +
                    '<div class="resize-card-meta-row"><span>New</span><strong data-role="dims">' + newDimensions + '</strong></div>' +
                '</div>' +
                '<div class="resize-card-footer">' +
                    '<span class="resize-card-size" data-role="size">' + formatBytes(item.size) + ' → ' + outputSize + '</span>' +
                    '<div class="resize-card-tools">' +
                        '<span class="resize-card-status ' + status.className + '" data-role="status">' + status.text + '</span>' +
                        '<button type="button" class="resize-card-download" data-action="download" aria-label="Download ' + escapeHtml(item.name) + '" title="Download this image"' + (canDownload ? '' : ' disabled') + '><i data-lucide="download"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</article>';
    }

    function updateCard(item) {
        const card = grid.querySelector('.resize-card[data-id="' + item.id + '"]');
        if (!card) return;

        const settings = currentResolved || resolveSettings();
        const target = computeTarget(item, settings);
        const status = statusInfo(item);
        const thumbUrl = item.outputUrl || item.sourceUrl;
        const preview = card.querySelector('.resize-card-preview img');
        const format = card.querySelector('[data-role="format"]');
        const original = card.querySelector('[data-role="original"]');
        const dimensions = card.querySelector('[data-role="dims"]');
        const size = card.querySelector('[data-role="size"]');
        const statusElCard = card.querySelector('[data-role="status"]');
        const download = card.querySelector('[data-action="download"]');

        card.classList.toggle('is-loading', item.status === 'loading');
        card.classList.toggle('is-ready', item.status === 'ready');
        card.classList.toggle('is-error', item.status === 'error');

        if (preview && thumbUrl && preview.getAttribute('src') !== thumbUrl) {
            preview.src = thumbUrl;
        }
        if (format) {
            format.textContent = item.status === 'ready' && item.outputMime
                ? mimeLabel(item.outputMime)
                : (item.mime ? mimeLabel(item.mime) : '—');
        }
        if (original) {
            original.textContent = item.image
                ? item.width.toLocaleString() + ' × ' + item.height.toLocaleString()
                : '—';
        }
        if (dimensions) {
            dimensions.textContent = target
                ? target.width.toLocaleString() + ' × ' + target.height.toLocaleString()
                : '—';
        }
        if (size) {
            const outputSize = item.status === 'ready' && item.outputBlob
                ? formatBytes(item.outputBlob.size)
                : '—';
            size.textContent = formatBytes(item.size) + ' → ' + outputSize;
        }
        if (statusElCard) {
            statusElCard.className = 'resize-card-status ' + status.className;
            statusElCard.textContent = status.text;
            statusElCard.title = item.error ||
                (item.targetMissed ? 'The target size could not be reached even at the lowest quality.' : '');
        }
        if (download) {
            download.disabled = !(item.status === 'ready' && item.outputBlob && !settings.error);
        }
    }

    function updateSummary() {
        const ready = items.filter(item => item.status === 'ready').length;
        const sourceBytes = items.reduce((sum, item) => sum + item.size, 0);
        const outputBytes = items.reduce((sum, item) => sum + (item.outputBlob ? item.outputBlob.size : 0), 0);

        if (items.length) {
            workspaceSub.textContent = ready === items.length
                ? items.length + (items.length === 1 ? ' image ready' : ' images ready') + ' · max 10 MB each'
                : ready + ' of ' + items.length + ' ready · max 10 MB each';
            totalSizeEl.textContent = ready === items.length && outputBytes
                ? formatBytes(outputBytes) + ' output'
                : formatBytes(sourceBytes) + ' source';
        } else {
            workspaceSub.textContent = 'Add images to resize them in bulk.';
            totalSizeEl.textContent = '';
        }
    }

    function updateExportState() {
        const settings = currentResolved || resolveSettings();
        const hasImage = items.some(item => item.image);
        const loading = items.some(item => item.status === 'loading');
        const canExport = hasImage && !isExporting && !settings.error && !loading;

        exportBtn.disabled = !canExport;
        clearAllBtn.disabled = items.length === 0 || isExporting;

        if (isExporting) {
            exportHint.textContent = 'Preparing your download…';
            return;
        }
        if (!items.length) {
            exportHint.textContent = 'Add images to enable export.';
            return;
        }
        if (settings.error) {
            exportHint.textContent = settings.error;
            return;
        }
        if (loading) {
            exportHint.textContent = 'Waiting for images to load…';
            return;
        }

        const label = settings.format === 'image/jpeg'
            ? 'JPG'
            : settings.format === 'image/png' ? 'PNG' : 'WebP';
        const detail = settings.targetBytes
            ? 'target ' + formatBytes(settings.targetBytes)
            : (settings.format === 'image/jpeg' || settings.format === 'image/webp')
                ? settings.quality + '% quality'
                : 'lossless';
        exportHint.textContent = items.length + (items.length === 1 ? ' image' : ' images') +
            ' · ' + label + ' · ' + detail + (items.length > 1 ? ' · ZIP' : '');
    }

    function updateWorkspaceMeta() {
        countEl.textContent = items.length;
        emptyState.hidden = items.length > 0;
        grid.hidden = items.length === 0;
        updateSummary();
        updateExportState();
    }

    function updateSettingsUI() {
        const settings = resolveSettings();
        currentResolved = settings;

        modeTabs.forEach(tab => {
            const active = tab.dataset.mode === mode;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        modePanels.forEach(panel => {
            panel.hidden = panel.dataset.panel !== mode;
        });

        percentageValue.textContent = percentageInput.value + '%';
        percentageBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.percentage === percentageInput.value);
        });

        const social = getSocialSize();
        socialPreview.textContent = social
            ? social.width.toLocaleString() + ' × ' + social.height.toLocaleString() + ' px · center crop'
            : 'Choose a preset';

        widthInput.classList.toggle('invalid', !!settings.widthError);
        heightInput.classList.toggle('invalid', !!settings.heightError);

        let hint = '';
        if (settings.sizeError) {
            hint = settings.sizeError;
        } else if (settings.width === null && settings.height === null) {
            hint = 'Leave both fields blank to keep each image\'s original size.';
        } else if (settings.width === null || settings.height === null) {
            hint = 'The missing dimension is calculated from each image\'s aspect ratio.';
        } else if (settings.lock) {
            hint = 'Images scale to fit inside these bounds without distortion.';
        } else {
            hint = 'Images are stretched to exactly these dimensions.';
        }
        sizeHint.textContent = hint;
        sizeHint.classList.toggle('invalid', !!settings.sizeError);

        const showQuality = settings.format === 'image/jpeg' || settings.format === 'image/webp';
        const targetEnabled = settings.format === 'image/jpeg';
        const automaticQuality = targetEnabled && settings.targetBytes !== null;

        qualityGroup.hidden = !showQuality || automaticQuality;
        qualityGroup.classList.toggle('is-auto', automaticQuality);
        qualityInput.disabled = isExporting || automaticQuality;
        qualityValue.textContent = qualityInput.value + '%';

        targetInput.disabled = !targetEnabled || isExporting;
        targetInput.classList.toggle('invalid', targetEnabled && !!settings.targetError);
        targetHint.classList.toggle('invalid', targetEnabled && !!settings.targetError);
        if (!targetEnabled) {
            targetHint.textContent = 'Only applies to JPG output.';
        } else if (settings.targetError) {
            targetHint.textContent = settings.targetError;
        } else if (automaticQuality) {
            targetHint.textContent = 'Automatic quality will be used to reach ' + formatBytes(settings.targetBytes) + '.';
        } else {
            targetHint.textContent = 'Optional — leave blank to use the quality slider.';
        }

        items.forEach(updateCard);
        updateExportState();
    }

    function setMode(nextMode) {
        if (isExporting || mode === nextMode) return;
        mode = nextMode;
        settingsChanged();
    }

    function settingsChanged() {
        if (isExporting) return;
        clearTimeout(processTimer);
        currentResolved = resolveSettings();

        if (currentResolved.error) {
            items.forEach(item => {
                if (item.image && item.status !== 'loading' && item.status !== 'processing') {
                    item.status = 'invalid';
                    updateCard(item);
                }
            });
        } else {
            items.forEach(item => {
                if (item.image && item.status !== 'loading' && item.status !== 'processing') {
                    item.status = 'idle';
                    item.error = '';
                    updateCard(item);
                }
            });
        }

        updateSettingsUI();
        updateSummary();
        scheduleProcess();
    }

    function scheduleProcess() {
        if (isExporting) return;
        clearTimeout(processTimer);
        processTimer = setTimeout(() => {
            processAll();
        }, 240);
    }

    function makeSignature(settings) {
        return getSettingsSignature(settings);
    }

    function canvasToBlob(canvas, mime, quality, isCurrent) {
        return new Promise((resolve, reject) => {
            try {
                canvas.toBlob(blob => {
                    if (!isCurrent()) {
                        resolve(null);
                        return;
                    }
                    if (!blob) {
                        reject(new Error('This image could not be encoded. Try a smaller size.'));
                        return;
                    }
                    resolve(blob);
                }, mime, quality);
            } catch (err) {
                reject(new Error('This image is too large to process in your browser.'));
            }
        });
    }

    async function encodeJpegToTarget(canvas, targetBytes, isCurrent) {
        let low = 0.1;
        let high = 0.92;
        let best = null;

        let blob = await canvasToBlob(canvas, 'image/jpeg', high, isCurrent);
        if (!blob) return null;
        if (blob.size <= targetBytes) {
            return { blob: blob, quality: Math.round(high * 100), met: true };
        }

        for (let i = 0; i < 7; i++) {
            if (!isCurrent()) return null;
            const mid = (low + high) / 2;
            blob = await canvasToBlob(canvas, 'image/jpeg', mid, isCurrent);
            if (!blob) break;
            if (blob.size <= targetBytes) {
                best = { blob: blob, quality: Math.round(mid * 100) };
                low = mid;
            } else {
                high = mid;
            }
        }

        if (!best) {
            blob = await canvasToBlob(canvas, 'image/jpeg', low, isCurrent);
            if (blob) {
                best = { blob: blob, quality: Math.round(low * 100) };
            }
        }

        if (!best) return null;
        return {
            blob: best.blob,
            quality: best.quality,
            met: best.blob.size <= targetBytes
        };
    }

    function drawSocialCrop(ctx, image, width, height) {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const targetRatio = width / height;
        const sourceRatio = sourceWidth / sourceHeight;
        let sx = 0;
        let sy = 0;
        let sw = sourceWidth;
        let sh = sourceHeight;

        if (sourceRatio > targetRatio) {
            sw = sourceHeight * targetRatio;
            sx = (sourceWidth - sw) / 2;
        } else if (sourceRatio < targetRatio) {
            sh = sourceWidth / targetRatio;
            sy = (sourceHeight - sh) / 2;
        }

        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    }

    async function processItem(item, settings, isCurrent) {
        const target = computeTarget(item, settings);
        if (!target) {
            throw new Error(settings.sizeError || 'Could not calculate the output size.');
        }

        if (!isCurrent() || !items.includes(item)) return null;

        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('This image is too large to resize in your browser.');
        }

        if (settings.format === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, target.width, target.height);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (settings.mode === 'social') {
            drawSocialCrop(ctx, item.image, target.width, target.height);
        } else {
            ctx.drawImage(item.image, 0, 0, target.width, target.height);
        }

        let blob = null;
        let qualityUsed = settings.quality;
        let targetMissed = false;

        if (settings.format === 'image/jpeg' && settings.targetBytes) {
            const result = await encodeJpegToTarget(canvas, settings.targetBytes, isCurrent);
            if (!result) return null;
            if (!isCurrent() || !items.includes(item)) return null;
            blob = result.blob;
            qualityUsed = result.quality;
            targetMissed = !result.met;
        } else {
            blob = await canvasToBlob(
                canvas,
                settings.format,
                Math.min(1, Math.max(0.1, settings.quality / 100)),
                isCurrent
            );
            if (!blob) return null;
            if (!isCurrent() || !items.includes(item)) return null;
        }

        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
        item.outputBlob = blob;
        item.outputMime = blob.type || settings.format;
        item.outputQuality = qualityUsed;
        item.outputWidth = target.width;
        item.outputHeight = target.height;
        item.outputUrl = URL.createObjectURL(blob);
        item.targetMissed = targetMissed;
        item.status = 'ready';
        item.error = '';
        item.signature = makeSignature(settings);

        updateCard(item);
        updateSummary();
        return item;
    }

    async function processAll() {
        if (isExporting) return;

        const settings = resolveSettings();
        currentResolved = settings;
        updateSettingsUI();

        if (!items.length) {
            updateWorkspaceMeta();
            return;
        }
        if (settings.sizeError || settings.targetError) {
            setStatus(settings.error, 'error');
            updateExportState();
            return;
        }

        const loaded = items.filter(item => item.image);
        if (!loaded.length) {
            setStatus('Waiting for images to load…', 'busy');
            return;
        }

        const token = ++processGeneration;
        const signature = makeSignature(settings);
        const pending = loaded.filter(item => {
            return !(item.status === 'ready' && item.signature === signature);
        });

        if (!pending.length) {
            updateSummary();
            updateExportState();
            const loading = items.filter(item => item.status === 'loading').length;
            const failed = items.filter(item => item.status === 'error').length;
            if (loading) {
                setStatus(
                    'Resized ' + (items.length - loading - failed) + ' of ' + items.length +
                    ' images so far…',
                    'busy'
                );
            } else if (failed) {
                setStatus(failed + (failed === 1 ? ' image could not be processed.' : ' images could not be processed.'), 'warning');
            } else {
                setStatus('All images are ready to export.', 'success');
            }
            return;
        }

        pending.forEach(item => {
            item.status = 'processing';
            item.error = '';
            updateCard(item);
        });
        updateSummary();
        setStatus('Resizing ' + pending.length + (pending.length === 1 ? ' image' : ' images') + '…', 'busy');

        for (const item of pending) {
            if (token !== processGeneration || isExporting) return;
            if (!items.includes(item)) continue;

            try {
                const result = await processItem(
                    item,
                    settings,
                    () => token === processGeneration && !isExporting
                );
                if (!result) return;
            } catch (err) {
                if (token !== processGeneration) return;
                item.status = 'error';
                item.error = err && err.message ? err.message : 'Could not resize this image.';
            }
            updateCard(item);
            updateSummary();
            if (token !== processGeneration) return;
        }

        updateSummary();
        updateExportState();
        const loading = items.filter(item => item.status === 'loading').length;
        const failed = items.filter(item => item.status === 'error').length;
        if (loading) {
            setStatus(
                'Resized ' + (items.length - loading - failed) + ' of ' + items.length +
                ' images so far…',
                'busy'
            );
        } else if (failed) {
            setStatus(
                'Resized ' + (items.length - failed) + ' of ' + items.length + ' images. ' +
                failed + (failed === 1 ? ' image failed.' : ' images failed.'),
                'warning'
            );
        } else {
            setStatus(
                'Resized ' + items.length + (items.length === 1 ? ' image' : ' images') +
                ' locally in your browser.',
                'success'
            );
        }
    }

    function addItem(file, mime) {
        const item = {
            id: 'r' + (nextId++),
            name: file.name || 'image',
            size: file.size,
            mime: mime,
            width: 0,
            height: 0,
            image: null,
            sourceUrl: URL.createObjectURL(file),
            outputUrl: '',
            outputBlob: null,
            outputMime: '',
            outputWidth: 0,
            outputHeight: 0,
            outputQuality: 0,
            status: 'loading',
            error: '',
            signature: '',
            targetMissed: false
        };

        items.push(item);

        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            if (!items.includes(item)) {
                URL.revokeObjectURL(item.sourceUrl);
                return;
            }
            if (!image.naturalWidth || !image.naturalHeight) {
                item.status = 'error';
                item.error = 'Could not determine this image\'s dimensions.';
                updateCard(item);
                updateWorkspaceMeta();
                return;
            }
            item.image = image;
            item.width = image.naturalWidth;
            item.height = image.naturalHeight;
            item.status = 'idle';
            updateCard(item);
            updateWorkspaceMeta();
            scheduleProcess();
        };
        image.onerror = () => {
            if (!items.includes(item)) return;
            item.status = 'error';
            item.error = 'This image could not be decoded by your browser.';
            updateCard(item);
            updateWorkspaceMeta();
        };
        image.src = item.sourceUrl;
    }

    function addFiles(fileList) {
        if (isExporting) return;
        const files = Array.from(fileList || []);
        if (!files.length) return;

        showError('');
        const notices = [];
        let accepted = 0;

        files.forEach(file => {
            if (items.length >= MAX_FILES) {
                if (!notices.includes('You can add up to ' + MAX_FILES + ' images at a time.')) {
                    notices.push('You can add up to ' + MAX_FILES + ' images at a time.');
                }
                return;
            }

            const mime = detectMime(file);
            if (!mime) {
                notices.push('"' + file.name + '" is not a supported image.');
                return;
            }
            if (file.size > MAX_FILE_SIZE) {
                notices.push('"' + file.name + '" is larger than 10 MB.');
                return;
            }
            if (!file.size) {
                notices.push('"' + file.name + '" is empty.');
                return;
            }

            addItem(file, mime);
            accepted++;
        });

        if (notices.length) {
            showError(notices.slice(0, 4).join(' ') + (notices.length > 4 ? ' …' : ''));
        }

        if (accepted) {
            renderGrid();
            updateSettingsUI();
            scheduleProcess();
            setStatus(accepted + (accepted === 1 ? ' image added.' : ' images added.'), 'success');
        } else {
            updateWorkspaceMeta();
        }
    }

    function renderGrid() {
        grid.innerHTML = items.map(cardHtml).join('');
        refreshIcons();
        updateWorkspaceMeta();
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function buildOutputName(item) {
        const base = (item.name || 'image').replace(/\.[^.]+$/, '') || 'image';
        const safe = base.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'image';
        const extension = extensionForMime(item.outputMime || 'image/png');
        return safe + '-' + item.outputWidth + 'x' + item.outputHeight + '.' + extension;
    }

    function uniqueName(name, used) {
        let candidate = name;
        let counter = 2;
        while (used.has(candidate.toLowerCase())) {
            const dot = name.lastIndexOf('.');
            const suffix = '-' + counter;
            candidate = dot > 0
                ? name.slice(0, dot) + suffix + name.slice(dot)
                : name + suffix;
            counter++;
        }
        used.add(candidate.toLowerCase());
        return candidate;
    }

    function downloadItem(item) {
        if (!item.outputBlob || item.status !== 'ready') return;
        downloadBlob(item.outputBlob, buildOutputName(item));
    }

    function removeItem(id) {
        const index = items.findIndex(item => item.id === id);
        if (index === -1) return;

        const item = items[index];
        items.splice(index, 1);
        URL.revokeObjectURL(item.sourceUrl);
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);

        renderGrid();
        updateSettingsUI();
        if (!items.length) {
            setStatus('All images cleared.', '');
        } else {
            setStatus(items.length + (items.length === 1 ? ' image' : ' images') + ' remaining.', '');
        }
        scheduleProcess();
    }

    function clearAll() {
        if (!items.length) return;

        processGeneration++;
        clearTimeout(processTimer);
        items.forEach(item => {
            URL.revokeObjectURL(item.sourceUrl);
            if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
        });
        items = [];
        targetInput.value = '';

        renderGrid();
        updateSettingsUI();
        showError('');
        setStatus('All images cleared.', '');
        dropzone.focus();
    }

    const crcTable = (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let value = i;
            for (let bit = 0; bit < 8; bit++) {
                value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
            }
            table[i] = value >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function dosDateTime(date) {
        const time = ((date.getHours() & 0x1F) << 11) |
            ((date.getMinutes() & 0x3F) << 5) |
            (Math.floor(date.getSeconds() / 2) & 0x1F);
        const day = (((date.getFullYear() - 1980) & 0x7F) << 9) |
            (((date.getMonth() + 1) & 0x0F) << 5) |
            (date.getDate() & 0x1F);
        return { time: time, date: day };
    }

    async function createZip(entries) {
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        const stamp = dosDateTime(new Date());
        let offset = 0;

        for (const entry of entries) {
            const data = new Uint8Array(await entry.blob.arrayBuffer());
            const nameBytes = encoder.encode(entry.name);
            const crc = crc32(data);

            if (offset + data.length > 0xFFFFFFFF) {
                throw new Error('The ZIP archive is too large. Try fewer or smaller images.');
            }

            const local = new Uint8Array(30 + nameBytes.length);
            const localView = new DataView(local.buffer);
            localView.setUint32(0, 0x04034B50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0x0800, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, stamp.time, true);
            localView.setUint16(12, stamp.date, true);
            localView.setUint32(14, crc, true);
            localView.setUint32(18, data.length, true);
            localView.setUint32(22, data.length, true);
            localView.setUint16(26, nameBytes.length, true);
            localView.setUint16(28, 0, true);
            local.set(nameBytes, 30);
            localParts.push(local, data);

            const central = new Uint8Array(46 + nameBytes.length);
            const centralView = new DataView(central.buffer);
            centralView.setUint32(0, 0x02014B50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0x0800, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, stamp.time, true);
            centralView.setUint16(14, stamp.date, true);
            centralView.setUint32(16, crc, true);
            centralView.setUint32(20, data.length, true);
            centralView.setUint32(24, data.length, true);
            centralView.setUint16(28, nameBytes.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, offset, true);
            central.set(nameBytes, 46);
            centralParts.push(central);

            offset += local.length + data.length;
        }

        let centralSize = 0;
        centralParts.forEach(part => {
            centralSize += part.length;
        });

        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054B50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, centralParts.length, true);
        endView.setUint16(10, centralParts.length, true);
        endView.setUint32(12, centralSize, true);
        endView.setUint32(16, offset, true);
        endView.setUint16(20, 0, true);

        return new Blob(localParts.concat(centralParts, [end]), { type: 'application/zip' });
    }

    function setExportProgress(done, total) {
        exportBtn.innerHTML = '<i data-lucide="loader-2" class="resize-spin"></i> Exporting ' + done + '/' + total + '…';
        refreshIcons();
    }

    function resetExportButton() {
        exportBtn.innerHTML = '<i data-lucide="download"></i> Export';
        refreshIcons();
    }

    function setControlsDisabled(disabled) {
        [
            widthInput,
            heightInput,
            lockAspect,
            percentageInput,
            socialSelect,
            targetInput,
            formatSelect,
            qualityInput
        ].forEach(control => {
            if (control) control.disabled = disabled;
        });
        modeTabs.forEach(tab => {
            tab.disabled = disabled;
        });
        percentageBtns.forEach(btn => {
            btn.disabled = disabled;
        });
        addBtn.disabled = disabled;
        emptyAddBtn.disabled = disabled;
        clearAllBtn.disabled = disabled || items.length === 0;
        dropzone.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        dropzone.classList.toggle('is-disabled', disabled);
    }

    async function handleExport() {
        if (isExporting) return;

        const settings = resolveSettings();
        if (settings.error) {
            showError(settings.error);
            return;
        }

        const exportable = items.filter(item => item.image);
        if (!exportable.length) {
            showError('Add at least one image to export.');
            return;
        }

        isExporting = true;
        processGeneration++;
        clearTimeout(processTimer);
        setControlsDisabled(true);
        setExportProgress(0, exportable.length);
        setStatus('Preparing ' + exportable.length + (exportable.length === 1 ? ' image' : ' images') + ' for export…', 'busy');
        updateExportState();

        const outputs = [];
        let failures = 0;
        let done = 0;

        for (const item of exportable) {
            try {
                const result = await processItem(item, settings, () => isExporting);
                if (result && item.outputBlob) {
                    outputs.push(item);
                } else {
                    failures++;
                }
            } catch (err) {
                failures++;
                item.status = 'error';
                item.error = err && err.message ? err.message : 'Could not resize this image.';
                updateCard(item);
            }
            done++;
            setExportProgress(done, exportable.length);
            setStatus('Resizing ' + done + ' of ' + exportable.length + '…', 'busy');
        }

        try {
            if (outputs.length === 1) {
                downloadItem(outputs[0]);
            } else if (outputs.length > 1) {
                setStatus('Packaging ' + outputs.length + ' images into a ZIP…', 'busy');
                const usedNames = new Set();
                const entries = outputs.map(item => ({
                    name: uniqueName(buildOutputName(item), usedNames),
                    blob: item.outputBlob
                }));
                const zip = await createZip(entries);
                downloadBlob(zip, 'resized-images.zip');
            }
        } catch (err) {
            failures += outputs.length;
            showError(err && err.message ? err.message : 'Could not create the export.');
            setStatus('Export failed. ' + (err && err.message ? err.message : ''), 'error');
            isExporting = false;
            setControlsDisabled(false);
            updateSettingsUI();
            updateSummary();
            resetExportButton();
            return;
        }

        isExporting = false;
        setControlsDisabled(false);
        updateSettingsUI();
        updateSummary();
        resetExportButton();

        if (outputs.length) {
            setStatus(
                'Exported ' + outputs.length + (outputs.length === 1 ? ' image.' : ' images as a ZIP.') +
                (failures ? ' ' + failures + ' failed.' : ''),
                failures ? 'warning' : 'success'
            );
        } else {
            setStatus('Could not export any images. Check the image card errors and try again.', 'error');
        }
        updateExportState();
    }

    modeTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => setMode(tab.dataset.mode));
        tab.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const next = modeTabs[(index + direction + modeTabs.length) % modeTabs.length];
            next.focus();
            setMode(next.dataset.mode);
        });
    });

    percentageInput.addEventListener('input', () => {
        percentageValue.textContent = percentageInput.value + '%';
        percentageBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.percentage === percentageInput.value);
        });
        settingsChanged();
    });

    percentageBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isExporting) return;
            percentageInput.value = btn.dataset.percentage;
            percentageValue.textContent = percentageInput.value + '%';
            percentageBtns.forEach(other => {
                other.classList.toggle('active', other === btn);
            });
            settingsChanged();
        });
    });

    widthInput.addEventListener('input', settingsChanged);
    heightInput.addEventListener('input', settingsChanged);
    lockAspect.addEventListener('change', settingsChanged);
    socialSelect.addEventListener('change', settingsChanged);
    targetInput.addEventListener('input', settingsChanged);
    formatSelect.addEventListener('change', settingsChanged);
    qualityInput.addEventListener('input', () => {
        qualityValue.textContent = qualityInput.value + '%';
        settingsChanged();
    });

    addBtn.addEventListener('click', () => {
        if (!isExporting) fileInput.click();
    });
    emptyAddBtn.addEventListener('click', () => {
        if (!isExporting) fileInput.click();
    });
    dropzone.addEventListener('click', event => {
        if (isExporting || event.target === fileInput) return;
        fileInput.click();
    });
    dropzone.addEventListener('keydown', event => {
        if (isExporting) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
        }
    });
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files || []);
        fileInput.value = '';
        addFiles(files);
    });

    app.addEventListener('dragover', event => {
        if (isExporting || !event.dataTransfer) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        dropzone.classList.add('dragover');
        workspace.classList.add('dragover');
    });
    app.addEventListener('dragleave', event => {
        if (app.contains(event.relatedTarget)) return;
        dropzone.classList.remove('dragover');
        workspace.classList.remove('dragover');
    });
    app.addEventListener('drop', event => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        dropzone.classList.remove('dragover');
        workspace.classList.remove('dragover');
        if (!isExporting && event.dataTransfer.files.length) {
            addFiles(event.dataTransfer.files);
        }
    });

    grid.addEventListener('click', event => {
        const previewButton = event.target.closest('[data-action="preview"]');
        if (previewButton) {
            const card = previewButton.closest('.resize-card');
            if (!card) return;
            const item = items.find(entry => entry.id === card.dataset.id);
            if (!item) return;

            const useOutput = Boolean(item.outputUrl && item.outputBlob);
            const dims = useOutput && item.outputWidth && item.outputHeight
                ? item.outputWidth.toLocaleString() + ' × ' + item.outputHeight.toLocaleString() + ' px'
                : (item.width && item.height
                    ? item.width.toLocaleString() + ' × ' + item.height.toLocaleString() + ' px'
                    : '');
            const bytes = useOutput ? item.outputBlob.size : item.size;
            window.ImagePreview.open({
                src: useOutput ? item.outputUrl : item.sourceUrl,
                name: item.name,
                meta: [useOutput ? 'Resized output' : 'Original', dims, formatBytes(bytes)].filter(Boolean).join(' · '),
                width: useOutput ? item.outputWidth : item.width,
                height: useOutput ? item.outputHeight : item.height,
                onDownload: () => {
                    if (useOutput) {
                        downloadBlob(item.outputBlob, buildOutputName(item));
                        return;
                    }
                    const anchor = document.createElement('a');
                    anchor.href = item.sourceUrl;
                    anchor.download = item.name;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                }
            });
            return;
        }

        const removeButton = event.target.closest('[data-action="remove"]');
        if (removeButton) {
            const card = removeButton.closest('.resize-card');
            if (card) removeItem(card.dataset.id);
            return;
        }

        const downloadButton = event.target.closest('[data-action="download"]');
        if (downloadButton) {
            const card = downloadButton.closest('.resize-card');
            if (!card) return;
            const item = items.find(entry => entry.id === card.dataset.id);
            if (item) downloadItem(item);
        }
    });

    clearAllBtn.addEventListener('click', () => {
        if (!isExporting) clearAll();
    });

    exportBtn.addEventListener('click', handleExport);

    currentResolved = resolveSettings();
    updateSettingsUI();
    renderGrid();
})();

// Wait for bcrypt to load before initializing
window.initBcrypt = function() {
    // Check for dcodeIO.bcrypt (the actual global name)
    if (typeof window.dcodeIO !== 'undefined' && typeof window.dcodeIO.bcrypt !== 'undefined') {
        window.bcrypt = window.dcodeIO.bcrypt;
    }

    if (typeof window.bcrypt === 'undefined') {
        return;
    }

    // Bcrypt Generator
    const bcryptInput = document.getElementById('bcryptInput');
    const bcryptRoundsSlider = document.getElementById('bcryptRoundsSlider');
    const bcryptRoundsValue = document.getElementById('bcryptRoundsValue');
    const bcryptGenerateBtn = document.getElementById('bcryptGenerateBtn');
    const bcryptResultContainer = document.getElementById('bcryptResultContainer');
    const bcryptResultValue = document.getElementById('bcryptResultValue');
    const bcryptCopyBtn = document.getElementById('bcryptCopyBtn');
    const bcryptVerifyInput = document.getElementById('bcryptVerifyInput');
    const bcryptHashInput = document.getElementById('bcryptHashInput');
    const bcryptVerifyBtn = document.getElementById('bcryptVerifyBtn');
    const bcryptVerifyResultContainer = document.getElementById('bcryptVerifyResultContainer');
    const bcryptVerifyResultValue = document.getElementById('bcryptVerifyResultValue');
    const bcryptModeBtns = document.querySelectorAll('.bcrypt-mode-btn');
    const bcryptHashMode = document.getElementById('bcryptHashMode');
    const bcryptVerifyMode = document.getElementById('bcryptVerifyMode');

    let bcryptRounds = 10;

    bcryptRoundsSlider.addEventListener('input', () => {
        bcryptRounds = parseInt(bcryptRoundsSlider.value);
        bcryptRoundsValue.textContent = bcryptRounds;
    });

    bcryptModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            bcryptModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            if (mode === 'hash') {
                bcryptHashMode.style.display = 'block';
                bcryptVerifyMode.style.display = 'none';
            } else {
                bcryptHashMode.style.display = 'none';
                bcryptVerifyMode.style.display = 'block';
            }
        });
    });

    bcryptGenerateBtn.addEventListener('click', async () => {
    const text = bcryptInput.value;

    if (!text) {
        bcryptResultContainer.classList.remove('visible');
        return;
    }

    if (typeof window.bcrypt === 'undefined') {
        bcryptResultValue.textContent = 'Error: bcryptjs library not loaded. Please refresh the page.';
        bcryptResultContainer.classList.add('visible');
        return;
    }

    try {
        const salt = await window.bcrypt.genSalt(bcryptRounds);
        const hash = await window.bcrypt.hash(text, salt);

        bcryptResultValue.textContent = hash;
        bcryptResultContainer.classList.add('visible');
        setBtn(bcryptCopyBtn, 'copy', 'Copy to Clipboard');
        bcryptCopyBtn.classList.remove('copied');
    } catch (error) {
        console.error('Error generating bcrypt hash:', error);
        bcryptResultValue.textContent = 'Error generating hash: ' + error.message;
        bcryptResultContainer.classList.add('visible');
    }
});

bcryptCopyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(bcryptResultValue.textContent);
        setBtn(bcryptCopyBtn, 'check', 'Copied!');
        bcryptCopyBtn.classList.add('copied');
        setTimeout(() => {
            setBtn(bcryptCopyBtn, 'copy', 'Copy to Clipboard');
            bcryptCopyBtn.classList.remove('copied');
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
});

bcryptVerifyBtn.addEventListener('click', async () => {
    const text = bcryptVerifyInput.value;
    const hash = bcryptHashInput.value;

    if (!text || !hash) {
        bcryptVerifyResultContainer.classList.remove('visible');
        return;
    }

    if (typeof window.bcrypt === 'undefined') {
        bcryptVerifyResultValue.textContent = 'Error: bcryptjs library not loaded. Please refresh the page.';
        bcryptVerifyResultValue.style.color = 'var(--danger)';
        bcryptVerifyResultContainer.classList.add('visible');
        return;
    }

    try {
        const isValid = await window.bcrypt.compare(text, hash);

        bcryptVerifyResultValue.innerHTML = isValid
            ? '<i data-lucide="circle-check"></i> Valid - The hash matches the plain text!'
            : '<i data-lucide="circle-x"></i> Invalid - The hash does not match the plain text.';
        refreshIcons();
        bcryptVerifyResultValue.style.color = isValid ? 'var(--success)' : 'var(--danger)';
        bcryptVerifyResultValue.style.background = isValid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        bcryptVerifyResultValue.style.borderColor = isValid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        bcryptVerifyResultContainer.classList.add('visible');
    } catch (error) {
        console.error('Error verifying bcrypt hash:', error);
        bcryptVerifyResultValue.textContent = 'Error verifying hash: ' + error.message;
        bcryptVerifyResultValue.style.color = 'var(--danger)';
        bcryptVerifyResultContainer.classList.add('visible');
    }
});
}

// Render all static Lucide icons on initial load
refreshIcons();
