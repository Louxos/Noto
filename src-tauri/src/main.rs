#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tauri_plugin_fs::FsExt;

#[derive(Default)]
struct PendingOpenFiles(Mutex<Vec<String>>);

#[tauri::command]
fn startup_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|argument| Path::new(argument).is_file())
        .collect()
}

#[tauri::command]
fn take_pending_open_files(state: State<'_, PendingOpenFiles>) -> Vec<String> {
    state.0.lock().map(|mut paths| std::mem::take(&mut *paths)).unwrap_or_default()
}

#[tauri::command]
fn open_default_apps_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd.exe")
            .args(["/C", "start", "", "ms-settings:defaultapps"])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| format!("Impossible d’ouvrir les paramètres Windows : {error}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("La gestion des associations est disponible dans l’application Windows.".to_string())
    }
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

#[tauri::command]
fn allow_directory_access(app: tauri::AppHandle, path: String, recursive: bool) -> Result<(), String> {
    let directory = std::path::PathBuf::from(path);
    if !directory.is_dir() {
        return Err("Le dossier choisi n’existe pas ou n’est pas accessible.".to_string());
    }
    app.fs_scope()
        .allow_directory(&directory, recursive)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn adjacent_image_paths(path: String) -> Result<Vec<String>, String> {
    let image = Path::new(&path);
    if !image.is_file() || !is_supported_image(image) {
        return Err("Le fichier image n’existe pas ou n’est pas pris en charge.".to_string());
    }
    let directory = image.parent().ok_or_else(|| "Le dossier de cette image est introuvable.".to_string())?;
    let entries = std::fs::read_dir(directory).map_err(|error| error.to_string())?;
    let mut images = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry.file_type().map_err(|error| error.to_string())?.is_file() {
            continue;
        }
        let sibling = entry.path();
        if is_supported_image(&sibling) {
            images.push(sibling.to_string_lossy().into_owned());
        }
    }
    Ok(images)
}

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "png" | "apng" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "ico" | "tif" | "tiff" | "avif"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::is_supported_image;
    use std::path::Path;

    #[test]
    fn recognizes_supported_image_types_without_recursing_or_reading_contents() {
        assert!(is_supported_image(Path::new("folder/Photo.JPEG")));
        assert!(is_supported_image(Path::new("folder/page-2.tiff")));
        assert!(!is_supported_image(Path::new("folder/document.pdf")));
        assert!(!is_supported_image(Path::new("folder/photo.jpeg.txt")));
    }
}

fn main() {
    tauri::Builder::default()
        .manage(PendingOpenFiles::default())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths: Vec<String> = argv
                .into_iter()
                .skip(1)
                .filter(|argument| Path::new(argument).is_file())
                .collect();
            if let Some(queue) = app.try_state::<PendingOpenFiles>() {
                if let Ok(mut pending) = queue.0.lock() {
                    pending.extend(paths.iter().cloned());
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let _ = app.emit("noto-open-files", paths);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            startup_paths,
            take_pending_open_files,
            open_default_apps_settings,
            allow_file_access,
            allow_directory_access,
            adjacent_image_paths
        ])
        .run(tauri::generate_context!())
        .expect("Noto n’a pas pu démarrer.");
}
