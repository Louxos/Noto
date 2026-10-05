#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_fs::FsExt;

#[tauri::command]
fn startup_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|argument| std::path::Path::new(argument).is_file())
        .collect()
}

#[tauri::command]
fn allow_file_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let file = std::path::PathBuf::from(path);
    if !file.is_file() {
        return Err("Le fichier demandé n’existe pas ou n’est pas accessible.".to_string());
    }
    app.fs_scope()
        .allow_file(&file)
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![startup_paths, allow_file_access])
        .run(tauri::generate_context!())
        .expect("Noto n’a pas pu démarrer.");
}
