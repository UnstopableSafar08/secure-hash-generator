# Secure Tools

A modern, secure web application for generating hashes, passwords, random strings, and bcrypt hashes. All operations are performed locally in your browser using the Web Crypto API - no data is sent to any server.

## Features

### 🔐 Hash Generator
- Support for multiple hash algorithms:
  - SHA-256 (recommended)
  - SHA-384 (recommended)
  - SHA-512 (recommended)
  - SHA-1 (for compatibility only)
  - MD5 (for compatibility only)
- Real-time algorithm switching
- Copy to clipboard functionality

### 🔑 Password Generator
- Customizable password length (6-100 characters)
- Character type options:
  - Uppercase letters (A-Z)
  - Lowercase letters (a-z)
  - Numbers (0-9)
  - Custom symbols (user-defined or default set)
- Password strength meter
- Cryptographically secure random generation

### 🎲 Random String Generator
- Generate multiple random strings at once (1-50 strings)
- Customizable string length (1-100 characters)
- Character type options
- Custom symbols support
- Individual copy buttons for each string
- Copy all strings at once

### 🔒 Bcrypt Generator
- Generate bcrypt hashes with configurable cost factor (1-20 rounds)
- Verify bcrypt hashes against plain text
- Uses bcryptjs library for client-side bcrypt operations
- Ideal for password hashing and verification

## Security

- All operations performed locally in your browser
- Uses Web Crypto API (`crypto.subtle` and `crypto.getRandomValues`)
- No data is transmitted to any server
- SHA-256, SHA-384, and SHA-512 are recommended for security purposes
- SHA-1 and MD5 are included for compatibility but are considered cryptographically broken
- Bcrypt is designed to be slow and resistant to brute-force attacks

## Tech Stack

- **HTML5** - Structure
- **CSS3** - Modern styling with glassmorphism effects
- **Vanilla JavaScript** - No frameworks, pure JS
- **Web Crypto API** - Secure cryptographic operations
- **bcryptjs** - Bcrypt hashing library (loaded via CDN)

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/UnstopableSafar08/secure-hash-generator.git
   cd secure-hash-generator
   ```

2. Open `index.html` in your web browser

No build process or dependencies required!

## File Structure

```
secure-hash-generator/
├── index.html              # Main HTML file
├── assets/
│   ├── css/
│   │   └── styles.css      # All styling
│   └── js/
│       └── script.js       # All JavaScript functionality
├── README.md               # This file
└── .gitignore              # Git ignore rules
```

## Browser Support

Works in all modern browsers that support the Web Crypto API:
- Chrome 37+
- Firefox 34+
- Safari 11+
- Edge 12+

## License

© 2026 Sagar Malla

## Author

[Sagar Malla](https://sagarmalla.info.np)
