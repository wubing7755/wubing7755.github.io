"use strict";
// WuBing's Home 前端脚本（TypeScript 源码；由 tsc 编译为 wwwroot/js/storage.js，SD-32）
// 运行时零第三方依赖；编译产物为全局脚本，挂载到 window.personalPortfolio。
// 注意：本文件必须保持全局脚本形态（无 import/export），否则产物会变成模块包装。
// 与原有 JS 一致：若 window.personalPortfolio 已存在则复用其引用（脚本可重复加载）。
const api = window.personalPortfolio ?? {};
window.personalPortfolio = api;
api.storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        }
        catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch {
            // 存储不可用时静默失败，不阻断应用
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        }
        catch {
            // 存储不可用时静默失败，不阻断应用
        }
    }
};
// 文档语言声明随切换更新（SD-29 可访问性 / 浏览器断行行为）
api.lang = {
    set(lang) {
        document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    }
};
// 主题在 Blazor 启动前已由 index.html 预应用；这里负责读取、切换和持久化。
api.theme = {
    get() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    },
    set(theme) {
        const normalized = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', normalized);
        api.storage.set('portfolio-theme', normalized);
        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.setAttribute('content', normalized === 'dark' ? '#101722' : '#1a5fb4');
        }
    },
    getOverrides() {
        return api.storage.get('portfolio-theme-overrides');
    },
    setOverrides(text) {
        applyOverrides(text);
        api.storage.set('portfolio-theme-overrides', text);
    },
    clearOverrides() {
        api.storage.remove('portfolio-theme-overrides');
        const style = document.documentElement.style;
        for (let i = style.length - 1; i >= 0; i--) {
            const prop = style.item(i);
            if (prop && prop.startsWith('--')) {
                style.removeProperty(prop);
            }
        }
    }
};
// 站点级主题覆盖：逐行 --name: value 解析 + 值消毒后注入 <html> 内联 style（覆盖内置亮/暗主题）。
// 变量名白名单已由 C# ThemeOverrideService 在保存路径校验，此处仅做值消毒兜底。
function applyOverrides(text) {
    if (!text)
        return;
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const colon = trimmed.indexOf(':');
        if (colon < 0)
            continue;
        const name = trimmed.slice(0, colon).trim();
        let value = trimmed.slice(colon + 1).trim();
        if (value.endsWith(';'))
            value = value.slice(0, -1).trim();
        if (!name.startsWith('--') || isForbiddenValue(value))
            continue;
        document.documentElement.style.setProperty(name, value);
    }
}
function isForbiddenValue(value) {
    const lower = value.toLowerCase();
    return ['url(', 'expression(', '@', ';', '{', '}', '!important', '\\', '/*', '*/', 'javascript:', 'data:']
        .some(pattern => lower.includes(pattern));
}
// description、canonical、robots、Open Graph 与 Twitter 元数据保持单例并随路由/语言同步；title 由 Blazor PageTitle 独占管理。
api.metadata = {
    set(title, description, canonical, locale, noIndex, image, type) {
        const setContent = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.setAttribute('content', value || '');
            }
        };
        setContent('meta-description', description);
        setContent('meta-robots', noIndex ? 'noindex, nofollow' : 'index, follow');
        setContent('og-title', title);
        setContent('og-description', description);
        setContent('og-url', canonical);
        setContent('og-locale', locale);
        setContent('og-image', image);
        setContent('og-type', type || 'website');
        setContent('twitter-title', title);
        setContent('twitter-description', description);
        setContent('twitter-image', image);
        const canonicalLink = document.getElementById('canonical-link');
        if (canonicalLink) {
            if (canonical) {
                canonicalLink.setAttribute('href', canonical);
            }
            else {
                canonicalLink.removeAttribute('href');
            }
        }
    }
};
// SPA 锚点导航滚动：Blazor Router 不自动滚动到 fragment 目标（SD-21 搜索结果直达区块）
api.scroll = {
    // 直接读浏览器地址栏 hash：初始加载与 SPA 导航均可靠（Blazor NavigationManager 在初始化时可能丢失 fragment）
    currentHash() {
        return window.location.hash || '';
    },
    toFragment(id) {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
    },
    // 返回顶部：页面内滚动，不产生导航。纯 fragment 链接（href="#...")会被 Blazor
    // 基于 <base href> 解析成站点根路径，导致跳到首页（曾导致页脚返回顶部回首页）。
    toTop() {
        let behavior = 'auto';
        try {
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                behavior = 'smooth';
            }
        }
        catch {
            // matchMedia 不可用时退回即时滚动
        }
        window.scrollTo({ top: 0, behavior });
    },
    // 跳到主内容并转移焦点：模拟原生 fragment 导航对 tabindex 目标的行为，
    // 供 skip-link 使用（同样避免 Blazor 将 fragment 解析为站点根路径）。
    toMainContent() {
        const el = document.getElementById('main-content');
        if (el) {
            el.scrollIntoView({ behavior: 'auto', block: 'start' });
            el.focus({ preventScroll: true });
        }
    }
};
// 携带 Bearer token 下载文件（数据备份导出等 Admin 端点）：fetch → blob → 触发浏览器下载。
api.download = {
    async save(url, fileName) {
        const token = api.storage.get('pp-auth-token');
        if (!token) {
            throw new Error('NOT_AUTHENTICATED');
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
            },
        });
        if (!response.ok) {
            throw new Error('HTTP_' + response.status);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName || 'portfolio-backup.zip';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
    }
};
