// 抖音视频的两种做法：template（nv hf-build 分镜）和 director（video-director 导演工程）
export const DIRECTOR_DIR = "抖音-director";
export const videoMode = (run) => (run?.video === "director" ? "director" : "template");
// 正式成片：不算压缩预览、风格样片、新旧对比
export const FINAL_RE = /^(?!预览|sample|compare).*\.mp4$/;
