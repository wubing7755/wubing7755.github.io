"use strict";
// WuBing's Home 错误捕获脚本（TypeScript 源码；由 tsc 编译为 wwwroot/js/error-boot.js）
// 职责：
//   捕获全局 JS 错误 / 未处理 Promise 拒绝，完整写入 console（错误详情不对访客公开，绝不写 DOM）。
// 设计约束（实机验证修正 2026-08-13）：
//   Blazor WASM 中，未捕获异常（事件处理器/异步）会触发 mono 运行时的 dotNetCriticalError，
//   框架强制显示 #blazor-error-ui（机甲故障面板）。本脚本不做二次导航（避免双重错误 UI），
//   仅保留 console 记录供 owner 自查；页面 UI 统一由框架 #blazor-error-ui / ErrorBoundary 呈现。
// 注意：
//   - 本文件必须保持全局脚本形态（无 import/export），且先于 blazor.webassembly.js 加载。
//   - 不得重复声明 storage.ts 已有的 `interface Window { personalPortfolio }`（同名属性冲突）；
//     这里仅合并新增属性。顶层变量避免与 storage.ts 的 `api` 重名（全局作用域）。
// 与 storage.ts 相同模式：window.personalPortfolio 已存在则复用（脚本可重复加载）。
const errorApi = window.personalPortfolio ?? {};
window.personalPortfolio = errorApi;
function formatError(context, error) {
    const detail = error instanceof Error
        ? `${error.message}\n${error.stack ?? ''}`
        : typeof error === 'string'
            ? error
            : String(error);
    return `[${context}] ${detail}`;
}
// 仅记录到 console（boot 阶段 Blazor 不可用，这是唯一正确的落点；错误详情不对访客公开）。
function logToConsole(context, error) {
    console.error(formatError(context, error));
}
window.addEventListener('error', (event) => {
    // 资源加载失败（script/img/css 404 等）没有 message/stack，单独归类。
    const target = event.target;
    if (target && target.tagName && target.tagName !== 'SCRIPT' && target.tagName !== 'IMG') {
        return;
    }
    if (target && target.src) {
        logToConsole('resource-load', `Failed to load resource: ${target.src}`);
        return;
    }
    logToConsole('window-error', event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
    logToConsole('unhandled-rejection', event.reason);
});
errorApi.error = {
    // 供 .NET 侧（JSInterop）主动上报业务异常时调用；当前仅记录 console。
    notify(message) {
        logToConsole('manual', message);
    },
};
