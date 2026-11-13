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
    resize: { title: 'Image Resizer', desc: 'Resize images locally with aspect-ratio, format and quality controls.' }
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
    const decodeInfo = document.getElementById('imageDecodeInfo');
    const decodeDownloadBtn = document.getElementById('imageDecodeDownloadBtn');
    const decodeClearBtn = document.getElementById('imageDecodeClearBtn');

    let currentDataUrl = '';
    let currentBaseName = 'image';

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
        encodeOutput.value = '';
        encodeResult.style.display = 'none';
        encodeError.textContent = '';
    });

    // ---- Decode (realtime) ----
    function updateDecode() {
        const rawInput = decodeInput.value.trim();
        decodeError.textContent = '';
        decodeResult.style.display = 'none';
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

    decodeClearBtn.addEventListener('click', () => {
        decodeInput.value = '';
        updateDecode();
        decodeInput.focus();
    });
})();

// Image Resizer Tool (client-side canvas resizing with format + quality controls)
(function initImageResizer() {
    const dropzone = document.getElementById('resizeDropzone');
    if (!dropzone) return;

    const fileInput = document.getElementById('resizeFileInput');
    const errorEl = document.getElementById('resizeError');
    const editor = document.getElementById('resizeEditor');
    const originalPreview = document.getElementById('resizeOriginalPreview');
    const originalInfo = document.getElementById('resizeOriginalInfo');
    const outputPreview = document.getElementById('resizeOutputPreview');
    const outputInfo = document.getElementById('resizeOutputInfo');
    const widthInput = document.getElementById('resizeWidth');
    const heightInput = document.getElementById('resizeHeight');
    const lockAspect = document.getElementById('resizeLockAspect');
    const presetBtns = document.querySelectorAll('.resize-preset-btn');
    const formatSelect = document.getElementById('resizeFormat');
    const formatGrid = document.querySelector('.resize-format-grid');
    const qualityGroup = document.getElementById('resizeQualityGroup');
    const qualityInput = document.getElementById('resizeQuality');
    const qualityValue = document.getElementById('resizeQualityValue');
    const downloadBtn = document.getElementById('resizeDownloadBtn');
    const resetBtn = document.getElementById('resizeResetBtn');
    const clearBtn = document.getElementById('resizeClearBtn');
    const noteEl = document.getElementById('resizeNote');

    const MAX_DIMENSION = 10000;
    const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const FORMAT_LABELS = {
        'image/png': 'PNG',
        'image/jpeg': 'JPEG',
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
        'image/x-icon': 'ico'
    };

    let sourceImage = null;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let originalMime = '';
    let originalFileName = 'image';
    let originalSize = 0;
    let sourceUrl = '';
    let outputUrl = '';
    let outputBlob = null;
    let outputExt = 'png';
    let renderTimer = null;
    let renderToken = 0;
    let loadToken = 0;

    function formatBytes(n) {
        if (!Number.isFinite(n)) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function infoRow(label, value) {
        return '<div class="image-info-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function mimeLabel(mime) {
        return FORMAT_LABELS[mime] || mime || 'Unknown';
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

    function resolveOutputMime() {
        const selected = formatSelect.value;
        if (selected !== 'original') return selected;
        if (originalMime === 'image/png' || originalMime === 'image/jpeg' || originalMime === 'image/webp') {
            return originalMime;
        }
        return 'image/png';
    }

    function usesQuality(mime) {
        return mime === 'image/jpeg' || mime === 'image/webp';
    }

    function fitWithin(width, height, limit) {
        const scale = Math.min(1, limit / Math.max(width, height));
        return {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale))
        };
    }

    function updateQualityVisibility() {
        const showQuality = usesQuality(resolveOutputMime());
        qualityGroup.hidden = !showQuality;
        formatGrid.classList.toggle('no-quality', !showQuality);
    }

    function updateOriginalFormatOption() {
        formatSelect.options[0].textContent = originalMime
            ? 'Keep original (' + mimeLabel(originalMime) + ')'
            : 'Keep original';
    }

    function showError(message) {
        errorEl.textContent = message || '';
    }

    function clearOutput() {
        renderToken++;
        if (outputUrl) {
            URL.revokeObjectURL(outputUrl);
            outputUrl = '';
        }
        outputBlob = null;
        downloadBtn.disabled = true;
        outputPreview.src = EMPTY_IMAGE;
        outputInfo.innerHTML = '<div class="resize-empty">Choose dimensions to preview</div>';
        noteEl.textContent = '';
    }

    function setPresetActive(scale) {
        presetBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scale === String(scale));
        });
    }

    function clearPresetActive() {
        presetBtns.forEach(btn => btn.classList.remove('active'));
    }

    function applyOriginalDimensions() {
        const fitted = fitWithin(sourceWidth, sourceHeight, MAX_DIMENSION);
        widthInput.value = fitted.width;
        heightInput.value = fitted.height;
    }

    function readDimension(input, label) {
        const raw = input.value.trim();
        if (raw === '') return null;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 1) {
            throw new Error(label + ' must be at least 1 px.');
        }
        if (value > MAX_DIMENSION) {
            throw new Error(label + ' cannot exceed ' + MAX_DIMENSION.toLocaleString() + ' px.');
        }
        return Math.round(value);
    }

    function buildOutputNote(mime) {
        const notes = [];
        if (originalMime === 'image/gif') {
            notes.push('Animated GIFs are exported as a single still frame.');
        }
        if (formatSelect.value === 'original' &&
            originalMime !== 'image/png' && originalMime !== 'image/jpeg' && originalMime !== 'image/webp') {
            notes.push('This source format is re-encoded as PNG.');
        }
        if (mime === 'image/jpeg') {
            notes.push('Transparent areas are filled with white for JPEG.');
        }
        return notes.join(' ');
    }

    function renderResize() {
        if (!sourceImage) return;

        let width;
        let height;
        try {
            width = readDimension(widthInput, 'Width');
            height = readDimension(heightInput, 'Height');
        } catch (err) {
            showError(err.message);
            downloadBtn.disabled = true;
            return;
        }

        if (width === null || height === null) {
            showError('');
            downloadBtn.disabled = true;
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            showError('This image is too large to resize in your browser.');
            downloadBtn.disabled = true;
            return;
        }

        const mime = resolveOutputMime();
        if (mime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceImage, 0, 0, width, height);

        const token = ++renderToken;
        const quality = Math.min(1, Math.max(0.1, parseInt(qualityInput.value, 10) / 100));
        try {
            canvas.toBlob(blob => {
                if (token !== renderToken) return;
                if (!blob) {
                    showError('Could not resize this image. Try smaller dimensions.');
                    downloadBtn.disabled = true;
                    return;
                }

                showError('');
                if (outputUrl) URL.revokeObjectURL(outputUrl);
                outputBlob = blob;
                const actualMime = blob.type || mime;
                outputExt = extensionForMime(actualMime);
                outputUrl = URL.createObjectURL(blob);
                outputPreview.src = outputUrl;

                let info = infoRow('Format', mimeLabel(actualMime)) +
                    infoRow('Dimensions', width.toLocaleString() + ' × ' + height.toLocaleString() + ' px') +
                    infoRow('File size', formatBytes(blob.size));
                if (usesQuality(actualMime)) {
                    info += infoRow('Quality', qualityInput.value + '%');
                }
                outputInfo.innerHTML = info;
                downloadBtn.disabled = false;
                noteEl.textContent = buildOutputNote(actualMime);
            }, mime, quality);
        } catch (err) {
            showError('Could not resize this image. Try smaller dimensions.');
            downloadBtn.disabled = true;
        }
    }

    function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderResize, 180);
    }

    function syncHeightFromWidth() {
        if (!lockAspect.checked || !sourceWidth || !sourceHeight) return;
        const width = Number(widthInput.value);
        if (Number.isFinite(width) && width >= 1) {
            heightInput.value = Math.max(1, Math.round(width * sourceHeight / sourceWidth));
        }
    }

    function syncWidthFromHeight() {
        if (!lockAspect.checked || !sourceWidth || !sourceHeight) return;
        const height = Number(heightInput.value);
        if (Number.isFinite(height) && height >= 1) {
            widthInput.value = Math.max(1, Math.round(height * sourceWidth / sourceHeight));
        }
    }

    function updateQualityLabel() {
        qualityValue.textContent = qualityInput.value + '%';
    }

    function loadFile(file) {
        showError('');
        if (!file) return;

        const mime = detectMime(file);
        if (!mime) {
            showError('Please select an image file (PNG, JPEG, WebP, GIF, BMP, SVG or AVIF).');
            return;
        }

        const token = ++loadToken;
        const nextUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            if (token !== loadToken) {
                URL.revokeObjectURL(nextUrl);
                return;
            }
            if (!img.naturalWidth || !img.naturalHeight) {
                URL.revokeObjectURL(nextUrl);
                showError('Could not determine the dimensions of that image.');
                return;
            }

            if (sourceUrl) URL.revokeObjectURL(sourceUrl);
            sourceUrl = nextUrl;
            sourceImage = img;
            sourceWidth = img.naturalWidth;
            sourceHeight = img.naturalHeight;
            originalMime = mime;
            originalFileName = file.name || 'image';
            originalSize = file.size;

            originalPreview.src = nextUrl;
            originalInfo.innerHTML =
                infoRow('File', escapeHtml(originalFileName)) +
                infoRow('Type', mimeLabel(originalMime)) +
                infoRow('Original size', formatBytes(originalSize)) +
                infoRow('Dimensions', sourceWidth.toLocaleString() + ' × ' + sourceHeight.toLocaleString() + ' px');

            applyOriginalDimensions();
            lockAspect.checked = true;
            formatSelect.value = 'original';
            qualityInput.value = 90;
            updateQualityLabel();
            updateOriginalFormatOption();
            updateQualityVisibility();
            clearPresetActive();
            clearOutput();
            editor.style.display = 'block';
            renderResize();
            editor.scrollIntoView({
                behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
                block: 'nearest'
            });
        };
        img.onerror = () => {
            URL.revokeObjectURL(nextUrl);
            if (token === loadToken) {
                showError('Could not load that image. Please try another file.');
            }
        };
        img.src = nextUrl;
    }

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
    fileInput.addEventListener('change', () => {
        loadFile(fileInput.files[0]);
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
        if (e.dataTransfer.files.length > 0) loadFile(e.dataTransfer.files[0]);
    });

    widthInput.addEventListener('input', () => {
        clearPresetActive();
        syncHeightFromWidth();
        scheduleRender();
    });

    heightInput.addEventListener('input', () => {
        clearPresetActive();
        syncWidthFromHeight();
        scheduleRender();
    });

    lockAspect.addEventListener('change', () => {
        if (lockAspect.checked) {
            clearPresetActive();
            syncHeightFromWidth();
            scheduleRender();
        }
    });

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!sourceImage) return;
            const scale = parseFloat(btn.dataset.scale);
            const fitted = fitWithin(
                Math.max(1, Math.round(sourceWidth * scale)),
                Math.max(1, Math.round(sourceHeight * scale)),
                MAX_DIMENSION
            );
            widthInput.value = fitted.width;
            heightInput.value = fitted.height;
            setPresetActive(btn.dataset.scale);
            showError('');
            renderResize();
        });
    });

    formatSelect.addEventListener('change', () => {
        updateQualityVisibility();
        scheduleRender();
    });

    qualityInput.addEventListener('input', () => {
        updateQualityLabel();
        scheduleRender();
    });

    resetBtn.addEventListener('click', () => {
        if (!sourceImage) return;
        applyOriginalDimensions();
        lockAspect.checked = true;
        formatSelect.value = 'original';
        qualityInput.value = 90;
        updateQualityLabel();
        updateQualityVisibility();
        clearPresetActive();
        showError('');
        renderResize();
    });

    clearBtn.addEventListener('click', () => {
        clearTimeout(renderTimer);
        renderToken++;
        loadToken++;
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        sourceUrl = '';
        sourceImage = null;
        sourceWidth = 0;
        sourceHeight = 0;
        originalMime = '';
        originalFileName = 'image';
        originalSize = 0;
        originalPreview.removeAttribute('src');
        originalInfo.innerHTML = '';
        widthInput.value = '';
        heightInput.value = '';
        lockAspect.checked = true;
        formatSelect.value = 'original';
        qualityInput.value = 90;
        updateQualityLabel();
        clearOutput();
        editor.style.display = 'none';
        showError('');
        fileInput.value = '';
        dropzone.focus();
    });

    downloadBtn.addEventListener('click', () => {
        if (!outputBlob) return;
        const baseName = (originalFileName || 'image').replace(/\.[^.]+$/, '') || 'image';
        const name = baseName + '-' + widthInput.value + 'x' + heightInput.value + '.' + outputExt;
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
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
