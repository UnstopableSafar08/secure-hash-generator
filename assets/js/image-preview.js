/* Shared image lightbox used by the image and PDF tools. */
(function () {
    'use strict';

    let modal = null;
    let state = null;

    function refreshIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function ensureModal() {
        if (modal) return modal;

        modal = document.createElement('div');
        modal.className = 'pdf-modal image-preview-modal';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="image-preview-card" role="dialog" aria-modal="true" aria-labelledby="imagePreviewTitle">' +
                '<div class="image-preview-head">' +
                    '<div class="image-preview-heading">' +
                        '<strong id="imagePreviewTitle"></strong>' +
                        '<span id="imagePreviewMeta"></span>' +
                    '</div>' +
                    '<button type="button" class="image-preview-close" data-preview-action="close" aria-label="Close preview" title="Close preview"><i data-lucide="x"></i></button>' +
                '</div>' +
                '<div class="image-preview-stage" id="imagePreviewStage">' +
                    '<img id="imagePreviewImage" alt="">' +
                '</div>' +
                '<div class="image-preview-foot">' +
                    '<span class="image-preview-hint">Click outside or press Esc to close</span>' +
                    '<button type="button" class="image-preview-download" data-preview-action="download"><i data-lucide="download"></i> Download</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);

        modal.addEventListener('click', function (event) {
            const action = event.target.closest('[data-preview-action]');
            if (action) {
                if (action.dataset.previewAction === 'close') {
                    close();
                } else if (action.dataset.previewAction === 'download') {
                    if (state && typeof state.onDownload === 'function') {
                        state.onDownload();
                    }
                }
                return;
            }
            if (event.target === modal) close();
        });

        refreshIcons();
        return modal;
    }

    function layoutImage() {
        if (!state || !modal || modal.hidden) return;
        const image = modal.querySelector('#imagePreviewImage');
        const stage = modal.querySelector('#imagePreviewStage');
        if (!image || !stage) return;

        const width = Number(state.width) || 0;
        const height = Number(state.height) || 0;
        if (!width || !height) {
            image.style.width = '';
            image.style.height = '';
            return;
        }

        const rotation = ((Number(state.rotation) || 0) % 360 + 360) % 360;
        const swapped = rotation === 90 || rotation === 270;
        const stageRect = stage.getBoundingClientRect();
        const maxWidth = Math.max(120, stageRect.width - 28);
        const maxHeight = Math.max(120, stageRect.height - 28);
        const visualAspect = swapped ? height / width : width / height;

        let visualWidth = maxWidth;
        let visualHeight = visualWidth / visualAspect;
        if (visualHeight > maxHeight) {
            visualHeight = maxHeight;
            visualWidth = visualHeight * visualAspect;
        }

        image.style.width = Math.max(1, Math.round(swapped ? visualHeight : visualWidth)) + 'px';
        image.style.height = Math.max(1, Math.round(swapped ? visualWidth : visualHeight)) + 'px';
        image.style.transform = rotation ? 'rotate(' + rotation + 'deg)' : '';
    }

    function previewKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    }

    function close() {
        if (!modal || modal.hidden) return;

        modal.hidden = true;
        document.body.classList.remove('image-preview-open');
        document.removeEventListener('keydown', previewKeydown);
        window.removeEventListener('resize', layoutImage);

        if (state && state.objectUrl) {
            URL.revokeObjectURL(state.objectUrl);
        }

        const image = modal.querySelector('#imagePreviewImage');
        if (image) {
            image.removeAttribute('src');
            image.style.width = '';
            image.style.height = '';
            image.style.transform = '';
        }

        const trigger = state && state.trigger;
        state = null;
        if (trigger && document.contains(trigger)) {
            trigger.focus({ preventScroll: true });
        }
    }

    function open(options) {
        close();
        const modalEl = ensureModal();
        const image = modalEl.querySelector('#imagePreviewImage');
        const title = modalEl.querySelector('#imagePreviewTitle');
        const meta = modalEl.querySelector('#imagePreviewMeta');
        const downloadBtn = modalEl.querySelector('[data-preview-action="download"]');

        let objectUrl = null;
        let src = options.src || '';
        if (!src && options.blob) {
            objectUrl = URL.createObjectURL(options.blob);
            src = objectUrl;
        }
        if (!src) return;

        state = {
            width: options.width,
            height: options.height,
            rotation: options.rotation || 0,
            objectUrl: objectUrl,
            trigger: document.activeElement,
            onDownload: options.onDownload
        };

        title.textContent = options.name || 'Image preview';
        meta.textContent = options.meta || '';
        image.alt = options.name || 'Image preview';
        image.style.width = '';
        image.style.height = '';
        image.style.transform = '';
        image.src = src;
        downloadBtn.hidden = typeof options.onDownload !== 'function';

        modalEl.hidden = false;
        document.body.classList.add('image-preview-open');
        document.addEventListener('keydown', previewKeydown);
        window.addEventListener('resize', layoutImage);

        const closeBtn = modalEl.querySelector('[data-preview-action="close"]');
        if (closeBtn) closeBtn.focus({ preventScroll: true });

        requestAnimationFrame(layoutImage);
    }

    window.ImagePreview = { open: open, close: close };
})();
