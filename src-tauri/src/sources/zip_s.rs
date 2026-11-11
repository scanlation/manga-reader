//! zip/cbz/epub 后端：保持压缩包打开，按条目名随机读取。

use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Mutex;

use super::EntryInfo;

pub struct ZipBackend {
    archive: Mutex<zip::ZipArchive<File>>,
    entries: Vec<EntryInfo>,
}

impl ZipBackend {
    pub fn open(path: &Path) -> Result<Self, String> {
        let file = File::open(path).map_err(|_| "err.notFound".to_string())?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(map_zip_err)?;

        let mut entries = Vec::with_capacity(archive.len());
        for i in 0..archive.len() {
            let entry = archive.by_index(i).map_err(map_zip_err)?;
            entries.push(EntryInfo {
                path: entry.name().replace('\\', "/"),
                size: entry.size(),
                is_dir: entry.is_dir(),
            });
        }

        Ok(Self {
            archive: Mutex::new(archive),
            entries,
        })
    }

    pub fn entries(&self) -> &[EntryInfo] {
        &self.entries
    }

    pub fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        let mut archive = self
            .archive
            .lock()
            .map_err(|_| "err.io".to_string())?;
        let mut entry = archive.by_name(path).map_err(map_zip_err)?;
        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut buf).map_err(|_| "err.corrupt".to_string())?;
        Ok(buf)
    }
}

fn map_zip_err(e: zip::result::ZipError) -> String {
    use zip::result::ZipError;
    match e {
        ZipError::FileNotFound => "err.notFound".to_string(),
        ZipError::InvalidPassword => "err.encrypted".to_string(),
        ZipError::InvalidArchive(_) => "err.corrupt".to_string(),
        ZipError::UnsupportedArchive(_) => "err.unsupported".to_string(),
        ZipError::Io(_) => "err.io".to_string(),
        _ => "err.io".to_string(),
    }
}
