# HeyBuddy 应用图标

面向 HeyBuddy 桌面端（`ui/desktop`，Electron Forge，`productName: HeyBuddy`）的应用图标方案。
母版为矢量 SVG，位图产物由 `make_icons.py` 一键重算。

**已选定方案 B（Sprout Buddy 抽芽伙伴），并已应用到 `ui/desktop/src/images/`。** A、C 作为设计备选保留。

## 一、设计依据

| 维度 | 取值 | 来源 |
|---|---|---|
| 主色渐变 | `#00713A` → `#109C48` → `#E4B43C` | 从 `ui/desktop/src/images/logo.png`（公司林业标）逐像素统计得出的实际主色，非新拟 |
| 容器外形 | 全出血 squircle，超椭圆 `n=5` | 对齐 macOS Big Sur 图标外形；同时对齐 WorkBuddy 的图标语法 |
| 前景 | 单一纯白主体，无描边、无文字 | 参考 WorkBuddy：满幅渐变底 + 一个白色主体，保证小尺寸辨识度 |
| 母版 | 1024×1024 RGBA | `ui/desktop/src/images/prepare.py` 的 `MASTER_SIZE` |

配色刻意选公司绿金而非 new-api 上游的品红/天蓝（`#F054A8` / `#48B4F0`）：HeyBuddy 走公司 OA SSO 登录，
图标应指向公司身份，而非上游开源项目身份。

## 二、三个方向

| 代号 | 名称 | 构思 | 小尺寸表现 |
|---|---|---|---|
| **A** | Buddy Ring 双影环 | 还原 new-api 桌面端图标（`new-api/electron/icon.png`）的双水滴 + 中心火花。整圆被一条 S 形通道劈成两枚锥形逗点——"两个伙伴"，中心火花即 AI 信号 | 16px 仍可辨双影与中心火花 |
| **B** ✅ | Sprout Buddy 抽芽伙伴 | 最贴近 WorkBuddy 的吉祥物语法：圆头 + 两枚挖空胶囊眼，头顶抽出一片新芽点明公司林业属性 | **最稳**，16px 仍读得出"有张脸" |
| **C** | SSO Shield 接入盾章 | 取 `new-api/web/public/logo.png` 的盾形，内部负形挖出四角星，强调 OA SSO 的可信接入 | 16px 盾形轮廓清晰，火花略糊 |

选型建议：
- 要**品牌延续性**（与 new-api 同源）→ A
- 要**亲和力与小尺寸稳健**（托盘 22px、Windows 16px 高频出现）→ B
- 要**政企语境的正式感**→ C

## 三、目录产物

```
branding/
├── make_icons.py                          # 母版生成脚本（改设计只改这一处）
├── heybuddy-icon-{a,b,c}-*.svg            # 矢量母版
├── heybuddy-icon-{a,b,c}-*-1024.png       # 全出血 1024 母版，喂给 prepare.py 用这个
├── heybuddy-icon-{a,b,c}-*-macos-1024.png # macOS HIG 留白版（主体 824，四周透明边）
├── heybuddy-icon-b-sproutbuddy-tray.svg   # 方案 B 托盘剪影母版（无底色、眼睛为空洞）
├── heybuddy-icon-b-sproutbuddy-tray-1024.png
└── preview/
    ├── _contact-sheet.png                 # 三方向 × 128/64/32/16 小尺寸验收图
    └── {key}-{1024,256,128,64,32,16}.png
```

## 四、如何应用到构建（方案 B 已执行）

### 关键约束：托盘图标必须用另一份剪影母版

`ui/desktop/src/main.ts:1650` 以 `new Tray('iconTemplate.png')` 加载托盘图，
Electron 对 `*Template` 后缀的图像在 macOS 上**只取 alpha 通道**渲染（浅色栏黑、深色栏白）。
全出血 squircle 母版 alpha 近乎全不透明，直接交给 `prepare.py` 会让菜单栏变成一个**纯黑方块**。

因此应用分两步：应用图标用全出血母版，托盘 4 件套改用 `-tray-1024.png` 剪影母版重写。

```bash
cd ui/desktop/src/images

# 1) 应用图标：全出血母版走既有流水线
cp ~/Project/HeyBuddy/branding/heybuddy-icon-b-sproutbuddy-1024.png logo.png
python3 prepare.py

# 2) 托盘 4 件套：改用剪影母版重写（复用 prepare.py 自身函数，不重复实现）
python3 - <<'EOF'
import importlib.util
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('prep', Path('prepare.py').resolve())
prep = importlib.util.module_from_spec(spec); spec.loader.exec_module(prep)
tray = prep.build_master(
    Path.home() / 'Project/HeyBuddy/branding/heybuddy-icon-b-sproutbuddy-tray-1024.png')
for name, (w, _) in prep.PLAIN_PNG_OUTPUTS.items():
    if name.startswith('iconTemplate'):
        tray.resize((w, w), Image.LANCZOS).save(name, optimize=True)
for name, (w, _) in prep.TRAY_UPDATE_OUTPUTS.items():
    prep.render_tray_update(tray, w).save(name, optimize=True)
EOF

python3 prepare.py --verify
```

`forge.config.ts` 引用的是 `src/images/icon*`，无需改配置。

验收口径：`iconTemplate*.png` 的 alpha 不透明占比应在 **30% 上下**（剪影），若接近 100% 说明第 2 步漏了。

### 已知遗留（本次未改动）

- `prepare.py` 的 `render_tray_update()` 画的是「白描边 + 绿圆点」角标，但 Template 图会丢弃颜色，
  角标在菜单栏中实际呈现为一个实心单色圆点。这是既有行为，与本次换标无关。
- `UPDATE_DOT_COLOR = #209F4B` 与新标主绿 `#109C48` 差异可忽略，无需调整。

### macOS 留白与 prepare.py 的冲突

`prepare.py` 的 `build_master()` 会按 alpha 包围盒**裁掉透明边**（为了托盘 22px 下主体占比足够大）。因此：

- 喂给 `prepare.py` 的必须是 **`-1024.png` 全出血版**，喂留白版会被裁成全出血，等于白留。
- 全出血母版生成的 `icon.icns` 在 macOS Dock 中会比遵循 HIG 的相邻应用**略大一圈**。若要严格对齐 HIG，
  需绕过 `prepare.py`，用 `-macos-1024.png` 单独生成 `.icns`。这是既有流水线的取舍，本次未改动其行为。

## 五、重新生成

```bash
python3 branding/make_icons.py
```

依赖：Pillow；渲染依赖 Chrome headless（macOS 上 ImageMagick 无 `librsvg` 委托，
内置 MSVG 渲染器会丢渐变与描边，不可用）。
