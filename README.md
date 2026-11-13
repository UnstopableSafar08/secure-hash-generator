# Secure Tools

A modern, secure web application for generating hashes, passwords, random strings, and bcrypt hashes, converting text case, Base64, and images, resizing images, converting PDFs to images and images to PDF, and counting characters. All operations are performed locally in your browser using the Web Crypto API - no data is sent to any server.

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

### ↔️ Base64 Tool
- Realtime Base64 encode/decode (UTF-8 safe, incl. emoji)
- Standard and URL-safe alphabets
- Swap, clear, copy, and live char counts

### 🔢 Char Count
- Realtime counts: characters (with/without whitespace), words, lines, sentences, paragraphs
- Composition breakdown: uppercase, lowercase, other letters, digits, spaces, other whitespace, symbols
- Per-character frequency table, reading time, and UTF-8 byte size
- Copyable summary

### 🔠 Convert Case
- Realtime conversion as you type
- UPPERCASE, lowercase, Title Case and Sentence case
- tOGGLE cASE and aLtErNaTiNg cAsE
- camelCase, snake_case, kebab-case and CONSTANT_CASE for code-friendly output
- Copy converted text to clipboard or clear with one click

### 🖼️ Image Base64
- Encode: drag & drop (or browse) any image to a Base64 data URL, with preview, file info, and dimensions
- Raw Base64 or full data URL output, copy to clipboard, download as `.txt`
- Decode: paste Base64/data URL for realtime preview with magic-byte format detection (PNG, JPEG, GIF, WebP, BMP, SVG) and one-click image download

### 📐 Image Resizer
- Bulk upload up to 50 images at once via drag & drop or the file picker (max 10 MB each)
- Image cards show a preview, filename, original size, original dimensions, new dimensions, output size, and per-image download
- Resize modes: **By Size** (with optional aspect-ratio locking), **As Percentage**, and **Social Media**
- Social presets for Instagram, Facebook, X, YouTube, LinkedIn, TikTok, Pinterest, and WhatsApp with center cropping
- Export as JPG, PNG, or WebP with quality control
- Optional JPG target file size in KB, reached automatically with a quality search
- Single images download directly; multiple images export as a ZIP archive
- Remove individual images or clear the whole batch
- All resizing is performed locally with the canvas API — no uploads

### 🖼️ PDF to Images
- Upload up to 10 PDFs at once via drag & drop or the file picker (max 100 MB and 200 pages each)
- Two modes: **Page to image** renders selected pages, while **Extract images** pulls embedded raster images out of the PDF
- Export as JPG, PNG, or WebP with **Normal** (150 DPI) or **High** (300 DPI) page rendering
- Optional page ranges such as `1-5, 8, 11-14`
- Password-protected PDFs get an in-app password prompt
- Result cards show a thumbnail, filename, page number, dimensions, file size, and individual download
- Single results download directly; multiple images are packaged into a ZIP archive
- Embedded-image extraction is best-effort for unusual masks, tiling, and uncommon image codecs
- Rendered with PDF.js entirely in the browser — no uploads

### 📄 Images to PDF
- Add up to 50 images at once via drag & drop or the file picker (max 10 MB each; 100 MB total)
- Supports JPG, PNG, WebP, GIF, BMP, and AVIF input
- Reorder pages by dragging cards or using the arrow buttons; rotate any image in 90° steps
- Page size: **Fit** (matches each image), **A4**, or **US Letter**
- Orientation: **Portrait** or **Landscape** for fixed page sizes
- Margin: **None**, **Small** (0.25 in), or **Big** (0.5 in)
- JPG and PNG files are embedded without unnecessary recompression when possible
- Other formats, rotated images, and images with EXIF orientation are re-encoded locally
- Produces one PDF with one image per page, plus a re-download button
- Built with pdf-lib entirely in the browser — no uploads

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
- **Lucide Icons** - Icon set vendored locally at `assets/js/lucide.min.js` (no CDN dependency)
- **Web Crypto API** - Secure cryptographic operations
- **PDF.js** - PDF parsing, page rendering, and image extraction, vendored locally at `assets/vendor/pdfjs/`
- **pdf-lib** - PDF creation, vendored locally at `assets/vendor/pdf-lib/`
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
├── index.html              # App shell: sidebar nav + tool panels
├── manifest.webmanifest    # PWA manifest (installable, offline)
├── sw.js                   # Service worker (offline app-shell cache)
├── assets/
│   ├── css/
│   │   └── styles.css      # All styling
│   ├── js/
│   │   ├── script.js       # Core tool logic + hash router
│   │   ├── pdf-tool.js     # PDF to images + images to PDF logic
│   │   └── lucide.min.js   # Lucide icons, vendored (no CDN)
│   ├── img/
│   │   ├── icon.svg        # App/PWA icon
│   │   └── favicon.ico     # Browser favicon
│   └── vendor/
│       ├── pdfjs/          # PDF.js build, worker, cmaps, standard fonts
│       └── pdf-lib/        # pdf-lib UMD build
├── README.md               # This file
└── .gitignore              # Git ignore rules
```

## Navigation

The sidebar lists all tools. Every tool is deep-linkable via hash routes
(`#/hash`, `#/password`, `#/random`, `#/bcrypt`, `#/base64`, `#/charCount`, `#/case`, `#/image`, `#/resize`, `#/pdfToImages`, `#/imagesToPdf`),
so bookmarks and back/forward buttons work. The sidebar search filters the
tool list, and the layout collapses to a top nav on small screens.

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
