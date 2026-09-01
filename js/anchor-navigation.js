// 正文目录/交叉引用锚点导航。
// Blazor WASM 会把 <a href="#..."> 点击当作内部路由导航（#锚点 被解析为空路径 → 跳首页）。
// 在 window 捕获阶段（最外层、先于 Blazor 的监听）接管：滚动到目标并更新 URL fragment。
// 注意：replaceState 相对 URL 会基于 <base href="/"> 解析成 /#xxx（丢路径），必须显式拼当前路径。
(function () {
  window.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest
      ? event.target.closest('a[href^="#"]')
      : null;
    if (!anchor) {
      return;
    }

    var id = anchor.getAttribute('href').slice(1);
    var target = document.getElementById(id);
    if (!target) {
      // 兜底：id 若为 URL 编码形态（如博客园导入的未编码锚点），尝试解码后匹配。
      target = document.getElementById(decodeURIComponent(id));
    }
    if (!target) {
      return; // 目标不存在：不接管
    }

    event.preventDefault();
    event.stopPropagation();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var url = window.location.pathname + window.location.search + '#' + id;
    history.replaceState(null, '', url);
  }, true);
})();
