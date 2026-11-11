//! 目录后端：用户选择的文件夹，或 rar/7z/tar 解压出的临时目录。

use std::fs;
use std::path::{Path, PathBuf};

use super::EntryInfo;

pub struct DirBackend {
    root: PathBuf,
    /// 解压产生的临时目录，close 时删除
    temp: Option<PathBuf>,
    entries: Vec<EntryInfo>,
}

impl DirBackend {
    /// 打开用户选择的文件夹（不负责清理）。
    pub fn open_folder(root: &Path) -> Result<Self, String> {
        Self::scan(root, None)
    }

    /// 打开解压到 `dest` 的临时目录（close 时删除整个目录）。
    pub fn open_extracted(dest: &Path) -> Result<Self, String> {
        Self::scan(dest, Some(dest.to_path_buf()))
    }

    fn scan(root: &Path, temp: Option<PathBuf>) -> Result<Self, String> {
        let mut entries = Vec::new();
        for entry in walkdir::WalkDir::new(root).min_depth(1) {
            let e = entry.map_err(|_| "err.io".to_string())?;
            let rel = e
                .path()
                .strip_prefix(root)
                .map_err(|_| "err.io".to_string())?;
            let path = rel.to_string_lossy().replace('\\', "/");
            if path.is_empty() {
                continue;
            }
            entries.push(EntryInfo {
                path,
                size: e.metadata().map(|m| m.len()).unwrap_or(0),
                is_dir: e.file_type().is_dir(),
            });
        }
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(Self {
            root: root.to_path_buf(),
            temp,
            entries,
        })
    }

    pub fn entries(&self) -> &[EntryInfo] {
        &self.entries
    }

    pub fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        // 拒绝路径穿越与反斜杠
        if path.contains('\\') || path.split('/').any(|seg| seg == "..") {
            return Err("err.notFound".to_string());
        }
        let full = self.root.join(path);
        fs::read(full).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "err.notFound".to_string()
            } else {
                "err.io".to_string()
            }
        })
    }

    pub fn cleanup(&mut self) {
        if let Some(temp) = self.temp.take() {
            let _ = fs::remove_dir_all(temp);
        }
    }
}
