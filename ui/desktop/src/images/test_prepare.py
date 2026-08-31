import tempfile
import unittest
from pathlib import Path

from PIL import Image

import prepare


SCRIPT_DIR = Path(__file__).resolve().parent
AIBUDDY_DIR = SCRIPT_DIR / "aibuddy"


class AIBuddyTrayGlyphTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
