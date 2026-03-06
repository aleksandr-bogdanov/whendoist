fn main() {
    tauri_build::build();

    // Compile the native UITabBar Swift plugin into a static library
    // so the @_cdecl("init_plugin_native_tabbar") symbol is available at link time.
    // Only runs on macOS (the build host) when cross-compiling for iOS.
    #[cfg(target_os = "macos")]
    {
        let target = std::env::var("TARGET").unwrap_or_default();
        if target.contains("ios") {
            tauri_utils::build::link_apple_library("tauri-plugin-native-tabbar", "ios");
        }
    }
}
