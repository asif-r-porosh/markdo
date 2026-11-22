/* native.js - inside the MarkDo desktop app (Tauri), replace the browser's
   File System Access pickers with native macOS dialogs. document.js and
   export.js already talk to showOpenFilePicker / showSaveFilePicker /
   handle.getFile() / handle.createWritable(), so they need no changes.
   In a normal browser window.__TAURI__ is absent and this file does nothing. */

export function installNativeFiles(T) {
  var dialog = T && T.dialog, fs = T && T.fs;
  if (!dialog || !fs) { return false; }

  function abort() {
    var e = new Error('The user aborted a request.');
    e.name = 'AbortError';
    return e;
  }
  function baseName(p) { return String(p).split(/[\\/]/).pop(); }

  /* picker "types" ([{description, accept:{mime:[.ext]}}]) -> dialog filters */
  function toFilters(types) {
    var out = [];
    (types || []).forEach(function (t) {
      var exts = [];
      Object.keys(t.accept || {}).forEach(function (mime) {
        (t.accept[mime] || []).forEach(function (x) { exts.push(String(x).replace(/^\./, '')); });
      });
      if (exts.length) { out.push({ name: t.description || 'Files', extensions: exts }); }
    });
    return out;
  }

  function makeHandle(path) {
    return {
      kind: 'file',
      name: baseName(path),
      path: path,
      getFile: function () {
        return fs.readFile(path).then(function (bytes) { return new File([bytes], baseName(path)); });
      },
      createWritable: function () {
        var parts = [];
        return Promise.resolve({
          write: function (data) { parts.push(data); return Promise.resolve(); },
          close: function () {
            return new Blob(parts).arrayBuffer().then(function (buf) {
              return fs.writeFile(path, new Uint8Array(buf));
            });
          }
        });
      }
    };
  }

  window.showOpenFilePicker = function (opts) {
    opts = opts || {};
    var o = { multiple: false, directory: false };
    var f = toFilters(opts.types);
    if (f.length) { o.filters = f; }
    return dialog.open(o).then(function (p) {
      if (!p) { throw abort(); }
      return [makeHandle(Array.isArray(p) ? p[0] : p)];
    });
  };

  window.showSaveFilePicker = function (opts) {
    opts = opts || {};
    var o = {};
    if (opts.suggestedName) { o.defaultPath = opts.suggestedName; }
    var f = toFilters(opts.types);
    if (f.length) { o.filters = f; }
    return dialog.save(o).then(function (p) {
      if (!p) { throw abort(); }
      return makeHandle(p);
    });
  };
  return true;
}

if (typeof window !== 'undefined' && window.__TAURI__) { installNativeFiles(window.__TAURI__); }
