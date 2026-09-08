use std::env;
use std::ffi::OsStr;
use std::io;

fn main() {
    if let Err(error) = run() {
        eprintln!("native no-replace publish failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> io::Result<()> {
    let mut arguments = env::args_os();
    let _program = arguments.next();
    let source = arguments.next().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "source stage path is required")
    })?;
    let destination = arguments.next().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "destination path is required")
    })?;
    if arguments.next().is_some() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "exactly two paths are required",
        ));
    }

    publish(&source, &destination)
}

#[cfg(target_os = "macos")]
fn publish(source: &OsStr, destination: &OsStr) -> io::Result<()> {
    use std::os::raw::{c_char, c_int, c_uint};

    #[link(name = "System")]
    unsafe extern "C" {
        fn renamex_np(from: *const c_char, to: *const c_char, flags: c_uint) -> c_int;
    }

    const RENAME_EXCL: c_uint = 0x0000_0004;
    let source = c_string(source)?;
    let destination = c_string(destination)?;
    let result = unsafe { renamex_np(source.as_ptr(), destination.as_ptr(), RENAME_EXCL) };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(target_os = "linux")]
fn publish(source: &OsStr, destination: &OsStr) -> io::Result<()> {
    use std::os::raw::{c_char, c_int, c_uint};

    #[link(name = "c")]
    unsafe extern "C" {
        fn renameat2(
            olddirfd: c_int,
            oldpath: *const c_char,
            newdirfd: c_int,
            newpath: *const c_char,
            flags: c_uint,
        ) -> c_int;
    }

    const AT_FDCWD: c_int = -100;
    const RENAME_NOREPLACE: c_uint = 0x0000_0001;
    let source = c_string(source)?;
    let destination = c_string(destination)?;
    let result = unsafe {
        renameat2(
            AT_FDCWD,
            source.as_ptr(),
            AT_FDCWD,
            destination.as_ptr(),
            RENAME_NOREPLACE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(windows)]
fn publish(source: &OsStr, destination: &OsStr) -> io::Result<()> {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    let source = wide_string(source)?;
    let destination = wide_string(destination)?;
    let result = unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), 0) };
    if result != 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
fn publish(_source: &OsStr, _destination: &OsStr) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "no atomic no-replace directory publication primitive is available on this Unix platform",
    ))
}

#[cfg(not(any(unix, windows)))]
fn publish(_source: &OsStr, _destination: &OsStr) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "no atomic no-replace directory publication primitive is available on this platform",
    ))
}

#[cfg(unix)]
fn c_string(path: &OsStr) -> io::Result<std::ffi::CString> {
    use std::os::unix::ffi::OsStrExt;

    std::ffi::CString::new(path.as_bytes()).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "paths containing NUL bytes are not supported",
        )
    })
}

#[cfg(windows)]
fn wide_string(path: &OsStr) -> io::Result<Vec<u16>> {
    use std::os::windows::ffi::OsStrExt;

    let mut result: Vec<u16> = path.encode_wide().collect();
    if result.contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "paths containing NUL characters are not supported",
        ));
    }
    result.push(0);
    Ok(result)
}
