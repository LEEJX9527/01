// Calorie Studio 桌面端：AI 接口由 Rust 后端调用，API 密钥只保存在应用配置目录，
// 网页层（WebView）只能通过下面三个命令间接使用，无法读取密钥本身。
mod provider;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      provider::provider_status,
      provider::save_provider,
      provider::analyze_food
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
