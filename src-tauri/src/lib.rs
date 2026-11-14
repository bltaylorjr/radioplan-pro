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

/// RadioReference.com web service (SOAP). The page can't call it directly (the browser engine blocks other sites),
/// so the app makes the request. Only https://api.radioreference.com/ is allowed.
#[tauri::command]
async fn rr_http(url: String, body: String, soap_action: String, post: bool) -> Result<String, String> {
    if !url.starts_with("https://api.radioreference.com/") || url.contains("..") || url.contains('@') {
        return Err("Address refused".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(60)).build();
        let res = if post {
            agent.post(&url)
                .set("Content-Type", "text/xml; charset=utf-8")
                .set("SOAPAction", &soap_action)
                .set("User-Agent", "LvPlanPro")
                .send_string(&body)
        } else {
            agent.get(&url).set("User-Agent", "LvPlanPro").call()
        };
        match res {
            Ok(r) => r.into_string().map_err(|e| e.to_string()),
            // SOAP faults come back as HTTP 500 with the fault in the body: pass them on so the page can explain them.
            Err(ureq::Error::Status(code, r)) => {
                let text = r.into_string().unwrap_or_default();
                if text.contains("Fault") { Ok(text) } else { Err(format!("RadioReference HTTP {}", code)) }
            }
            Err(e) => Err(format!("No connection to RadioReference ({})", e)),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info, install_update, rr_http])
        .setup(|app| {
            let mut w = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("LvPlan Pro")
                .inner_size(1440.0, 920.0)
                .min_inner_size(900.0, 600.0);
            if let Some(dir) = portable_data_dir() {
                w = w.data_directory(dir);
            }
            w.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LvPlan Pro");
}
