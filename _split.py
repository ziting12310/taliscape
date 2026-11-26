"""切分脚本：把原单文件 JS 按模块注释边界拆成 ES module。
拆分规则：保持业务代码 100% 不变，只在顶部加 export/import。"""
import re, os, textwrap

ROOT = r"d:\competition\trae\game"
with open(os.path.join(ROOT, "index.html"), "r", encoding="utf-8") as f:
    html = f.read()

# 抓出 <script> ... </script> 内部
m = re.search(r"<script>([\s\S]*?)</script>", html)
assert m, "没找到 script 块"
script = m.group(1)

# 模块边界：/* === ... === *  注释块里的模块名
blocks = re.split(r"(/\* =+\*\n \*\s+\d+\.)", script)
# blocks[0] 是第一个注释之前（空或 'use strict' 头），后续成对出现
modules = []
# 手动重建：blocks[1] 是 "/* ====\n *  1."，blocks[2] 是其内容
# 但 split 把分隔符吃了，重建
if len(blocks) >= 3:
    for i in range(1, len(blocks), 2):
        header = blocks[i] + blocks[i + 1]
        # header 里有模块名（第 2 行）
        name_m = re.search(r"\*\s+\d+\.\s*(.+)", header)
        name = name_m.group(1).strip() if name_m else f"mod{i}"
        # 下一个模块的 header 之前的内容
        body_start = script.find(header) + len(header)
        if i + 2 < len(blocks):
            body_end = script.find(blocks[i + 2]) if i + 2 < len(blocks) else len(script)
        else:
            body_end = len(script)
        body = script[body_start:body_end].strip("\n")
        modules.append((name, body))

print(f"切出 {len(modules)} 个模块：")
for n, _ in modules: print(f"  - {n}")

# 目标文件映射
file_map = {
    "StateMachine": ("GameState.js", []),
    "题库": ("QuizBank.js", []),
    "GridManager": ("GridManager.js", []),
    "Player": ("Player.js", ["import GridManager from './GridManager.js';"]),
    "TeacherTimer": ("TeacherTimer.js", ["import GameState from './GameState.js';"]),
    "ShameTracker": ("ShameTracker.js", []),
    "QuizManager": ("QuizManager.js", [
        "import GameState from './GameState.js';",
        "import QuizBank from './QuizBank.js';",
        "import FlashbackData from './FlashbackData.js';",  # 占位，FlashbackData 单独写
    ]),
    "FlashbackManager": ("FlashbackManager.js", [
        "import GameState from './GameState.js';",
        "import FlashbackData from './FlashbackData.js';",
        "import ShameTracker from './ShameTracker.js';",
    ]),
    "Renderer": ("Renderer.js", [
        "import GameState from './GameState.js';",
    ]),
    "Main": ("main.js", []),
}

os.makedirs(os.path.join(ROOT, "js"), exist_ok=True)

for mod_name, body in modules:
    if mod_name not in file_map:
        print(f"[跳过] 未配置映射: {mod_name}")
        continue
    fname, imports = file_map[mod_name]
    path = os.path.join(ROOT, "js", fname)
    # 如果是 Main，不在这里写，最后统一处理
    if fname == "main.js":
        continue
    content = "// 自动拆分自原单文件 index.html，业务逻辑 100% 原样搬运\n"
    if imports:
        content += "\n".join(imports) + "\n\n"
    # 给 const/class 加 export
    content += _add_export(body)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[写入] js/{fname}  ({len(content)} 字节)")

# FlashbackData —— 单独处理，从原 script 里抓 FLASHBACK_TYPES 块
flash_m = re.search(r"const FLASHBACK_TYPES = \{([\s\S]*?)\n\};", script)
if flash_m:
    path = os.path.join(ROOT, "js", "FlashbackData.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("// 闪回类型数据（自动拆分）\n" + flash_m.group(0).replace("const FLASHBACK_TYPES", "export const FLASHBACK_TYPES"))
    print(f"[写入] js/FlashbackData.js")

print("\n拆分完成，下一步写 main.js 和精简 index.html")
