pub mod notifications;

/// Smoke-test command — verifies Rust ↔ WebView IPC works.
/// Remove once real commands are added.
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Rust backend is connected.", name)
}
