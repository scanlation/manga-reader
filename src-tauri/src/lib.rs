mod commands;
mod sources;
mod state;

use state::Sources;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 清理上次运行遗留的解压临时目录
    sources::extractors::cleanup_all();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Sources::new())
        .invoke_handler(tauri::generate_handler![
            commands::open_source,
            commands::read_entry,
            commands::close_source,
            commands::path_kind
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
