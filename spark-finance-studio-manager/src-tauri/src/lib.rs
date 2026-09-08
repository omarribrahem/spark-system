use tauri::Manager;

#[derive(serde::Serialize)]
pub struct AppPaths {
    pub app_data_dir: String,
    pub db_path: String,
    pub backups_dir: String,
    pub attachments_dir: String,
}

#[tauri::command]
fn get_app_paths(app_handle: tauri::AppHandle) -> Result<AppPaths, String> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let db_path = app_data.join("spark.db");
    let backups_dir = app_data.join("backups");
    let attachments_dir = app_data.join("attachments");

    Ok(AppPaths {
        app_data_dir: app_data.to_string_lossy().to_string(),
        db_path: db_path.to_string_lossy().to_string(),
        backups_dir: backups_dir.to_string_lossy().to_string(),
        attachments_dir: attachments_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn open_folder_in_explorer(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let target_path = if path.starts_with("%LOCALAPPDATA%") || path.contains(":\\") {
        std::path::PathBuf::from(path)
    } else {
        let app_data = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
        app_data.join(path)
    };

    if !target_path.exists() {
        let _ = std::fs::create_dir_all(&target_path);
    }

    open::that(&target_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn store_oauth_token(service: String, account: String, token: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_oauth_token(service: String, account: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(&service, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_oauth_token(service: String, account: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &account).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_app_paths,
            open_folder_in_explorer,
            store_oauth_token,
            get_oauth_token,
            delete_oauth_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running spark finance studio manager application");
}
