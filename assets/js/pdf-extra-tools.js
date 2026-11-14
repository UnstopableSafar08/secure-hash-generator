/* Secure Tools extra PDF utilities: Word export, split, merge, watermark and encryption.
   Everything runs locally in the browser. */
(function () {
    'use strict';

    const PDFJS_BASE = 'assets/vendor/pdfjs/';
    const PDFLIB_SRC = 'assets/vendor/pdf-lib/pdf-lib.min.js?v=2.11.1';

    const MAX_PDF_BYTES = 100 * 1024 * 1024;
    const MAX_MERGE_FILES = 20;
    const MAX_WORD_PAGES = 500;
    const CANCELLED = Symbol('pdf-extra-cancelled');

    let pdfjsPromise = null;
    let pdfLibPromise = null;

    function byId(id) {
        return document.getElementById(id);
    }

    function assetUrl(path) {
        return new URL(path, document.baseURI).href;
    }

    function refreshIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes)) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizePdfName(value, fallback) {
        let name = String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ');
        if (!name) name = fallback || 'document';
        if (!/\.pdf$/i.test(name)) name += '.pdf';
        return name.slice(0, 120);
    }

    function safeBaseName(name) {
        const base = String(name || 'file').replace(/\.[^.]+$/, '');
        const safe = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
        return (safe || 'file').slice(0, 80);
    }

    function uniqueName(name, used) {
        let candidate = name;
        let counter = 2;
        while (used.has(candidate.toLowerCase())) {
            const dot = name.lastIndexOf('.');
            candidate = dot > 0
                ? name.slice(0, dot) + '-' + counter + name.slice(dot)
                : name + '-' + counter;
            counter++;
        }
        used.add(candidate.toLowerCase());
        return candidate;
    }

    function padNumber(value, length) {
        return String(value).padStart(length || 2, '0');
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 10000);
    }

    function isPdfFile(file) {
        const type = (file && file.type ? file.type : '').toLowerCase();
        if (type === 'application/pdf') return true;
        return /\.pdf$/i.test((file && file.name) || '');
    }

    function loadScript(src, globalName, label) {
        return new Promise(function (resolve, reject) {
            if (window[globalName]) {
                resolve(window[globalName]);
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = function () {
                if (window[globalName]) resolve(window[globalName]);
                else reject(new Error('The ' + label + ' library loaded but was not available.'));
            };
            script.onerror = function () {
                reject(new Error('Could not load the ' + label + ' library. Check your connection and try again.'));
            };
            document.head.appendChild(script);
        });
    }

    function loadPdfJs() {
        if (!pdfjsPromise) {
            pdfjsPromise = loadScript(assetUrl(PDFJS_BASE + 'pdf.min.js'), 'pdfjsLib', 'PDF.js').then(function (pdfjs) {
                pdfjs.GlobalWorkerOptions.workerSrc = assetUrl(PDFJS_BASE + 'pdf.worker.min.js');
                return pdfjs;
            });
            pdfjsPromise.catch(function () {
                pdfjsPromise = null;
            });
        }
        return pdfjsPromise;
    }

    function loadPdfLib() {
        if (!pdfLibPromise) {
            pdfLibPromise = loadScript(assetUrl(PDFLIB_SRC), 'PDFLib', 'pdf-lib');
            pdfLibPromise.catch(function () {
                pdfLibPromise = null;
            });
        }
        return pdfLibPromise;
    }

    /* ---------------------------------------------------------------------
       Password prompt (shared by every tool on this page)
       --------------------------------------------------------------------- */

    let passwordModal = null;
    let passwordResolve = null;
    let passwordErrorTimer = null;

    window.addEventListener('hashchange', function () {
        if (passwordResolve) finishPassword(null);
    });

    function finishPassword(value) {
        if (!passwordResolve) return;
        const resolve = passwordResolve;
        passwordResolve = null;
        if (passwordModal) {
            passwordModal.hidden = true;
            const input = passwordModal.querySelector('#pdfExtraPasswordInput');
            if (input) input.value = '';
        }
        resolve(value);
    }

    function showPasswordModal(doc, incorrect) {
        if (!passwordModal) {
            passwordModal = document.createElement('div');
            passwordModal.className = 'pdf-modal';
            passwordModal.hidden = true;
            passwordModal.innerHTML =
                '<div class="pdf-modal-card" role="dialog" aria-modal="true" aria-labelledby="pdfExtraPasswordTitle" aria-describedby="pdfExtraPasswordDesc">' +
                    '<div class="pdf-modal-icon"><i data-lucide="lock-keyhole"></i></div>' +
                    '<h3 id="pdfExtraPasswordTitle">Password required</h3>' +
                    '<p id="pdfExtraPasswordDesc">This PDF is protected. Enter its password to continue.</p>' +
                    '<form class="pdf-modal-form">' +
                        '<label class="pdf-modal-label" for="pdfExtraPasswordInput">PDF password</label>' +
                        '<input type="password" class="resize-field" id="pdfExtraPasswordInput" autocomplete="off" spellcheck="false" required>' +
                        '<p class="pdf-modal-error" id="pdfExtraPasswordError" hidden></p>' +
                        '<div class="pdf-modal-actions">' +
                            '<button type="button" class="pdf-modal-cancel" data-modal-action="cancel">Cancel</button>' +
                            '<button type="submit" class="pdf-modal-submit"><i data-lucide="lock-open"></i> Unlock PDF</button>' +
                        '</div>' +
                    '</form>' +
                '</div>';
            document.body.appendChild(passwordModal);

            const form = passwordModal.querySelector('.pdf-modal-form');
            const input = passwordModal.querySelector('#pdfExtraPasswordInput');
            const error = passwordModal.querySelector('#pdfExtraPasswordError');

            form.addEventListener('submit', function (event) {
                event.preventDefault();
                const password = input.value;
                if (!password) {
                    error.textContent = 'Enter the PDF password.';
                    error.hidden = false;
                    input.focus();
                    return;
                }
                finishPassword(password);
            });
            passwordModal.querySelector('[data-modal-action="cancel"]').addEventListener('click', function () {
                finishPassword(null);
            });
            passwordModal.addEventListener('click', function (event) {
                if (event.target === passwordModal) finishPassword(null);
            });
            passwordModal.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finishPassword(null);
                }
            });
            refreshIcons();
        }

        if (passwordResolve) finishPassword(null);

        const title = passwordModal.querySelector('#pdfExtraPasswordTitle');
        const desc = passwordModal.querySelector('#pdfExtraPasswordDesc');
        const error = passwordModal.querySelector('#pdfExtraPasswordError');
        const input = passwordModal.querySelector('#pdfExtraPasswordInput');

        title.textContent = incorrect ? 'Incorrect password' : 'Password required';
        desc.textContent = '"' + (doc && doc.name ? doc.name : 'This PDF') + '" is protected. Enter its password to continue.';
        error.textContent = incorrect ? 'That password did not unlock the PDF. Try again.' : '';
        error.hidden = !incorrect;
        input.value = '';
        passwordModal.hidden = false;
        clearTimeout(passwordErrorTimer);
        passwordErrorTimer = setTimeout(function () {
            if (!passwordModal.hidden && !input.value) input.focus();
        }, 30);
        refreshIcons();

        return new Promise(function (resolve) {
            passwordResolve = resolve;
        });
    }

    /* ---------------------------------------------------------------------
       PDF loading and friendly errors
       --------------------------------------------------------------------- */

    function isPasswordError(error) {
        const message = (error && error.message) || '';
        return /password|encrypted/i.test(message);
    }

    function pdfErrorMessage(error) {
        if (error === CANCELLED) return 'A password is required to read this PDF.';
        const name = error && error.name ? error.name : '';
        const message = error && error.message ? error.message : '';
        if (name === 'PasswordException' || /password/i.test(message)) {
            return 'The password did not unlock this PDF.';
        }
        if (name === 'InvalidPDFException' || /invalid pdf|not a pdf|failed to parse/i.test(message)) {
            return 'This file is not a valid PDF or is corrupted.';
        }
        if (name === 'MissingPDFException') {
            return 'The PDF could not be read from disk.';
        }
        return message || 'Could not read this PDF.';
    }

    function createDocRecord(file) {
        return {
            id: 'pdf-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
            file: file,
            name: (file && file.name) || 'document.pdf',
            size: (file && file.size) || 0,
            status: 'loading',
            error: '',
            pageCount: null,
            password: '',
            usedPassword: false,
            pdfDoc: null,
            pdfjsDoc: null,
            task: null
        };
    }

    function destroyDoc(doc) {
        if (!doc) return;
        if (doc.task) {
            try { doc.task.destroy(); } catch (error) { /* ignore */ }
            doc.task = null;
        }
        if (doc.pdfjsDoc) {
            try { doc.pdfjsDoc.destroy(); } catch (error) { /* ignore */ }
            doc.pdfjsDoc = null;
        }
        doc.pdfDoc = null;
    }

    /* Load a fresh pdf-lib document, prompting for a password when needed. */
    async function openPdfLibDocument(doc) {
        const PDFLib = await loadPdfLib();
        const bytes = await doc.file.arrayBuffer();
        let password = doc.password || '';
        let incorrect = !!password;
        let triedEmptyPassword = false;

        for (;;) {
            try {
                const pdfDoc = await PDFLib.PDFDocument.load(
                    bytes,
                    password ? { password: password } : undefined
                );
                doc.password = password;
                doc.pageCount = pdfDoc.getPageCount();
                doc.usedPassword = !!password;
                return pdfDoc;
            } catch (error) {
                if (!isPasswordError(error)) throw error;

                // Permission-only PDFs often have an empty user password and a
                // separate owner password. Try that before asking the user.
                if (!password && !triedEmptyPassword) {
                    triedEmptyPassword = true;
                    try {
                        const pdfDoc = await PDFLib.PDFDocument.load(bytes, { password: '' });
                        doc.password = '';
                        doc.pageCount = pdfDoc.getPageCount();
                        doc.usedPassword = false;
                        return pdfDoc;
                    } catch (emptyError) {
                        if (!isPasswordError(emptyError)) throw emptyError;
                    }
                }

                const answer = await showPasswordModal(doc, incorrect);
                if (answer === null) throw CANCELLED;
                password = answer;
                incorrect = true;
            }
        }
    }

    async function loadPdfLibDocumentRecord(doc) {
        const pdfDoc = await openPdfLibDocument(doc);
        doc.pdfDoc = pdfDoc;
        return pdfDoc;
    }

    /* Load with PDF.js (needed for text extraction). */
    async function openPdfJsDocument(doc) {
        const pdfjs = await loadPdfJs();
        const buffer = await doc.file.arrayBuffer();
        const task = pdfjs.getDocument({
            data: new Uint8Array(buffer),
            cMapUrl: assetUrl(PDFJS_BASE + 'cmaps/'),
            cMapPacked: true,
            standardFontDataUrl: assetUrl(PDFJS_BASE + 'standard_fonts/')
        });
        doc.task = task;
        let cancelled = false;

        task.onPassword = function (updatePassword, reason) {
            showPasswordModal(doc, reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD).then(function (password) {
                if (password === null) {
                    cancelled = true;
                    try { task.destroy(); } catch (error) { /* ignore */ }
                    return;
                }
                doc.usedPassword = true;
                updatePassword(password);
            });
        };

        try {
            const pdf = await task.promise;
            if (cancelled) {
                try { pdf.destroy(); } catch (error) { /* ignore */ }
                throw CANCELLED;
            }
            if (pdf.numPages > MAX_WORD_PAGES) {
                try { pdf.destroy(); } catch (error) { /* ignore */ }
                throw new Error('This PDF has ' + pdf.numPages + ' pages. PDF to Word supports up to ' + MAX_WORD_PAGES + ' pages at a time.');
            }
            doc.pageCount = pdf.numPages;
            doc.pdfjsDoc = pdf;
            return pdf;
        } catch (error) {
            if (cancelled) throw CANCELLED;
            throw error;
        } finally {
            doc.task = null;
        }
    }

    /* ---------------------------------------------------------------------
       Page ranges
       --------------------------------------------------------------------- */

    function parseRangeSegments(value, pageCount) {
        const normalized = String(value || '').replace(/[\u2013\u2014]/g, '-').trim();
        const rawSegments = normalized.split(',').map(function (part) {
            return part.trim();
        }).filter(Boolean);

        if (!rawSegments.length) {
            throw new Error('Enter at least one page number or range.');
        }

        return rawSegments.map(function (segment) {
            const match = segment.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
            if (!match) {
                throw new Error('"' + segment + '" is not a valid page number or range.');
            }
            const start = Number(match[1]);
            const end = match[2] ? Number(match[2]) : start;
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1) {
                throw new Error('Page numbers must be whole numbers starting at 1.');
            }
            if (start > end) {
                throw new Error('The range "' + segment + '" must go from low to high.');
            }
            if (end > pageCount) {
                throw new Error('"' + segment + '" is outside this PDF (pages 1-' + pageCount + ').');
            }
            const pages = [];
            for (let page = start; page <= end; page++) pages.push(page - 1);
            return pages;
        });
    }

    function parsePageSelection(value, pageCount) {
        const trimmed = String(value || '').trim();
        if (!trimmed) {
            return Array.from({ length: pageCount }, function (_, index) {
                return index;
            });
        }
        const segments = parseRangeSegments(trimmed, pageCount);
        const selected = new Set();
        segments.forEach(function (segment) {
            segment.forEach(function (page) {
                selected.add(page);
            });
        });
        return Array.from(selected).sort(function (a, b) {
            return a - b;
        });
    }

    function isContiguous(indices) {
        for (let index = 1; index < indices.length; index++) {
            if (indices[index] !== indices[index - 1] + 1) return false;
        }
        return true;
    }

    function pageLabel(indices) {
        if (!indices.length) return 'No pages';
        if (indices.length === 1) return 'Page ' + (indices[0] + 1);
        if (isContiguous(indices)) return 'Pages ' + (indices[0] + 1) + '-' + (indices[indices.length - 1] + 1);
        if (indices.length <= 4) {
            return 'Pages ' + indices.map(function (index) { return index + 1; }).join(', ');
        }
        return 'Pages ' + indices.slice(0, 3).map(function (index) { return index + 1; }).join(', ') +
            ' +' + (indices.length - 3) + ' more';
    }

    function pageSlug(indices) {
        if (indices.length === 1) return 'page-' + padNumber(indices[0] + 1, 3);
        if (isContiguous(indices)) {
            return 'pages-' + padNumber(indices[0] + 1, 3) + '-' + padNumber(indices[indices.length - 1] + 1, 3);
        }
        if (indices.length <= 5) {
            return 'pages-' + indices.map(function (index) {
                return padNumber(index + 1, 3);
            }).join('-');
        }
        return 'pages-' + padNumber(indices[0] + 1, 3) + '-' +
            padNumber(indices[indices.length - 1] + 1, 3) + '-' + indices.length;
    }

    /* ---------------------------------------------------------------------
       ZIP writer (stored entries, UTF-8 names)
       --------------------------------------------------------------------- */

    const CRC_TABLE = (function () {
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
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
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
                throw new Error('The ZIP archive is too large. Try fewer or smaller files.');
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
        centralParts.forEach(function (part) {
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

    /* ---------------------------------------------------------------------
       DOCX writer (text-only Word document)
       --------------------------------------------------------------------- */

    function escapeXml(value) {
        return String(value == null ? '' : value)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function textItemsToLines(items) {
        const groups = [];
        (items || []).forEach(function (item) {
            if (!item || typeof item.str !== 'string' || !item.str.trim()) return;
            const transform = item.transform || [];
            const x = Number(transform[4]) || 0;
            const y = Number(transform[5]) || 0;
            const height = Math.abs(Number(transform[3])) || Number(item.height) || 10;
            const tolerance = Math.max(2, height * 0.35);

            let group = null;
            for (let index = groups.length - 1; index >= Math.max(0, groups.length - 10); index--) {
                if (Math.abs(groups[index].y - y) <= tolerance) {
                    group = groups[index];
                    break;
                }
            }
            if (!group) {
                group = { y: y, items: [] };
                groups.push(group);
            }
            group.items.push({
                x: x,
                width: Number(item.width) || 0,
                height: height,
                text: item.str
            });
        });

        groups.sort(function (a, b) {
            return b.y - a.y;
        });

        return groups.map(function (group) {
            const parts = group.items.sort(function (a, b) {
                return a.x - b.x;
            });
            let line = '';
            let previous = null;
            parts.forEach(function (part) {
                if (previous) {
                    const gap = part.x - (previous.x + previous.width);
                    if (gap > Math.max(1, part.height * 0.12) && !/\s$/.test(line) && !/^\s/.test(part.text)) {
                        line += ' ';
                    }
                }
                line += part.text;
                previous = part;
            });
            return line.replace(/\s+/g, ' ').trim();
        }).filter(Boolean);
    }

    async function buildDocx(pagesLines, sourceName) {
        const paragraphs = [];
        pagesLines.forEach(function (lines, pageIndex) {
            if (!lines.length) {
                paragraphs.push('<w:p/>');
            } else {
                lines.forEach(function (line) {
                    paragraphs.push(
                        '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:t xml:space="preserve">' +
                        escapeXml(line) +
                        '</w:t></w:r></w:p>'
                    );
                });
            }
            if (pageIndex < pagesLines.length - 1) {
                paragraphs.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
            }
        });

        const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
                '<w:body>' +
                    paragraphs.join('') +
                    '<w:sectPr>' +
                        '<w:pgSz w:w="11906" w:h="16838"/>' +
                        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
                    '</w:sectPr>' +
                '</w:body>' +
            '</w:document>';

        const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
                '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
                '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
            '</Types>';

        const packageRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
                '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
            '</Relationships>';

        const documentRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

        const coreProps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
                'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
                'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
                '<dc:title>' + escapeXml(safeBaseName(sourceName)) + '</dc:title>' +
                '<dc:creator>Secure Tools</dc:creator>' +
                '<cp:lastModifiedBy>Secure Tools</cp:lastModifiedBy>' +
                '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:created>' +
            '</cp:coreProperties>';

        const appProps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
                '<Application>Secure Tools</Application>' +
            '</Properties>';

        function entry(name, text) {
            return {
                name: name,
                blob: new Blob([text], { type: 'application/xml' })
            };
        }

        return createZip([
            entry('[Content_Types].xml', contentTypes),
            entry('_rels/.rels', packageRels),
            entry('word/document.xml', documentXml),
            entry('word/_rels/document.xml.rels', documentRels),
            entry('docProps/core.xml', coreProps),
            entry('docProps/app.xml', appProps)
        ]);
    }

    /* ---------------------------------------------------------------------
       Shared UI helpers
       --------------------------------------------------------------------- */

    function bindDropzone(dropzone, input, onFiles, isBusy) {
        if (!dropzone || !input) return;

        dropzone.addEventListener('click', function () {
            if (!isBusy()) input.click();
        });

        dropzone.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!isBusy()) input.click();
            }
        });

        dropzone.addEventListener('dragover', function (event) {
            event.preventDefault();
            if (!isBusy()) dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', function () {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', function (event) {
            event.preventDefault();
            dropzone.classList.remove('dragover');
            if (!isBusy() && event.dataTransfer) onFiles(event.dataTransfer.files);
        });

        input.addEventListener('change', function () {
            if (input.files && input.files.length) onFiles(input.files);
            input.value = '';
        });
    }

    function statusText(doc) {
        if (!doc) return '';
        if (doc.status === 'loading') return { text: 'Reading PDF…', className: 'loading' };
        if (doc.status === 'ready') return { text: doc.usedPassword ? 'Unlocked' : 'Ready', className: 'ready' };
        if (doc.status === 'error') return { text: doc.error || 'Could not read this PDF.', className: 'error' };
        return { text: 'Queued', className: 'queued' };
    }

    function singleDocCardHtml(doc, busy) {
        const status = statusText(doc);
        const meta = formatBytes(doc.size) + (doc.pageCount ? ' · ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') : '');
        const canRetry = doc.status === 'error' && !busy;
        const canRemove = !busy && doc.status !== 'loading';
        return '<article class="pdf-doc-card ' + status.className + '" data-doc-id="' + escapeHtml(doc.id) + '">' +
            '<div class="pdf-doc-icon"><i data-lucide="file-text"></i></div>' +
            '<div class="pdf-doc-body">' +
                '<div class="pdf-doc-name" title="' + escapeHtml(doc.name) + '">' + escapeHtml(doc.name) + '</div>' +
                '<div class="pdf-doc-meta">' + escapeHtml(meta) + '</div>' +
                '<div class="pdf-doc-state ' + status.className + '" title="' + escapeHtml(doc.error || '') + '">' + escapeHtml(status.text) + '</div>' +
            '</div>' +
            '<div class="pdf-doc-actions">' +
                (canRetry ? '<button type="button" class="pdf-doc-action" data-doc-action="retry" title="Try reading this PDF again" aria-label="Retry ' + escapeHtml(doc.name) + '"><i data-lucide="refresh-cw"></i></button>' : '') +
                '<button type="button" class="pdf-doc-action pdf-doc-remove" data-doc-action="remove" title="Remove PDF" aria-label="Remove ' + escapeHtml(doc.name) + '"' + (canRemove ? '' : ' disabled') + '><i data-lucide="x"></i></button>' +
            '</div>' +
        '</article>';
    }

    /* ---------------------------------------------------------------------
       Shared single-file tool controller
       --------------------------------------------------------------------- */

    function createSingleDocTool(config) {
        const prefix = config.prefix;
        const els = {
            addBtn: byId(prefix + 'AddBtn'),
            clearBtn: byId(prefix + 'ClearAllBtn'),
            dropzone: byId(prefix + 'Dropzone'),
            input: byId(prefix + 'FileInput'),
            emptyAddBtn: byId(prefix + 'EmptyAddBtn'),
            empty: byId(prefix + 'Empty'),
            docs: byId(prefix + 'Docs'),
            count: byId(prefix + 'Count'),
            sub: byId(prefix + 'Sub'),
            total: byId(prefix + 'Total'),
            status: byId(prefix + 'Status'),
            error: byId(prefix + 'Error'),
            output: byId(prefix + 'Output'),
            outputName: byId(prefix + 'OutputName'),
            outputMeta: byId(prefix + 'OutputMeta'),
            downloadBtn: byId(prefix + 'DownloadBtn')
        };

        const ui = {
            doc: null,
            busy: false,
            loading: false,
            output: null,
            errorTimer: null
        };

        function setStatus(message, tone) {
            if (!els.status) return;
            els.status.textContent = message || '';
            els.status.className = 'resize-status' + (tone ? ' ' + tone : '');
        }

        function setError(message) {
            if (!els.error) return;
            els.error.textContent = message || '';
            clearTimeout(ui.errorTimer);
            if (message) {
                ui.errorTimer = setTimeout(function () {
                    els.error.textContent = '';
                }, 12000);
            }
        }

        function updateAction() {
            if (config.updateAction) config.updateAction(ui);
        }

        function clearOutput() {
            ui.output = null;
            if (els.output) els.output.hidden = true;
            if (els.outputMeta) els.outputMeta.textContent = '';
        }

        function setOutput(blob, name, meta) {
            ui.output = { blob: blob, name: name };
            if (els.output) els.output.hidden = false;
            if (els.outputName) els.outputName.textContent = name;
            if (els.outputMeta) els.outputMeta.textContent = meta || '';
            refreshIcons();
        }

        function render() {
            const doc = ui.doc;
            const status = doc ? statusText(doc) : null;

            if (els.count) els.count.textContent = doc ? '1' : '0';
            if (els.empty) els.empty.hidden = !!doc;
            if (els.docs) {
                els.docs.hidden = !doc;
                els.docs.innerHTML = doc ? singleDocCardHtml(doc, ui.busy || ui.loading) : '';
            }
            if (els.addBtn) els.addBtn.disabled = ui.busy || ui.loading;
            if (els.clearBtn) els.clearBtn.disabled = !doc || ui.busy || ui.loading;
            if (els.emptyAddBtn) els.emptyAddBtn.disabled = ui.busy || ui.loading;
            if (els.sub) {
                if (!doc) {
                    els.sub.textContent = config.emptySub || '';
                } else if (doc.status === 'loading') {
                    els.sub.textContent = 'Reading PDF…';
                } else if (doc.status === 'error') {
                    els.sub.textContent = 'This PDF could not be read.';
                } else {
                    els.sub.textContent = (doc.pageCount || 0) + (doc.pageCount === 1 ? ' page' : ' pages') +
                        ' · ' + (status && status.className === 'ready' && doc.usedPassword ? 'unlocked' : 'ready');
                }
            }
            if (els.total) els.total.textContent = doc ? formatBytes(doc.size) : '';

            updateAction();
            refreshIcons();
        }

        async function loadDoc(doc) {
            if (!doc || ui.doc !== doc) return;
            ui.loading = true;
            doc.status = 'loading';
            doc.error = '';
            clearOutput();
            setStatus('', '');
            setError('');
            render();

            try {
                await config.load(doc, ui);
                if (ui.doc !== doc) return;
                doc.status = 'ready';
                setStatus(config.readyStatus ? config.readyStatus(doc) : 'PDF ready.', 'success');
            } catch (error) {
                if (ui.doc !== doc) return;
                doc.status = 'error';
                doc.error = pdfErrorMessage(error);
                setStatus('', '');
                setError(error === CANCELLED
                    ? 'A password is required to read "' + doc.name + '". Use Retry to enter it.'
                    : doc.error);
            } finally {
                if (ui.doc === doc) {
                    ui.loading = false;
                    render();
                }
            }
        }

        function addFiles(fileList) {
            if (ui.busy || ui.loading) return;
            const files = Array.from(fileList || []);
            if (!files.length) return;
            const file = files.find(isPdfFile);
            if (!file) {
                setError('Please choose a PDF file.');
                return;
            }
            if (file.size > MAX_PDF_BYTES) {
                setError('"' + file.name + '" is larger than 100 MB.');
                return;
            }

            destroyDoc(ui.doc);
            const doc = createDocRecord(file);
            ui.doc = doc;
            if (config.onNewDoc) config.onNewDoc();
            loadDoc(doc);
        }

        function clearDoc() {
            if (ui.busy || ui.loading) return;
            destroyDoc(ui.doc);
            ui.doc = null;
            clearOutput();
            setStatus('', '');
            setError('');
            if (config.onClear) config.onClear();
            render();
        }

        function setBusy(value) {
            ui.busy = value;
            render();
        }

        if (els.addBtn) els.addBtn.addEventListener('click', function () {
            if (!ui.busy && !ui.loading) els.input.click();
        });
        if (els.emptyAddBtn) els.emptyAddBtn.addEventListener('click', function () {
            if (!ui.busy && !ui.loading) els.input.click();
        });
        if (els.clearBtn) els.clearBtn.addEventListener('click', clearDoc);
        if (els.docs) {
            els.docs.addEventListener('click', function (event) {
                const button = event.target.closest('[data-doc-action]');
                if (!button) return;
                const action = button.getAttribute('data-doc-action');
                if (action === 'remove') clearDoc();
                if (action === 'retry' && ui.doc) loadDoc(ui.doc);
            });
        }
        if (els.downloadBtn) {
            els.downloadBtn.addEventListener('click', function () {
                if (ui.output) downloadBlob(ui.output.blob, ui.output.name);
            });
        }
        bindDropzone(els.dropzone, els.input, addFiles, function () {
            return ui.busy || ui.loading;
        });

        render();

        return {
            els: els,
            ui: ui,
            render: render,
            updateAction: updateAction,
            setStatus: setStatus,
            setError: setError,
            setBusy: setBusy,
            setOutput: setOutput,
            clearOutput: clearOutput,
            clearDoc: clearDoc
        };
    }

    /* ---------------------------------------------------------------------
       PDF to Word
       --------------------------------------------------------------------- */

    function initPdfToWord() {
        const convertBtn = byId('pdfToWordConvertBtn');
        const rangeInput = byId('pdfToWordRange');
        const hint = byId('pdfToWordHint');
        if (!convertBtn || !rangeInput || !hint) return;

        const tool = createSingleDocTool({
            prefix: 'pdfToWord',
            emptySub: 'Add a PDF to extract its text.',
            load: function (doc) {
                return openPdfJsDocument(doc);
            },
            readyStatus: function (doc) {
                return 'Read ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') + ' from "' + doc.name + '".';
            },
            updateAction: function (ui) {
                const ready = !!(ui.doc && ui.doc.status === 'ready');
                convertBtn.disabled = !ready || ui.busy;

                if (!ui.doc) {
                    hint.textContent = 'Add a PDF to enable conversion.';
                } else if (ui.doc.status === 'loading') {
                    hint.textContent = 'Reading PDF…';
                } else if (ui.doc.status === 'error') {
                    hint.textContent = 'Fix the error above to continue.';
                } else if (ui.busy) {
                    hint.textContent = 'Extracting text…';
                } else {
                    hint.textContent = ui.doc.pageCount + (ui.doc.pageCount === 1 ? ' page' : ' pages') +
                        ' ready. Choose a range or convert all pages.';
                }
            },
            onNewDoc: function () {
                rangeInput.value = '';
                rangeInput.classList.remove('invalid');
            },
            onClear: function () {
                rangeInput.classList.remove('invalid');
            }
        });

        rangeInput.addEventListener('input', function () {
            rangeInput.classList.remove('invalid');
            tool.setError('');
        });

        convertBtn.addEventListener('click', async function () {
            const doc = tool.ui.doc;
            if (!doc || doc.status !== 'ready' || tool.ui.busy) return;

            let pageIndices;
            try {
                pageIndices = parsePageSelection(rangeInput.value, doc.pageCount);
            } catch (error) {
                rangeInput.classList.add('invalid');
                tool.setError(error.message);
                rangeInput.focus();
                return;
            }

            rangeInput.classList.remove('invalid');
            tool.setBusy(true);
            tool.clearOutput();
            tool.setStatus('Extracting text…', 'busy');

            try {
                const pagesLines = [];
                for (let index = 0; index < pageIndices.length; index++) {
                    const pageNumber = pageIndices[index] + 1;
                    tool.setStatus('Extracting page ' + (index + 1) + ' of ' + pageIndices.length + '…', 'busy');
                    const page = await doc.pdfjsDoc.getPage(pageNumber);
                    const content = await page.getTextContent();
                    pagesLines.push(textItemsToLines(content.items));
                    try { page.cleanup(); } catch (error) { /* ignore */ }
                    if (index % 5 === 0) {
                        await new Promise(function (resolve) { setTimeout(resolve, 0); });
                    }
                }

                const lineCount = pagesLines.reduce(function (sum, lines) {
                    return sum + lines.length;
                }, 0);

                if (!lineCount) {
                    throw new Error('No selectable text was found. This PDF may be a scan; run OCR first, then try again.');
                }

                const docxBlob = await buildDocx(pagesLines, doc.name);
                const fileName = safeBaseName(doc.name) + '.docx';
                const meta = pageIndices.length + (pageIndices.length === 1 ? ' page' : ' pages') +
                    ' · ' + lineCount + (lineCount === 1 ? ' paragraph' : ' paragraphs') +
                    ' · ' + formatBytes(docxBlob.size);
                tool.setOutput(docxBlob, fileName, meta);
                tool.setStatus('Word document ready — ' + meta + '.', 'success');
            } catch (error) {
                console.error('PDF to Word failed:', error);
                tool.setError(pdfErrorMessage(error));
                tool.setStatus('', '');
            } finally {
                tool.setBusy(false);
            }
        });
    }

    /* ---------------------------------------------------------------------
       Split PDF
       --------------------------------------------------------------------- */

    function initSplitPdf() {
        const modeSelect = byId('splitPdfMode');
        const modeHint = byId('splitPdfModeHint');
        const chunksField = byId('splitPdfChunksField');
        const chunksInput = byId('splitPdfChunks');
        const rangesField = byId('splitPdfRangesField');
        const rangesInput = byId('splitPdfRanges');
        const actionBtn = byId('splitPdfActionBtn');
        const actionHint = byId('splitPdfActionHint');
        const resultsSection = byId('splitPdfResultsSection');
        const resultsEl = byId('splitPdfResults');
        const resultCountEl = byId('splitPdfResultCount');
        const resultSummaryEl = byId('splitPdfResultSummary');
        const downloadAllBtn = byId('splitPdfDownloadAllBtn');
        if (!modeSelect || !actionBtn || !resultsEl) return;

        const state = {
            results: [],
            packaging: false
        };

        const tool = createSingleDocTool({
            prefix: 'splitPdf',
            emptySub: 'Add a PDF to split its pages.',
            load: function (doc) {
                return loadPdfLibDocumentRecord(doc);
            },
            readyStatus: function (doc) {
                return 'Read ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') + ' from "' + doc.name + '".';
            },
            updateAction: function (ui) {
                const ready = !!(ui.doc && ui.doc.status === 'ready');
                const locked = ui.busy || ui.loading;
                actionBtn.disabled = !ready || ui.busy;
                modeSelect.disabled = locked;
                if (chunksInput) chunksInput.disabled = locked;
                if (rangesInput) rangesInput.disabled = locked;
                if (!ui.doc) {
                    actionHint.textContent = 'Add a PDF to enable splitting.';
                } else if (ui.doc.status === 'loading') {
                    actionHint.textContent = 'Reading PDF…';
                } else if (ui.doc.status === 'error') {
                    actionHint.textContent = 'Fix the error above to continue.';
                } else if (ui.busy) {
                    actionHint.textContent = 'Splitting PDF…';
                } else {
                    actionHint.textContent = ui.doc.pageCount + (ui.doc.pageCount === 1 ? ' page' : ' pages') + ' ready to split.';
                }
            },
            onNewDoc: clearResults,
            onClear: clearResults
        });

        function clearResults() {
            state.results = [];
            renderResults();
            tool.setStatus('', '');
            tool.setError('');
        }

        function renderResults() {
            const count = state.results.length;
            if (resultCountEl) resultCountEl.textContent = count;
            if (resultsSection) resultsSection.hidden = count === 0;
            if (downloadAllBtn) {
                downloadAllBtn.hidden = count < 2;
                downloadAllBtn.disabled = count < 2 || state.packaging;
            }
            if (!count) {
                if (resultSummaryEl) resultSummaryEl.textContent = '';
                resultsEl.innerHTML = '';
                return;
            }

            const total = state.results.reduce(function (sum, result) {
                return sum + result.blob.size;
            }, 0);
            if (resultSummaryEl) {
                const doc = tool.ui.doc;
                resultSummaryEl.textContent = count + (count === 1 ? ' file' : ' files') + ' · ' +
                    formatBytes(total) + ' total' +
                    (doc && doc.usedPassword ? ' · outputs are not encrypted' : '');
            }

            resultsEl.innerHTML = state.results.map(function (result, index) {
                return '<article class="pdf-result-card pdf-file-result" role="listitem">' +
                    '<div class="pdf-result-file-icon"><i data-lucide="file-text"></i></div>' +
                    '<div class="pdf-result-body">' +
                        '<div class="pdf-result-name" title="' + escapeHtml(result.name) + '">' + escapeHtml(result.name) + '</div>' +
                        '<div class="pdf-result-meta">' + escapeHtml(result.label) + ' · ' + formatBytes(result.blob.size) + '</div>' +
                    '</div>' +
                    '<button type="button" class="pdf-result-download" data-split-action="download" data-result-index="' + index + '" aria-label="Download ' + escapeHtml(result.name) + '" title="Download this PDF"><i data-lucide="download"></i></button>' +
                '</article>';
            }).join('');
            refreshIcons();
        }

        function syncMode() {
            const mode = modeSelect.value;
            if (chunksField) chunksField.hidden = mode !== 'chunks';
            if (rangesField) rangesField.hidden = mode !== 'ranges';
            if (modeHint) {
                modeHint.textContent = mode === 'chunks'
                    ? 'Creates one PDF for each group of pages.'
                    : mode === 'ranges'
                        ? 'Each comma-separated range becomes its own PDF.'
                        : 'Creates a separate PDF for every page.';
            }
            clearResults();
            tool.render();
        }

        function buildPlan(doc) {
            const mode = modeSelect.value;
            if (mode === 'every') {
                return Array.from({ length: doc.pageCount }, function (_, index) {
                    return { indices: [index], label: pageLabel([index]) };
                });
            }

            if (mode === 'chunks') {
                const size = Number(chunksInput && chunksInput.value);
                if (!Number.isInteger(size) || size < 1 || size > 200) {
                    throw new Error('Pages per file must be a whole number between 1 and 200.');
                }
                const groups = [];
                for (let start = 0; start < doc.pageCount; start += size) {
                    const indices = [];
                    for (let page = start; page < Math.min(start + size, doc.pageCount); page++) {
                        indices.push(page);
                    }
                    groups.push({ indices: indices, label: pageLabel(indices) });
                }
                return groups;
            }

            if (!rangesInput || !rangesInput.value.trim()) {
                throw new Error('Enter at least one range, for example: 1-3, 4-6, 8.');
            }
            return parseRangeSegments(rangesInput.value, doc.pageCount).map(function (indices) {
                return { indices: indices, label: pageLabel(indices) };
            });
        }

        async function splitPdf() {
            const doc = tool.ui.doc;
            if (!doc || doc.status !== 'ready' || tool.ui.busy) return;

            let plan;
            try {
                plan = buildPlan(doc);
            } catch (error) {
                tool.setError(error.message);
                if (rangesInput) rangesInput.classList.add('invalid');
                return;
            }
            if (rangesInput) rangesInput.classList.remove('invalid');

            tool.setBusy(true);
            clearResults();
            tool.setStatus('Splitting PDF…', 'busy');

            try {
                const PDFLib = await loadPdfLib();
                const source = doc.pdfDoc;
                if (!source) throw new Error('Read the PDF again before splitting.');
                const usedNames = new Set();
                const base = safeBaseName(doc.name);
                const results = [];

                for (let index = 0; index < plan.length; index++) {
                    const item = plan[index];
                    tool.setStatus('Creating file ' + (index + 1) + ' of ' + plan.length + '…', 'busy');
                    const output = await PDFLib.PDFDocument.create();
                    const pages = await output.copyPages(source, item.indices);
                    pages.forEach(function (page) {
                        output.addPage(page);
                    });
                    const bytes = await output.save();
                    const blob = new Blob([bytes], { type: 'application/pdf' });
                    const name = uniqueName(base + '-' + pageSlug(item.indices) + '.pdf', usedNames);
                    results.push({ name: name, label: item.label, blob: blob });
                    if (index % 8 === 0) {
                        await new Promise(function (resolve) { setTimeout(resolve, 0); });
                    }
                }

                state.results = results;
                renderResults();
                tool.setStatus('Created ' + results.length + (results.length === 1 ? ' PDF.' : ' PDFs.') +
                    (doc.usedPassword ? ' The source was unlocked; split outputs are not encrypted.' : ''), 'success');
            } catch (error) {
                console.error('Split PDF failed:', error);
                tool.setError(pdfErrorMessage(error));
                tool.setStatus('', '');
            } finally {
                tool.setBusy(false);
            }
        }

        modeSelect.addEventListener('change', syncMode);
        chunksInput.addEventListener('input', function () {
            chunksInput.classList.remove('invalid');
            tool.setError('');
        });
        rangesInput.addEventListener('input', function () {
            rangesInput.classList.remove('invalid');
            tool.setError('');
        });
        actionBtn.addEventListener('click', splitPdf);

        resultsEl.addEventListener('click', function (event) {
            const button = event.target.closest('[data-split-action="download"]');
            if (!button) return;
            const index = Number(button.getAttribute('data-result-index'));
            const result = state.results[index];
            if (result) downloadBlob(result.blob, result.name);
        });

        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', async function () {
                if (!state.results.length || state.packaging) return;
                const results = state.results.slice();
                state.packaging = true;
                renderResults();
                tool.setError('');
                tool.setStatus('Packaging ZIP…', 'busy');
                try {
                    const zip = await createZip(results.map(function (result) {
                        return { name: result.name, blob: result.blob };
                    }));
                    downloadBlob(zip, safeBaseName(tool.ui.doc ? tool.ui.doc.name : 'split') + '-split.zip');
                    tool.setStatus('ZIP archive ready — ' + results.length + ' files, ' + formatBytes(zip.size) + '.', 'success');
                } catch (error) {
                    console.error('ZIP creation failed:', error);
                    tool.setError('Could not create the ZIP archive: ' + (error.message || 'unknown error'));
                    tool.setStatus('', '');
                } finally {
                    state.packaging = false;
                    renderResults();
                }
            });
        }

        syncMode();
    }

    /* ---------------------------------------------------------------------
       Merge PDFs
       --------------------------------------------------------------------- */

    function initMergePdf() {
        const addBtn = byId('mergePdfAddBtn');
        const clearBtn = byId('mergePdfClearAllBtn');
        const dropzone = byId('mergePdfDropzone');
        const input = byId('mergePdfFileInput');
        const emptyAddBtn = byId('mergePdfEmptyAddBtn');
        const empty = byId('mergePdfEmpty');
        const docsEl = byId('mergePdfDocs');
        const countEl = byId('mergePdfCount');
        const subEl = byId('mergePdfSub');
        const totalEl = byId('mergePdfTotal');
        const summaryEl = byId('mergePdfSummary');
        const actionBtn = byId('mergePdfActionBtn');
        const actionHint = byId('mergePdfActionHint');
        const outputNameInput = byId('mergePdfOutputName');
        const outputNamePreview = byId('mergePdfOutputNamePreview');
        const output = byId('mergePdfOutput');
        const outputFile = byId('mergePdfOutputFile');
        const outputMeta = byId('mergePdfOutputMeta');
        const downloadBtn = byId('mergePdfDownloadBtn');
        const statusEl = byId('mergePdfStatus');
        const errorEl = byId('mergePdfError');
        if (!actionBtn || !docsEl) return;

        const state = {
            docs: [],
            busy: false,
            adding: false,
            output: null,
            errorTimer: null
        };

        function setStatus(message, tone) {
            statusEl.textContent = message || '';
            statusEl.className = 'resize-status' + (tone ? ' ' + tone : '');
        }

        function setError(message) {
            errorEl.textContent = message || '';
            clearTimeout(state.errorTimer);
            if (message) {
                state.errorTimer = setTimeout(function () {
                    errorEl.textContent = '';
                }, 12000);
            }
        }

        function clearOutput() {
            state.output = null;
            if (output) output.hidden = true;
            if (outputMeta) outputMeta.textContent = '';
        }

        function setOutput(blob, name, meta) {
            state.output = { blob: blob, name: name };
            if (output) output.hidden = false;
            if (outputFile) outputFile.textContent = name;
            if (outputMeta) outputMeta.textContent = meta || '';
            refreshIcons();
        }

        function readyDocs() {
            return state.docs.filter(function (doc) {
                return doc.status === 'ready';
            });
        }

        function mergeCardHtml(doc) {
            const status = statusText(doc);
            const index = state.docs.indexOf(doc);
            const disabled = state.busy || state.adding;
            const canMove = !disabled && doc.status === 'ready';
            const meta = formatBytes(doc.size) + (doc.pageCount ? ' · ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') : '');
            const actions = [];
            if (doc.status === 'error' && !disabled) {
                actions.push('<button type="button" class="pdf-doc-action" data-doc-action="retry" title="Try reading this PDF again" aria-label="Retry ' + escapeHtml(doc.name) + '"><i data-lucide="refresh-cw"></i></button>');
            }
            if (doc.status === 'ready') {
                actions.push('<button type="button" class="pdf-doc-action" data-doc-action="up" title="Move up" aria-label="Move ' + escapeHtml(doc.name) + ' up"' + (index === 0 || !canMove ? ' disabled' : '') + '><i data-lucide="arrow-up"></i></button>');
                actions.push('<button type="button" class="pdf-doc-action" data-doc-action="down" title="Move down" aria-label="Move ' + escapeHtml(doc.name) + ' down"' + (index === state.docs.length - 1 || !canMove ? ' disabled' : '') + '><i data-lucide="arrow-down"></i></button>');
            }
            actions.push('<button type="button" class="pdf-doc-action pdf-doc-remove" data-doc-action="remove" title="Remove PDF" aria-label="Remove ' + escapeHtml(doc.name) + '"' + (disabled || doc.status === 'loading' ? ' disabled' : '') + '><i data-lucide="x"></i></button>');

            return '<article class="pdf-doc-card ' + status.className + '" data-doc-id="' + escapeHtml(doc.id) + '">' +
                '<div class="pdf-doc-icon"><i data-lucide="file-text"></i></div>' +
                '<div class="pdf-doc-body">' +
                    '<div class="pdf-doc-name" title="' + escapeHtml(doc.name) + '">' + escapeHtml(doc.name) + '</div>' +
                    '<div class="pdf-doc-meta">' + escapeHtml(meta) + '</div>' +
                    '<div class="pdf-doc-state ' + status.className + '" title="' + escapeHtml(doc.error || '') + '">' + escapeHtml(status.text) + '</div>' +
                '</div>' +
                '<div class="pdf-doc-actions">' + actions.join('') + '</div>' +
            '</article>';
        }

        function render() {
            const totalSize = state.docs.reduce(function (sum, doc) { return sum + doc.size; }, 0);
            const pages = readyDocs().reduce(function (sum, doc) { return sum + (doc.pageCount || 0); }, 0);
            const allReady = state.docs.length >= 2 && state.docs.every(function (doc) { return doc.status === 'ready'; });
            const hasErrors = state.docs.some(function (doc) { return doc.status === 'error'; });
            const anyLoading = state.docs.some(function (doc) { return doc.status === 'loading'; });

            countEl.textContent = state.docs.length;
            if (empty) empty.hidden = state.docs.length > 0;
            docsEl.hidden = state.docs.length === 0;
            docsEl.innerHTML = state.docs.map(mergeCardHtml).join('');
            if (totalEl) totalEl.textContent = state.docs.length ? formatBytes(totalSize) : '';
            if (subEl) {
                subEl.textContent = !state.docs.length
                    ? 'Add PDFs, then arrange their order.'
                    : state.docs.length + (state.docs.length === 1 ? ' file' : ' files') + ' · ' + pages + ' pages ready';
            }
            if (addBtn) addBtn.disabled = state.busy || state.adding;
            if (emptyAddBtn) emptyAddBtn.disabled = state.busy || state.adding;
            if (clearBtn) clearBtn.disabled = !state.docs.length || state.busy || state.adding;
            if (summaryEl) {
                summaryEl.innerHTML = '<span>' + state.docs.length + (state.docs.length === 1 ? ' file' : ' files') + '</span>' +
                    '<strong>' + pages + (pages === 1 ? ' page' : ' pages') + '</strong>';
            }

            actionBtn.disabled = !allReady || state.busy || state.adding;
            if (!state.docs.length) {
                actionHint.textContent = 'Add at least two PDFs to merge.';
            } else if (state.adding || anyLoading) {
                actionHint.textContent = 'Reading PDFs…';
            } else if (state.docs.length < 2) {
                actionHint.textContent = 'Add one more PDF to merge.';
            } else if (hasErrors) {
                actionHint.textContent = 'Retry or remove the PDFs marked with errors.';
            } else if (state.busy) {
                actionHint.textContent = 'Merging PDFs…';
            } else {
                actionHint.textContent = pages + ' pages will be merged in the order shown.';
            }

            refreshIcons();
        }

        async function loadMergeDoc(doc, quiet) {
            doc.status = 'loading';
            doc.error = '';
            if (!quiet) render();
            try {
                const pdfDoc = await loadPdfLibDocumentRecord(doc);
                doc.pdfDoc = pdfDoc;
                doc.status = 'ready';
            } catch (error) {
                doc.status = 'error';
                doc.error = error === CANCELLED
                    ? 'Password required. Retry to unlock this PDF.'
                    : pdfErrorMessage(error);
                if (!quiet) render();
                throw error;
            }
        }

        async function addFiles(fileList) {
            if (state.busy || state.adding) return;
            const files = Array.from(fileList || []);
            if (!files.length) return;
            const messages = [];
            const newlyAdded = [];

            for (const file of files) {
                if (state.docs.length >= MAX_MERGE_FILES) {
                    messages.push('You can merge up to ' + MAX_MERGE_FILES + ' PDFs at a time.');
                    break;
                }
                if (!isPdfFile(file)) {
                    messages.push('"' + file.name + '" is not a PDF.');
                    continue;
                }
                if (file.size > MAX_PDF_BYTES) {
                    messages.push('"' + file.name + '" is larger than 100 MB.');
                    continue;
                }
                const doc = createDocRecord(file);
                state.docs.push(doc);
                newlyAdded.push(doc);
            }

            if (messages.length) setError(messages.join(' '));
            if (!newlyAdded.length) {
                render();
                return;
            }

            clearOutput();
            setStatus('', '');
            state.adding = true;
            render();

            for (const doc of newlyAdded) {
                if (doc.status !== 'loading') continue;
                try {
                    await loadMergeDoc(doc, true);
                } catch (error) {
                    if (error !== CANCELLED) {
                        setError(doc.error);
                    } else {
                        setError('A password is required to read "' + doc.name + '". Use Retry to enter it.');
                    }
                }
                render();
            }

            state.adding = false;
            render();
        }

        async function retryDoc(doc) {
            if (state.busy || state.adding) return;
            clearOutput();
            setStatus('', '');
            setError('');
            state.adding = true;
            render();
            try {
                await loadMergeDoc(doc, true);
            } catch (error) {
                if (error === CANCELLED) {
                    setError('A password is required to read "' + doc.name + '". Use Retry to enter it.');
                } else {
                    setError(doc.error);
                }
            } finally {
                state.adding = false;
                render();
            }
        }

        function removeDoc(doc) {
            if (state.busy || state.adding) return;
            const index = state.docs.indexOf(doc);
            if (index < 0) return;
            state.docs.splice(index, 1);
            destroyDoc(doc);
            clearOutput();
            setError('');
            render();
        }

        function moveDoc(doc, direction) {
            if (state.busy || state.adding) return;
            const index = state.docs.indexOf(doc);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= state.docs.length) return;
            state.docs.splice(index, 1);
            state.docs.splice(target, 0, doc);
            clearOutput();
            setError('');
            render();
        }

        function clearAll() {
            if (state.busy || state.adding) return;
            state.docs.forEach(destroyDoc);
            state.docs = [];
            clearOutput();
            setStatus('', '');
            setError('');
            render();
        }

        async function mergePdfs() {
            if (state.busy || state.adding) return;
            const docs = state.docs;
            if (docs.length < 2 || !docs.every(function (doc) { return doc.status === 'ready'; })) return;

            state.busy = true;
            clearOutput();
            setError('');
            render();
            setStatus('Merging PDFs…', 'busy');

            try {
                const PDFLib = await loadPdfLib();
                const merged = await PDFLib.PDFDocument.create();
                let totalPages = 0;

                for (let index = 0; index < docs.length; index++) {
                    const doc = docs[index];
                    setStatus('Adding file ' + (index + 1) + ' of ' + docs.length + '…', 'busy');
                    const pages = await merged.copyPages(doc.pdfDoc, doc.pdfDoc.getPageIndices());
                    pages.forEach(function (page) {
                        merged.addPage(page);
                    });
                    totalPages += doc.pageCount || 0;
                    await new Promise(function (resolve) { setTimeout(resolve, 0); });
                }

                setStatus('Saving merged PDF…', 'busy');
                const bytes = await merged.save();
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const name = sanitizePdfName(outputNameInput && outputNameInput.value, 'merged');
                const usedPassword = docs.some(function (doc) { return doc.usedPassword; });
                const meta = totalPages + (totalPages === 1 ? ' page' : ' pages') + ' · ' +
                    docs.length + ' files · ' + formatBytes(blob.size) + (usedPassword ? ' · not encrypted' : '');
                setOutput(blob, name, meta);
                setStatus('Merged ' + docs.length + ' PDFs into ' + totalPages + ' pages — ' + formatBytes(blob.size) + '.', 'success');
            } catch (error) {
                console.error('Merge PDFs failed:', error);
                setError(pdfErrorMessage(error));
                setStatus('', '');
            } finally {
                state.busy = false;
                render();
            }
        }

        function syncOutputName() {
            if (outputNamePreview) {
                outputNamePreview.textContent = sanitizePdfName(outputNameInput && outputNameInput.value, 'merged');
            }
        }

        if (addBtn) addBtn.addEventListener('click', function () {
            if (!state.busy && !state.adding) input.click();
        });
        if (emptyAddBtn) emptyAddBtn.addEventListener('click', function () {
            if (!state.busy && !state.adding) input.click();
        });
        if (clearBtn) clearBtn.addEventListener('click', clearAll);
        if (outputNameInput) outputNameInput.addEventListener('input', syncOutputName);
        if (downloadBtn) {
            downloadBtn.addEventListener('click', function () {
                if (state.output) downloadBlob(state.output.blob, state.output.name);
            });
        }
        actionBtn.addEventListener('click', mergePdfs);

        docsEl.addEventListener('click', function (event) {
            const button = event.target.closest('[data-doc-action]');
            if (!button) return;
            const card = button.closest('[data-doc-id]');
            if (!card) return;
            const doc = state.docs.find(function (item) {
                return item.id === card.getAttribute('data-doc-id');
            });
            if (!doc) return;
            const action = button.getAttribute('data-doc-action');
            if (action === 'remove') removeDoc(doc);
            if (action === 'up') moveDoc(doc, -1);
            if (action === 'down') moveDoc(doc, 1);
            if (action === 'retry') retryDoc(doc);
        });

        bindDropzone(dropzone, input, addFiles, function () {
            return state.busy || state.adding;
        });

        syncOutputName();
        render();
    }

    /* ---------------------------------------------------------------------
       Watermark PDF
       --------------------------------------------------------------------- */

    function hexToRgb(hex) {
        const match = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
        if (!match) return null;
        const value = match[1];
        return {
            r: parseInt(value.slice(0, 2), 16) / 255,
            g: parseInt(value.slice(2, 4), 16) / 255,
            b: parseInt(value.slice(4, 6), 16) / 255
        };
    }

    function initWatermarkPdf() {
        const textInput = byId('watermarkPdfText');
        const sizeInput = byId('watermarkPdfSize');
        const opacityInput = byId('watermarkPdfOpacity');
        const rotationSelect = byId('watermarkPdfRotation');
        const colorInput = byId('watermarkPdfColor');
        const rangeInput = byId('watermarkPdfRange');
        const applyBtn = byId('watermarkPdfApplyBtn');
        const hint = byId('watermarkPdfHint');
        if (!applyBtn || !textInput) return;

        const tool = createSingleDocTool({
            prefix: 'watermarkPdf',
            emptySub: 'Add a PDF to stamp a text watermark.',
            load: function (doc) {
                return loadPdfLibDocumentRecord(doc);
            },
            readyStatus: function (doc) {
                return 'Read ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') + ' from "' + doc.name + '".';
            },
            updateAction: function (ui) {
                const ready = !!(ui.doc && ui.doc.status === 'ready');
                applyBtn.disabled = !ready || ui.busy;
                if (!ui.doc) {
                    hint.textContent = 'Add a PDF to enable watermarking.';
                } else if (ui.doc.status === 'loading') {
                    hint.textContent = 'Reading PDF…';
                } else if (ui.doc.status === 'error') {
                    hint.textContent = 'Fix the error above to continue.';
                } else if (ui.busy) {
                    hint.textContent = 'Applying watermark…';
                } else if (rangeInput && rangeInput.value.trim()) {
                    hint.textContent = 'Only the pages you list will be watermarked.';
                } else {
                    hint.textContent = 'All ' + ui.doc.pageCount + (ui.doc.pageCount === 1 ? ' page' : ' pages') + ' will be watermarked.';
                }
            },
            onNewDoc: function () {
                rangeInput.value = '';
                rangeInput.classList.remove('invalid');
            },
            onClear: function () {
                rangeInput.classList.remove('invalid');
            }
        });

        rangeInput.addEventListener('input', function () {
            rangeInput.classList.remove('invalid');
            tool.setError('');
            tool.updateAction();
        });

        applyBtn.addEventListener('click', async function () {
            const doc = tool.ui.doc;
            if (!doc || doc.status !== 'ready' || tool.ui.busy) return;

            const text = textInput.value.trim();
            if (!text) {
                tool.setError('Enter the watermark text.');
                textInput.focus();
                return;
            }
            if (text.length > 80) {
                tool.setError('Watermark text must be 80 characters or fewer.');
                textInput.focus();
                return;
            }

            const size = Number(sizeInput.value);
            if (!Number.isFinite(size) || size < 8 || size > 240) {
                tool.setError('Font size must be a number between 8 and 240.');
                sizeInput.focus();
                return;
            }

            const opacity = Number(opacityInput.value);
            if (!Number.isFinite(opacity) || opacity < 5 || opacity > 100) {
                tool.setError('Opacity must be between 5% and 100%.');
                opacityInput.focus();
                return;
            }

            const rotation = Number(rotationSelect.value);
            if (![-45, 0, 45, 90].includes(rotation)) {
                tool.setError('Choose a valid watermark rotation.');
                return;
            }

            const color = hexToRgb(colorInput.value);
            if (!color) {
                tool.setError('Choose a valid watermark color.');
                colorInput.focus();
                return;
            }

            let pageIndices;
            try {
                pageIndices = parsePageSelection(rangeInput.value, doc.pageCount);
            } catch (error) {
                rangeInput.classList.add('invalid');
                tool.setError(error.message);
                rangeInput.focus();
                return;
            }
            rangeInput.classList.remove('invalid');

            tool.setBusy(true);
            tool.clearOutput();
            tool.setStatus('Applying watermark…', 'busy');

            try {
                const PDFLib = await loadPdfLib();
                const pdfDoc = await openPdfLibDocument(doc);
                const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

                let baseWidth;
                try {
                    baseWidth = font.widthOfTextAtSize(text, size);
                } catch (error) {
                    throw new Error('The standard PDF font cannot render some characters in this watermark. Use Latin letters and common punctuation.');
                }

                for (let index = 0; index < pageIndices.length; index++) {
                    const page = pdfDoc.getPage(pageIndices[index]);
                    const pageSize = page.getSize();
                    const pageRotation = ((page.getRotation().angle % 360) + 360) % 360;
                    const drawAngle = rotation - pageRotation;
                    const radians = drawAngle * Math.PI / 180;
                    const visualWidth = (pageRotation === 90 || pageRotation === 270) ? pageSize.height : pageSize.width;
                    const visualHeight = (pageRotation === 90 || pageRotation === 270) ? pageSize.width : pageSize.height;
                    const maxWidth = rotation === 0
                        ? visualWidth * 0.92
                        : rotation === 90
                            ? visualHeight * 0.92
                            : Math.hypot(visualWidth, visualHeight) * 0.72;
                    const drawSize = Math.max(8, Math.min(size, size * maxWidth / Math.max(baseWidth, 1)));
                    const textWidth = font.widthOfTextAtSize(text, drawSize);
                    const textHeight = font.heightAtSize(drawSize);
                    const offsetX = (textWidth / 2) * Math.cos(radians) - (textHeight / 2) * Math.sin(radians);
                    const offsetY = (textWidth / 2) * Math.sin(radians) + (textHeight / 2) * Math.cos(radians);
                    const x = pageSize.width / 2 - offsetX;
                    const y = pageSize.height / 2 - offsetY;

                    page.drawText(text, {
                        x: x,
                        y: y,
                        size: drawSize,
                        font: font,
                        color: PDFLib.rgb(color.r, color.g, color.b),
                        opacity: opacity / 100,
                        rotate: PDFLib.degrees(drawAngle)
                    });

                    if (index % 20 === 0) {
                        tool.setStatus('Watermarking page ' + (index + 1) + ' of ' + pageIndices.length + '…', 'busy');
                        await new Promise(function (resolve) { setTimeout(resolve, 0); });
                    }
                }

                tool.setStatus('Saving watermarked PDF…', 'busy');
                const bytes = await pdfDoc.save();
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const name = safeBaseName(doc.name) + '-watermarked.pdf';
                const meta = pageIndices.length + (pageIndices.length === 1 ? ' page' : ' pages') +
                    ' · ' + formatBytes(blob.size) + (doc.usedPassword ? ' · not encrypted' : '');
                tool.setOutput(blob, name, meta);
                tool.setStatus('Watermarked ' + pageIndices.length + (pageIndices.length === 1 ? ' page' : ' pages') +
                    ' — ' + formatBytes(blob.size) + '.', 'success');
            } catch (error) {
                console.error('Watermark PDF failed:', error);
                tool.setError(pdfErrorMessage(error));
                tool.setStatus('', '');
            } finally {
                tool.setBusy(false);
            }
        });
    }

    /* ---------------------------------------------------------------------
       Protect PDF (AES-256 encryption)
       --------------------------------------------------------------------- */

    function looksEncrypted(bytes) {
        const tail = bytes.slice(Math.max(0, bytes.length - 131072));
        const text = new TextDecoder('latin1').decode(tail);
        return /\/Encrypt\b/.test(text);
    }

    function initProtectPdf() {
        const passwordInput = byId('protectPdfPassword');
        const confirmInput = byId('protectPdfConfirm');
        const ownerInput = byId('protectPdfOwner');
        const allowPrinting = byId('protectPdfAllowPrinting');
        const allowCopying = byId('protectPdfAllowCopying');
        const allowModifying = byId('protectPdfAllowModifying');
        const applyBtn = byId('protectPdfApplyBtn');
        const hint = byId('protectPdfHint');
        if (!applyBtn || !passwordInput || !confirmInput) return;

        function validationMessage() {
            const password = passwordInput.value;
            const confirm = confirmInput.value;
            const owner = ownerInput ? ownerInput.value : '';
            if (!password) return 'Choose an open password of at least 8 characters.';
            if (password.length < 8) return 'Use a password of at least 8 characters.';
            if (!confirm) return 'Repeat the password to confirm it.';
            if (password !== confirm) return 'Passwords do not match.';
            if (owner && owner.length < 8) return 'The owner password must be at least 8 characters.';
            return '';
        }

        const tool = createSingleDocTool({
            prefix: 'protectPdf',
            emptySub: 'Add a PDF to encrypt it.',
            load: function (doc) {
                return loadPdfLibDocumentRecord(doc);
            },
            readyStatus: function (doc) {
                return 'Read ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') + ' from "' + doc.name + '".';
            },
            updateAction: function (ui) {
                const ready = !!(ui.doc && ui.doc.status === 'ready');
                const message = validationMessage();
                applyBtn.disabled = !ready || ui.busy || !!message;

                if (!ui.doc) {
                    hint.textContent = 'Add a PDF to enable protection.';
                } else if (ui.doc.status === 'loading') {
                    hint.textContent = 'Reading PDF…';
                } else if (ui.doc.status === 'error') {
                    hint.textContent = 'Fix the error above to continue.';
                } else if (ui.busy) {
                    hint.textContent = 'Encrypting PDF…';
                } else if (message) {
                    hint.textContent = message;
                } else {
                    hint.textContent = ui.doc.pageCount + (ui.doc.pageCount === 1 ? ' page' : ' pages') +
                        ' will be encrypted with AES-256.';
                }
            }
        });

        [passwordInput, confirmInput, ownerInput].forEach(function (field) {
            if (!field) return;
            field.addEventListener('input', function () {
                tool.setError('');
                tool.updateAction();
            });
        });

        applyBtn.addEventListener('click', async function () {
            const doc = tool.ui.doc;
            if (!doc || doc.status !== 'ready' || tool.ui.busy) return;

            const password = passwordInput.value;
            const confirm = confirmInput.value;
            const owner = ownerInput ? ownerInput.value : '';
            const message = validationMessage();
            if (message) {
                tool.setError(message);
                (password.length < 8 ? passwordInput : confirmInput).focus();
                return;
            }

            tool.setBusy(true);
            tool.clearOutput();
            tool.setStatus('Encrypting with AES-256…', 'busy');

            try {
                const PDFLib = await loadPdfLib();
                const pdfDoc = await openPdfLibDocument(doc);
                if (typeof pdfDoc.encrypt !== 'function') {
                    throw new Error('This PDF engine does not support encryption. Refresh the page and try again.');
                }

                pdfDoc.encrypt({
                    userPassword: password,
                    ownerPassword: owner || password,
                    permissions: {
                        printing: allowPrinting && allowPrinting.checked ? 'highResolution' : false,
                        copying: !!(allowCopying && allowCopying.checked),
                        modifying: !!(allowModifying && allowModifying.checked),
                        annotating: false,
                        fillingForms: false,
                        contentAccessibility: true,
                        documentAssembly: false
                    }
                });

                const bytes = await pdfDoc.save();
                if (!looksEncrypted(bytes)) {
                    throw new Error('Encryption could not be verified. The protected file was not created.');
                }

                const blob = new Blob([bytes], { type: 'application/pdf' });
                const name = safeBaseName(doc.name) + '-protected.pdf';
                const meta = 'AES-256 · ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') +
                    ' · ' + formatBytes(blob.size);
                tool.setOutput(blob, name, meta);
                tool.setStatus('Encrypted ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') +
                    ' with AES-256. Keep the password safe — it cannot be recovered.', 'success');

                passwordInput.value = '';
                confirmInput.value = '';
                if (ownerInput) ownerInput.value = '';
                tool.updateAction();
            } catch (error) {
                console.error('Protect PDF failed:', error);
                tool.setError(pdfErrorMessage(error));
                tool.setStatus('', '');
            } finally {
                tool.setBusy(false);
            }
        });
    }

    /* ---------------------------------------------------------------------
       Initialize everything
       --------------------------------------------------------------------- */

    try {
        initPdfToWord();
        initSplitPdf();
        initMergePdf();
        initWatermarkPdf();
        initProtectPdf();
    } catch (error) {
        console.error('Could not initialize extra PDF tools:', error);
    }
})();
