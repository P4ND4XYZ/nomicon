// mdBook 0.5.1 indexes with an English tokenizer which drops Japanese words.
// Search its existing, unmodified document store for Japanese substrings instead.
(function () {
    'use strict';

    const hasJapanese = query => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(query);
    const normalize = text => text.normalize('NFKC').toLowerCase();

    function japaneseMatches(documents, query) {
        const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
        if (terms.length === 0) {
            return [];
        }
        const results = [];
        for (const [ref, doc] of Object.entries(documents)) {
            const title = normalize(doc.title || '');
            const body = normalize(doc.body || '');
            if (terms.every(term => title.includes(term) || body.includes(term))) {
                const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 5 : 1), 0);
                results.push({ref, score, doc});
            }
        }
        return results.sort((a, b) => b.score - a.score || Number(a.ref) - Number(b.ref));
    }

    function install(elasticlunr) {
        const original = elasticlunr.Index.prototype.search;
        elasticlunr.Index.prototype.search = function (query, options) {
            return hasJapanese(query)
                ? japaneseMatches(this.documentStore.docs, query)
                : original.call(this, query, options);
        };
    }

    // A URL search can finish before additional-js loads. Refresh that initial
    // Japanese result without changing browser history or the native controls.
    function refreshInitialSearch() {
        const query = new URLSearchParams(window.location.search).get('search');
        const config = window.search;
        if (!query || !hasJapanese(query) || !config || !config.index) {
            return;
        }
        const list = document.getElementById('mdbook-searchresults');
        const header = document.getElementById('mdbook-searchresults-header');
        if (!list || !header) {
            return;
        }
        const results = japaneseMatches(config.index.documentStore.docs, query)
            .slice(0, config.results_options.limit_results);
        const fragment = document.createDocumentFragment();
        for (const result of results) {
            const item = document.createElement('li');
            const link = document.createElement('a');
            const url = new URL(window.path_to_root + config.doc_urls[result.ref], window.location.href);
            url.searchParams.set('highlight', query);
            link.href = url.href;
            link.textContent = result.doc.breadcrumbs;
            const teaser = document.createElement('span');
            teaser.className = 'teaser';
            const body = result.doc.body;
            const position = Math.max(0, body.indexOf(query));
            teaser.textContent = body.slice(Math.max(0, position - 40), position + 160);
            item.append(link, teaser);
            fragment.append(item);
        }
        list.replaceChildren(fragment);
        header.textContent = `${results.length}件の検索結果:「${query}」`;
    }

    if (typeof module !== 'undefined') {
        module.exports = {hasJapanese, japaneseMatches, install};
    }
    if (typeof window !== 'undefined' && window.elasticlunr) {
        install(window.elasticlunr);
        if (document.readyState === 'complete') {
            refreshInitialSearch();
        } else {
            window.addEventListener('load', refreshInitialSearch, {once: true});
        }
    }
}());
