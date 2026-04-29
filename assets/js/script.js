const inputText = document.getElementById('inputText');
const generateBtn = document.getElementById('generateBtn');
const resultContainer = document.getElementById('resultContainer');
const resultLabel = document.getElementById('resultLabel');
const resultValue = document.getElementById('resultValue');
const copyBtn = document.getElementById('copyBtn');
const algorithmBtns = document.querySelectorAll('.algorithm-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

let selectedAlgorithm = 'SHA-256';

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === tabId + 'Tab') {
                content.classList.add('active');
            }
        });
    });
});

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
        copyBtn.textContent = '📋 Copy to Clipboard';
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
        copyBtn.textContent = '✓ Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
            copyBtn.textContent = '📋 Copy to Clipboard';
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
            copyPasswordBtn.textContent = '✓ Copied!';
            copyPasswordBtn.classList.add('copied');
            setTimeout(() => {
                copyPasswordBtn.textContent = '📋 Copy';
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
            <button class="string-item-copy" data-string="${randomString}">📋 Copy</button>
        `;
        stringsOutput.appendChild(stringItem);
    }

    // Add copy functionality to individual strings
    document.querySelectorAll('.string-item-copy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const stringToCopy = btn.dataset.string;
            try {
                await navigator.clipboard.writeText(stringToCopy);
                btn.textContent = '✓ Copied!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = '📋 Copy';
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
        copyAllStringsBtn.textContent = '✓ All Copied!';
        copyAllStringsBtn.classList.add('copied');
        setTimeout(() => {
            copyAllStringsBtn.textContent = '📋 Copy All';
            copyAllStringsBtn.classList.remove('copied');
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
});

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
        bcryptCopyBtn.textContent = '📋 Copy to Clipboard';
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
        bcryptCopyBtn.textContent = '✓ Copied!';
        bcryptCopyBtn.classList.add('copied');
        setTimeout(() => {
            bcryptCopyBtn.textContent = '📋 Copy to Clipboard';
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

        bcryptVerifyResultValue.textContent = isValid ? '✓ Valid - The hash matches the plain text!' : '✗ Invalid - The hash does not match the plain text.';
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
