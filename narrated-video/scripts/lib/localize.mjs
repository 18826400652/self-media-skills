// 把工程里从 CDN 加载的 GSAP 换成本地文件（nv hf-kit 复制到 compositions/kit/gsap.min.js）。
// 国内访问 jsdelivr 时常十几秒才返回，会让 hyperframes 的截图、检查、渲染因页面加载超时而失败；本地文件没有这个问题。
// 不管 HTML 是谁生成的（帧模板、HyperFrames 组装脚本、字幕脚本、手写帧），nv hf-build 组装完都统一换一遍。
export const LOCAL_GSAP = "compositions/kit/gsap.min.js";

// 整个 <script …gsap@版本/dist/gsap.min.js…></script> 标签：换成干净的本地标签（去掉 integrity、crossorigin）
const GSAP_TAG_RE = /<script\b[^>]*\bsrc="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@([\d.]+)\/dist\/gsap\.min\.js"[^>]*>\s*<\/script>/g;

/**
 * @param {string} html
 * @param {string} localVersion 本地 gsap.min.js 的版本；CDN 地址的版本不同时照样换，并在 mismatched 里报出来
 * @returns {{ html: string, count: number, mismatched: string[] }}
 */
export function localizeGsap(html, localVersion) {
  let count = 0;
  const mismatched = [];
  const out = html.replace(GSAP_TAG_RE, (_, version) => {
    count++;
    if (version !== localVersion && !mismatched.includes(version)) mismatched.push(version);
    return `<script src="${LOCAL_GSAP}"></script>`;
  });
  return { html: out, count, mismatched };
}
