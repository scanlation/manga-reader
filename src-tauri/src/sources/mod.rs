//! 书籍源后端：统一的条目列举与单文件读取抽象。
//!
//! - `ZipBackend`：zip/cbz/epub，保持压缩包打开，按需随机读取单条目；
//! - `DirBackend`：用户选择的文件夹，或 rar/7z/tar 整包解压出的临时目录。
//!
//! 打开调度在 [`open_path`]：优先扩展名，其次魔数嗅探。
//! 所有错误以 `err.*` 错误码返回，由前端映射为当前语言的提示文案。

pub mod dir_s;
pub mod extractors;
pub mod zip_s;

use std::fs;
use std::io::Read;
use std::path::Path;

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EntryInfo {
    /// 相对路径，统一使用 `/` 分隔
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
}

pub enum Backend {
    Zip(zip_s::ZipBackend),
    Dir(dir_s::DirBackend),
}

impl Backend {
    pub fn kind(&self) -> &'static str {
        match self {
            Backend::Zip(_) => "zip",
            Backend::Dir(_) => "dir",
        }
    }

    pub fn list(&self) -> Vec<EntryInfo> {
        match self {
            Backend::Zip(b) => b.entries().to_vec(),
            Backend::Dir(b) => b.entries().to_vec(),
        }
    }

    pub fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        match self {
            Backend::Zip(b) => b.read(path),
            Backend::Dir(b) => b.read(path),
        }
    }

    /// 释放资源；对解压到临时目录的后端会删除临时目录。
    pub fn close(&mut self) {
        match self {
            Backend::Zip(_) => {}
            Backend::Dir(b) => b.cleanup(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
    Zip,
    Rar,
    SevenZ,
    Tar,
}

/// 打开一个文件或文件夹，返回 (格式标签, 后端)。
/// 格式标签为原始扩展名（cbz/epub/rar/7z/tar/folder...），用于前端历史记录展示。
pub fn open_path(path: &Path) -> Result<(String, Backend), String> {
    let meta = fs::metadata(path).map_err(io_err)?;
    if meta.is_dir() {
        let backend = Backend::Dir(dir_s::DirBackend::open_folder(path)?);
        return Ok(("folder".to_string(), backend));
    }

    let (format, label) = detect_format(path)?;
    match format {
        Format::Zip => {
            let backend = Backend::Zip(zip_s::ZipBackend::open(path)?);
            Ok((label, backend))
        }
        Format::Rar => {
            let dest = extractors::new_temp_dir()?;
            extractors::extract_rar(path, &dest)?;
            let backend = Backend::Dir(dir_s::DirBackend::open_extracted(&dest)?);
            Ok((label, backend))
        }
        Format::SevenZ => {
            let dest = extractors::new_temp_dir()?;
            extractors::extract_7z(path, &dest)?;
            let backend = Backend::Dir(dir_s::DirBackend::open_extracted(&dest)?);
            Ok((label, backend))
        }
        Format::Tar => {
            let dest = extractors::new_temp_dir()?;
            extractors::extract_tar(path, &dest)?;
            let backend = Backend::Dir(dir_s::DirBackend::open_extracted(&dest)?);
            Ok((label, backend))
        }
    }
}

fn ext_label(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| "file".to_string())
}

/// 扩展名优先、魔数兜底的格式识别。
fn detect_format(path: &Path) -> Result<(Format, String), String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let ext = ext_label(path);

    let by_ext = match ext.as_str() {
        "zip" | "cbz" | "epub" | "jar" => Some(Format::Zip),
        "rar" | "cbr" => Some(Format::Rar),
        "7z" | "cb7" => Some(Format::SevenZ),
        // tar 家族：tar / tar.gz / tgz / tar.bz2 / tbz2 / tbz
        "tar" | "tgz" | "tbz" | "tbz2" => Some(Format::Tar),
        "gz" | "bz2" if name.contains(".tar.") => Some(Format::Tar),
        _ => None,
    };
    if let Some(format) = by_ext {
        return Ok((format, ext));
    }

    // 无（可识别的）扩展名：读魔数
    let mut file = fs::File::open(path).map_err(io_err)?;
    let mut head = [0u8; 512];
    let n = file.read(&mut head).map_err(io_err)?;
    let head = &head[..n];

    if head.starts_with(b"PK") {
        return Ok((Format::Zip, "zip".to_string()));
    }
    if head.starts_with(b"Rar!") {
        return Ok((Format::Rar, "rar".to_string()));
    }
    if head.starts_with(&[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) {
        return Ok((Format::SevenZ, "7z".to_string()));
    }
    if head.len() > 261 && &head[257..262] == b"ustar" {
        return Ok((Format::Tar, "tar".to_string()));
    }
    Err("err.unsupported".to_string())
}

fn io_err(e: std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::NotFound {
        "err.notFound".to_string()
    } else {
        "err.io".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("mtr-test-{name}"));
        let _ = std::fs::remove_file(&p);
        p
    }

    #[test]
    fn zip_backend_roundtrip() {
        let path = temp_file("sample.zip");
        let file = fs::File::create(&path).unwrap();
        let mut w = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default();
        w.start_file("001.txt", opts).unwrap();
        w.write_all(b"page-one").unwrap();
        w.start_file("dir/002.txt", opts).unwrap();
        w.write_all(b"page-two").unwrap();
        w.finish().unwrap();

        let (label, mut backend) = open_path(&path).unwrap();
        assert_eq!(label, "zip");
        let entries = backend.list();
        let names: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        assert!(names.contains(&"001.txt"));
        assert!(names.contains(&"dir/002.txt"));
        assert_eq!(backend.read("dir/002.txt").unwrap(), b"page-two");
        backend.close();
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn tar_backend_roundtrip() {
        let dir = std::env::temp_dir().join("mtr-test-tarsrc");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("ch1")).unwrap();
        fs::write(dir.join("ch1/001.txt"), b"hello").unwrap();

        let tar_path = temp_file("sample.tar");
        let file = fs::File::create(&tar_path).unwrap();
        let mut builder = tar::Builder::new(file);
        builder
            .append_dir_all(".", &dir)
            .unwrap();
        builder.into_inner().unwrap();

        let (label, mut backend) = open_path(&tar_path).unwrap();
        assert_eq!(label, "tar");
        let entries = backend.list();
        assert!(entries.iter().any(|e| e.path.ends_with("ch1/001.txt")));
        let entry = entries
            .iter()
            .find(|e| e.path.ends_with("ch1/001.txt"))
            .unwrap();
        assert_eq!(backend.read(&entry.path).unwrap(), b"hello");
        backend.close();

        let _ = fs::remove_file(&tar_path);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn dir_backend_lists_files() {
        let dir = std::env::temp_dir().join("mtr-test-dirsrc");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("a")).unwrap();
        fs::write(dir.join("a/001.txt"), b"abc").unwrap();

        let (label, mut backend) = open_path(&dir).unwrap();
        assert_eq!(label, "folder");
        assert_eq!(backend.list().len(), 2); // "a" 目录 + 001.txt
        assert_eq!(backend.read("a/001.txt").unwrap(), b"abc");
        backend.close();
        let _ = fs::remove_dir_all(&dir);
    }
}
