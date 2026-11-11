//! rar/cbr、7z、tar 家族的整包解压（解压到临时目录后以目录后端读取）。

use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// 所有解压临时目录的公共父目录。
fn temp_root() -> PathBuf {
    std::env::temp_dir().join("manga-tools-reader")
}

/// 创建一次打开专用的临时目录。
pub fn new_temp_dir() -> Result<PathBuf, String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = temp_root().join(format!("{}-{}", std::process::id(), ts));
    fs::create_dir_all(&dir).map_err(|_| "err.io".to_string())?;
    Ok(dir)
}

/// 应用启动时清理历史遗留的临时目录。
pub fn cleanup_all() {
    let _ = fs::remove_dir_all(temp_root());
}

pub fn extract_rar(src: &Path, dest: &Path) -> Result<(), String> {
    let mut archive = unrar::Archive::new(src)
        .open_for_processing()
        .map_err(|_| "err.corrupt".to_string())?;
    loop {
        let header = match archive.read_header() {
            Ok(h) => h,
            Err(_) => return Err("err.corrupt".to_string()),
        };
        let Some(header) = header else { break };
        archive = header
            .extract_with_base(dest)
            .map_err(|_| "err.corrupt".to_string())?;
    }
    Ok(())
}

pub fn extract_7z(src: &Path, dest: &Path) -> Result<(), String> {
    sevenz_rust::decompress_file(src, dest).map_err(|_| "err.corrupt".to_string())
}

/// tar / tar.gz / tar.bz2：按扩展名决定解压流。
pub fn extract_tar(src: &Path, dest: &Path) -> Result<(), String> {
    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let file = File::open(src).map_err(|_| "err.notFound".to_string())?;
    let reader: Box<dyn Read> = if name.ends_with(".tar.gz")
        || name.ends_with(".tgz")
    {
        Box::new(flate2::read::GzDecoder::new(file))
    } else if name.ends_with(".tar.bz2") || name.ends_with(".tbz2") || name.ends_with(".tbz") {
        Box::new(bzip2::read::BzDecoder::new(file))
    } else {
        Box::new(file)
    };

    tar::Archive::new(reader)
        .unpack(dest)
        .map_err(|_| "err.corrupt".to_string())
}
