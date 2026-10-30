"use strict";
// 首屏主题预应用：必须在 Blazor 与页面渲染前执行，避免亮/暗主题与覆盖变量闪烁。
(() => {
    "use strict";
    let theme = "light";
    try {
        theme = localStorage.getItem("portfolio-theme")
            || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
    catch {
        theme = "light";
    }
    const normalizedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", normalizedTheme);
    // 覆盖预应用：先站点级缓存、再个人覆盖（个人优先）；支持 [light]/[dark] 分组；值消毒兜底。
    try {
        const overrideSources = [
            localStorage.getItem("portfolio-theme-overrides"),
            localStorage.getItem("portfolio-theme-personal-overrides"),
        ];
        const lightMap = {};
        const darkMap = {};
        for (const overrides of overrideSources) {
            if (!overrides)
                continue;
            let section = "light";
            for (const rawLine of overrides.split("\n")) {
                const line = rawLine.trim();
                if (!line || line.startsWith("#"))
                    continue;
                const sectionMatch = line.match(/^\[(light|dark)\]$/i);
                if (sectionMatch) {
                    section = sectionMatch[1].toLowerCase() === "dark" ? "dark" : "light";
                    continue;
                }
                const colon = line.indexOf(":");
                if (colon < 0)
                    continue;
                const name = line.slice(0, colon).trim();
                let value = line.slice(colon + 1).trim();
                if (value.endsWith(";"))
                    value = value.slice(0, -1).trim();
                const lower = value.toLowerCase();
                if (!name.startsWith("--")
                    || lower.includes("url(")
                    || lower.includes("expression(")
                    || lower.includes("@")
                    || lower.includes("!important")) {
                    continue;
                }
                if (section === "dark")
                    darkMap[name] = value;
                else
                    lightMap[name] = value;
            }
        }
        for (const key of Object.keys(lightMap)) {
            if (!(key in darkMap))
                darkMap[key] = lightMap[key];
        }
        const cssLines = [":root {"];
        for (const key of Object.keys(lightMap))
            cssLines.push(`  ${key}: ${lightMap[key]};`);
        cssLines.push("}");
        cssLines.push('html[data-theme="dark"] {');
        for (const key of Object.keys(darkMap))
            cssLines.push(`  ${key}: ${darkMap[key]};`);
        cssLines.push("}");
        if (Object.keys(lightMap).length > 0 || Object.keys(darkMap).length > 0) {
            const styleEl = document.createElement("style");
            styleEl.id = "theme-preapply-overrides";
            styleEl.setAttribute("data-theme-overrides", "");
            styleEl.textContent = cssLines.join("\n");
            document.head.appendChild(styleEl);
        }
    }
    catch {
        // 无缓存或存储不可用时保持默认主题。
    }
    document.addEventListener("DOMContentLoaded", () => {
        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.setAttribute("content", normalizedTheme === "dark" ? "#0d1524" : "#0b3d91");
        }
    }, { once: true });
})();
