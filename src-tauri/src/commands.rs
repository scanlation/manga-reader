//! 前端可调用的命令：打开源、读单条目、关闭源、判断路径类型。

use serde::Serialize;
use tauri::{ipc::Response, State};

use crate::sources::{open_path, EntryInfo};
use crate::state::Sources;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    handle: u32,
    /// 格式标签（zip/cbz/epub/rar/cbr/7z/tar/folder...）
    format: String,
    kind: String,
    entries: Vec<EntryInfo>,
}

#[tauri::command]
pub fn open_source(path: String, state: State<'_, Sources>) -> Result<OpenResult, String> {
    let (format, backend) = open_path(std::path::Path::new(&path))?;
    let kind = backend.kind().to_string();
    let entries = backend.list();
    let handle = state.insert(backend);
    Ok(OpenResult {
        handle,
        format,
        kind,
        entries,
    })
}

/// 读取单条目原始字节。返回 ipc::Response 以绕过 JSON 序列化，
/// 前端 invoke 直接得到 ArrayBuffer。
#[tauri::command]
pub fn read_entry(
    handle: u32,
    path: String,
    state: State<'_, Sources>,
) -> Result<Response, String> {
    let bytes = state.with(handle, |b| b.read(&path))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn close_source(handle: u32, state: State<'_, Sources>) -> Result<(), String> {
    state.remove(handle)
}

/// 拖放路径的类型判断："dir" | "file" | "missing"
#[tauri::command]
pub fn path_kind(path: String) -> String {
    match std::fs::metadata(&path) {
        Ok(m) if m.is_dir() => "dir".to_string(),
        Ok(_) => "file".to_string(),
        Err(_) => "missing".to_string(),
    }
}
