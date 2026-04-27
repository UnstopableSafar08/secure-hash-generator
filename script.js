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
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest(selectedAlgorithm, data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

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

    let chars = '';
    let password = '';

    if (useUppercase) chars += charSets.uppercase;
    if (useLowercase) chars += charSets.lowercase;
    if (useNumbers) chars += charSets.numbers;
    if (useSymbols) chars += charSets.symbols;

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

    let chars = '';
    if (useUppercase) chars += charSets.uppercase;
    if (useLowercase) chars += charSets.lowercase;
    if (useNumbers) chars += charSets.numbers;
    if (useSymbols) chars += charSets.symbols;

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
