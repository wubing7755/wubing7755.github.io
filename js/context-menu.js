"use strict";
// 自定义右键菜单：拦截浏览器 contextmenu 并显示站点像素风菜单（SD 视觉体系）。
// 菜单项按右键目标动态生成：链接（新标签打开/复制地址）、图片（新标签打开/复制地址）、
// 选中文本（复制）、空白（回到顶部/切换主题/切换语言）。
// 主题/语言切换复用现有 .theme-switch/.lang-switch 按钮的 Blazor 链路（dispatch click），
// 保证 ThemeService/LanguageService 状态同步，而非直接改 DOM。
// 本文件保持全局脚本形态（无 import/export），编译产物挂到 window.personalPortfolio。
(() => {
    const api = window.personalPortfolio ?? {};
    window.personalPortfolio = api;
    const MENU_ID = 'pp-context-menu';
    const MENU_CLASS = 'context-menu';
    const ITEM_CLASS = 'context-menu-item';
    const SEPARATOR_CLASS = 'context-menu-separator';
    const SCROLL_OFFSET = 8;
    let currentItems = [];
    let currentIndex = -1;
    function isEn() {
        return document.documentElement.lang === 'en';
    }
    function t(zh, en) {
        return isEn() ? en : zh;
    }
    function buildItems(target, selection) {
        const items = [];
        const anchor = target instanceof Element ? target.closest('a') : null;
        const image = target instanceof Element ? target.closest('img') : null;
        if (anchor) {
            const href = anchor.getAttribute('href') || '';
            const absolute = new URL(href, window.location.href).href;
            items.push({
                label: t('在新标签中打开', 'Open in new tab'),
                action: () => { window.open(absolute, '_blank', 'noopener'); },
            });
            items.push({
                label: t('复制链接地址', 'Copy link address'),
                action: () => { copyText(absolute); },
            });
        }
        if (image) {
            const src = image.getAttribute('src') || '';
            const absolute = new URL(src, window.location.href).href;
            items.push({
                label: t('在新标签中打开图片', 'Open image in new tab'),
                action: () => { window.open(absolute, '_blank', 'noopener'); },
            });
            items.push({
                label: t('复制图片地址', 'Copy image address'),
                action: () => { copyText(absolute); },
            });
        }
        if (selection) {
            items.push({
                label: t('复制选中文本', 'Copy selected text'),
                action: () => { copyText(selection); },
            });
        }
        if (items.length > 0) {
            items.push({ label: '', action: () => undefined }); // separator
        }
        items.push({
            label: t('搜索', 'Search'),
            action: () => { navigateToSearch(selection); },
        });
        items.push({
            label: t('设置', 'Settings'),
            action: () => { navigateToSettings(); },
        });
        items.push({
            label: t('回到顶部', 'Back to top'),
            action: () => { api.scroll?.toTop(); },
        });
        items.push({
            label: t('切换主题', 'Toggle theme'),
            action: () => { triggerButtonClick('.theme-switch'); },
        });
        items.push({
            label: t('切换语言', 'Toggle language'),
            action: () => { triggerButtonClick('.lang-switch'); },
        });
        return items;
    }
    // 跳转站内搜索页：右键时选中了文本则带上作为关键词（/search?q=），
    // 通过 <a> click 触发 Blazor SPA 导航（不整页刷新；Blazor Router 拦截同站链接）。
    function navigateToSearch(selection) {
        const keyword = selection ? selection.trim() : '';
        const url = keyword.length > 0 ? `/search?q=${encodeURIComponent(keyword)}` : '/search';
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }
    // 跳转站点设置页：通过 <a> click 触发 Blazor SPA 导航（不整页刷新；Blazor Router 拦截同站链接）。
    function navigateToSettings() {
        const anchor = document.createElement('a');
        anchor.href = '/settings';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }
    function triggerButtonClick(selector) {
        const button = document.querySelector(selector);
        if (button) {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
    }
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(() => { fallbackCopy(text); });
            return;
        }
        fallbackCopy(text);
    }
    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        }
        catch {
            // 复制失败静默（非关键路径）
        }
        textarea.remove();
    }
    function showMenu(x, y) {
        const existing = document.getElementById(MENU_ID);
        if (existing) {
            existing.remove();
        }
        const selection = getSelectionText();
        const items = buildItems(document.elementFromPoint(x, y), selection);
        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.className = MENU_CLASS;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('tabindex', '-1');
        currentItems = [];
        items.forEach((item) => {
            if (!item.label) {
                const separator = document.createElement('div');
                separator.className = SEPARATOR_CLASS;
                separator.setAttribute('role', 'separator');
                menu.appendChild(separator);
                return;
            }
            const entry = document.createElement('button');
            entry.type = 'button';
            entry.className = ITEM_CLASS;
            entry.setAttribute('role', 'menuitem');
            entry.textContent = item.label;
            entry.addEventListener('click', () => {
                closeMenu();
                item.action();
            });
            // 高亮索引必须对齐不含 separator 的 DOM 条目，而非 items 原始索引（含 separator），
            // 否则右键链接/图片时 separator 之后的「搜索/设置」会错位高亮。
            const entryIndex = currentItems.length;
            entry.addEventListener('mouseenter', () => { setActive(entryIndex); });
            menu.appendChild(entry);
            currentItems.push(item.action);
        });
        document.body.appendChild(menu);
        // 定位：视口内防溢出（翻转）
        const rect = menu.getBoundingClientRect();
        let left = x;
        let top = y;
        if (left + rect.width + SCROLL_OFFSET > window.innerWidth) {
            left = Math.max(SCROLL_OFFSET, window.innerWidth - rect.width - SCROLL_OFFSET);
        }
        if (top + rect.height + SCROLL_OFFSET > window.innerHeight) {
            top = Math.max(SCROLL_OFFSET, window.innerHeight - rect.height - SCROLL_OFFSET);
        }
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        currentIndex = -1;
        menu.focus({ preventScroll: true });
    }
    function getSelectionText() {
        const selection = window.getSelection();
        const text = selection ? selection.toString() : '';
        return text && text.trim().length > 0 ? text : null;
    }
    function setActive(index) {
        const menu = document.getElementById(MENU_ID);
        if (!menu) {
            return;
        }
        const entries = Array.from(menu.querySelectorAll(`.${ITEM_CLASS}`));
        if (index < 0 || index >= entries.length) {
            return;
        }
        currentIndex = index;
        entries.forEach((entry, i) => {
            if (i === index) {
                entry.classList.add('context-menu-item-active');
                entry.focus();
            }
            else {
                entry.classList.remove('context-menu-item-active');
            }
        });
    }
    function moveActive(delta) {
        const menu = document.getElementById(MENU_ID);
        if (!menu) {
            return;
        }
        const entries = Array.from(menu.querySelectorAll(`.${ITEM_CLASS}`));
        if (entries.length === 0) {
            return;
        }
        const next = currentIndex < 0 ? 0 : (currentIndex + delta + entries.length) % entries.length;
        setActive(next);
    }
    function closeMenu() {
        const menu = document.getElementById(MENU_ID);
        if (menu) {
            menu.remove();
        }
        currentItems = [];
        currentIndex = -1;
    }
    function onContextMenu(event) {
        event.preventDefault();
        showMenu(event.clientX, event.clientY);
    }
    function onKeyDown(event) {
        if (!document.getElementById(MENU_ID)) {
            return;
        }
        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                closeMenu();
                break;
            case 'ArrowDown':
                event.preventDefault();
                moveActive(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                moveActive(-1);
                break;
            case 'Home':
                event.preventDefault();
                setActive(0);
                break;
            case 'End':
                event.preventDefault();
                setActive(Array.from(document.querySelectorAll(`.${ITEM_CLASS}`)).length - 1);
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                activateCurrent();
                break;
        }
    }
    function activateCurrent() {
        if (currentIndex >= 0 && currentIndex < currentItems.length) {
            const action = currentItems[currentIndex];
            closeMenu();
            action();
        }
    }
    function onDocumentMouseDown(event) {
        const menu = document.getElementById(MENU_ID);
        if (menu && !menu.contains(event.target)) {
            closeMenu();
        }
    }
    function onScrollOrResize() {
        closeMenu();
    }
    function onWindowBlur() {
        closeMenu();
    }
    function init() {
        if (api.contextMenu) {
            return; // 重复加载防护
        }
        window.addEventListener('contextmenu', onContextMenu, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('mousedown', onDocumentMouseDown, true);
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        window.addEventListener('blur', onWindowBlur);
        api.contextMenu = { close: closeMenu };
    }
    init();
})();
