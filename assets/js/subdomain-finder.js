/**
 * Subdomain Finder
 *
 * Discovers public subdomains from two client-side sources:
 *  - Cert Spotter Certificate Transparency API (paginated, capped)
 *  - HackerTarget host search (passive DNS)
 *
 * Only the base domain is sent to those APIs. No brute forcing or direct DNS
 * probing is performed, and every source's status is shown with the results.
 */

(function () {
    'use strict';

    const CT_API_URL = 'https://api.certspotter.com/v1/issuances';
    const HACKERTARGET_URL = 'https://api.hackertarget.com/hostsearch/';
    const CT_PAGE_LIMIT = 3;
    const FETCH_TIMEOUT_MS = 20000;
    const MAX_NAMES = 5000;

    let initialized = false;
    let busy = false;
    let currentDomain = '';
    let currentRows = [];

    function byId(id) {
        return document.getElementById(id);
    }

    function init() {
        if (initialized) return;
        const section = byId('subdomain-finder-section');
        if (!section) return;
        initialized = true;

        const form = byId('subdomain-form');
        const filterInput = byId('subdomain-filter');
        const copyBtn = byId('subdomain-copy');
        const downloadBtn = byId('subdomain-download');

        if (form) form.addEventListener('submit', handleSubmit);
        if (filterInput) filterInput.addEventListener('input', applyFilter);
        if (copyBtn) copyBtn.addEventListener('click', copyList);
        if (downloadBtn) downloadBtn.addEventListener('click', downloadList);
    }

    /* ---------------------------------------------------------------------
     * Domain validation
     * ------------------------------------------------------------------ */

    function isIpAddress(host) {
        return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.indexOf(':') !== -1 || host.charAt(0) === '[';
    }

    function isValidHostname(host) {
        if (!host || host.length > 253) return false;
        return host.split('.').every(function (label) {
            return label.length >= 1 && label.length <= 63 &&
                /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
        });
    }

    function toAsciiHost(value) {
        const name = String(value || '').trim().toLowerCase().replace(/\.$/, '');
        if (!name || !/^[a-z0-9._\-\u00a1-\uffff]+$/i.test(name)) return '';
        try {
            return new URL('https://' + name + '/').hostname.toLowerCase().replace(/\.$/, '');
        } catch (error) {
            return '';
        }
    }

    function normalizeDomain(value) {
        let raw = String(value || '').trim();
        if (!raw) return '';
        raw = raw.replace(/^\*\./, '');
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;

        let host;
        try {
            host = new URL(raw).hostname.toLowerCase().replace(/\.$/, '');
        } catch (error) {
            return '';
        }

        if (!host || isIpAddress(host)) return '';
        if (host.split('.').length < 2 || !isValidHostname(host)) return '';

        // A TLD made only of digits is not a useful public base domain.
        const tld = host.split('.').pop();
        if (!tld || /^\d+$/.test(tld)) return '';
        return host;
    }

    /* ---------------------------------------------------------------------
     * API clients
     * ------------------------------------------------------------------ */

    async function fetchWithTimeout(url, label) {
        const controller = new AbortController();
        const timer = setTimeout(function () {
            controller.abort();
        }, FETCH_TIMEOUT_MS);

        try {
            return await fetch(url.toString(), {
                cache: 'no-store',
                signal: controller.signal
            });
        } catch (error) {
            throw new Error(label + ' could not be reached. Check your connection and try again.');
        } finally {
            clearTimeout(timer);
        }
    }

    async function searchCertSpotter(domain) {
        const url = new URL(CT_API_URL);
        url.searchParams.set('domain', domain);
        url.searchParams.set('include_subdomains', 'true');
        url.searchParams.set('match_wildcards', 'true');
        url.searchParams.append('expand', 'dns_names');

        const names = [];
        let pages = 0;
        let warning = '';

        for (;;) {
            if (pages >= CT_PAGE_LIMIT) {
                warning = 'Stopped after ' + pages + ' pages to respect the free API limit.';
                break;
            }

            let response;
            try {
                response = await fetchWithTimeout(url, 'Cert Spotter');
            } catch (error) {
                if (pages) {
                    warning = error.message + ' Showing results from earlier pages.';
                    break;
                }
                throw error;
            }

            if (!response.ok) {
                const message = response.status === 429
                    ? 'Cert Spotter free rate limit reached. Try again later.'
                    : 'Cert Spotter returned HTTP ' + response.status + '.';
                if (pages) {
                    warning = message + ' Showing results from earlier pages.';
                    break;
                }
                throw new Error(message);
            }

            let list;
            try {
                list = await response.json();
            } catch (error) {
                if (pages) {
                    warning = 'Cert Spotter returned invalid data on a later page.';
                    break;
                }
                throw new Error('Cert Spotter returned invalid JSON.');
            }

            if (!Array.isArray(list)) {
                if (pages) {
                    warning = 'Cert Spotter returned an unexpected response on a later page.';
                    break;
                }
                throw new Error('Cert Spotter returned an unexpected response.');
            }

            pages++;
            list.forEach(function (item) {
                if (!item || !Array.isArray(item.dns_names)) return;
                item.dns_names.forEach(function (name) {
                    if (name) names.push(name);
                });
            });

            const last = list[list.length - 1];
            if (!list.length || !last || !last.id) break;
            url.searchParams.set('after', String(last.id));
        }

        return { names: names, pages: pages, warning: warning };
    }

    async function searchHackerTarget(domain) {
        const url = new URL(HACKERTARGET_URL);
        url.searchParams.set('q', domain);

        const response = await fetchWithTimeout(url, 'HackerTarget');
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('HackerTarget rate limit reached. Try again later.');
            }
            throw new Error('HackerTarget returned HTTP ' + response.status + '.');
        }

        const text = await response.text();
        const lines = text.split(/\r?\n/).map(function (line) {
            return line.trim();
        }).filter(Boolean);

        if (!lines.length) return { names: [], warning: '' };

        const invalid = lines.find(function (line) {
            return line.indexOf(',') === -1;
        });
        if (invalid) {
            if (/api count|quota|exceed|limit/i.test(invalid)) {
                throw new Error('HackerTarget free API quota reached. Try again later.');
            }
            if (/no records|not found|no data/i.test(invalid)) {
                return { names: [], warning: '' };
            }
            throw new Error('HackerTarget returned an unexpected response.');
        }

        const names = [];
        lines.forEach(function (line) {
            const host = line.split(',')[0];
            if (host) names.push(host);
        });
        return { names: names, warning: '' };
    }

    async function runSource(id, label, kind, search) {
        const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
        try {
            const result = await search();
            const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
            return {
                id: id,
                label: label,
                kind: kind,
                names: result.names || [],
                pages: result.pages || 0,
                status: result.warning ? 'partial' : 'ok',
                detail: result.warning || '',
                found: 0,
                ms: Math.round(elapsed)
            };
        } catch (error) {
            const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
            return {
                id: id,
                label: label,
                kind: kind,
                names: [],
                pages: 0,
                status: 'error',
                detail: error && error.message ? error.message : 'Request failed.',
                found: 0,
                ms: Math.round(elapsed)
            };
        }
    }

    /* ---------------------------------------------------------------------
     * Aggregation
     * ------------------------------------------------------------------ */

    function collectSubdomains(domain, sources) {
        const byName = new Map();
        const wildcards = new Set();
        let truncated = false;

        sources.forEach(function (source) {
            source.names.forEach(function (raw) {
                const lower = String(raw || '').trim().toLowerCase().replace(/\.$/, '');
                if (!lower) return;

                if (lower.indexOf('*') !== -1) {
                    wildcards.add(lower);
                    return;
                }

                const host = toAsciiHost(lower);
                if (!host || host === domain) return;
                if (host.slice(-(domain.length + 1)) !== '.' + domain) return;
                if (!isValidHostname(host)) return;

                if (!byName.has(host)) {
                    if (byName.size >= MAX_NAMES) {
                        truncated = true;
                        return;
                    }
                    byName.set(host, new Set());
                }
                byName.get(host).add(source.id);
            });
        });

        byName.forEach(function (ids) {
            ids.forEach(function (id) {
                const source = sources.find(function (item) {
                    return item.id === id;
                });
                if (source) source.found++;
            });
        });

        return {
            names: Array.from(byName.keys()).sort(function (a, b) {
                return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            }),
            origins: byName,
            wildcards: wildcards.size,
            truncated: truncated
        };
    }

    /* ---------------------------------------------------------------------
     * Rendering
     * ------------------------------------------------------------------ */

    function setNote(message, tone) {
        const note = byId('subdomain-note');
        if (!note) return;
        note.textContent = message;
        note.className = 'checker-note' + (tone ? ' ' + tone : '');
    }

    function showError(message) {
        const error = byId('subdomain-error');
        if (!error) return;
        error.textContent = message;
        error.classList.remove('ssl-hidden');
    }

    function hideError() {
        const error = byId('subdomain-error');
        if (!error) return;
        error.textContent = '';
        error.classList.add('ssl-hidden');
    }

    function setBusy(value) {
        const input = byId('subdomain-domain');
        const button = byId('subdomain-btn');
        busy = value;
        if (input) input.disabled = value;
        if (button) {
            button.disabled = value;
            button.textContent = value ? 'Searching…' : 'Find Subdomains';
        }
    }

    function clearResults() {
        currentDomain = '';
        currentRows = [];

        const results = byId('subdomain-results');
        const list = byId('subdomain-list');
        const sources = byId('subdomain-sources');
        const badges = byId('subdomain-badges');
        const summary = byId('subdomain-summary');
        const filter = byId('subdomain-filter');

        if (results) results.classList.add('ssl-hidden');
        if (list) list.textContent = '';
        if (sources) sources.textContent = '';
        if (badges) badges.textContent = '';
        if (summary) summary.textContent = '';
        if (filter) filter.value = '';

        setListActionsEnabled(false);
    }

    function setListActionsEnabled(value) {
        const copyBtn = byId('subdomain-copy');
        const downloadBtn = byId('subdomain-download');
        if (copyBtn) copyBtn.disabled = !value;
        if (downloadBtn) downloadBtn.disabled = !value;
    }

    function addBadge(container, text, tone) {
        const badge = document.createElement('span');
        badge.className = 'ssl-badge ' + (tone || 'is-info');
        badge.textContent = text;
        container.appendChild(badge);
    }

    function sourceStatus(source) {
        if (source.status === 'error') {
            return 'Unavailable — ' + source.detail;
        }
        if (source.status === 'partial') {
            return source.found + ' ' + (source.found === 1 ? 'name' : 'names') + ' · ' + source.detail;
        }
        const pages = source.pages ? ' · ' + source.pages + (source.pages === 1 ? ' page' : ' pages') : '';
        return source.found + ' ' + (source.found === 1 ? 'name' : 'names') + pages;
    }

    function renderSources(sources) {
        const container = byId('subdomain-sources');
        if (!container) return;
        container.textContent = '';

        sources.forEach(function (source) {
            const card = document.createElement('div');
            card.className = 'subdomain-source is-' + source.status;

            const head = document.createElement('div');
            head.className = 'subdomain-source-head';
            const name = document.createElement('strong');
            name.textContent = source.label;
            const kind = document.createElement('span');
            kind.textContent = source.kind;
            head.appendChild(name);
            head.appendChild(kind);

            const status = document.createElement('span');
            status.className = 'subdomain-source-status';
            status.textContent = sourceStatus(source);

            card.appendChild(head);
            card.appendChild(status);
            container.appendChild(card);
        });
    }

    function renderResults(domain, names, sources, origins, wildcards, truncated, elapsed) {
        currentDomain = domain;

        const results = byId('subdomain-results');
        const title = byId('subdomain-title');
        const summary = byId('subdomain-summary');
        const badges = byId('subdomain-badges');
        const list = byId('subdomain-list');
        const filter = byId('subdomain-filter');
        const empty = byId('subdomain-empty');
        if (!results || !title || !summary || !badges || !list) return;

        const activeSources = sources.filter(function (source) {
            return source.status !== 'error';
        }).length;
        const anyProblem = truncated || sources.some(function (source) {
            return source.status !== 'ok';
        });

        title.textContent = 'Subdomains of ' + domain;
        summary.textContent = names.length + ' unique public subdomain' + (names.length === 1 ? '' : 's') +
            ' from ' + activeSources + ' source' + (activeSources === 1 ? '' : 's') +
            ' · ' + (Math.max(elapsed, 0) / 1000).toFixed(1) + 's';

        badges.textContent = '';
        addBadge(badges, names.length + (names.length === 1 ? ' name' : ' names'), 'is-info');
        if (anyProblem) addBadge(badges, 'Partial results', 'is-warning');
        if (wildcards) addBadge(badges, wildcards + ' wildcard' + (wildcards === 1 ? '' : 's') + ' skipped', 'is-info');
        if (truncated) addBadge(badges, 'Result cap reached', 'is-warning');

        renderSources(sources);

        list.textContent = '';
        currentRows = [];
        const fragment = document.createDocumentFragment();
        names.forEach(function (name) {
            const item = document.createElement('li');
            item.className = 'subdomain-item';
            item.dataset.name = name;

            const label = document.createElement('span');
            label.className = 'subdomain-name';
            label.textContent = name;
            item.appendChild(label);

            const origin = document.createElement('span');
            origin.className = 'subdomain-origin';
            const sourceIds = sources.filter(function (source) {
                return origins.has(name) && origins.get(name).has(source.id);
            }).map(function (source) {
                return source.id === 'certspotter' ? 'CT' : 'DNS';
            });
            origin.textContent = sourceIds.length ? sourceIds.join(' · ') : '';
            origin.title = sourceIds.length ? 'Found in ' + sourceIds.join(' and ') : '';
            item.appendChild(origin);

            fragment.appendChild(item);
            currentRows.push(item);
        });
        list.appendChild(fragment);

        if (filter) filter.value = '';
        if (empty) {
            empty.textContent = names.length
                ? 'No subdomains matched this filter.'
                : 'No public subdomains were found. Try another domain or search again later.';
            empty.classList.toggle('ssl-hidden', names.length > 0);
        }

        results.classList.remove('ssl-hidden');
        setListActionsEnabled(names.length > 0);
    }

    function applyFilter() {
        const filter = byId('subdomain-filter');
        const empty = byId('subdomain-empty');
        const query = filter ? filter.value.trim().toLowerCase() : '';
        let visible = 0;

        currentRows.forEach(function (row) {
            const match = !query || row.dataset.name.indexOf(query) !== -1;
            row.hidden = !match;
            if (match) visible++;
        });

        if (empty) {
            empty.classList.toggle('ssl-hidden', visible > 0);
            if (!visible && currentRows.length) {
                empty.textContent = query
                    ? 'No subdomains match "' + filter.value.trim() + '".'
                    : 'No public subdomains were found. Try another domain or search again later.';
            }
        }
    }

    function visibleNames() {
        return currentRows.filter(function (row) {
            return !row.hidden;
        }).map(function (row) {
            return row.dataset.name;
        });
    }

    async function copyList() {
        const names = visibleNames();
        if (!names.length) return;
        const button = byId('subdomain-copy');
        try {
            await navigator.clipboard.writeText(names.join('\n'));
            if (button) {
                const previous = button.textContent;
                button.textContent = 'Copied!';
                button.disabled = true;
                setTimeout(function () {
                    button.textContent = previous;
                    button.disabled = false;
                }, 2000);
            }
        } catch (error) {
            showError('The subdomain list could not be copied to the clipboard.');
        }
    }

    function downloadList() {
        const names = visibleNames();
        if (!names.length) return;
        const domain = currentDomain || 'domain';
        const safe = domain.replace(/[^a-z0-9.-]+/gi, '-');
        const blob = new Blob([names.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = safe + '-subdomains.txt';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 10000);
    }

    /* ---------------------------------------------------------------------
     * Search
     * ------------------------------------------------------------------ */

    async function handleSubmit(event) {
        event.preventDefault();
        if (busy) return;

        hideError();
        clearResults();

        const input = byId('subdomain-domain');
        const domain = normalizeDomain(input ? input.value : '');
        if (!domain) {
            showError('Enter a valid base domain, for example example.com.');
            if (input) input.focus();
            return;
        }

        if (input) input.value = domain;
        setBusy(true);
        setNote('Searching Certificate Transparency and passive DNS for ' + domain + '…', 'is-info');
        const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

        try {
            const sources = await Promise.all([
                runSource('certspotter', 'Cert Spotter CT', 'Certificate Transparency', function () {
                    return searchCertSpotter(domain);
                }),
                runSource('hackertarget', 'HackerTarget', 'Passive DNS', function () {
                    return searchHackerTarget(domain);
                })
            ]);

            const collected = collectSubdomains(domain, sources);
            const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
            const failed = sources.filter(function (source) {
                return source.status === 'error';
            });

            if (!collected.names.length && failed.length === sources.length) {
                setNote('Both public data sources could not be queried.', 'is-warning');
                showError('Subdomain search failed. ' + failed.map(function (source) {
                    return source.label + ': ' + source.detail;
                }).join(' '));
                return;
            }

            renderResults(domain, collected.names, sources, collected.origins, collected.wildcards, collected.truncated, elapsed);

            if (failed.length) {
                setNote('Search finished with warnings. Some sources were unavailable.', 'is-warning');
            } else if (sources.some(function (source) { return source.status === 'partial'; }) || collected.truncated) {
                setNote('Search finished with partial results. Free API limits or pagination caps were reached.', 'is-warning');
            } else if (!collected.names.length) {
                setNote('No public subdomains were found for ' + domain + '.', 'is-info');
            } else {
                setNote('Found ' + collected.names.length + ' unique public subdomains for ' + domain + '.', 'is-success');
            }
        } catch (error) {
            showError('Subdomain search failed. ' + (error && error.message ? error.message : 'Unexpected error.'));
            setNote('Search failed. Try again in a moment.', 'is-warning');
        } finally {
            setBusy(false);
        }
    }

    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState !== 'loading') init();
})();
