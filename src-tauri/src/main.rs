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

#[tauri::command]
fn allow_directory_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let directory = std::path::PathBuf::from(path);
    if !directory.is_dir() {
        return Err("Le dossier de destination n’existe pas ou n’est pas accessible.".to_string());
    }
    app.fs_scope()
        .allow_directory(&directory, false)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_notebook_directory(parent_path: String, folder_name: String) -> Result<String, String> {
    let parent = std::path::PathBuf::from(parent_path);
    if !parent.is_dir() {
        return Err("Le dossier parent n’existe pas ou n’est pas accessible.".to_string());
    }
    if folder_name.trim().is_empty()
        || folder_name.chars().count() > 100
        || folder_name == "."
        || folder_name == ".."
        || folder_name.ends_with('.')
        || folder_name.ends_with(' ')
        || folder_name.chars().any(|character| {
            character.is_control() || matches!(character, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
    {
        return Err("Choisissez un nom de carnet valide pour Windows.".to_string());
    }
    let target = parent.join(folder_name);
    if target.exists() {
        return Err("Un dossier portant ce nom existe déjà à cet emplacement.".to_string());
    }
    std::fs::create_dir(&target).map_err(|error| {
        format!("Impossible de créer le dossier du carnet : {error}")
    })?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn allow_directory_tree_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let directory = std::path::PathBuf::from(path);
    if !directory.is_dir() {
        return Err("Le dossier du carnet n’existe pas ou n’est pas accessible.".to_string());
    }
    app.fs_scope()
        .allow_directory(&directory, true)
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![startup_paths, allow_file_access, allow_directory_access, allow_directory_tree_access, create_notebook_directory])
        .run(tauri::generate_context!())
        .expect("Noto n’a pas pu démarrer.");
}
