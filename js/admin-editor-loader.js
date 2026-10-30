"use strict";
(() => {
    "use strict";
    let loading = null;
    function load() {
        if (window.AdminEditor) {
            return Promise.resolve();
        }
        if (loading) {
            return loading;
        }
        loading = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = new URL("js/admin-editor.js", document.baseURI).toString();
            script.onload = () => {
                if (window.AdminEditor) {
                    resolve();
                    return;
                }
                loading = null;
                script.remove();
                reject(new Error("admin-editor.js loaded without AdminEditor API"));
            };
            script.onerror = () => {
                loading = null;
                script.remove();
                reject(new Error("admin-editor.js failed to load"));
            };
            document.body.appendChild(script);
        });
        return loading;
    }
    window.loadAdminEditor = load;
})();
