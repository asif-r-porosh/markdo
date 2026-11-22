# MarkDo desktop (macOS)

A Tauri 2 shell around the same files as the website. No second copy of the app:
the window loads `dist/`, which `scripts/stage.sh` builds from the repo root.

- `src-tauri/tauri.conf.json`: window, bundle and the build hook (`sh ../scripts/stage.sh`).
- `src-tauri/capabilities/default.json`: what the window may do (native open/save dialogs,
  read/write the chosen file, print).
- `../js/native.js`: inside the app, swaps the browser file pickers for native macOS dialogs.
  In a browser it does nothing. `document.js` and `export.js` are untouched.

## Build

Needs Rust and `cargo install tauri-cli --version "^2"`.

    cd desktop
    cargo tauri build

The app is `src-tauri/target/release/bundle/macos/MarkDo.app`. Run it with
`open src-tauri/target/release/bundle/macos/MarkDo.app`. The build is unsigned, so it runs on the
Mac that built it; handing it to another Mac needs signing and notarising.

Export to PDF opens the macOS print dialog, as in a browser; choose Save as PDF there.
