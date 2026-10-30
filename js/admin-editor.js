"use strict";
(() => {
    "use strict";
    let activeCleanup = null;
    let activeEditor = null;
    let activeSearchPanel = null;
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
        const before = editor.value.slice(0, editor.selectionStart);
        const lines = before.split("\n");
        return { line: lines.length, column: lines[lines.length - 1].length + 1 };
    }
    /** 按滚动比例同步两栏：左滚动 → 右跟随，右滚动 → 左跟随。 */
    function syncScroll(left, right) {
        if (!left || !right) {
            return () => { };
        }
        let syncing = false;
        function apply(target, source) {
            const sourceMax = source.scrollHeight - source.clientHeight;
            const targetMax = target.scrollHeight - target.clientHeight;
            if (sourceMax > 0 && targetMax > 0) {
                target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
            }
        }
        function onLeftScroll() {
            if (syncing)
                return;
            syncing = true;
            apply(right, left);
            syncing = false;
        }
        function onRightScroll() {
            if (syncing)
                return;
            syncing = true;
            apply(left, right);
            syncing = false;
        }
        left.addEventListener("scroll", onLeftScroll, { passive: true });
        right.addEventListener("scroll", onRightScroll, { passive: true });
        return () => {
            left.removeEventListener("scroll", onLeftScroll);
            right.removeEventListener("scroll", onRightScroll);
        };
    }
    function attachLineNumbers(editor, gutter, cursorPosition) {
        if (!editor || !gutter) {
            return () => { };
        }
        const textarea = editor;
        const gutterElement = gutter;
        function renderLines() {
            const count = textarea.value.split("\n").length;
            const fragment = document.createDocumentFragment();
            for (let index = 1; index <= count; index++) {
                const line = document.createElement("span");
                line.textContent = String(index);
                line.dataset.line = String(index);
                fragment.appendChild(line);
                if (index < count)
                    fragment.appendChild(document.createTextNode("\n"));
            }
            gutterElement.replaceChildren(fragment);
            updateActiveLine();
        }
        function updateActiveLine() {
            const position = getPosition(textarea);
            const previous = gutterElement.querySelector(".is-active");
            if (previous)
                previous.classList.remove("is-active");
            const current = gutterElement.querySelector(`[data-line="${position.line}"]`);
            if (current)
                current.classList.add("is-active");
            const style = getComputedStyle(textarea);
            const lineHeight = parseFloat(style.lineHeight) || 24;
            const paddingTop = parseFloat(style.paddingTop) || 0;
            const activeY = paddingTop + (position.line - 1) * lineHeight - textarea.scrollTop;
            textarea.style.setProperty("--admin-active-line-y", activeY + "px");
            textarea.style.setProperty("--admin-active-line-height", lineHeight + "px");
            if (cursorPosition) {
                cursorPosition.textContent = "Ln " + position.line + ", Col " + position.column;
            }
        }
        function syncGutterScroll() {
            gutterElement.scrollTop = textarea.scrollTop;
            updateActiveLine();
        }
        renderLines();
        textarea.addEventListener("input", renderLines);
        textarea.addEventListener("scroll", syncGutterScroll, { passive: true });
        textarea.addEventListener("click", updateActiveLine);
        textarea.addEventListener("keyup", updateActiveLine);
        textarea.addEventListener("select", updateActiveLine);
        return () => {
            textarea.removeEventListener("input", renderLines);
            textarea.removeEventListener("scroll", syncGutterScroll);
            textarea.removeEventListener("click", updateActiveLine);
            textarea.removeEventListener("keyup", updateActiveLine);
            textarea.removeEventListener("select", updateActiveLine);
        };
    }
    function indentSelection(editor, outdent) {
        const value = editor.value;
        const originalStart = editor.selectionStart;
        const originalEnd = editor.selectionEnd;
        const blockStart = value.lastIndexOf("\n", Math.max(0, originalStart - 1)) + 1;
        const nextBreak = value.indexOf("\n", originalEnd);
        const blockEnd = nextBreak < 0 ? value.length : nextBreak;
        const lines = value.slice(blockStart, blockEnd).split("\n");
        let transformed;
        let firstRemoved = 0;
        let totalDelta = 0;
        if (outdent) {
            transformed = lines
                .map((line, index) => {
                const match = line.match(/^(?: {1,4}|\t)/);
                const removed = match ? match[0].length : 0;
                if (index === 0)
                    firstRemoved = removed;
                totalDelta -= removed;
                return line.slice(removed);
            })
                .join("\n");
        }
        else {
            transformed = lines.map((line) => "    " + line).join("\n");
            totalDelta = lines.length * 4;
        }
        const selectionStart = outdent ? Math.max(blockStart, originalStart - firstRemoved) : originalStart + 4;
        const selectionEnd = Math.max(selectionStart, originalEnd + totalDelta);
        replaceRange(editor, transformed, blockStart, blockEnd, selectionStart, selectionEnd);
    }
    function continueList(editor) {
        const cursor = editor.selectionStart;
        if (cursor !== editor.selectionEnd)
            return false;
        const lineStart = editor.value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
        const match = editor.value.slice(lineStart, cursor).match(/^(\s*)([-+*]|>|\d+[.)])\s+(.*)$/);
        if (!match)
            return false;
        if (match[3].length === 0) {
            replaceRange(editor, "", lineStart, cursor, lineStart, lineStart);
            return true;
        }
        let marker = match[2];
        const ordered = marker.match(/^(\d+)([.)])$/);
        if (ordered)
            marker = String(Number(ordered[1]) + 1) + ordered[2];
        const insertion = "\n" + match[1] + marker + " ";
        replaceRange(editor, insertion, cursor, cursor, cursor + insertion.length, cursor + insertion.length);
        return true;
    }
    function wrapSelection(editor, before, after, placeholder) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selected = editor.value.slice(start, end) || placeholder;
        replaceRange(editor, before + selected + after, start, end, start + before.length, start + before.length + selected.length);
    }
    function prefixLines(editor, prefix) {
        const value = editor.value;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const blockStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const nextBreak = value.indexOf("\n", end);
        const blockEnd = nextBreak < 0 ? value.length : nextBreak;
        const lines = value.slice(blockStart, blockEnd).split("\n");
        const replacement = lines
            .map((line, index) => (prefix === "1. " ? String(index + 1) + ". " + line : prefix + line))
            .join("\n");
        replaceRange(editor, replacement, blockStart, blockEnd, start + prefix.length, end + replacement.length - (blockEnd - blockStart));
    }
    function applyFormat(command) {
        const editor = activeEditor;
        if (!editor)
            return;
        switch (command) {
            case "heading":
                prefixLines(editor, "## ");
                break;
            case "bold":
                wrapSelection(editor, "**", "**", "text");
                break;
            case "italic":
                wrapSelection(editor, "*", "*", "text");
                break;
            case "quote":
                prefixLines(editor, "> ");
                break;
            case "unordered-list":
                prefixLines(editor, "- ");
                break;
            case "ordered-list":
                prefixLines(editor, "1. ");
                break;
            case "link":
                wrapSelection(editor, "[", "](https://)", "link text");
                break;
            case "code":
                wrapSelection(editor, "`", "`", "code");
                break;
        }
    }
    function searchElements() {
        if (!activeSearchPanel)
            return null;
        const find = activeSearchPanel.querySelector('[data-editor-search="find"]');
        const replace = activeSearchPanel.querySelector('[data-editor-search="replace"]');
        const status = activeSearchPanel.querySelector('[data-editor-search="status"]');
        if (!find || !replace || !status)
            return null;
        return { find, replace, status };
    }
    function openSearch(replaceMode) {
        const elements = searchElements();
        if (!elements)
            return;
        activeSearchPanel.hidden = false;
        activeSearchPanel.classList.toggle("is-replace-mode", !!replaceMode);
        elements.find.focus();
        elements.find.select();
    }
    function closeSearch() {
        if (!activeSearchPanel)
            return;
        activeSearchPanel.hidden = true;
        if (activeEditor)
            activeEditor.focus();
    }
    function findNext(reverse) {
        const editor = activeEditor;
        const elements = searchElements();
        if (!editor || !elements)
            return false;
        const query = elements.find.value;
        if (!query) {
            elements.status.textContent = "0 / 0";
            return false;
        }
        const haystack = editor.value.toLocaleLowerCase();
        const needle = query.toLocaleLowerCase();
        const start = reverse ? editor.selectionStart - 1 : editor.selectionEnd;
        let match = reverse ? haystack.lastIndexOf(needle, start) : haystack.indexOf(needle, start);
        if (match < 0)
            match = reverse ? haystack.lastIndexOf(needle) : haystack.indexOf(needle);
        if (match < 0) {
            elements.status.textContent = "0 / 0";
            return false;
        }
        editor.setSelectionRange(match, match + query.length);
        const before = editor.value.slice(0, match);
        const line = before.split("\n").length;
        const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 24;
        editor.scrollTop = Math.max(0, (line - 2) * lineHeight);
        const total = haystack.split(needle).length - 1;
        const ordinal = haystack.slice(0, match).split(needle).length;
        elements.status.textContent = ordinal + " / " + total;
        return true;
    }
    function replaceCurrent() {
        const editor = activeEditor;
        const elements = searchElements();
        if (!editor || !elements || !elements.find.value)
            return;
        const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
        if (selected.toLocaleLowerCase() !== elements.find.value.toLocaleLowerCase()) {
            findNext(false);
            return;
        }
        const start = editor.selectionStart;
        replaceRange(editor, elements.replace.value, start, editor.selectionEnd, start, start + elements.replace.value.length);
        elements.find.focus();
        findNext(false);
    }
    function replaceAll() {
        const editor = activeEditor;
        const elements = searchElements();
        if (!editor || !elements || !elements.find.value)
            return;
        const needle = elements.find.value.toLocaleLowerCase();
        const source = editor.value;
        const lower = source.toLocaleLowerCase();
        let cursor = 0;
        let count = 0;
        let output = "";
        let match;
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
        if (!dotNetRef || typeof dotNetRef.invokeMethodAsync !== "function")
            return;
        const promise = value === undefined
            ? dotNetRef.invokeMethodAsync(method)
            : dotNetRef.invokeMethodAsync(method, value);
        if (promise && typeof promise.then === "function")
            promise.catch(() => { });
    }
    function acceptedImages(files) {
        const allowed = /\.(png|jpe?g|gif|webp)$/i;
        return Array.from(files ?? []).filter((file) => /^image\/(png|jpeg|gif|webp)$/i.test(file.type || "") || allowed.test(file.name || ""));
    }
    function insertImageMarkdown(editor, fileName, url) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const alt = String(fileName || "image")
            .replace(/\.[^.]+$/, "")
            .replace(/[\[\]\r\n]/g, " ");
        const prefix = start > 0 && editor.value[start - 1] !== "\n" ? "\n" : "";
        const suffix = end < editor.value.length && editor.value[end] !== "\n" ? "\n" : "";
        const markdown = prefix + "![" + alt + "](" + url + ")" + suffix;
        replaceRange(editor, markdown, start, end, start + markdown.length, start + markdown.length);
    }
    async function uploadImages(files, editor, dotNetRef, uploadUrl) {
        const images = acceptedImages(files);
        if (!images.length || !uploadUrl)
            return;
        const shell = editor.closest(".admin-markdown-shell");
        if (shell)
            shell.classList.add("is-uploading");
        notify(dotNetRef, "OnImageUploadStartedAsync", images.length);
        let uploaded = 0;
        try {
            for (let index = 0; index < images.length; index++) {
                const form = new FormData();
                form.append("file", images[index], images[index].name || "pasted-image.png");
                const token = localStorage.getItem("pp-auth-token");
                const headers = {};
                if (token)
                    headers.Authorization = "Bearer " + token;
                const response = await fetch(uploadUrl, { method: "POST", headers, body: form });
                if (!response.ok)
                    throw new Error("upload failed: " + response.status);
                const result = (await response.json());
                if (!result.url)
                    throw new Error("upload response has no url");
                insertImageMarkdown(editor, images[index].name, result.url);
                uploaded++;
            }
            notify(dotNetRef, "OnImageUploadCompletedAsync", uploaded);
        }
        catch {
            notify(dotNetRef, "OnImageUploadFailedAsync", uploaded);
        }
        finally {
            if (shell)
                shell.classList.remove("is-uploading", "is-drag-over");
        }
    }
    function attachImageUpload(editor, dotNetRef, uploadUrl) {
        function onDragOver(event) {
            if (!acceptedImages(event.dataTransfer?.files).length)
                return;
            event.preventDefault();
            editor.closest(".admin-markdown-shell")?.classList.add("is-drag-over");
        }
        function onDragLeave() {
            editor.closest(".admin-markdown-shell")?.classList.remove("is-drag-over");
        }
        function onDrop(event) {
            const images = acceptedImages(event.dataTransfer?.files);
            if (!images.length)
                return;
            event.preventDefault();
            uploadImages(images, editor, dotNetRef, uploadUrl);
        }
        function onPaste(event) {
            const images = acceptedImages(event.clipboardData?.files);
            if (!images.length)
                return;
            event.preventDefault();
            uploadImages(images, editor, dotNetRef, uploadUrl);
        }
        editor.addEventListener("dragover", onDragOver);
        editor.addEventListener("dragleave", onDragLeave);
        editor.addEventListener("drop", onDrop);
        editor.addEventListener("paste", onPaste);
        return () => {
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
        const cleanupScroll = syncScroll(editor, preview);
        const cleanupLineNumbers = attachLineNumbers(editor, gutter, cursorPosition);
        const cleanupImageUpload = attachImageUpload(editor, dotNetRef, uploadUrl);
        function onDocumentKeyDown(event) {
            if (event.isComposing || !(event.ctrlKey || event.metaKey))
                return;
            const shortcut = String(event.key).toLowerCase();
            if (shortcut === "s") {
                event.preventDefault();
                notify(dotNetRef, "SaveFromShortcutAsync");
            }
            else if (shortcut === "f" || shortcut === "h") {
                event.preventDefault();
                openSearch(shortcut === "h");
            }
        }
        function onEditorKeyDown(event) {
            if (event.isComposing)
                return;
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
                const shortcut = String(event.key).toLowerCase();
                const command = shortcut === "b" ? "bold" : shortcut === "i" ? "italic" : shortcut === "k" ? "link" : null;
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
            }
            else if (event.key === "Enter" && event.target.matches('[data-editor-search="find"]')) {
                event.preventDefault();
                findNext(event.shiftKey);
            }
        }
        function onSearchClick(event) {
            const action = event.target.closest("[data-editor-search-action]");
            if (!(action instanceof HTMLElement))
                return;
            switch (action.dataset.editorSearchAction) {
                case "next":
                    findNext(false);
                    break;
                case "previous":
                    findNext(true);
                    break;
                case "replace":
                    replaceCurrent();
                    break;
                case "replace-all":
                    replaceAll();
                    break;
                case "close":
                    closeSearch();
                    break;
            }
        }
        document.addEventListener("keydown", onDocumentKeyDown);
        editor.addEventListener("keydown", onEditorKeyDown);
        if (searchPanel) {
            searchPanel.addEventListener("keydown", onSearchKeyDown);
            searchPanel.addEventListener("click", onSearchClick);
        }
        activeCleanup = () => {
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
        syncScroll,
        initialize,
        applyFormat,
        openSearch,
        findNext,
        replaceCurrent,
        replaceAll,
        dispose,
    };
})();
