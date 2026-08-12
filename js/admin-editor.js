// Admin 正文编辑器：行号、当前行、搜索替换、图片上传、Markdown 辅助输入与生命周期清理。
(function () {
  "use strict";

  var activeCleanup = null;
  var activeEditor = null;
  var activeSearchPanel = null;

  function emitInput(editor) {
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function replaceRange(editor, text, start, end, selectionStart, selectionEnd) {
    editor.setRangeText(text, start, end, "start");
    editor.setSelectionRange(selectionStart, selectionEnd);
    emitInput(editor);
    editor.focus();
  }

  function getPosition(editor) {
    var before = editor.value.slice(0, editor.selectionStart);
    var lines = before.split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  /** 按滚动比例同步两栏：左滚动 → 右跟随，右滚动 → 左跟随。 */
  function syncScroll(left, right) {
    if (!left || !right) {
      return function () {};
    }

    var syncing = false;
    function apply(target, source) {
      var sourceMax = source.scrollHeight - source.clientHeight;
      var targetMax = target.scrollHeight - target.clientHeight;
      if (sourceMax > 0 && targetMax > 0) {
        target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
      }
    }
    function onLeftScroll() {
      if (syncing) return;
      syncing = true;
      apply(right, left);
      syncing = false;
    }
    function onRightScroll() {
      if (syncing) return;
      syncing = true;
      apply(left, right);
      syncing = false;
    }

    left.addEventListener("scroll", onLeftScroll, { passive: true });
    right.addEventListener("scroll", onRightScroll, { passive: true });
    return function () {
      left.removeEventListener("scroll", onLeftScroll);
      right.removeEventListener("scroll", onRightScroll);
    };
  }

  function attachLineNumbers(editor, gutter, cursorPosition) {
    if (!editor || !gutter) {
      return function () {};
    }

    function renderLines() {
      var count = editor.value.split("\n").length;
      var fragment = document.createDocumentFragment();
      for (var index = 1; index <= count; index++) {
        var line = document.createElement("span");
        line.textContent = String(index);
        line.dataset.line = String(index);
        fragment.appendChild(line);
        if (index < count) fragment.appendChild(document.createTextNode("\n"));
      }
      gutter.replaceChildren(fragment);
      updateActiveLine();
    }

    function updateActiveLine() {
      var position = getPosition(editor);
      var previous = gutter.querySelector(".is-active");
      if (previous) previous.classList.remove("is-active");
      var current = gutter.querySelector('[data-line="' + position.line + '"]');
      if (current) current.classList.add("is-active");

      var style = getComputedStyle(editor);
      var lineHeight = parseFloat(style.lineHeight) || 24;
      var paddingTop = parseFloat(style.paddingTop) || 0;
      var activeY = paddingTop + (position.line - 1) * lineHeight - editor.scrollTop;
      editor.style.setProperty("--admin-active-line-y", activeY + "px");
      editor.style.setProperty("--admin-active-line-height", lineHeight + "px");
      if (cursorPosition) {
        cursorPosition.textContent = "Ln " + position.line + ", Col " + position.column;
      }
    }

    function syncGutterScroll() {
      gutter.scrollTop = editor.scrollTop;
      updateActiveLine();
    }

    renderLines();
    editor.addEventListener("input", renderLines);
    editor.addEventListener("scroll", syncGutterScroll, { passive: true });
    editor.addEventListener("click", updateActiveLine);
    editor.addEventListener("keyup", updateActiveLine);
    editor.addEventListener("select", updateActiveLine);
    return function () {
      editor.removeEventListener("input", renderLines);
      editor.removeEventListener("scroll", syncGutterScroll);
      editor.removeEventListener("click", updateActiveLine);
      editor.removeEventListener("keyup", updateActiveLine);
      editor.removeEventListener("select", updateActiveLine);
    };
  }

  function indentSelection(editor, outdent) {
    var value = editor.value;
    var originalStart = editor.selectionStart;
    var originalEnd = editor.selectionEnd;
    var blockStart = value.lastIndexOf("\n", Math.max(0, originalStart - 1)) + 1;
    var nextBreak = value.indexOf("\n", originalEnd);
    var blockEnd = nextBreak < 0 ? value.length : nextBreak;
    var lines = value.slice(blockStart, blockEnd).split("\n");
    var transformed;
    var firstRemoved = 0;
    var totalDelta = 0;

    if (outdent) {
      transformed = lines.map(function (line, index) {
        var match = line.match(/^(?: {1,4}|\t)/);
        var removed = match ? match[0].length : 0;
        if (index === 0) firstRemoved = removed;
        totalDelta -= removed;
        return line.slice(removed);
      }).join("\n");
    } else {
      transformed = lines.map(function (line) { return "    " + line; }).join("\n");
      totalDelta = lines.length * 4;
    }

    var selectionStart = outdent ? Math.max(blockStart, originalStart - firstRemoved) : originalStart + 4;
    var selectionEnd = Math.max(selectionStart, originalEnd + totalDelta);
    replaceRange(editor, transformed, blockStart, blockEnd, selectionStart, selectionEnd);
  }

  function continueList(editor) {
    var cursor = editor.selectionStart;
    if (cursor !== editor.selectionEnd) return false;
    var lineStart = editor.value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
    var match = editor.value.slice(lineStart, cursor).match(/^(\s*)([-+*]|>|\d+[.)])\s+(.*)$/);
    if (!match) return false;
    if (match[3].length === 0) {
      replaceRange(editor, "", lineStart, cursor, lineStart, lineStart);
      return true;
    }
    var marker = match[2];
    var ordered = marker.match(/^(\d+)([.)])$/);
    if (ordered) marker = String(Number(ordered[1]) + 1) + ordered[2];
    var insertion = "\n" + match[1] + marker + " ";
    replaceRange(editor, insertion, cursor, cursor, cursor + insertion.length, cursor + insertion.length);
    return true;
  }

  function wrapSelection(editor, before, after, placeholder) {
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    var selected = editor.value.slice(start, end) || placeholder;
    replaceRange(editor, before + selected + after, start, end, start + before.length, start + before.length + selected.length);
  }

  function prefixLines(editor, prefix) {
    var value = editor.value;
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    var blockStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    var nextBreak = value.indexOf("\n", end);
    var blockEnd = nextBreak < 0 ? value.length : nextBreak;
    var lines = value.slice(blockStart, blockEnd).split("\n");
    var replacement = lines.map(function (line, index) {
      return prefix === "1. " ? String(index + 1) + ". " + line : prefix + line;
    }).join("\n");
    replaceRange(editor, replacement, blockStart, blockEnd, start + prefix.length, end + replacement.length - (blockEnd - blockStart));
  }

  function applyFormat(command) {
    var editor = activeEditor;
    if (!editor) return;
    switch (command) {
      case "heading": prefixLines(editor, "## "); break;
      case "bold": wrapSelection(editor, "**", "**", "text"); break;
      case "italic": wrapSelection(editor, "*", "*", "text"); break;
      case "quote": prefixLines(editor, "> "); break;
      case "unordered-list": prefixLines(editor, "- "); break;
      case "ordered-list": prefixLines(editor, "1. "); break;
      case "link": wrapSelection(editor, "[", "](https://)", "link text"); break;
      case "code": wrapSelection(editor, "`", "`", "code"); break;
    }
  }

  function searchElements() {
    if (!activeSearchPanel) return null;
    return {
      find: activeSearchPanel.querySelector('[data-editor-search="find"]'),
      replace: activeSearchPanel.querySelector('[data-editor-search="replace"]'),
      status: activeSearchPanel.querySelector('[data-editor-search="status"]'),
    };
  }

  function openSearch(replaceMode) {
    var elements = searchElements();
    if (!elements) return;
    activeSearchPanel.hidden = false;
    activeSearchPanel.classList.toggle("is-replace-mode", !!replaceMode);
    elements.find.focus();
    elements.find.select();
  }

  function closeSearch() {
    if (!activeSearchPanel) return;
    activeSearchPanel.hidden = true;
    if (activeEditor) activeEditor.focus();
  }

  function findNext(reverse) {
    var editor = activeEditor;
    var elements = searchElements();
    if (!editor || !elements) return false;
    var query = elements.find.value;
    if (!query) {
      elements.status.textContent = "0 / 0";
      return false;
    }
    var haystack = editor.value.toLocaleLowerCase();
    var needle = query.toLocaleLowerCase();
    var start = reverse ? editor.selectionStart - 1 : editor.selectionEnd;
    var match = reverse ? haystack.lastIndexOf(needle, start) : haystack.indexOf(needle, start);
    if (match < 0) match = reverse ? haystack.lastIndexOf(needle) : haystack.indexOf(needle);
    if (match < 0) {
      elements.status.textContent = "0 / 0";
      return false;
    }
    editor.setSelectionRange(match, match + query.length);
    var before = editor.value.slice(0, match);
    var line = before.split("\n").length;
    var lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 24;
    editor.scrollTop = Math.max(0, (line - 2) * lineHeight);
    var total = haystack.split(needle).length - 1;
    var ordinal = haystack.slice(0, match).split(needle).length;
    elements.status.textContent = ordinal + " / " + total;
    return true;
  }

  function replaceCurrent() {
    var editor = activeEditor;
    var elements = searchElements();
    if (!editor || !elements || !elements.find.value) return;
    var selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (selected.toLocaleLowerCase() !== elements.find.value.toLocaleLowerCase()) {
      findNext(false);
      return;
    }
    var start = editor.selectionStart;
    replaceRange(editor, elements.replace.value, start, editor.selectionEnd, start, start + elements.replace.value.length);
    elements.find.focus();
    findNext(false);
  }

  function replaceAll() {
    var editor = activeEditor;
    var elements = searchElements();
    if (!editor || !elements || !elements.find.value) return;
    var needle = elements.find.value.toLocaleLowerCase();
    var source = editor.value;
    var lower = source.toLocaleLowerCase();
    var cursor = 0;
    var count = 0;
    var output = "";
    var match;
    while ((match = lower.indexOf(needle, cursor)) >= 0) {
      output += source.slice(cursor, match) + elements.replace.value;
      cursor = match + elements.find.value.length;
      count++;
    }
    if (count === 0) {
      elements.status.textContent = "0 / 0";
      return;
    }
    output += source.slice(cursor);
    replaceRange(editor, output, 0, source.length, 0, 0);
    elements.status.textContent = String(count);
    elements.find.focus();
  }

  function notify(dotNetRef, method, value) {
    if (!dotNetRef || typeof dotNetRef.invokeMethodAsync !== "function") return;
    var promise = value === undefined
      ? dotNetRef.invokeMethodAsync(method)
      : dotNetRef.invokeMethodAsync(method, value);
    if (promise && typeof promise.catch === "function") promise.catch(function () {});
  }

  function acceptedImages(files) {
    var allowed = /\.(png|jpe?g|gif|webp)$/i;
    return Array.from(files || []).filter(function (file) {
      return /^image\/(png|jpeg|gif|webp)$/i.test(file.type || "") || allowed.test(file.name || "");
    });
  }

  function insertImageMarkdown(editor, fileName, url) {
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    var alt = String(fileName || "image").replace(/\.[^.]+$/, "").replace(/[\[\]\r\n]/g, " ");
    var prefix = start > 0 && editor.value[start - 1] !== "\n" ? "\n" : "";
    var suffix = end < editor.value.length && editor.value[end] !== "\n" ? "\n" : "";
    var markdown = prefix + "![" + alt + "](" + url + ")" + suffix;
    replaceRange(editor, markdown, start, end, start + markdown.length, start + markdown.length);
  }

  async function uploadImages(files, editor, dotNetRef, uploadUrl) {
    var images = acceptedImages(files);
    if (!images.length || !uploadUrl) return;
    var shell = editor.closest(".admin-markdown-shell");
    if (shell) shell.classList.add("is-uploading");
    notify(dotNetRef, "OnImageUploadStartedAsync", images.length);
    var uploaded = 0;
    try {
      for (var index = 0; index < images.length; index++) {
        var form = new FormData();
        form.append("file", images[index], images[index].name || "pasted-image.png");
        var token = localStorage.getItem("pp-auth-token");
        var headers = token ? { Authorization: "Bearer " + token } : {};
        var response = await fetch(uploadUrl, { method: "POST", headers: headers, body: form });
        if (!response.ok) throw new Error("upload failed: " + response.status);
        var result = await response.json();
        if (!result.url) throw new Error("upload response has no url");
        insertImageMarkdown(editor, images[index].name, result.url);
        uploaded++;
      }
      notify(dotNetRef, "OnImageUploadCompletedAsync", uploaded);
    } catch (error) {
      notify(dotNetRef, "OnImageUploadFailedAsync", uploaded);
    } finally {
      if (shell) shell.classList.remove("is-uploading", "is-drag-over");
    }
  }

  function attachImageUpload(editor, dotNetRef, uploadUrl) {
    function onDragOver(event) {
      if (!acceptedImages(event.dataTransfer && event.dataTransfer.files).length) return;
      event.preventDefault();
      editor.closest(".admin-markdown-shell")?.classList.add("is-drag-over");
    }
    function onDragLeave() {
      editor.closest(".admin-markdown-shell")?.classList.remove("is-drag-over");
    }
    function onDrop(event) {
      var images = acceptedImages(event.dataTransfer && event.dataTransfer.files);
      if (!images.length) return;
      event.preventDefault();
      uploadImages(images, editor, dotNetRef, uploadUrl);
    }
    function onPaste(event) {
      var images = acceptedImages(event.clipboardData && event.clipboardData.files);
      if (!images.length) return;
      event.preventDefault();
      uploadImages(images, editor, dotNetRef, uploadUrl);
    }
    editor.addEventListener("dragover", onDragOver);
    editor.addEventListener("dragleave", onDragLeave);
    editor.addEventListener("drop", onDrop);
    editor.addEventListener("paste", onPaste);
    return function () {
      editor.removeEventListener("dragover", onDragOver);
      editor.removeEventListener("dragleave", onDragLeave);
      editor.removeEventListener("drop", onDrop);
      editor.removeEventListener("paste", onPaste);
    };
  }

  function dispose() {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    activeEditor = null;
    activeSearchPanel = null;
  }

  function initialize(editor, gutter, preview, searchPanel, cursorPosition, dotNetRef, uploadUrl) {
    dispose();
    activeEditor = editor;
    activeSearchPanel = searchPanel;
    var cleanupScroll = syncScroll(editor, preview);
    var cleanupLineNumbers = attachLineNumbers(editor, gutter, cursorPosition);
    var cleanupImageUpload = attachImageUpload(editor, dotNetRef, uploadUrl);

    function onDocumentKeyDown(event) {
      if (event.isComposing || !(event.ctrlKey || event.metaKey)) return;
      var shortcut = String(event.key).toLowerCase();
      if (shortcut === "s") {
        event.preventDefault();
        notify(dotNetRef, "SaveFromShortcutAsync");
      } else if (shortcut === "f" || shortcut === "h") {
        event.preventDefault();
        openSearch(shortcut === "h");
      }
    }

    function onEditorKeyDown(event) {
      if (event.isComposing) return;
      if (event.key === "Tab") {
        event.preventDefault();
        indentSelection(editor, event.shiftKey);
        return;
      }
      if (event.key === "Enter" && continueList(editor)) {
        event.preventDefault();
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        var shortcut = String(event.key).toLowerCase();
        var command = shortcut === "b" ? "bold" : shortcut === "i" ? "italic" : shortcut === "k" ? "link" : null;
        if (command) {
          event.preventDefault();
          applyFormat(command);
        }
      }
    }

    function onSearchKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      } else if (event.key === "Enter" && event.target.matches('[data-editor-search="find"]')) {
        event.preventDefault();
        findNext(event.shiftKey);
      }
    }

    function onSearchClick(event) {
      var action = event.target.closest("[data-editor-search-action]");
      if (!action) return;
      switch (action.dataset.editorSearchAction) {
        case "next": findNext(false); break;
        case "previous": findNext(true); break;
        case "replace": replaceCurrent(); break;
        case "replace-all": replaceAll(); break;
        case "close": closeSearch(); break;
      }
    }

    document.addEventListener("keydown", onDocumentKeyDown);
    editor.addEventListener("keydown", onEditorKeyDown);
    if (searchPanel) {
      searchPanel.addEventListener("keydown", onSearchKeyDown);
      searchPanel.addEventListener("click", onSearchClick);
    }
    activeCleanup = function () {
      cleanupScroll();
      cleanupLineNumbers();
      cleanupImageUpload();
      document.removeEventListener("keydown", onDocumentKeyDown);
      editor.removeEventListener("keydown", onEditorKeyDown);
      if (searchPanel) {
        searchPanel.removeEventListener("keydown", onSearchKeyDown);
        searchPanel.removeEventListener("click", onSearchClick);
      }
    };
  }

  window.AdminEditor = {
    syncScroll: syncScroll,
    initialize: initialize,
    applyFormat: applyFormat,
    openSearch: openSearch,
    findNext: findNext,
    replaceCurrent: replaceCurrent,
    replaceAll: replaceAll,
    dispose: dispose,
  };
})();
