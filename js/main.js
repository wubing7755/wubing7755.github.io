export const ScriptsInOne = (() => {
    return {
        initialize() {
            console.log('Initializing scripts...');
            if (typeof window.initSidebarDrag === 'function') {
                window.initSidebarDrag();
            }
            if (typeof window.initThemeToggle === 'function') {
                window.initThemeToggle();
            }
            window.addEventListener('beforeunload', () => ScriptsInOne.cleanup());
        },
        cleanup(_fullCleanup) {
            document.documentElement.removeAttribute('data-theme');
        },
        forcecleanup() {
            this.cleanup();
            localStorage.removeItem('theme');
        },
    };
})();
window.ScriptsInOne = ScriptsInOne;
//# sourceMappingURL=main.js.map