import importlib.util
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
import struct
import tempfile

spec = importlib.util.spec_from_file_location('pecheck', Path(__file__).with_name('check_win7_pe.py'))
pecheck = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pecheck)


def image(machine=0x14c, subsystem=(6, 1), imports=()):
    return NS(FILE_HEADER=NS(Machine=machine),
              OPTIONAL_HEADER=NS(MajorSubsystemVersion=subsystem[0], MinorSubsystemVersion=subsystem[1]),
              DIRECTORY_ENTRY_IMPORT=[NS(dll=dll, imports=[NS(name=name) for name in names]) for dll, names in imports])


class Win7PeTest(unittest.TestCase):
    def test_accepts_32_bit_win7_images_and_ordinal_imports(self):
        self.assertEqual(pecheck.violations(image(imports=[(b'kernel32.dll', [b'CreateFileW', None])])), [])

    def test_rejects_architecture_and_subsystem(self):
        self.assertTrue(pecheck.violations(image(machine=0x8664)))
        self.assertTrue(pecheck.violations(image(subsystem=(6, 2))))

    def test_rejects_known_post_win7_imports(self):
        self.assertTrue(pecheck.violations(image(imports=[(b'kernel32.dll', [b'WaitOnAddress'])])))
        self.assertTrue(pecheck.violations(image(imports=[(b'api-ms-win-core-path-l1-1-0.dll', [])])))

    def test_does_not_reject_delay_loaded_optional_apis(self):
        pe = image()
        pe.DIRECTORY_ENTRY_DELAY_IMPORT = [NS(dll=b'kernel32.dll', imports=[NS(name=b'WaitOnAddress')])]
        self.assertEqual(pecheck.violations(pe), [])

    def test_checks_real_pe_headers_and_rejects_empty_or_x64_directories(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            with self.assertRaisesRegex(RuntimeError, 'No Windows binaries'):
                pecheck.check_directory(directory)
            dos = bytearray(128)
            dos[:2] = b'MZ'
            struct.pack_into('<I', dos, 60, 128)
            optional = bytearray(224)
            struct.pack_into('<H', optional, 0, 0x10b)
            struct.pack_into('<II', optional, 32, 4096, 512)
            struct.pack_into('<HH', optional, 48, 6, 1)
            struct.pack_into('<II', optional, 56, 4096, 512)
            struct.pack_into('<H', optional, 68, 3)
            struct.pack_into('<I', optional, 92, 16)
            binary = directory / 'aibuddy.exe'
            for machine in [0x14c, 0x8664]:
                coff = struct.pack('<HHIIIHH', machine, 0, 0, 0, 0, 224, 0x102)
                binary.write_bytes((dos + b'PE\0\0' + coff + optional).ljust(512, b'\0'))
                if machine == 0x14c:
                    pecheck.check_directory(directory)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'expected an x86'):
                        pecheck.check_directory(directory)


if __name__ == '__main__':
    unittest.main()
