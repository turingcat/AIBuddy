"""Catch incompatible static PE imports; this is not a substitute for Win7 testing."""

from pathlib import Path
import sys

POST_WIN7_APIS = {
    b'WaitOnAddress', b'WakeByAddressSingle', b'WakeByAddressAll',
    b'GetSystemTimePreciseAsFileTime', b'GetTempPath2W', b'GetTempPath2A',
    b'GetOverlappedResultEx', b'SetThreadDescription', b'GetThreadDescription',
    b'SetThreadInformation', b'GetThreadInformation', b'CreateFile2',
    b'DiscardVirtualMemory', b'OfferVirtualMemory', b'ReclaimVirtualMemory',
    b'VirtualAlloc2', b'MapViewOfFile3',
}
POST_WIN7_DLLS = {b'api-ms-win-core-path-l1-1-0.dll', b'api-ms-win-core-synch-l1-2-0.dll'}


def violations(pe):
    errors = []
    if pe.FILE_HEADER.Machine != 0x14c:
        errors.append('expected an x86 PE image')
    header = pe.OPTIONAL_HEADER
    if (header.MajorSubsystemVersion, header.MinorSubsystemVersion) > (6, 1):
        errors.append('subsystem requires a Windows version newer than 7')
    for entry in getattr(pe, 'DIRECTORY_ENTRY_IMPORT', []):
        if entry.dll.lower() in POST_WIN7_DLLS:
            errors.append(f'unsupported DLL: {entry.dll.decode()}')
        for symbol in entry.imports:
            if symbol.name in POST_WIN7_APIS:
                errors.append(f'unsupported static API: {symbol.name.decode()}')
    return errors


def check_directory(directory):
    import pefile

    paths = [path for path in Path(directory).rglob('*') if path.suffix.lower() in ('.exe', '.dll', '.node')]
    if not paths:
        raise RuntimeError('No Windows binaries found')
    errors = []
    for path in paths:
        with pefile.PE(str(path)) as pe:
            errors.extend(f'{path}: {error}' for error in violations(pe))
    if errors:
        raise RuntimeError('\n'.join(errors))
    print(f'Checked {len(paths)} x86 PE images; native Win7 SP1 runtime validation is still required.')


if __name__ == '__main__':
    check_directory(sys.argv[1])
