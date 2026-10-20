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

const RELEASES_URL: &str = "https://github.com/Louxos/Noto/releases/latest";

#[tauri::command]
fn open_release_page() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe")
            .arg(RELEASES_URL)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| format!("Impossible d’ouvrir la page des versions : {error}"))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(RELEASES_URL)
            .spawn()
            .map_err(|error| format!("Impossible d’ouvrir la page des versions : {error}"))?;
        Ok(())
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(RELEASES_URL)
            .spawn()
            .map_err(|error| format!("Impossible d’ouvrir la page des versions : {error}"))?;
        Ok(())
    }
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

/// Affiche un fichier produit dans l’explorateur Windows (dossier parent si le
/// fichier n’existe plus). Aucun programme n’est lancé depuis le fichier :
/// seule la sélection dans l’explorateur est demandée.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let requested = std::path::PathBuf::from(path.trim());
    if path.trim().is_empty() {
        return Err("Aucun chemin à afficher n’a été fourni.".to_string());
    }
    if !requested.exists() {
        return Err(format!(
            "« {} » n’existe plus à cet emplacement.",
            requested.display()
        ));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut command = std::process::Command::new("explorer.exe");
        if requested.is_file() {
            // `/select,` ouvre l’explorateur avec le fichier sélectionné.
            command.arg("/select,").arg(&requested);
        } else {
            command.arg(&requested);
        }
        command
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| format!("Impossible d’ouvrir l’explorateur : {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("open");
        if requested.is_file() {
            command.arg("-R").arg(&requested);
        } else {
            command.arg(&requested);
        }
        command
            .spawn()
            .map_err(|error| format!("Impossible d’ouvrir le Finder : {error}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let directory = if requested.is_dir() {
            requested.clone()
        } else {
            requested
                .parent()
                .map(std::path::Path::to_path_buf)
                .unwrap_or_else(|| std::path::PathBuf::from("."))
        };
        std::process::Command::new("xdg-open")
            .arg(&directory)
            .spawn()
            .map_err(|error| format!("Impossible d’ouvrir le gestionnaire de fichiers : {error}"))?;
        return Ok(());
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
    fn reveal_path_refuses_empty_or_missing_targets() {
        assert!(super::reveal_path(String::new()).is_err());
        assert!(super::reveal_path("   ".to_string()).is_err());
        assert!(super::reveal_path("chemin/inexistant-noto-42.txt".to_string()).is_err());
    }

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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            startup_paths,
            take_pending_open_files,
            open_release_page,
            open_default_apps_settings,
            allow_file_access,
            allow_directory_access,
            adjacent_image_paths,
            reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("Noto n’a pas pu démarrer.");
}
