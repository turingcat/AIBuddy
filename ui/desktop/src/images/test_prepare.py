import contextlib
import io
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

import prepare


SCRIPT_DIR = Path(__file__).resolve().parent
AIBUDDY_DIR = SCRIPT_DIR / "aibuddy"


class AIBuddyTrayGlyphTests(unittest.TestCase):
    @contextlib.contextmanager
    def image_fixture(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_dir = Path(temporary_directory)
            for name in prepare.PNG_OUTPUTS:
                shutil.copy2(SCRIPT_DIR / name, fixture_dir / name)
            for name in ("icon.ico", "icon.icns", "icon-light.png", "icon-light.icns", "icon.svg"):
                shutil.copy2(SCRIPT_DIR / name, fixture_dir / name)

            fixture_aibuddy_dir = fixture_dir / "aibuddy"
            fixture_aibuddy_dir.mkdir()
            for name in ("iconTemplate.png", "iconTemplate@2x.png"):
                shutil.copy2(AIBUDDY_DIR / name, fixture_aibuddy_dir / name)

            with patch.object(prepare, "SCRIPT_DIR", fixture_dir):
                yield fixture_dir

    def render(self, size: int) -> Image.Image:
        self.assertTrue(
            hasattr(prepare, "render_aibuddy_tray_glyph"),
            "AIBuddy tray glyph renderer is missing",
        )
        return prepare.render_aibuddy_tray_glyph(size)

    def verify(self, image: Image.Image, size: int) -> list[str]:
        self.assertTrue(
            hasattr(prepare, "verify_aibuddy_tray_glyph"),
            "AIBuddy tray glyph verifier is missing",
        )
        return prepare.verify_aibuddy_tray_glyph(image, size)

    def test_renderer_produces_deterministic_rgba_glyphs_with_transparent_margins(self):
        for size in (22, 44):
            with self.subTest(size=size):
                image = self.render(size)
                alpha = image.getchannel("A")
                bbox = alpha.getbbox()

                self.assertEqual(image.mode, "RGBA")
                self.assertEqual(image.size, (size, size))
                self.assertIsNotNone(bbox)
                self.assertGreater(bbox[0], 0)
                self.assertGreater(bbox[1], 0)
                self.assertLess(bbox[2], size)
                self.assertLess(bbox[3], size)
                self.assertEqual(
                    image.tobytes(), self.render(size).tobytes(), "renderer output changed"
                )
                self.assertEqual(image.getchannel("R").getextrema(), (0, 0))
                self.assertEqual(image.getchannel("G").getextrema(), (0, 0))
                self.assertEqual(image.getchannel("B").getextrema(), (0, 0))
                self.assertEqual(self.verify(image, size), [])

    def test_renderer_has_centered_antenna_rounded_head_and_two_transparent_eyes(self):
        for size in (22, 44):
            with self.subTest(size=size):
                image = self.render(size)
                alpha = image.getchannel("A")
                scale = size / 22
                center = size // 2

                self.assertGreater(alpha.getpixel((center, round(3 * scale))), 0)
                self.assertEqual(alpha.getpixel((round(5 * scale), round(3 * scale))), 0)
                self.assertEqual(alpha.getpixel((round(17 * scale), round(3 * scale))), 0)
                self.assertGreater(alpha.getpixel((center, round(7 * scale))), 0)
                self.assertEqual(alpha.getpixel((round(5 * scale), round(7 * scale))), 0)
                self.assertGreater(alpha.getpixel((round(6 * scale), round(11 * scale))), 0)
                self.assertEqual(alpha.getpixel((round(8 * scale), round(12 * scale))), 0)
                self.assertEqual(alpha.getpixel((round(14 * scale), round(12 * scale))), 0)
                self.assertGreater(alpha.getpixel((round(6 * scale), round(12 * scale))), 0)
                self.assertGreater(alpha.getpixel((round(10 * scale), round(12 * scale))), 0)

    def test_checked_in_templates_match_the_renderer_and_writer(self):
        self.assertTrue(
            hasattr(prepare, "write_aibuddy_tray_glyphs"),
            "AIBuddy tray glyph writer is missing",
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory)
            prepare.write_aibuddy_tray_glyphs(output_dir)

            for size, name in ((22, "iconTemplate.png"), (44, "iconTemplate@2x.png")):
                with self.subTest(size=size):
                    checked_in = Image.open(AIBUDDY_DIR / name).convert("RGBA")
                    generated_path = output_dir / name
                    generated = Image.open(generated_path).convert("RGBA")

                    self.assertEqual(checked_in.tobytes(), self.render(size).tobytes())
                    self.assertEqual(generated.tobytes(), self.render(size).tobytes())
                    self.assertEqual((AIBUDDY_DIR / name).read_bytes(), generated_path.read_bytes())

    def test_renderer_rejects_unsupported_size(self):
        with self.assertRaisesRegex(ValueError, "不支持的 AIBuddy 托盘尺寸"):
            prepare.render_aibuddy_tray_glyph(23)

    def test_verifier_rejects_invalid_mode_size_and_empty_alpha(self):
        self.assertIn(
            "模式为 RGB，期望 RGBA",
            self.verify(Image.new("RGB", (22, 22)), 22),
        )
        self.assertIn(
            "尺寸为 (21, 21)，期望 22x22",
            self.verify(Image.new("RGBA", (21, 21)), 22),
        )
        self.assertIn("alpha 图层为空", self.verify(Image.new("RGBA", (22, 22)), 22))

    def test_verifier_rejects_missing_margins_nonblack_rgb_and_missing_features(self):
        marginless = Image.new("RGBA", (22, 22), (0, 0, 0, 255))
        self.assertIn("没有保留透明边距", self.verify(marginless, 22)[0])

        nonblack = self.render(22)
        nonblack.putpixel((0, 0), (1, 0, 0, 0))
        self.assertIn("R 通道不是纯黑", self.verify(nonblack, 22))

        missing_antenna = self.render(22)
        antenna_alpha = missing_antenna.getchannel("A")
        antenna_alpha.putpixel((11, 3), 0)
        missing_antenna.putalpha(antenna_alpha)
        self.assertIn("缺失居中的短天线", self.verify(missing_antenna, 22))

        missing_head = self.render(22)
        head_alpha = missing_head.getchannel("A")
        head_alpha.putpixel((6, 11), 0)
        missing_head.putalpha(head_alpha)
        self.assertIn("缺失圆角机器人头部", self.verify(missing_head, 22))

        filled_eye = self.render(22)
        eye_alpha = filled_eye.getchannel("A")
        eye_alpha.putpixel((8, 12), 255)
        filled_eye.putalpha(eye_alpha)
        self.assertIn("缺失两个透明眼孔", self.verify(filled_eye, 22))

        broken_eye_area = self.render(22)
        eye_area_alpha = broken_eye_area.getchannel("A")
        eye_area_alpha.putpixel((6, 12), 0)
        broken_eye_area.putalpha(eye_area_alpha)
        self.assertIn("眼孔破坏了机器人头部", self.verify(broken_eye_area, 22))

    def test_verify_rejects_missing_and_non_rgba_aibuddy_templates(self):
        with self.image_fixture() as fixture_dir:
            (fixture_dir / "aibuddy" / "iconTemplate@2x.png").unlink()
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertFalse(prepare.verify())
            self.assertIn("缺失 aibuddy/iconTemplate@2x.png", output.getvalue())

        with self.image_fixture() as fixture_dir:
            Image.new("RGB", (22, 22), (0, 0, 0)).save(
                fixture_dir / "aibuddy" / "iconTemplate.png"
            )
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertFalse(prepare.verify())
            self.assertIn("模式为 RGB，期望 RGBA", output.getvalue())

        with self.image_fixture() as fixture_dir:
            Image.new("RGBA", (1, 1)).save(fixture_dir / "icon.png")
            Image.new("RGBA", (1, 1)).save(fixture_dir / "icon.icns", format="PNG")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertFalse(prepare.verify())
            self.assertIn("异常 icon.png: (1, 1) RGBA", output.getvalue())
            self.assertIn("异常 icon.icns 最大尺寸: (1, 1)", output.getvalue())

    def test_aibuddy_tray_only_cli_writes_only_template_files(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_dir = Path(temporary_directory)
            output = io.StringIO()
            with (
                patch.object(prepare, "SCRIPT_DIR", fixture_dir),
                patch.object(sys, "argv", ["prepare.py", "--aibuddy-tray-only"]),
                contextlib.redirect_stdout(output),
            ):
                self.assertEqual(prepare.main(), 0)

            self.assertEqual(
                sorted(path.relative_to(fixture_dir).as_posix() for path in fixture_dir.rglob("*")),
                ["aibuddy", "aibuddy/iconTemplate.png", "aibuddy/iconTemplate@2x.png"],
            )
            self.assertIn("AIBuddy Minimal Bot 托盘字形", output.getvalue())

    def test_cli_rejects_a_missing_source_after_aibuddy_flag_check(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = io.StringIO()
            with (
                patch.object(prepare, "SCRIPT_DIR", Path(temporary_directory)),
                patch.object(sys, "argv", ["prepare.py", "--source", "missing.png"]),
                contextlib.redirect_stdout(output),
            ):
                self.assertEqual(prepare.main(), 1)

            self.assertIn("源图不存在: missing.png", output.getvalue())


if __name__ == "__main__":
    unittest.main()
