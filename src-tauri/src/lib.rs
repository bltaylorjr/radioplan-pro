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
fn install_update(url: String, sha256: Option<String>) -> Result<(), String> {
    let ok_chars = url.chars().all(|c| c.is_ascii_alphanumeric() || "/:._-".contains(c));
    if !url.starts_with(UPDATE_PREFIX) || !url.ends_with(".exe") || url.contains("..") || !ok_chars {
        return Err("Update address refused".into());
    }
    // The SHA-256 GitHub reports for the file. When given, a download that does not match is deleted and not run.
    let sha = sha256.unwrap_or_default().to_ascii_uppercase();
    if !sha.is_empty() && (sha.len() != 64 || !sha.chars().all(|c| c.is_ascii_hexdigit())) {
        return Err("Update checksum refused".into());
    }
    if portable_data_dir().is_some() {
        return Err("Portable copy: replace the files on the drive with the new flash-drive download".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let tmp = std::env::temp_dir().join("RadioPlanPro-Update.exe");
        let script = format!(
            "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; $f='{}'; Invoke-WebRequest -UseBasicParsing -Uri '{}' -OutFile $f; $want='{}'; if ($want -ne '' -and (Get-FileHash -Algorithm SHA256 -Path $f).Hash -ne $want) {{ Remove-Item $f -Force; exit 1 }}; Start-Process -FilePath $f -ArgumentList '/S'",
            tmp.display(), url, sha
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
/// so the app makes the request. Only https://api.radioreference.com/ and the official CPSC recalls API
/// (https://www.saferproducts.gov/RestWebServices/Recall) are allowed.
#[tauri::command]
async fn rr_http(url: String, body: String, soap_action: String, post: bool) -> Result<String, String> {
    let ok = url.starts_with("https://api.radioreference.com/") || url.starts_with("https://www.saferproducts.gov/RestWebServices/Recall?");
    if !ok || url.contains("..") || url.contains('@') {
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
