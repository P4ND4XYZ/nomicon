# Rust 裏本 — The Rustonomicon (Japanese translation)

This checkout contains the Japanese translation of [rust-lang/nomicon](https://github.com/rust-lang/nomicon), pinned to [`5791ca9f5d671328af7a8fe87b42ca90c7211d28`](https://github.com/rust-lang/nomicon/commit/5791ca9f5d671328af7a8fe87b42ca90c7211d28). It is not a declaration of an official Japanese publication or deployment.

The existing [Japanese edition](https://github.com/rust-lang-ja/rust-nomicon-ja/tree/1b23982de81bab6174f6e202f30437f315274ccd) and the [translation table](https://github.com/rust-lang-ja/the-rust-programming-language-ja/blob/2eaecee7a369fa354d6c3fe7e27d7332a74514ed/TranslationTable.md) were checked as terminology and translation references; the current English source takes precedence. Source and reference commits remain fixed during translation.

All 64 Markdown files (63 chapters and the table of contents) have been translated and independently contrast-reviewed against the fixed source. Translation information, attribution and licensing are displayed in [the introduction](src/intro.md). Passing code tests is not proof of translation accuracy.

The GitHub button in the book links to the **English source repository**. A Japanese publication URL and repository have not been selected. Publishing, deployment, commits and pushes require separate authorization.

The Dark Arts of Advanced and Unsafe Rust Programming

Nicknamed "the Nomicon."

## NOTE: This is a draft document, and may contain serious errors

> Instead of the programs I had hoped for, there came only a shuddering
blackness and ineffable loneliness; and I saw at last a fearful truth which no
one had ever dared to breathe before — the unwhisperable secret of secrets — The
fact that this language of stone and stridor is not a sentient perpetuation of
Rust as London is of Old London and Paris of Old Paris, but that it is in fact
quite unsafe, its sprawling body imperfectly embalmed and infested with queer
animate things which have nothing to do with it as it was in compilation.

This book digs into all the awful details that are necessary to understand in
order to write correct Unsafe Rust programs. Due to the nature of this problem,
it may lead to unleashing untold horrors that shatter your psyche into a billion
infinitesimal fragments of despair.

## Requirements

Building the Nomicon requires [mdBook]. To get it:

[mdBook]: https://github.com/rust-lang/mdBook

```bash
cargo install mdbook --version 0.5.1 --locked
```

### `mdbook` usage

To build the Nomicon use the `build` sub-command:

```bash
mdbook build
```

The output will be placed in the `book` subdirectory. To check it out, open the
`index.html` file in your web browser. You can pass the `--open` flag to `mdbook
build` and it'll open the index page in your default browser (if the process is
successful) just like with `cargo doc --open`:

```bash
mdbook build --open
```

There is also a `test` sub-command to test all code samples contained in the book:

```bash
rustup run nightly mdbook test
```

Use Rust nightly, as the upstream CI does: some examples require unstable features. The verified environment is mdBook 0.5.1 and Rust `1.101.0-nightly (c36f14571 2026-10-01)` on Windows/MSVC. Rust edition 2024 is configured in `book.toml`. Do not update the source baseline as part of a toolchain update.

The Japanese search supplement uses mdBook's existing document store for substring matching without adding dependencies; Latin-only queries still use the native search.

The final browser checks used Chrome 154.0.8037.92 at desktop and 390px mobile sizes. The source HEAD check on 2026-10-03 still matched the pinned commit, so no upstream update was pending at that time. Recheck before a future publication.

When following upstream later, identify changed chapters and translate, contrast-review and verify them before updating the source baseline.

### `linkcheck`

We use the upstream `linkcheck` tool to find broken links. Install the `rust-docs` component for the nightly toolchain first. To run it locally:

```sh
curl -sSLo linkcheck.sh https://raw.githubusercontent.com/rust-lang/rust/master/src/tools/linkchecker/linkcheck.sh
sh linkcheck.sh --all nomicon
```

### Hosting layout and relative links

The book preserves upstream relative links such as `../book/index.html`, `../reference/index.html`, `../std/` and `../core/`. For a complete local preview or publication, place the built Japanese book under a `nomicon/` directory next to the Rust documentation directories (the layout used by the upstream link checker). A standalone `book/` output does not contain those sibling documents. Select the actual hosting layout before publication; no public host has been configured. Existing old-path redirects in `book.toml` are retained.

## Translation reports and licensing

The English source is an unfinished draft and may contain technical errors. When it disagrees with The Reference, prefer The Reference as explained in the introduction.

For a **translation error**, report the chapter path, quotation and proposed correction to the maintainers of this Japanese checkout; no Japanese issue tracker has been selected. Do not send Japanese-only translation issues to the English tracker by default. For an **original-source issue**, use [rust-lang/nomicon/issues](https://github.com/rust-lang/nomicon/issues), referring to the fixed English passage and commit. Record suspected source errors separately from translation defects rather than silently correcting them in Japanese.

The source and the referenced Japanese edition include the MIT and Apache-2.0 licenses. This checkout retains [`LICENSE-MIT`](LICENSE-MIT), [`LICENSE-APACHE`](LICENSE-APACHE) and the source attribution to **The Rust Project Developers**. The Japanese text is a modification of the pinned English chapters, with the existing Japanese edition credited above as a checked reference. No original copyright or license notices have been removed.

## Contributing to the English source

Given that the Nomicon is still in a draft state, we'd love your help! Please
feel free to open issues about anything, and send in PRs for things you'd like
to fix or change. If your change is large, please open an issue first, so we can
make sure that it's something we'd accept before you go through the work of
getting a PR together.
