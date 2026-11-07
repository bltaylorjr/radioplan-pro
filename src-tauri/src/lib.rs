use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Where automatic updates come from (GitHub Releases of the project repository).
const UPDATE_PREFIX: &str = "https://github.com/bltaylorjr/radioplan-pro/releases/download/";

/// Portable mode: when a folder named "RadioPlan Data" (or a file "portable.txt") sits next to the
/// program, all projects and maps are stored there (for example on a flash drive) instead of in
/// %LOCALAPPDATA%\com.radioplan.pro.
fn portable_data_dir() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.to_path_buf();
    let data = dir.join("RadioPlan Data");
    if data.is_dir() || dir.join("portable.txt").is_file() {
        let _ = std::fs::create_dir_all(&data);
        Some(data)
    } else {
        None
    }
}

#[derive(serde::Serialize)]
struct AppInfo { portable: bool, os: &'static str }

#[tauri::command]
fn app_info() -> AppInfo { AppInfo { portable: portable_data_dir().is_some(), os: std::env::consts::OS } }

/// Download the new installer from the project's GitHub release and run it silently.
/// The installer closes this app, replaces it, and starts the new version.
#[tauri::command]
fn install_update(url: String) -> Result<(), String> {
    let ok_chars = url.chars().all(|c| c.is_ascii_alphanumeric() || "/:._-".contains(c));
    if !url.starts_with(UPDATE_PREFIX) || !url.ends_with(".exe") || url.contains("..") || !ok_chars {
        return Err("Update address refused".into());
    }
    if portable_data_dir().is_some() {
        return Err("Portable copy: replace the files on the drive with the new flash-drive download".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let tmp = std::env::temp_dir().join("RadioPlanPro-Update.exe");
        let script = format!(
            "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing -Uri '{}' -OutFile '{}'; Start-Process -FilePath '{}' -ArgumentList '/S'",
            url, tmp.display(), tmp.display()
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("Automatic install is only available on Windows".into())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info, install_update])
        .setup(|app| {
            let mut w = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("RadioPlan Pro")
                .inner_size(1440.0, 920.0)
                .min_inner_size(900.0, 600.0);
            if let Some(dir) = portable_data_dir() {
                w = w.data_directory(dir);
            }
            w.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running RadioPlan Pro");
}
