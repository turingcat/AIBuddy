#!/usr/bin/env python3
"""从品牌源图 logo.png 重新生成各平台图标产物。

取代依赖 ImageMagick + iconutil（后者仅 macOS）的旧 prepare.sh，
改用 Pillow 跨平台实现，Windows/Linux/macOS 均可直接运行。

用法：
    python prepare.py                 # 源图默认取脚本同目录 logo.png
    python prepare.py --source 路径   # 指定源图
    python prepare.py --verify        # 只校验已生成产物，不重写

@author logic
@date 2026-08-14
"""

import argparse
import base64
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

SCRIPT_DIR = Path(__file__).resolve().parent
MASTER_SIZE = 1024
LOGO_SOURCE = 'logo.png'

ICO_SIZES = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]

# 普通 PNG 产物 -> 期望尺寸
PLAIN_PNG_OUTPUTS = {
    'icon.png': (1024, 1024),
    'icon-512.png': (512, 512),
    'iconTemplate.png': (22, 22),
    'iconTemplate@2x.png': (44, 44),
}

# 托盘"更新可用"角标版，由 render_tray_update 单独生成
TRAY_UPDATE_OUTPUTS = {
    'iconTemplateUpdate.png': (22, 22),
    'iconTemplateUpdate@2x.png': (44, 44),
}

# 校验用的全部 PNG 产物
PNG_OUTPUTS = {**PLAIN_PNG_OUTPUTS, **TRAY_UPDATE_OUTPUTS}

UPDATE_DOT_COLOR = (32, 159, 75, 255)  # #209F4B，取自 logo 主体绿色
UPDATE_DOT_STROKE = (255, 255, 255, 255)


def build_master(source: Path) -> Image.Image:
    """源图 -> RGBA -> 裁掉透明边 -> 透明底补正方形 -> 1024 母版。

    裁边是为了缩小到 22px 托盘时主体占比足够大，避免透明边距把图形挤得过小。
    """
    im = Image.open(source).convert('RGBA')
    bbox = im.getchannel('A').getbbox()
    if bbox:
        im = im.crop(bbox)
    side = max(im.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return square.resize((MASTER_SIZE, MASTER_SIZE), Image.LANCZOS)


def render_tray_update(master: Image.Image, size: int) -> Image.Image:
    """托盘"更新可用"图标：logo 锚左下约 68%，右上角画带白描边的绿色圆点。"""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    logo_size = round(size * 0.68)
    logo = master.resize((logo_size, logo_size), Image.LANCZOS)
    canvas.paste(logo, (0, size - logo_size), logo)

    margin = max(1, size // 22)
    dot_d = round(size * 0.36)
    radius = dot_d // 2
    cx = size - margin - radius
    cy = margin + radius
    draw = ImageDraw.Draw(canvas)
    draw.ellipse(
        [cx - radius - margin, cy - radius - margin, cx + radius + margin, cy + radius + margin],
        fill=UPDATE_DOT_STROKE,
    )
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=UPDATE_DOT_COLOR)
    return canvas


def write_svg_wrapper(png_path: Path, out_path: Path) -> None:
    """flatpak scalable 槽位用的 SVG 包装：位图源只能内嵌 base64 PNG。"""
    data = base64.b64encode(png_path.read_bytes()).decode('ascii')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        f'<image href="data:image/png;base64,{data}" width="512" height="512"/>'
        '</svg>\n'
    )
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg)


def generate(source: Path) -> None:
    master = build_master(source)

    for name, size in PLAIN_PNG_OUTPUTS.items():
        master.resize(size, Image.LANCZOS).save(SCRIPT_DIR / name, optimize=True)
        print(f'生成 {name} {size[0]}x{size[1]}')

    for name, (width, _height) in TRAY_UPDATE_OUTPUTS.items():
        render_tray_update(master, width).save(SCRIPT_DIR / name, optimize=True)
        print(f'生成 {name} {width}x{width}（含更新角标）')

    master.save(SCRIPT_DIR / 'icon.ico', sizes=ICO_SIZES)
    print(f'生成 icon.ico 尺寸集 {[s[0] for s in ICO_SIZES]}')
    master.save(SCRIPT_DIR / 'icon.icns')
    print('生成 icon.icns 16-1024 全套')

    # icon-light.* 与新 icon 逐字节相同，兼容仍引用旧路径的打包配置
    shutil.copyfile(SCRIPT_DIR / 'icon.png', SCRIPT_DIR / 'icon-light.png')
    shutil.copyfile(SCRIPT_DIR / 'icon.icns', SCRIPT_DIR / 'icon-light.icns')
    print('生成 icon-light.png / icon-light.icns（字节副本）')

    write_svg_wrapper(SCRIPT_DIR / 'icon-512.png', SCRIPT_DIR / 'icon.svg')
    print('生成 icon.svg（512 位图内嵌包装）')


def generate_packager_icons(source: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    master = build_master(source)
    master.save(output_dir / 'icon.png', optimize=True)
    master.save(output_dir / 'icon.ico', sizes=ICO_SIZES)
    master.save(output_dir / 'icon.icns')
    print(f'生成打包图标到 {output_dir}')


def verify() -> bool:
    ok = True
    for name, size in PNG_OUTPUTS.items():
        path = SCRIPT_DIR / name
        if not path.exists():
            print(f'缺失 {name}')
            ok = False
            continue
        im = Image.open(path)
        if im.size != size or im.mode != 'RGBA':
            print(f'异常 {name}: {im.size} {im.mode}，期望 {size} RGBA')
            ok = False
        else:
            print(f'通过 {name} {size[0]}x{size[1]}')

    ico_path = SCRIPT_DIR / 'icon.ico'
    if ico_path.exists():
        sizes = set(Image.open(ico_path).ico.sizes())
        if sizes != set(ICO_SIZES):
            print(f'异常 icon.ico 尺寸集: {sorted(sizes)}')
            ok = False
        else:
            print(f'通过 icon.ico 尺寸集 {[s[0] for s in ICO_SIZES]}')
    else:
        print('缺失 icon.ico')
        ok = False

    icns_path = SCRIPT_DIR / 'icon.icns'
    if icns_path.exists():
        im = Image.open(icns_path)
        if im.size != (MASTER_SIZE, MASTER_SIZE):
            print(f'异常 icon.icns 最大尺寸: {im.size}')
            ok = False
        else:
            print(f'通过 icon.icns 最大尺寸 {im.size[0]}')
    else:
        print('缺失 icon.icns')
        ok = False

    for a, b in (('icon-light.png', 'icon.png'), ('icon-light.icns', 'icon.icns')):
        pa, pb = SCRIPT_DIR / a, SCRIPT_DIR / b
        if not pa.exists() or pa.read_bytes() != pb.read_bytes():
            print(f'异常 {a} 与 {b} 不逐字节相同')
            ok = False
        else:
            print(f'通过 {a} = {b} 字节一致')

    svg_path = SCRIPT_DIR / 'icon.svg'
    if not svg_path.exists() or 'data:image/png;base64,' not in svg_path.read_text(encoding='utf-8'):
        print('异常 icon.svg 内嵌包装缺失')
        ok = False
    else:
        print('通过 icon.svg 内嵌包装')

    return ok


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    parser = argparse.ArgumentParser(description='从 logo.png 生成全平台图标产物')
    parser.add_argument('--source', default=str(SCRIPT_DIR / LOGO_SOURCE), help='品牌源图路径')
    parser.add_argument('--verify', action='store_true', help='只校验产物，不重新生成')
    parser.add_argument('--packager-icons-dir', help='生成 icon.png、icon.ico 和 icon.icns 到指定目录')
    args = parser.parse_args()

    if args.verify:
        return 0 if verify() else 1

    source = Path(args.source)
    if not source.exists():
        print(f'源图不存在: {source}')
        return 1
    if args.packager_icons_dir:
        generate_packager_icons(source, Path(args.packager_icons_dir))
        return 0

    generate(source)
    print('--- 校验 ---')
    return 0 if verify() else 1


if __name__ == '__main__':
    sys.exit(main())
