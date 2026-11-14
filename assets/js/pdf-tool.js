/* Secure Tools PDF utilities: PDF to images and images to PDF, fully client-side. */
(function () {
    'use strict';

    const PDFJS_BASE = 'assets/vendor/pdfjs/';
    const PDFLIB_SRC = 'assets/vendor/pdf-lib/pdf-lib.min.js?v=2.11.1';

    const MAX_PDF_FILES = 10;
    const MAX_PDF_BYTES = 100 * 1024 * 1024;
    const MAX_PDF_PAGES = 200;
    const MAX_OUTPUT_PX = 10000;

    const MAX_IMAGE_FILES = 50;
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const MAX_IMAGE_TOTAL_BYTES = 100 * 1024 * 1024;

    const CANCELLED = Symbol('pdf-cancelled');
    const PAGE_SIZES = {
        a4: { width: 595.28, height: 841.89 },
        letter: { width: 612, height: 792 }
    };
    const MARGINS = {
        none: 0,
        small: 18,
        big: 36
    };
    const IMAGE_EXTENSIONS = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/avif': 'avif'
    };
    const IMAGE_MIMES_BY_EXTENSION = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        bmp: 'image/bmp',
        avif: 'image/avif'
    };

    let pdfjsPromise = null;
    let pdfLibPromise = null;

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
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeBaseName(name) {
        const base = String(name || 'file').replace(/\.[^.]+$/, '');
        const safe = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
        return (safe || 'file').slice(0, 90);
    }

    function padNumber(value, length) {
        return String(value).padStart(length, '0');
    }

    function extensionForMime(mime) {
        return IMAGE_EXTENSIONS[mime] || 'png';
    }

    function mimeLabel(mime) {
        return {
            'image/jpeg': 'JPG',
            'image/png': 'PNG',
            'image/webp': 'WebP',
            'image/gif': 'GIF',
            'image/bmp': 'BMP',
            'image/avif': 'AVIF'
        }[mime] || '—';
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

    // Shared lightbox (assets/js/image-preview.js) powers every image preview.
    function closePreview() {
        if (window.ImagePreview) window.ImagePreview.close();
    }

    function openPreview(options) {
        if (window.ImagePreview) window.ImagePreview.open(options);
    }

    function canvasToBlob(canvas, mime, quality) {
        return new Promise(function (resolve, reject) {
            try {
                canvas.toBlob(function (blob) {
                    if (!blob) {
                        reject(new Error('The image could not be encoded. Try a smaller page or a different format.'));
                        return;
                    }
                    resolve(blob);
                }, mime, quality);
            } catch (error) {
                reject(new Error('The image is too large to process in this browser.'));
            }
        });
    }

    function makeThumbnail(canvas, maxSide) {
        const limit = maxSide || 320;
        const scale = Math.min(1, limit / Math.max(canvas.width, canvas.height, 1));
        const thumb = document.createElement('canvas');
        thumb.width = Math.max(1, Math.round(canvas.width * scale));
        thumb.height = Math.max(1, Math.round(canvas.height * scale));
        const ctx = thumb.getContext('2d');
        if (!ctx) return '';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, thumb.width, thumb.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
        return thumb.toDataURL('image/png');
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

    function bindDropzone(dropzone, input, onFiles) {
        if (!dropzone || !input) return;

        dropzone.addEventListener('click', function () {
            if (dropzone.classList.contains('is-disabled')) return;
            input.click();
        });
        dropzone.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            if (dropzone.classList.contains('is-disabled')) return;
            input.click();
        });
        ['dragenter', 'dragover'].forEach(function (type) {
            dropzone.addEventListener(type, function (event) {
                event.preventDefault();
                if (dropzone.classList.contains('is-disabled')) return;
                dropzone.classList.add('dragover');
            });
        });
        ['dragleave', 'dragend', 'drop'].forEach(function (type) {
            dropzone.addEventListener(type, function (event) {
                event.preventDefault();
                dropzone.classList.remove('dragover');
            });
        });
        dropzone.addEventListener('drop', function (event) {
            if (dropzone.classList.contains('is-disabled')) return;
            const files = event.dataTransfer && event.dataTransfer.files;
            if (files && files.length) onFiles(files);
        });
        input.addEventListener('change', function () {
            if (input.files && input.files.length) onFiles(input.files);
            input.value = '';
        });
    }

    function bindWorkspaceDrop(workspace, onFiles) {
        if (!workspace) return;
        ['dragenter', 'dragover'].forEach(function (type) {
            workspace.addEventListener(type, function (event) {
                if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                workspace.classList.add('dragover');
            });
        });
        ['dragleave', 'dragend'].forEach(function (type) {
            workspace.addEventListener(type, function () {
                workspace.classList.remove('dragover');
            });
        });
        workspace.addEventListener('drop', function (event) {
            if (!event.dataTransfer || !event.dataTransfer.files.length) return;
            event.preventDefault();
            workspace.classList.remove('dragover');
            onFiles(event.dataTransfer.files);
        });
    }

    /* ---------------------------------------------------------------------
       PDF to images
       --------------------------------------------------------------------- */

    function initPdfToImages() {
        const app = document.getElementById('pdfToImagesApp');
        if (!app) return;

        const addBtn = document.getElementById('pdfToImagesAddBtn');
        const clearAllBtn = document.getElementById('pdfToImagesClearAllBtn');
        const emptyAddBtn = document.getElementById('pdfToImagesEmptyAddBtn');
        const dropzone = document.getElementById('pdfToImagesDropzone');
        const fileInput = document.getElementById('pdfToImagesFileInput');
        const workspace = app.querySelector('.resize-workspace');
        const docsEl = document.getElementById('pdfToImagesDocs');
        const emptyEl = document.getElementById('pdfToImagesEmpty');
        const countEl = document.getElementById('pdfToImagesCount');
        const subEl = document.getElementById('pdfToImagesSub');
        const totalEl = document.getElementById('pdfToImagesTotal');
        const modeButtons = document.querySelectorAll('#pdfConvertMode .pdf-choice-btn');
        const modeHint = document.getElementById('pdfModeHint');
        const formatSelect = document.getElementById('pdfImageFormat');
        const qualityGroup = document.getElementById('pdfQualityGroup');
        const qualityButtons = document.querySelectorAll('#pdfQualityChoices .pdf-choice-btn');
        const pageRangeInput = document.getElementById('pdfPageRange');
        const pageRangeHint = document.getElementById('pdfPageRangeHint');
        const convertBtn = document.getElementById('pdfConvertBtn');
        const cancelBtn = document.getElementById('pdfCancelBtn');
        const convertHint = document.getElementById('pdfConvertHint');
        const resultsSection = document.getElementById('pdfToImagesResultsSection');
        const resultsEl = document.getElementById('pdfToImagesResults');
        const resultCountEl = document.getElementById('pdfResultCount');
        const resultSummaryEl = document.getElementById('pdfResultSummary');
        const downloadAllBtn = document.getElementById('pdfDownloadAllBtn');
        const statusEl = document.getElementById('pdfToImagesStatus');
        const errorEl = document.getElementById('pdfToImagesError');

        const state = {
            docs: [],
            results: [],
            nextId: 1,
            mode: 'page',
            quality: 'high',
            isConverting: false,
            cancelled: false,
            generation: 0,
            renderTask: null,
            errorTimer: null,
            packaging: false,
            lastMode: 'page'
        };

        let passwordModal = null;
        let passwordResolve = null;
        let passwordDocId = null;

        function setStatus(message, tone) {
            statusEl.textContent = message || '';
            statusEl.className = 'resize-status' + (tone ? ' ' + tone : '');
        }

        function showError(message) {
            errorEl.textContent = message || '';
            clearTimeout(state.errorTimer);
            if (message) {
                state.errorTimer = setTimeout(function () {
                    errorEl.textContent = '';
                }, 10000);
            }
        }

        function showPasswordModal(doc, incorrect) {
            if (!passwordModal) {
                passwordModal = document.createElement('div');
                passwordModal.className = 'pdf-modal';
                passwordModal.hidden = true;
                passwordModal.innerHTML =
                    '<div class="pdf-modal-card" role="dialog" aria-modal="true" aria-labelledby="pdfPasswordTitle" aria-describedby="pdfPasswordDesc">' +
                        '<div class="pdf-modal-icon"><i data-lucide="lock-keyhole"></i></div>' +
                        '<h3 id="pdfPasswordTitle">Password required</h3>' +
                        '<p id="pdfPasswordDesc">This PDF is protected. Enter its password to continue.</p>' +
                        '<form class="pdf-modal-form">' +
                            '<label class="pdf-modal-label" for="pdfPasswordInput">PDF password</label>' +
                            '<input type="password" class="resize-field" id="pdfPasswordInput" autocomplete="off" spellcheck="false" required>' +
                            '<p class="pdf-modal-error" id="pdfPasswordError" hidden></p>' +
                            '<div class="pdf-modal-actions">' +
                                '<button type="button" class="pdf-modal-cancel" data-modal-action="cancel">Cancel</button>' +
                                '<button type="submit" class="pdf-modal-submit"><i data-lucide="lock-open"></i> Unlock PDF</button>' +
                            '</div>' +
                        '</form>' +
                    '</div>';
                document.body.appendChild(passwordModal);

                const form = passwordModal.querySelector('.pdf-modal-form');
                const input = passwordModal.querySelector('#pdfPasswordInput');
                const error = passwordModal.querySelector('#pdfPasswordError');

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

            const title = passwordModal.querySelector('#pdfPasswordTitle');
            const desc = passwordModal.querySelector('#pdfPasswordDesc');
            const error = passwordModal.querySelector('#pdfPasswordError');
            const input = passwordModal.querySelector('#pdfPasswordInput');

            title.textContent = incorrect ? 'Incorrect password' : 'Password required';
            desc.textContent = '"' + doc.name + '" is protected. Enter its password to continue.';
            error.textContent = incorrect ? 'That password did not unlock the PDF. Try again.' : '';
            error.hidden = !incorrect;
            input.value = '';
            passwordModal.hidden = false;
            passwordDocId = doc.id;

            setTimeout(function () {
                input.focus();
            }, 30);
            refreshIcons();

            return new Promise(function (resolve) {
                passwordResolve = resolve;
            });
        }

        function finishPassword(value) {
            if (!passwordResolve) return;
            const resolve = passwordResolve;
            passwordResolve = null;
            passwordDocId = null;
            if (passwordModal) {
                passwordModal.hidden = true;
                const input = passwordModal.querySelector('#pdfPasswordInput');
                if (input) input.value = '';
            }
            resolve(value);
        }

        function isPdfFile(file) {
            const type = (file.type || '').toLowerCase();
            if (type === 'application/pdf') return true;
            return /\.pdf$/i.test(file.name || '');
        }

        function pdfErrorMessage(error) {
            const name = error && error.name ? error.name : '';
            const message = error && error.message ? error.message : '';
            if (name === 'PasswordException' || /password/i.test(message)) {
                return 'This PDF is password-protected. Use Unlock to enter the password.';
            }
            if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) {
                return 'This file is not a valid PDF or is corrupted.';
            }
            if (name === 'MissingPDFException') {
                return 'The PDF could not be read from disk.';
            }
            return message || 'Could not read this PDF.';
        }

        function docStatus(doc) {
            if (doc.status === 'loading') return { text: 'Reading PDF…', className: 'loading' };
            if (doc.status === 'ready') return { text: doc.passwordProtected ? 'Unlocked' : 'Ready', className: 'ready' };
            if (doc.status === 'error') return { text: doc.error || 'Could not read this PDF.', className: 'error' };
            return { text: 'Queued', className: 'queued' };
        }

        function docCardHtml(doc) {
            const status = docStatus(doc);
            const meta = formatBytes(doc.size) + (doc.pageCount ? ' · ' + doc.pageCount + (doc.pageCount === 1 ? ' page' : ' pages') : '');
            const retry = !state.isConverting && doc.status === 'error';
            return '<article class="pdf-doc-card ' + status.className + '" data-doc-id="' + doc.id + '">' +
                '<div class="pdf-doc-icon"><i data-lucide="file-text"></i></div>' +
                '<div class="pdf-doc-body">' +
                    '<div class="pdf-doc-name" title="' + escapeHtml(doc.name) + '">' + escapeHtml(doc.name) + '</div>' +
                    '<div class="pdf-doc-meta">' + escapeHtml(meta) + '</div>' +
                    '<div class="pdf-doc-state ' + status.className + '" title="' + escapeHtml(doc.error || '') + '">' + escapeHtml(status.text) + '</div>' +
                '</div>' +
                '<div class="pdf-doc-actions">' +
                    (retry ? '<button type="button" class="pdf-doc-action" data-doc-action="retry" title="Try reading this PDF again" aria-label="Retry ' + escapeHtml(doc.name) + '"><i data-lucide="refresh-cw"></i></button>' : '') +
                    '<button type="button" class="pdf-doc-action pdf-doc-remove" data-doc-action="remove" title="Remove PDF" aria-label="Remove ' + escapeHtml(doc.name) + '"' + (state.isConverting ? ' disabled' : '') + '><i data-lucide="x"></i></button>' +
                '</div>' +
            '</article>';
        }

        function renderDocs() {
            docsEl.innerHTML = state.docs.map(docCardHtml).join('');
            docsEl.hidden = state.docs.length === 0;
            refreshIcons();
        }

        function resultCardHtml(result, index) {
            const kind = result.kind === 'page' ? 'Page ' + result.page : 'Image';
            return '<article class="pdf-result-card" data-result-id="' + index + '" role="listitem">' +
                '<div class="pdf-result-thumb">' +
                    (result.thumb ? '<img src="' + result.thumb + '" alt="">' : '<i data-lucide="file-image"></i>') +
                    '<span class="pdf-result-badge">' + escapeHtml(kind) + '</span>' +
                    '<button type="button" class="image-preview-trigger" data-result-action="preview" aria-label="Preview ' + escapeHtml(result.name) + '" title="Preview image"><i data-lucide="zoom-in"></i></button>' +
                '</div>' +
                '<div class="pdf-result-body">' +
                    '<div class="pdf-result-name" title="' + escapeHtml(result.name) + '">' + escapeHtml(result.name) + '</div>' +
                    '<div class="pdf-result-meta">' + result.width.toLocaleString() + ' × ' + result.height.toLocaleString() + ' px · ' + formatBytes(result.blob.size) + '</div>' +
                '</div>' +
                '<button type="button" class="pdf-result-download" data-result-action="download" aria-label="Download ' + escapeHtml(result.name) + '" title="Download this image"><i data-lucide="download"></i></button>' +
            '</article>';
        }

        function updateResultsUi() {
            const count = state.results.length;
            resultCountEl.textContent = count;
            resultsSection.hidden = count === 0;
            downloadAllBtn.hidden = count < 2;
            downloadAllBtn.disabled = count < 2 || state.packaging;

            if (!count) {
                resultSummaryEl.textContent = '';
                return;
            }

            const total = state.results.reduce(function (sum, result) {
                return sum + result.blob.size;
            }, 0);
            resultSummaryEl.textContent = count + (count === 1 ? ' image' : ' images') +
                ' · ' + formatBytes(total) + ' total · ' +
                (state.lastMode === 'page' ? 'rendered pages' : 'embedded images');
        }

        function appendResult(result) {
            state.results.push(result);
            resultsEl.insertAdjacentHTML('beforeend', resultCardHtml(result, state.results.length - 1));
            updateResultsUi();
            refreshIcons();
        }

        function clearResults() {
            closePreview();
            state.results = [];
            resultsEl.innerHTML = '';
            updateResultsUi();
        }

        function resetDocs() {
            state.docs.forEach(function (doc) {
                if (doc.task) {
                    try { doc.task.destroy(); } catch (error) { /* ignore */ }
                }
                if (doc.pdf) {
                    try { doc.pdf.destroy(); } catch (error) { /* ignore */ }
                }
            });
            state.docs = [];
            renderDocs();
        }

        function updateUi() {
            const ready = state.docs.filter(function (doc) { return doc.status === 'ready'; }).length;
            const sourceBytes = state.docs.reduce(function (sum, doc) { return sum + doc.size; }, 0);
            const outputBytes = state.results.reduce(function (sum, result) { return sum + result.blob.size; }, 0);

            countEl.textContent = state.docs.length;
            emptyEl.hidden = state.docs.length > 0;
            docsEl.hidden = state.docs.length === 0;

            if (state.docs.length) {
                subEl.textContent = ready === state.docs.length
                    ? state.docs.length + (state.docs.length === 1 ? ' PDF ready' : ' PDFs ready') + ' · max 100 MB each'
                    : ready + ' of ' + state.docs.length + ' PDFs ready · max 100 MB each';
                totalEl.textContent = state.results.length
                    ? formatBytes(outputBytes) + ' output'
                    : formatBytes(sourceBytes) + ' source';
            } else {
                subEl.textContent = 'Add PDFs to convert their pages or images.';
                totalEl.textContent = '';
            }

            if (state.isConverting) {
                convertHint.textContent = 'Conversion in progress. Use Cancel to stop.';
            } else if (!state.docs.length) {
                convertHint.textContent = 'Add PDFs to enable conversion.';
            } else if (!ready) {
                convertHint.textContent = 'Waiting for PDFs to load…';
            } else {
                const format = formatSelect.value;
                const detail = format === 'image/png'
                    ? 'lossless PNG'
                    : (state.quality === 'high' ? 'High quality' : 'Normal quality');
                convertHint.textContent = ready + (ready === 1 ? ' PDF' : ' PDFs') + ' · ' +
                    (state.mode === 'page' ? 'pages' : 'embedded images') + ' · ' +
                    mimeLabel(format) + ' · ' + detail;
            }

            qualityGroup.hidden = formatSelect.value === 'image/png';

            modeButtons.forEach(function (button) {
                const active = button.dataset.pdfMode === state.mode;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            qualityButtons.forEach(function (button) {
                const active = button.dataset.pdfQuality === state.quality;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
            });

            modeHint.textContent = state.mode === 'page'
                ? 'Every selected page becomes one image file.'
                : 'Embedded raster images are extracted. Best-effort for masks, tiling, and uncommon codecs.';

            const canConvert = ready > 0 && !state.isConverting;
            convertBtn.disabled = !canConvert;
            clearAllBtn.disabled = state.isConverting || (state.docs.length === 0 && state.results.length === 0);
            addBtn.disabled = state.isConverting || state.docs.length >= MAX_PDF_FILES;
            emptyAddBtn.disabled = state.isConverting || state.docs.length >= MAX_PDF_FILES;
            fileInput.disabled = state.isConverting;
            formatSelect.disabled = state.isConverting;
            pageRangeInput.disabled = state.isConverting;
            modeButtons.forEach(function (button) { button.disabled = state.isConverting; });
            qualityButtons.forEach(function (button) { button.disabled = state.isConverting; });
            dropzone.classList.toggle('is-disabled', state.isConverting || state.docs.length >= MAX_PDF_FILES);
            dropzone.setAttribute('aria-disabled', (state.isConverting || state.docs.length >= MAX_PDF_FILES) ? 'true' : 'false');
            cancelBtn.hidden = !state.isConverting;
            updateResultsUi();
        }

        function setBusyUi(busy) {
            if (busy) {
                convertBtn.innerHTML = '<i data-lucide="loader-2" class="resize-spin"></i> Converting…';
            } else {
                convertBtn.innerHTML = '<i data-lucide="scan-line"></i> Convert';
            }
            refreshIcons();
            updateUi();
        }

        function setDocError(doc, message) {
            doc.status = 'error';
            doc.error = message;
            doc.pdf = null;
            doc.pageCount = null;
        }

        async function loadDoc(doc) {
            if (!state.docs.includes(doc)) return;

            doc.status = 'loading';
            doc.error = '';
            renderDocs();
            updateUi();

            try {
                const pdfjs = await loadPdfJs();
                if (!state.docs.includes(doc)) return;

                const buffer = await doc.file.arrayBuffer();
                if (!state.docs.includes(doc)) return;

                const task = pdfjs.getDocument({
                    data: new Uint8Array(buffer),
                    cMapUrl: assetUrl(PDFJS_BASE + 'cmaps/'),
                    cMapPacked: true,
                    standardFontDataUrl: assetUrl(PDFJS_BASE + 'standard_fonts/')
                });
                doc.task = task;
                doc.passwordProtected = false;
                doc.passwordCancelled = false;

                task.onPassword = function (updatePassword, reason) {
                    showPasswordModal(doc, reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD).then(function (password) {
                        if (!state.docs.includes(doc) || doc.task !== task) {
                            if (password !== null) {
                                try { task.destroy(); } catch (error) { /* ignore */ }
                            }
                            return;
                        }
                        if (password === null) {
                            doc.passwordCancelled = true;
                            try { task.destroy(); } catch (error) { /* ignore */ }
                            return;
                        }
                        doc.passwordProtected = true;
                        updatePassword(password);
                    });
                };

                const pdf = await task.promise;
                if (!state.docs.includes(doc)) {
                    try { pdf.destroy(); } catch (error) { /* ignore */ }
                    return;
                }
                if (pdf.numPages > MAX_PDF_PAGES) {
                    try { pdf.destroy(); } catch (error) { /* ignore */ }
                    throw new Error('This PDF has ' + pdf.numPages + ' pages. The limit is ' + MAX_PDF_PAGES + ' pages per PDF.');
                }

                doc.pdf = pdf;
                doc.pageCount = pdf.numPages;
                doc.status = 'ready';
                doc.error = '';
                if (doc.passwordProtected) {
                    setStatus('Unlocked "' + doc.name + '" (' + pdf.numPages + ' pages).', 'success');
                }
            } catch (error) {
                if (!state.docs.includes(doc)) return;
                if (doc.passwordCancelled) {
                    setDocError(doc, 'Password required. Use Unlock to try again.');
                } else {
                    setDocError(doc, pdfErrorMessage(error));
                }
            } finally {
                doc.task = null;
                if (state.docs.includes(doc)) {
                    renderDocs();
                    updateUi();
                }
            }
        }

        function addPdfFiles(fileList) {
            if (state.isConverting) return;
            const files = Array.from(fileList || []);
            if (!files.length) return;

            const messages = [];
            const records = [];

            files.forEach(function (file) {
                if (state.docs.length >= MAX_PDF_FILES) {
                    messages.push('You can add up to ' + MAX_PDF_FILES + ' PDFs at once.');
                    return;
                }
                if (!isPdfFile(file)) {
                    messages.push('"' + file.name + '" is not a PDF.');
                    return;
                }
                if (file.size > MAX_PDF_BYTES) {
                    messages.push('"' + file.name + '" is larger than 100 MB.');
                    return;
                }
                const doc = {
                    id: state.nextId++,
                    file: file,
                    name: file.name || 'document.pdf',
                    size: file.size,
                    status: 'loading',
                    error: '',
                    pageCount: null,
                    pdf: null,
                    task: null,
                    passwordProtected: false,
                    passwordCancelled: false
                };
                state.docs.push(doc);
                records.push(doc);
            });

            if (messages.length) showError(messages[0] + (messages.length > 1 ? ' ' + (messages.length - 1) + ' more file(s) skipped.' : ''));
            renderDocs();
            updateUi();

            if (!records.length) return;
            if (records.length) {
                setStatus('Reading ' + records.length + (records.length === 1 ? ' PDF…' : ' PDFs…'), 'busy');
            }

            (async function () {
                for (const doc of records) {
                    await loadDoc(doc);
                }
                const loaded = records.filter(function (doc) {
                    return state.docs.includes(doc) && doc.status === 'ready';
                }).length;
                if (loaded) {
                    setStatus(loaded + (loaded === 1 ? ' PDF ready.' : ' PDFs ready.'), 'success');
                }
            })();
        }

        function destroyDoc(doc) {
            if (passwordDocId === doc.id) finishPassword(null);
            if (doc.task) {
                try { doc.task.destroy(); } catch (error) { /* ignore */ }
            }
            if (doc.pdf) {
                try { doc.pdf.destroy(); } catch (error) { /* ignore */ }
            }
            doc.task = null;
            doc.pdf = null;
        }

        function removeDoc(id) {
            if (state.isConverting) return;
            const index = state.docs.findIndex(function (doc) { return doc.id === id; });
            if (index === -1) return;
            const doc = state.docs[index];
            destroyDoc(doc);
            state.docs.splice(index, 1);
            renderDocs();
            updateUi();
            setStatus('Removed "' + doc.name + '".', '');
        }

        function parsePageRange(text, pageCount) {
            const value = (text || '').trim();
            if (!value) {
                return Array.from({ length: pageCount }, function (_, index) { return index + 1; });
            }

            const pages = new Set();
            const parts = value.split(',');
            for (const rawPart of parts) {
                const part = rawPart.trim();
                if (!part) throw new Error('The page range contains an empty entry.');
                const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
                if (!match) throw new Error('Use page numbers and ranges like 1-5, 8 or 11-14.');
                let start = parseInt(match[1], 10);
                let end = match[2] ? parseInt(match[2], 10) : start;
                if (start < 1 || end < 1) throw new Error('Page numbers start at 1.');
                if (start > end) throw new Error('The range "' + part + '" is backwards. Use ' + end + '-' + start + '.');
                if (end > pageCount) {
                    throw new Error('The range includes page ' + end + ', but this PDF only has ' + pageCount + (pageCount === 1 ? ' page.' : ' pages.'));
                }
                for (let page = start; page <= end; page++) pages.add(page);
            }

            if (!pages.size) throw new Error('The page range does not include any pages.');
            return Array.from(pages).sort(function (a, b) { return a - b; });
        }

        function outputDpi() {
            return state.quality === 'high' ? 300 : 150;
        }

        function outputQuality() {
            return state.quality === 'high' ? 0.92 : 0.8;
        }

        function checkGeneration(token) {
            if (state.cancelled || token !== state.generation) throw CANCELLED;
        }

        async function renderPageResult(doc, pageNumber, pageCount, token) {
            checkGeneration(token);
            const page = await doc.pdf.getPage(pageNumber);
            checkGeneration(token);

            const baseViewport = page.getViewport({ scale: 1 });
            let scale = outputDpi() / 72;
            const longest = Math.max(baseViewport.width, baseViewport.height) * scale;
            if (longest > MAX_OUTPUT_PX) {
                scale *= MAX_OUTPUT_PX / longest;
            }

            const viewport = page.getViewport({ scale: scale });
            const width = Math.max(1, Math.floor(viewport.width));
            const height = Math.max(1, Math.floor(viewport.height));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) {
                page.cleanup();
                throw new Error('This page is too large to render in your browser.');
            }

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            const renderTask = page.render({
                canvasContext: ctx,
                viewport: viewport,
                background: '#ffffff',
                intent: 'display'
            });
            state.renderTask = renderTask;

            try {
                await renderTask.promise;
            } catch (error) {
                page.cleanup();
                if (state.cancelled || (error && error.name === 'RenderingCancelledException')) throw CANCELLED;
                throw error;
            } finally {
                state.renderTask = null;
            }

            checkGeneration(token);
            page.cleanup();

            const format = formatSelect.value;
            const blob = await canvasToBlob(canvas, format, format === 'image/png' ? undefined : outputQuality());
            checkGeneration(token);
            const thumb = makeThumbnail(canvas);
            canvas.width = 0;
            canvas.height = 0;

            const digits = Math.max(3, String(pageCount).length);
            const extension = extensionForMime(format);
            return {
                kind: 'page',
                page: pageNumber,
                name: safeBaseName(doc.name) + '-page-' + padNumber(pageNumber, digits) + '.' + extension,
                blob: blob,
                thumb: thumb,
                width: width,
                height: height
            };
        }

        function getImageObject(page, objectId) {
            return new Promise(function (resolve, reject) {
                try {
                    const data = page.objs.get(objectId, resolve, reject);
                    if (data !== undefined && data !== null) {
                        resolve(data);
                    }
                } catch (error) {
                    try {
                        page.objs.get(objectId, resolve, reject);
                    } catch (innerError) {
                        reject(innerError);
                    }
                }
            });
        }

        function imageDataCanvas(image) {
            if (!image || !image.width || !image.height) return null;
            if (image.width < 8 || image.height < 8) return null;

            const pdfjs = window.pdfjsLib;
            const width = image.width;
            const height = image.height;
            let canvas = null;
            const ctx = function () {
                if (!canvas) {
                    canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                }
                return canvas.getContext('2d');
            };

            if (image.bitmap) {
                const target = document.createElement('canvas');
                target.width = width;
                target.height = height;
                const targetCtx = target.getContext('2d');
                if (!targetCtx) return null;
                targetCtx.drawImage(image.bitmap, 0, 0, width, height);
                return target;
            }

            const pixels = image.data;
            if (!pixels) return null;

            if (image.kind === pdfjs.ImageKind.GRAYSCALE_1BPP) {
                const rgba = new Uint8ClampedArray(width * height * 4);
                const rowBytes = (width + 7) >> 3;
                let out = 0;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const byte = pixels[y * rowBytes + (x >> 3)] || 0;
                        const bit = (byte >> (7 - (x & 7))) & 1;
                        const value = bit ? 255 : 0;
                        rgba[out++] = value;
                        rgba[out++] = value;
                        rgba[out++] = value;
                        rgba[out++] = 255;
                    }
                }
                const context = ctx();
                if (!context) return null;
                context.putImageData(new ImageData(rgba, width, height), 0, 0);
                return canvas;
            }

            if (image.kind === pdfjs.ImageKind.RGB_24BPP) {
                const rgba = new Uint8ClampedArray(width * height * 4);
                let out = 0;
                for (let i = 0; i < width * height; i++) {
                    const source = i * 3;
                    rgba[out++] = pixels[source];
                    rgba[out++] = pixels[source + 1];
                    rgba[out++] = pixels[source + 2];
                    rgba[out++] = 255;
                }
                const context = ctx();
                if (!context) return null;
                context.putImageData(new ImageData(rgba, width, height), 0, 0);
                return canvas;
            }

            if (image.kind === pdfjs.ImageKind.RGBA_32BPP) {
                const context = ctx();
                if (!context) return null;
                const source = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength);
                context.putImageData(new ImageData(source, width, height), 0, 0);
                return canvas;
            }

            return null;
        }

        async function imageToResult(doc, pageNumber, image, index, token) {
            checkGeneration(token);
            let source = imageDataCanvas(image);
            if (!source) return null;

            let width = source.width;
            let height = source.height;
            if (Math.max(width, height) > MAX_OUTPUT_PX) {
                const scale = MAX_OUTPUT_PX / Math.max(width, height);
                const resized = document.createElement('canvas');
                resized.width = Math.max(1, Math.round(width * scale));
                resized.height = Math.max(1, Math.round(height * scale));
                const resizedCtx = resized.getContext('2d');
                if (!resizedCtx) return null;
                resizedCtx.imageSmoothingEnabled = true;
                resizedCtx.imageSmoothingQuality = 'high';
                resizedCtx.drawImage(source, 0, 0, resized.width, resized.height);
                width = resized.width;
                height = resized.height;
                source.width = 0;
                source.height = 0;
                source = resized;
            }

            const format = formatSelect.value;
            let outputCanvas = source;
            if (format === 'image/jpeg') {
                outputCanvas = document.createElement('canvas');
                outputCanvas.width = width;
                outputCanvas.height = height;
                const outputCtx = outputCanvas.getContext('2d');
                if (!outputCtx) return null;
                outputCtx.fillStyle = '#ffffff';
                outputCtx.fillRect(0, 0, width, height);
                outputCtx.drawImage(source, 0, 0);
            }

            const blob = await canvasToBlob(outputCanvas, format, format === 'image/png' ? undefined : outputQuality());
            checkGeneration(token);
            const thumb = makeThumbnail(outputCanvas);
            const extension = extensionForMime(format);

            source.width = 0;
            source.height = 0;
            if (outputCanvas !== source) {
                outputCanvas.width = 0;
                outputCanvas.height = 0;
            }

            return {
                kind: 'image',
                page: pageNumber,
                name: safeBaseName(doc.name) + '-image-' + padNumber(index, 3) + '.' + extension,
                blob: blob,
                thumb: thumb,
                width: width,
                height: height
            };
        }

        async function extractPageImages(doc, pageNumber, index, token) {
            const page = await doc.pdf.getPage(pageNumber);
            checkGeneration(token);
            const operatorList = await page.getOperatorList();
            checkGeneration(token);

            const pdfjs = window.pdfjsLib;
            const ops = pdfjs.OPS;
            const results = [];
            const seenObjects = new Set();
            const seenInline = new WeakSet();
            let imageIndex = index;

            for (let i = 0; i < operatorList.fnArray.length; i++) {
                checkGeneration(token);
                const fn = operatorList.fnArray[i];
                const args = operatorList.argsArray[i];
                let image = null;

                if (fn === ops.paintImageXObject || fn === ops.paintImageXObjectRepeat) {
                    if (!args || typeof args[0] !== 'string' || seenObjects.has(args[0])) continue;
                    seenObjects.add(args[0]);
                    try {
                        image = await getImageObject(page, args[0]);
                    } catch (error) {
                        image = null;
                    }
                } else if (fn === ops.paintInlineImageXObject) {
                    image = args && args[0];
                    if (image && typeof image === 'object') {
                        if (seenInline.has(image)) continue;
                        seenInline.add(image);
                    }
                } else if (fn === ops.paintInlineImageXObjectGroup) {
                    image = args && args[0];
                    if (image && typeof image === 'object') {
                        if (seenInline.has(image)) continue;
                        seenInline.add(image);
                    }
                }

                if (!image) continue;
                try {
                    const result = await imageToResult(doc, pageNumber, image, imageIndex, token);
                    if (result) {
                        results.push(result);
                        imageIndex++;
                    }
                } catch (error) {
                    if (error === CANCELLED) throw error;
                }
            }

            page.cleanup();
            return results;
        }

        async function downloadAllResults() {
            if (state.results.length < 2 || state.packaging) return;
            state.packaging = true;
            updateResultsUi();
            setStatus('Packaging ' + state.results.length + ' images into a ZIP…', 'busy');
            try {
                const used = new Set();
                const entries = state.results.map(function (result) {
                    return {
                        name: uniqueName(result.name, used),
                        blob: result.blob
                    };
                });
                const zip = await createZip(entries);
                downloadBlob(zip, 'pdf-images.zip');
                setStatus('Downloaded ' + state.results.length + ' images as pdf-images.zip.', 'success');
            } catch (error) {
                showError(error && error.message ? error.message : 'Could not create the ZIP archive.');
                setStatus('Could not create the ZIP archive.', 'error');
            } finally {
                state.packaging = false;
                updateResultsUi();
            }
        }

        async function convert() {
            if (state.isConverting) return;
            const ready = state.docs.filter(function (doc) { return doc.status === 'ready' && doc.pdf; });
            if (!ready.length) {
                showError('Add at least one readable PDF before converting.');
                return;
            }

            let plans;
            try {
                plans = ready.map(function (doc) {
                    return {
                        doc: doc,
                        pages: parsePageRange(pageRangeInput.value, doc.pageCount)
                    };
                });
            } catch (error) {
                pageRangeInput.classList.add('invalid');
                pageRangeHint.classList.add('invalid');
                showError(error.message);
                return;
            }

            pageRangeInput.classList.remove('invalid');
            pageRangeHint.classList.remove('invalid');

            const totalPages = plans.reduce(function (sum, plan) { return sum + plan.pages.length; }, 0);
            if (!totalPages) {
                showError('The page range does not include any pages.');
                return;
            }

            clearResults();
            showError('');
            state.isConverting = true;
            state.cancelled = false;
            state.lastMode = state.mode;
            const token = ++state.generation;
            setBusyUi(true);
            setStatus('Preparing ' + totalPages + (totalPages === 1 ? ' page' : ' pages') + '…', 'busy');

            let completed = 0;
            let failures = 0;

            try {
                for (const plan of plans) {
                    checkGeneration(token);
                    const doc = plan.doc;
                    setStatus('Converting "' + doc.name + '"…', 'busy');

                    if (state.mode === 'page') {
                        for (const pageNumber of plan.pages) {
                            checkGeneration(token);
                            try {
                                const result = await renderPageResult(doc, pageNumber, doc.pageCount, token);
                                appendResult(result);
                                completed++;
                                setStatus('Rendered ' + completed + ' of ' + totalPages + ' pages…', 'busy');
                            } catch (error) {
                                if (error === CANCELLED) throw error;
                                failures++;
                                setStatus('Page ' + pageNumber + ' failed: ' + (error.message || 'render error'), 'warning');
                            }
                        }
                    } else {
                        let extractedIndex = 1;
                        for (const pageNumber of plan.pages) {
                            checkGeneration(token);
                            try {
                                const pageResults = await extractPageImages(doc, pageNumber, extractedIndex, token);
                                extractedIndex += pageResults.length;
                                pageResults.forEach(function (result) {
                                    appendResult(result);
                                    completed++;
                                });
                                if (!pageResults.length) {
                                    setStatus('No embedded images found on page ' + pageNumber + ' of "' + doc.name + '".', 'warning');
                                } else {
                                    setStatus('Extracted ' + completed + (completed === 1 ? ' image…' : ' images…'), 'busy');
                                }
                            } catch (error) {
                                if (error === CANCELLED) throw error;
                                failures++;
                                setStatus('Page ' + pageNumber + ' failed: ' + (error.message || 'extraction error'), 'warning');
                            }
                        }
                    }
                }

                if (!state.results.length) {
                    setStatus(
                        state.mode === 'page'
                            ? 'No images were produced. Check the page range and try again.'
                            : 'No embedded images were found. Try Page to image mode instead.',
                        'warning'
                    );
                    if (state.mode !== 'page') {
                        showError('No embedded raster images were found. Scanned pages are usually one large image; try Page to image mode instead.');
                    }
                } else {
                    setStatus(
                        'Converted ' + state.results.length + (state.results.length === 1 ? ' image' : ' images') +
                        (failures ? ' · ' + failures + ' page(s) skipped.' : '') + ' Downloading…',
                        failures ? 'warning' : 'success'
                    );
                    if (state.results.length === 1) {
                        downloadBlob(state.results[0].blob, state.results[0].name);
                    } else {
                        await downloadAllResults();
                    }
                    setStatus(
                        'Converted ' + state.results.length + (state.results.length === 1 ? ' image.' : ' images.') +
                        (failures ? ' ' + failures + ' page(s) skipped.' : ''),
                        failures ? 'warning' : 'success'
                    );
                }
            } catch (error) {
                if (error === CANCELLED || state.cancelled) {
                    setStatus('Conversion cancelled. ' + (state.results.length ? state.results.length + ' image(s) kept.' : ''), 'warning');
                } else {
                    showError(error && error.message ? error.message : 'Could not convert the PDF.');
                    setStatus('Conversion failed: ' + (error && error.message ? error.message : 'Unknown error'), 'error');
                }
            } finally {
                state.isConverting = false;
                state.renderTask = null;
                setBusyUi(false);
                renderDocs();
                updateUi();
            }
        }

        function cancelConversion() {
            if (!state.isConverting) return;
            state.cancelled = true;
            state.generation++;
            if (state.renderTask) {
                try { state.renderTask.cancel(); } catch (error) { /* ignore */ }
            }
            setStatus('Cancelling conversion…', 'warning');
        }

        function clearAll() {
            if (state.isConverting) return;
            if (!state.docs.length && !state.results.length) return;
            resetDocs();
            clearResults();
            showError('');
            updateUi();
            setStatus('All PDFs and results cleared.', '');
        }

        addBtn.addEventListener('click', function () { fileInput.click(); });
        emptyAddBtn.addEventListener('click', function () { fileInput.click(); });
        bindDropzone(dropzone, fileInput, addPdfFiles);
        bindWorkspaceDrop(workspace, function (files) {
            if (!state.isConverting) addPdfFiles(files);
        });

        clearAllBtn.addEventListener('click', clearAll);
        convertBtn.addEventListener('click', convert);
        cancelBtn.addEventListener('click', cancelConversion);

        modeButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                if (state.isConverting) return;
                state.mode = button.dataset.pdfMode;
                updateUi();
            });
        });
        qualityButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                if (state.isConverting) return;
                state.quality = button.dataset.pdfQuality;
                updateUi();
            });
        });
        formatSelect.addEventListener('change', updateUi);
        pageRangeInput.addEventListener('input', function () {
            pageRangeInput.classList.remove('invalid');
            pageRangeHint.classList.remove('invalid');
        });

        docsEl.addEventListener('click', function (event) {
            const button = event.target.closest('[data-doc-action]');
            if (!button) return;
            const card = button.closest('[data-doc-id]');
            if (!card) return;
            const id = Number(card.dataset.docId);
            if (button.dataset.docAction === 'remove') {
                removeDoc(id);
            } else if (button.dataset.docAction === 'retry') {
                const doc = state.docs.find(function (item) { return item.id === id; });
                if (doc && !state.isConverting) loadDoc(doc);
            }
        });

        resultsEl.addEventListener('click', function (event) {
            const action = event.target.closest('[data-result-action]');
            if (!action) return;
            const card = action.closest('[data-result-id]');
            if (!card) return;
            const index = Number(card.dataset.resultId);
            const result = state.results[index];
            if (!result) return;

            if (action.dataset.resultAction === 'download') {
                downloadBlob(result.blob, result.name);
            } else if (action.dataset.resultAction === 'preview') {
                openPreview({
                    name: result.name,
                    meta: (result.kind === 'page' ? 'Page ' + result.page : 'Embedded image') + ' · ' +
                        result.width.toLocaleString() + ' × ' + result.height.toLocaleString() + ' px · ' +
                        formatBytes(result.blob.size),
                    blob: result.blob,
                    width: result.width,
                    height: result.height,
                    onDownload: function () {
                        downloadBlob(result.blob, result.name);
                    }
                });
            }
        });

        downloadAllBtn.addEventListener('click', downloadAllResults);

        renderDocs();
        updateResultsUi();
        updateUi();
    }

    /* ---------------------------------------------------------------------
       Images to PDF
       --------------------------------------------------------------------- */

    function initImagesToPdf() {
        const app = document.getElementById('imagesToPdfApp');
        if (!app) return;

        const addBtn = document.getElementById('imagesToPdfAddBtn');
        const clearAllBtn = document.getElementById('imagesToPdfClearAllBtn');
        const emptyAddBtn = document.getElementById('imagesToPdfEmptyAddBtn');
        const dropzone = document.getElementById('imagesToPdfDropzone');
        const fileInput = document.getElementById('imagesToPdfFileInput');
        const workspace = app.querySelector('.resize-workspace');
        const grid = document.getElementById('imagesToPdfGrid');
        const emptyEl = document.getElementById('imagesToPdfEmpty');
        const countEl = document.getElementById('imagesToPdfCount');
        const subEl = document.getElementById('imagesToPdfSub');
        const totalEl = document.getElementById('imagesToPdfTotal');
        const pageSizeSelect = document.getElementById('imagePdfPageSize');
        const orientationSelect = document.getElementById('imagePdfOrientation');
        const orientationHint = document.getElementById('imagePdfOrientationHint');
        const marginSelect = document.getElementById('imagePdfMargin');
        const marginHint = document.getElementById('imagePdfMarginHint');
        const summary = document.getElementById('imagePdfSummary');
        const exportBtn = document.getElementById('imagesToPdfExportBtn');
        const exportHint = document.getElementById('imagesToPdfHint');
        const statusEl = document.getElementById('imagesToPdfStatus');
        const errorEl = document.getElementById('imagesToPdfError');
        const outputEl = document.getElementById('imagesToPdfOutput');
        const outputName = document.getElementById('imagesToPdfOutputName');
        const outputMeta = document.getElementById('imagesToPdfOutputMeta');
        const outputDownloadBtn = document.getElementById('imagesToPdfDownloadBtn');

        const state = {
            items: [],
            nextId: 1,
            isExporting: false,
            generation: 0,
            output: null,
            dragId: null,
            errorTimer: null
        };

        function setStatus(message, tone) {
            statusEl.textContent = message || '';
            statusEl.className = 'resize-status' + (tone ? ' ' + tone : '');
        }

        function showError(message) {
            errorEl.textContent = message || '';
            clearTimeout(state.errorTimer);
            if (message) {
                state.errorTimer = setTimeout(function () {
                    errorEl.textContent = '';
                }, 10000);
            }
        }

        function normalizeImageMime(file) {
            let type = (file.type || '').toLowerCase();
            if (type === 'image/jpg') type = 'image/jpeg';
            if (type === 'image/x-ms-bmp') type = 'image/bmp';
            if (IMAGE_EXTENSIONS[type]) return type;
            const extension = String(file.name || '').split('.').pop().toLowerCase();
            return IMAGE_MIMES_BY_EXTENSION[extension] || null;
        }

        function readImageDimensions(file) {
            if (typeof createImageBitmap === 'function') {
                return createImageBitmap(file).then(function (bitmap) {
                    const dimensions = { width: bitmap.width, height: bitmap.height };
                    if (typeof bitmap.close === 'function') bitmap.close();
                    return dimensions;
                }).catch(function () {
                    return readImageWithElement(file);
                });
            }
            return readImageWithElement(file);
        }

        function readImageWithElement(file) {
            return new Promise(function (resolve, reject) {
                const url = URL.createObjectURL(file);
                const image = new Image();
                image.onload = function () {
                    const dimensions = {
                        width: image.naturalWidth || image.width,
                        height: image.naturalHeight || image.height
                    };
                    URL.revokeObjectURL(url);
                    resolve(dimensions);
                };
                image.onerror = function () {
                    URL.revokeObjectURL(url);
                    reject(new Error('This image could not be decoded.'));
                };
                image.src = url;
            });
        }

        function itemCardHtml(item, index) {
            const rotation = item.rotation || 0;
            const scale = rotation % 180 === 0 ? 1 : 0.72;
            const canMoveUp = !state.isExporting && index > 0;
            const canMoveDown = !state.isExporting && index < state.items.length - 1;
            const dimensions = item.width && item.height
                ? item.width.toLocaleString() + ' × ' + item.height.toLocaleString() + ' px'
                : 'Reading…';

            return '<article class="resize-card pdf-image-card" data-item-id="' + item.id + '" draggable="' + (state.isExporting ? 'false' : 'true') + '" role="listitem">' +
                '<div class="resize-card-preview pdf-image-preview">' +
                    (item.previewUrl
                        ? '<img src="' + escapeHtml(item.previewUrl) + '" alt="' + escapeHtml(item.name) + ' preview" style="transform: rotate(' + rotation + 'deg) scale(' + scale + ')">'
                        : '<i data-lucide="image"></i>') +
                    '<button type="button" class="image-preview-trigger" data-image-action="preview" aria-label="Preview ' + escapeHtml(item.name) + '" title="Preview image"><i data-lucide="zoom-in"></i></button>' +
                    '<span class="resize-card-format">' + escapeHtml(mimeLabel(item.mime)) + '</span>' +
                    '<span class="pdf-order-badge">' + (index + 1) + '</span>' +
                    '<button type="button" class="resize-card-remove" data-image-action="remove" aria-label="Remove ' + escapeHtml(item.name) + '"><i data-lucide="x"></i></button>' +
                '</div>' +
                '<div class="resize-card-info">' +
                    '<div class="resize-card-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
                    '<div class="resize-card-meta">' +
                        '<div class="resize-card-meta-row"><span>Dimensions</span><strong>' + escapeHtml(dimensions) + '</strong></div>' +
                        '<div class="resize-card-meta-row"><span>File size</span><strong>' + formatBytes(item.size) + '</strong></div>' +
                    '</div>' +
                    '<div class="pdf-image-footer">' +
                        '<span class="pdf-rotate-label">' + rotation + '°</span>' +
                        '<div class="pdf-image-actions">' +
                            '<button type="button" class="pdf-icon-btn" data-image-action="up" aria-label="Move ' + escapeHtml(item.name) + ' earlier" title="Move up"' + (canMoveUp ? '' : ' disabled') + '><i data-lucide="arrow-up"></i></button>' +
                            '<button type="button" class="pdf-icon-btn" data-image-action="down" aria-label="Move ' + escapeHtml(item.name) + ' later" title="Move down"' + (canMoveDown ? '' : ' disabled') + '><i data-lucide="arrow-down"></i></button>' +
                            '<button type="button" class="pdf-icon-btn" data-image-action="rotate" aria-label="Rotate ' + escapeHtml(item.name) + ' 90 degrees" title="Rotate 90°"' + (state.isExporting ? ' disabled' : '') + '><i data-lucide="rotate-cw"></i></button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</article>';
        }

        function renderGrid() {
            grid.innerHTML = state.items.map(itemCardHtml).join('');
            grid.hidden = state.items.length === 0;
            emptyEl.hidden = state.items.length > 0;
            refreshIcons();
        }

        function hideOutput() {
            state.output = null;
            outputEl.hidden = true;
        }

        function settingsDescription() {
            const pageSize = pageSizeSelect.value;
            const sizeLabel = pageSize === 'fit' ? 'Fit' : pageSize === 'a4' ? 'A4' : 'US Letter';
            const orientation = pageSize === 'fit'
                ? 'auto orientation'
                : orientationSelect.value === 'landscape' ? 'landscape' : 'portrait';
            const margin = pageSize === 'fit'
                ? 'no margin'
                : marginSelect.value === 'none' ? 'no margin' : marginSelect.value === 'small' ? 'small margin' : 'big margin';
            return sizeLabel + ' · ' + orientation + ' · ' + margin;
        }

        function updateUi() {
            const readyCount = state.items.filter(function (item) { return item.status === 'ready'; }).length;
            const sourceBytes = state.items.reduce(function (sum, item) { return sum + item.size; }, 0);
            const allReady = state.items.length > 0 && readyCount === state.items.length;
            const fit = pageSizeSelect.value === 'fit';

            countEl.textContent = state.items.length;
            emptyEl.hidden = state.items.length > 0;
            grid.hidden = state.items.length === 0;

            if (state.items.length) {
                subEl.textContent = allReady
                    ? state.items.length + (state.items.length === 1 ? ' image ready' : ' images ready') + ' · max 10 MB each'
                    : readyCount + ' of ' + state.items.length + ' images ready · max 10 MB each';
                totalEl.textContent = state.output
                    ? formatBytes(state.output.blob.size) + ' PDF'
                    : formatBytes(sourceBytes) + ' source';
            } else {
                subEl.textContent = 'Add images and arrange their page order.';
                totalEl.textContent = '';
            }

            summary.innerHTML = '<span>' + state.items.length + (state.items.length === 1 ? ' image' : ' images') + '</span>' +
                '<strong>' + state.items.length + (state.items.length === 1 ? ' PDF page' : ' PDF pages') + '</strong>';

            orientationSelect.disabled = state.isExporting || fit;
            marginSelect.disabled = state.isExporting || fit;
            orientationHint.textContent = fit
                ? 'Fit mode follows each image’s own orientation.'
                : 'Fixed page size with the selected orientation.';
            marginHint.textContent = fit
                ? 'Margins apply to A4 and US Letter pages.'
                : 'Space around each image on the page.';

            addBtn.disabled = state.isExporting || state.items.length >= MAX_IMAGE_FILES;
            emptyAddBtn.disabled = state.isExporting || state.items.length >= MAX_IMAGE_FILES;
            fileInput.disabled = state.isExporting;
            clearAllBtn.disabled = state.isExporting || state.items.length === 0;
            dropzone.classList.toggle('is-disabled', state.isExporting || state.items.length >= MAX_IMAGE_FILES);
            dropzone.setAttribute('aria-disabled', (state.isExporting || state.items.length >= MAX_IMAGE_FILES) ? 'true' : 'false');
            pageSizeSelect.disabled = state.isExporting;
            exportBtn.disabled = state.isExporting || !allReady;

            if (state.isExporting) {
                exportHint.textContent = 'Building your PDF…';
            } else if (!state.items.length) {
                exportHint.textContent = 'Add images to enable export.';
            } else if (!allReady) {
                exportHint.textContent = 'Waiting for images to load…';
            } else {
                exportHint.textContent = state.items.length + (state.items.length === 1 ? ' image' : ' images') +
                    ' · ' + settingsDescription() + ' · 1 PDF';
            }

            if (state.output) {
                outputEl.hidden = false;
                outputName.textContent = state.output.name;
                outputMeta.textContent = formatBytes(state.output.blob.size) + ' · ' +
                    state.output.pages + (state.output.pages === 1 ? ' page' : ' pages') + ' · ' + settingsDescription();
            }
        }

        function updateSettingsOnly() {
            hideOutput();
            updateUi();
        }

        function addImages(fileList) {
            if (state.isExporting) return;
            const files = Array.from(fileList || []);
            if (!files.length) return;

            const messages = [];
            const newItems = [];
            let totalBytes = state.items.reduce(function (sum, item) { return sum + item.size; }, 0);

            files.forEach(function (file) {
                if (state.items.length >= MAX_IMAGE_FILES) {
                    messages.push('You can add up to ' + MAX_IMAGE_FILES + ' images.');
                    return;
                }
                const mime = normalizeImageMime(file);
                if (!mime) {
                    messages.push('"' + file.name + '" is not a supported image (use JPG, PNG, WebP, GIF, BMP or AVIF).');
                    return;
                }
                if (file.size > MAX_IMAGE_BYTES) {
                    messages.push('"' + file.name + '" is larger than 10 MB.');
                    return;
                }
                if (totalBytes + file.size > MAX_IMAGE_TOTAL_BYTES) {
                    messages.push('The batch would exceed 100 MB. Add fewer or smaller images.');
                    return;
                }
                totalBytes += file.size;

                const item = {
                    id: state.nextId++,
                    file: file,
                    name: file.name || 'image',
                    size: file.size,
                    mime: mime,
                    width: 0,
                    height: 0,
                    rotation: 0,
                    status: 'loading',
                    previewUrl: URL.createObjectURL(file)
                };
                state.items.push(item);
                newItems.push(item);
            });

            if (messages.length) showError(messages[0] + (messages.length > 1 ? ' ' + (messages.length - 1) + ' more file(s) skipped.' : ''));
            renderGrid();
            hideOutput();
            updateUi();

            if (!newItems.length) return;

            (async function () {
                let loaded = 0;
                for (const item of newItems) {
                    if (!state.items.includes(item)) continue;
                    setStatus('Reading ' + (loaded + 1) + ' of ' + newItems.length + ' images…', 'busy');
                    try {
                        const dimensions = await readImageDimensions(item.file);
                        if (!state.items.includes(item)) continue;
                        item.width = dimensions.width;
                        item.height = dimensions.height;
                        item.status = 'ready';
                        loaded++;
                    } catch (error) {
                        const index = state.items.indexOf(item);
                        if (index !== -1) state.items.splice(index, 1);
                        URL.revokeObjectURL(item.previewUrl);
                        showError('"' + item.name + '" could not be decoded and was skipped.');
                    }
                    renderGrid();
                    updateUi();
                }

                if (loaded) {
                    setStatus(loaded + (loaded === 1 ? ' image added.' : ' images added.'), 'success');
                } else if (state.items.length) {
                    setStatus('Some images could not be read.', 'warning');
                }
                renderGrid();
                updateUi();
            })();
        }

        function removeItem(id) {
            if (state.isExporting) return;
            closePreview();
            const index = state.items.findIndex(function (item) { return item.id === id; });
            if (index === -1) return;
            const item = state.items[index];
            state.items.splice(index, 1);
            URL.revokeObjectURL(item.previewUrl);
            renderGrid();
            hideOutput();
            updateUi();
            setStatus(state.items.length ? 'Image removed. ' + state.items.length + ' remaining.' : 'All images cleared.', '');
        }

        function moveItem(id, delta) {
            if (state.isExporting) return;
            const index = state.items.findIndex(function (item) { return item.id === id; });
            if (index === -1) return;
            const next = index + delta;
            if (next < 0 || next >= state.items.length) return;
            const item = state.items.splice(index, 1)[0];
            state.items.splice(next, 0, item);
            renderGrid();
            hideOutput();
            updateUi();
        }

        function rotateItem(id) {
            if (state.isExporting) return;
            const item = state.items.find(function (entry) { return entry.id === id; });
            if (!item) return;
            item.rotation = ((item.rotation || 0) + 90) % 360;
            renderGrid();
            hideOutput();
            updateUi();
        }

        function reorderItem(dragId, targetId) {
            if (state.isExporting || dragId === targetId) return;
            const from = state.items.findIndex(function (item) { return item.id === dragId; });
            const to = state.items.findIndex(function (item) { return item.id === targetId; });
            if (from === -1 || to === -1) return;
            const item = state.items.splice(from, 1)[0];
            state.items.splice(to, 0, item);
            renderGrid();
            hideOutput();
            updateUi();
        }

        function clearAll() {
            if (state.isExporting) return;
            if (!state.items.length && !state.output) return;
            closePreview();
            state.items.forEach(function (item) {
                URL.revokeObjectURL(item.previewUrl);
            });
            state.items = [];
            renderGrid();
            hideOutput();
            showError('');
            updateUi();
            setStatus('All images cleared.', '');
        }

        function readJpegOrientation(bytes) {
            if (!bytes || bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1;
            let offset = 2;
            while (offset + 4 <= bytes.length) {
                if (bytes[offset] !== 0xFF) {
                    offset++;
                    continue;
                }
                let marker = bytes[offset + 1];
                if (marker === 0xFF) {
                    offset++;
                    continue;
                }
                if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
                    offset += 2;
                    continue;
                }
                if (marker === 0xDA || marker === 0xD9) break;
                const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
                if (length < 2) break;
                const end = offset + 2 + length;
                if (end > bytes.length) break;

                if (marker === 0xE1 && length >= 8 &&
                    bytes[offset + 4] === 0x45 && bytes[offset + 5] === 0x78 &&
                    bytes[offset + 6] === 0x69 && bytes[offset + 7] === 0x66) {
                    const tiff = offset + 10;
                    if (tiff + 8 > bytes.length) break;
                    const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
                    const read16 = function (position) {
                        if (position + 2 > bytes.length) return 0;
                        return little
                            ? bytes[position] | (bytes[position + 1] << 8)
                            : (bytes[position] << 8) | bytes[position + 1];
                    };
                    const read32 = function (position) {
                        if (position + 4 > bytes.length) return 0;
                        return little
                            ? (bytes[position] | (bytes[position + 1] << 8) | (bytes[position + 2] << 16) | (bytes[position + 3] << 24)) >>> 0
                            : ((bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3]) >>> 0;
                    };
                    if (read16(tiff + 2) === 0x002A) {
                        const directory = tiff + read32(tiff + 4);
                        if (directory + 2 <= bytes.length) {
                            const count = read16(directory);
                            for (let i = 0; i < count; i++) {
                                const entry = directory + 2 + i * 12;
                                if (entry + 12 > bytes.length) break;
                                if (read16(entry) === 0x0112) {
                                    const type = read16(entry + 2);
                                    const valueCount = read32(entry + 4);
                                    if (type === 3 && valueCount >= 1) {
                                        const orientation = read16(entry + 8);
                                        if (orientation >= 1 && orientation <= 8) return orientation;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
                offset = end;
            }
            return 1;
        }

        function drawSourceToCanvas(source, sourceWidth, sourceHeight, rotation, fillWhite) {
            const swapped = rotation === 90 || rotation === 270;
            let width = swapped ? sourceHeight : sourceWidth;
            let height = swapped ? sourceWidth : sourceHeight;
            const scale = Math.min(1, MAX_OUTPUT_PX / Math.max(width, height, 1));
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('This image is too large to process in your browser.');
            if (fillWhite) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.translate(width / 2, height / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            const drawWidth = sourceWidth * scale;
            const drawHeight = sourceHeight * scale;
            ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            return canvas;
        }

        async function decodeImageForCanvas(file) {
            if (typeof createImageBitmap === 'function') {
                try {
                    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
                    return {
                        source: bitmap,
                        width: bitmap.width,
                        height: bitmap.height,
                        close: function () {
                            if (typeof bitmap.close === 'function') bitmap.close();
                        }
                    };
                } catch (error) {
                    /* fall through to an image element */
                }
            }

            const url = URL.createObjectURL(file);
            try {
                const image = await new Promise(function (resolve, reject) {
                    const element = new Image();
                    element.onload = function () { resolve(element); };
                    element.onerror = function () { reject(new Error('This image could not be decoded.')); };
                    element.src = url;
                });
                return {
                    source: image,
                    width: image.naturalWidth || image.width,
                    height: image.naturalHeight || image.height,
                    close: function () { URL.revokeObjectURL(url); }
                };
            } catch (error) {
                URL.revokeObjectURL(url);
                throw error;
            }
        }

        async function prepareImage(item) {
            const rotation = item.rotation || 0;
            const isJpeg = item.mime === 'image/jpeg';
            const isPng = item.mime === 'image/png';
            const originalBytes = new Uint8Array(await item.file.arrayBuffer());
            const exifOrientation = isJpeg ? readJpegOrientation(originalBytes) : 1;

            if (rotation === 0 && exifOrientation === 1 && (isJpeg || isPng)) {
                return {
                    kind: isJpeg ? 'jpg' : 'png',
                    bytes: originalBytes,
                    width: item.width,
                    height: item.height
                };
            }

            const decoded = await decodeImageForCanvas(item.file);
            try {
                const canvas = drawSourceToCanvas(
                    decoded.source,
                    decoded.width,
                    decoded.height,
                    rotation,
                    isJpeg
                );
                const blob = await canvasToBlob(canvas, isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? 0.92 : undefined);
                const bytes = new Uint8Array(await blob.arrayBuffer());
                const width = canvas.width;
                const height = canvas.height;
                canvas.width = 0;
                canvas.height = 0;
                return {
                    kind: isJpeg ? 'jpg' : 'png',
                    bytes: bytes,
                    width: width,
                    height: height
                };
            } finally {
                decoded.close();
            }
        }

        function layoutForPage(prepared, pageSize, orientation, marginKey) {
            if (pageSize === 'fit') {
                const scale = 72 / 96;
                const width = prepared.width * scale;
                const height = prepared.height * scale;
                return {
                    pageWidth: width,
                    pageHeight: height,
                    x: 0,
                    y: 0,
                    drawWidth: width,
                    drawHeight: height
                };
            }

            const base = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
            let pageWidth = base.width;
            let pageHeight = base.height;
            if (orientation === 'landscape') {
                const swap = pageWidth;
                pageWidth = pageHeight;
                pageHeight = swap;
            }
            const margin = MARGINS[marginKey] || 0;
            const availableWidth = Math.max(1, pageWidth - margin * 2);
            const availableHeight = Math.max(1, pageHeight - margin * 2);
            const scale = Math.min(availableWidth / prepared.width, availableHeight / prepared.height);
            const drawWidth = prepared.width * scale;
            const drawHeight = prepared.height * scale;
            return {
                pageWidth: pageWidth,
                pageHeight: pageHeight,
                x: margin + (availableWidth - drawWidth) / 2,
                y: margin + (availableHeight - drawHeight) / 2,
                drawWidth: drawWidth,
                drawHeight: drawHeight
            };
        }

        function setExportBusy(busy, done, total) {
            if (busy) {
                exportBtn.innerHTML = '<i data-lucide="loader-2" class="resize-spin"></i> Creating ' + done + '/' + total + '…';
            } else {
                exportBtn.innerHTML = '<i data-lucide="download"></i> Create PDF';
            }
            refreshIcons();
        }

        async function exportPdf() {
            if (state.isExporting) return;
            const ready = state.items.filter(function (item) { return item.status === 'ready'; });
            if (!ready.length) {
                showError('Add at least one image before creating a PDF.');
                return;
            }

            state.isExporting = true;
            hideOutput();
            state.generation++;
            const token = state.generation;
            renderGrid();
            updateUi();
            setExportBusy(true, 0, ready.length);
            setStatus('Preparing ' + ready.length + (ready.length === 1 ? ' image…' : ' images…'), 'busy');
            showError('');

            try {
                const PDFLib = await loadPdfLib();
                const pdf = await PDFLib.PDFDocument.create();
                pdf.setTitle('Images to PDF');
                pdf.setProducer('Secure Tools');
                pdf.setCreator('Secure Tools — client-side image to PDF');

                const pageSize = pageSizeSelect.value;
                const orientation = orientationSelect.value;
                const marginKey = marginSelect.value;
                let done = 0;

                for (const item of ready) {
                    if (token !== state.generation) throw new Error('Export cancelled.');
                    setStatus('Creating page ' + (done + 1) + ' of ' + ready.length + '…', 'busy');

                    const prepared = await prepareImage(item);
                    const layout = layoutForPage(prepared, pageSize, orientation, marginKey);
                    const page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
                    const embedded = prepared.kind === 'jpg'
                        ? await pdf.embedJpg(prepared.bytes)
                        : await pdf.embedPng(prepared.bytes);

                    page.drawImage(embedded, {
                        x: layout.x,
                        y: layout.y,
                        width: layout.drawWidth,
                        height: layout.drawHeight
                    });

                    done++;
                    setExportBusy(true, done, ready.length);
                    updateUi();
                }

                setStatus('Saving PDF…', 'busy');
                const bytes = await pdf.save({ useObjectStreams: true });
                if (token !== state.generation) throw new Error('Export cancelled.');
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const name = 'images-to-pdf.pdf';
                state.output = {
                    blob: blob,
                    name: name,
                    pages: done
                };
                updateUi();
                setStatus('PDF created — ' + formatBytes(blob.size) + ' · ' + done + (done === 1 ? ' page.' : ' pages.'), 'success');
                downloadBlob(blob, name);
            } catch (error) {
                showError(error && error.message ? error.message : 'Could not create the PDF.');
                setStatus('Could not create the PDF: ' + (error && error.message ? error.message : 'Unknown error'), 'error');
            } finally {
                state.isExporting = false;
                renderGrid();
                updateUi();
                setExportBusy(false);
            }
        }

        addBtn.addEventListener('click', function () { fileInput.click(); });
        emptyAddBtn.addEventListener('click', function () { fileInput.click(); });
        bindDropzone(dropzone, fileInput, addImages);
        bindWorkspaceDrop(workspace, function (files) {
            if (!state.isExporting) addImages(files);
        });

        clearAllBtn.addEventListener('click', clearAll);
        exportBtn.addEventListener('click', exportPdf);
        outputDownloadBtn.addEventListener('click', function () {
            if (state.output) downloadBlob(state.output.blob, state.output.name);
        });

        pageSizeSelect.addEventListener('change', updateSettingsOnly);
        orientationSelect.addEventListener('change', updateSettingsOnly);
        marginSelect.addEventListener('change', updateSettingsOnly);

        grid.addEventListener('click', function (event) {
            const button = event.target.closest('[data-image-action]');
            if (!button) return;
            const card = button.closest('[data-item-id]');
            if (!card) return;
            const id = Number(card.dataset.itemId);
            const action = button.dataset.imageAction;
            if (action === 'remove') removeItem(id);
            else if (action === 'up') moveItem(id, -1);
            else if (action === 'down') moveItem(id, 1);
            else if (action === 'rotate') rotateItem(id);
            else if (action === 'preview') {
                const item = state.items.find(function (entry) { return entry.id === id; });
                if (!item || !item.previewUrl) return;
                const rotation = item.rotation || 0;
                const parts = [];
                if (item.width && item.height) {
                    parts.push(item.width.toLocaleString() + ' × ' + item.height.toLocaleString() + ' px');
                }
                parts.push(formatBytes(item.size));
                if (rotation) parts.push('Rotated ' + rotation + '°');
                openPreview({
                    name: item.name,
                    meta: parts.join(' · '),
                    src: item.previewUrl,
                    width: item.width,
                    height: item.height,
                    rotation: rotation,
                    onDownload: function () {
                        downloadBlob(item.file, item.name);
                    }
                });
            }
        });

        grid.addEventListener('dragstart', function (event) {
            const card = event.target.closest('[data-item-id]');
            if (!card || state.isExporting) {
                event.preventDefault();
                return;
            }
            state.dragId = Number(card.dataset.itemId);
            card.classList.add('dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(state.dragId));
            }
        });

        grid.addEventListener('dragend', function () {
            state.dragId = null;
            grid.querySelectorAll('.pdf-image-card').forEach(function (card) {
                card.classList.remove('dragging', 'pdf-drop-target');
            });
        });

        grid.addEventListener('dragover', function (event) {
            if (!event.dataTransfer || event.dataTransfer.types.includes('Files')) return;
            const card = event.target.closest('[data-item-id]');
            if (!card) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            grid.querySelectorAll('.pdf-drop-target').forEach(function (element) {
                if (element !== card) element.classList.remove('pdf-drop-target');
            });
            card.classList.add('pdf-drop-target');
        });

        grid.addEventListener('dragleave', function (event) {
            const card = event.target.closest('[data-item-id]');
            if (card) card.classList.remove('pdf-drop-target');
        });

        grid.addEventListener('drop', function (event) {
            if (!event.dataTransfer || event.dataTransfer.types.includes('Files')) return;
            const card = event.target.closest('[data-item-id]');
            if (!card) return;
            event.preventDefault();
            const dragId = state.dragId;
            const targetId = Number(card.dataset.itemId);
            grid.querySelectorAll('.pdf-drop-target').forEach(function (element) {
                element.classList.remove('pdf-drop-target');
            });
            if (dragId !== null) reorderItem(dragId, targetId);
        });

        renderGrid();
        updateUi();
    }

    window.addEventListener('hashchange', closePreview);

    initPdfToImages();
    initImagesToPdf();
})();
