#!/usr/bin/env python3
"""生成 HeyBuddy 桌面端应用图标的 SVG 母版与预览位图。

三个方向共用同一套品牌令牌（绿金渐变 + 全出血 squircle），
渲染依赖 Chrome headless（macOS 上 ImageMagick 无 librsvg 委托，
内置 MSVG 渲染器会丢渐变与描边）。

用法：
    python3 make_icons.py            # 生成 SVG 母版 + preview 位图

@date 2026-08-27
"""

import math
import subprocess
import sys
from pathlib import Path

from PIL import Image

DIR = Path(__file__).resolve().parent
PREVIEW = DIR / 'preview'
SIZE = 1024
C = SIZE / 2

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# 品牌令牌：取自 ui/desktop/src/images/logo.png 的实际主色
GREEN = '#109C48'
GREEN_DEEP = '#00713A'
GOLD = '#E4B43C'
WHITE = '#FFFFFF'


# ---------- 几何工具 ----------

def catmull_rom_path(pts, closed=True):
    """采样点 -> 三次贝塞尔闭合路径，避免上百个折线点污染 SVG 母版。"""
    n = len(pts)
    d = [f'M {pts[0][0]:.2f},{pts[0][1]:.2f}']
    last = n if closed else n - 1
    for i in range(last):
        p0 = pts[(i - 1) % n]
        p1 = pts[i % n]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f'C {c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f}')
    if closed:
        d.append('Z')
    return ' '.join(d)


def squircle(cx, cy, half, n=5.0, samples=72):
    """超椭圆 |x/a|^n + |y/a|^n = 1，n=5 逼近 macOS Big Sur 图标外形。"""
    pts = []
    for i in range(samples):
        t = 2 * math.pi * i / samples
        ct, st = math.cos(t), math.sin(t)
        x = math.copysign(abs(ct) ** (2 / n), ct) * half
        y = math.copysign(abs(st) ** (2 / n), st) * half
        pts.append((cx + x, cy + y))
    return catmull_rom_path(pts)


def yinyang_channel(cx, cy, r):
    """阴阳分割线：两段半径 r/2 的半圆首尾相接，构成贯穿圆心的 S 形。"""
    h = r / 2
    return (f'M {cx:.2f},{cy - r:.2f} '
            f'A {h:.2f},{h:.2f} 0 0,1 {cx:.2f},{cy:.2f} '
            f'A {h:.2f},{h:.2f} 0 0,0 {cx:.2f},{cy + r:.2f}')


def sparkle(cx, cy, r):
    """四角星：凹边由控制点落在中心的二次曲线生成，呼应 new-api 图标中心的火花。"""
    return (f'M {cx:.2f},{cy - r:.2f} '
            f'Q {cx:.2f},{cy:.2f} {cx + r:.2f},{cy:.2f} '
            f'Q {cx:.2f},{cy:.2f} {cx:.2f},{cy + r:.2f} '
            f'Q {cx:.2f},{cy:.2f} {cx - r:.2f},{cy:.2f} '
            f'Q {cx:.2f},{cy:.2f} {cx:.2f},{cy - r:.2f} Z')


def leaf(cx, cy, w, h, bulge=0.55):
    """叶形（尖头椭圆）：公司林业属性的最小符号。"""
    return (f'M {cx:.2f},{cy:.2f} '
            f'C {cx + w:.2f},{cy - h * bulge:.2f} {cx + w:.2f},{cy - h * (1 - bulge):.2f} {cx:.2f},{cy - h:.2f} '
            f'C {cx - w:.2f},{cy - h * (1 - bulge):.2f} {cx - w:.2f},{cy - h * bulge:.2f} {cx:.2f},{cy:.2f} Z')


def capsule(cx, cy, w, h):
    return f'<rect x="{cx - w / 2:.2f}" y="{cy - h / 2:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{w / 2:.2f}"/>'


# ---------- SVG 组装 ----------

def wrap(body, title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">
  <title>{title}</title>
  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1024" y2="1024">
      <stop offset="0" stop-color="{GREEN_DEEP}"/>
      <stop offset="0.45" stop-color="{GREEN}"/>
      <stop offset="1" stop-color="{GOLD}"/>
    </linearGradient>
  </defs>
  <path d="{squircle(C, C, C)}" fill="url(#bg)"/>
{body}
</svg>
'''


def concept_a():
    """A 双影环：还原 new-api 桌面端图标的双水滴 + 中心火花。

    构造为整圆被一条 S 形通道劈开——两半各自一端圆钝、一端收细，
    通道贯穿圆心，正好容纳中心火花。
    """
    r, channel = 322, 142
    body = (
        f'  <defs>\n'
        f'    <mask id="split" maskUnits="userSpaceOnUse" x="0" y="0" width="{SIZE}" height="{SIZE}">\n'
        f'      <rect width="{SIZE}" height="{SIZE}" fill="#000"/>\n'
        f'      <circle cx="{C:.0f}" cy="{C:.0f}" r="{r}" fill="#fff"/>\n'
        f'      <path d="{yinyang_channel(C, C, r)}" fill="none" stroke="#000" '
        f'stroke-width="{channel}" stroke-linecap="round"/>\n'
        f'    </mask>\n'
        f'  </defs>\n'
        f'  <rect width="{SIZE}" height="{SIZE}" fill="{WHITE}" mask="url(#split)"/>\n'
        f'  <path d="{sparkle(C, C, 88)}" fill="{WHITE}"/>'
    )
    return wrap(body, 'HeyBuddy — Buddy Ring')


# B 方案几何：头部锚点与新芽走向，squircle 版与托盘剪影版共用
B_HX, B_HY = C - 6, C + 78
B_TOP = B_HY - 300


def _sprout_shapes():
    stem = (f'M {B_HX + 6:.0f},{B_TOP + 18:.0f} '
            f'C {B_HX + 10:.0f},{B_TOP - 62:.0f} {B_HX + 44:.0f},{B_TOP - 104:.0f} '
            f'{B_HX + 96:.0f},{B_TOP - 128:.0f}')
    blade = (f'<path d="{leaf(B_HX + 30, B_TOP - 40, 86, 226)}" '
             f'transform="rotate(46 {B_HX + 30:.0f} {B_TOP - 40:.0f})"/>')
    head = f'<path d="{squircle(B_HX, B_HY, 300, n=3.6)}"/>'
    return stem, blade, head


def concept_b():
    """B 抽芽伙伴：WorkBuddy 式吉祥物头像，顶部一片新芽点明林业属性。"""
    stem, blade, head = _sprout_shapes()
    body = (
        f'  <g transform="rotate(-8 {C:.0f} {C:.0f})">\n'
        f'    <path d="{stem}" fill="none" stroke="{WHITE}" stroke-width="26" stroke-linecap="round"/>\n'
        f'    <g fill="{WHITE}">{blade}{head}</g>\n'
        f'    <g fill="url(#bg)">\n'
        f'      {capsule(B_HX - 112, B_HY - 22, 84, 190)}\n'
        f'      {capsule(B_HX + 112, B_HY - 22, 84, 190)}\n'
        f'    </g>\n'
        f'  </g>'
    )
    return wrap(body, 'HeyBuddy — Sprout Buddy')


def concept_b_tray():
    """B 的托盘剪影版：无底色、纯黑、眼睛为真空洞。

    macOS 对 *Template.png 只取 alpha 通道渲染，全出血 squircle 会变成纯黑方块，
    故托盘必须用剪影母版。眼睛相对放大，保证 22px 下不糊成一团。
    """
    stem, blade, head = _sprout_shapes()
    body = (
        f'  <defs>\n'
        f'    <mask id="eyes" maskUnits="userSpaceOnUse" x="0" y="0" width="{SIZE}" height="{SIZE}">\n'
        f'      <rect width="{SIZE}" height="{SIZE}" fill="#fff"/>\n'
        f'      <g fill="#000">\n'
        f'        {capsule(B_HX - 116, B_HY - 22, 104, 210)}\n'
        f'        {capsule(B_HX + 116, B_HY - 22, 104, 210)}\n'
        f'      </g>\n'
        f'    </mask>\n'
        f'  </defs>\n'
        f'  <g transform="rotate(-8 {C:.0f} {C:.0f})" mask="url(#eyes)">\n'
        f'    <path d="{stem}" fill="none" stroke="#000" stroke-width="26" stroke-linecap="round"/>\n'
        f'    <g fill="#000">{blade}{head}</g>\n'
        f'  </g>'
    )
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" '
            f'viewBox="0 0 {SIZE} {SIZE}">\n  <title>HeyBuddy — Sprout Buddy 托盘剪影</title>\n'
            f'{body}\n</svg>\n')


def concept_c():
    """C 接入盾章：盾牌 + 负形火花，强调 OA SSO 的可信接入。"""
    w, top, bot = 262, C - 300, C + 316
    shield = (f'M {C - w:.0f},{top + 74:.0f} '
              f'Q {C - w:.0f},{top:.0f} {C - w + 74:.0f},{top:.0f} '
              f'L {C + w - 74:.0f},{top:.0f} '
              f'Q {C + w:.0f},{top:.0f} {C + w:.0f},{top + 74:.0f} '
              f'L {C + w:.0f},{C + 40:.0f} '
              f'Q {C + w:.0f},{C + 208:.0f} {C:.0f},{bot:.0f} '
              f'Q {C - w:.0f},{C + 208:.0f} {C - w:.0f},{C + 40:.0f} Z')
    body = (
        f'  <path d="{shield} {sparkle(C, C + 12, 150)}" fill="{WHITE}" fill-rule="evenodd"/>'
    )
    return wrap(body, 'HeyBuddy — SSO Shield')


TRAY = {'b-sproutbuddy': concept_b_tray}

CONCEPTS = {
    'a-buddyring': concept_a,
    'b-sproutbuddy': concept_b,
    'c-ssoshield': concept_c,
}

RENDER_SIZES = [1024, 256, 128, 64, 32, 16]


def render(svg: Path, out: Path) -> None:
    """Chrome headless 按母版原尺寸出图；小尺寸一律由此降采样，口径与 prepare.py 一致。"""
    subprocess.run(
        [CHROME, '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
         '--default-background-color=00000000', '--force-device-scale-factor=1',
         f'--window-size={SIZE},{SIZE}', f'--screenshot={out}', svg.as_uri()],
        check=True, capture_output=True,
    )


def macos_padded(master: Image.Image) -> Image.Image:
    """macOS HIG 版：1024 画布内主体占 824，四周留透明边。

    注意 prepare.py 的 build_master 会按 alpha 包围盒裁掉透明边，
    因此喂给它的必须是全出血母版；此变体供绕过该流水线时直接使用。
    """
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    body = master.resize((824, 824), Image.LANCZOS)
    canvas.paste(body, ((SIZE - 824) // 2, (SIZE - 824) // 2), body)
    return canvas


def contact_sheet(masters: dict) -> None:
    """按 128/64/32/16 排布，用于小尺寸可读性验收。"""
    sizes = [128, 64, 32, 16]
    pad, gap = 24, 24
    w = pad * 2 + 128 + gap + sum(sizes) + gap * (len(sizes) - 1)
    h = pad * 2 + len(masters) * (128 + gap) - gap
    sheet = Image.new('RGBA', (w, h), (255, 255, 255, 255))
    for row, master in enumerate(masters.values()):
        y = pad + row * (128 + gap)
        big = master.resize((128, 128), Image.LANCZOS)
        sheet.paste(big, (pad, y), big)
        x = pad + 128 + gap
        for s in sizes:
            im = master.resize((s, s), Image.LANCZOS)
            sheet.paste(im, (x, y + (128 - s) // 2), im)
            x += s + gap
    sheet.save(PREVIEW / '_contact-sheet.png')


def main() -> int:
    if not Path(CHROME).exists():
        print(f'缺少渲染器: {CHROME}')
        return 1
    PREVIEW.mkdir(exist_ok=True)
    masters = {}
    for key, fn in CONCEPTS.items():
        svg = DIR / f'heybuddy-icon-{key}.svg'
        svg.write_text(fn(), encoding='utf-8')

        master_png = DIR / f'heybuddy-icon-{key}-1024.png'
        render(svg, master_png)
        master = Image.open(master_png).convert('RGBA')
        masters[key] = master

        macos_padded(master).save(DIR / f'heybuddy-icon-{key}-macos-1024.png', optimize=True)
        for s in RENDER_SIZES:
            if s != SIZE:
                master.resize((s, s), Image.LANCZOS).save(PREVIEW / f'{key}-{s}.png', optimize=True)
        print(f'生成 {svg.name} + 1024 母版 + macOS 留白版 + 预览 {RENDER_SIZES}')

    for key, fn in TRAY.items():
        svg = DIR / f'heybuddy-icon-{key}-tray.svg'
        svg.write_text(fn(), encoding='utf-8')
        render(svg, DIR / f'heybuddy-icon-{key}-tray-1024.png')
        print(f'生成 {svg.name} + 托盘剪影母版')

    contact_sheet(masters)
    print('生成 preview/_contact-sheet.png')
    return 0


if __name__ == '__main__':
    sys.exit(main())
