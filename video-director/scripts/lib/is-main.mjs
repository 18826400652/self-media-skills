// 脚本被直接运行（而不是被测试导入）时返回 true。按真实路径比较：skill 常通过软链接调用。
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isMain(metaUrl) {
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
