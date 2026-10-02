// 在线食物库：转发 Open Food Facts 搜索。
// 只接受搜索关键词，URL 与字段在这里固定，WebView 无法借此访问其他地址。
use serde_json::Value;
use std::time::Duration;

const SEARCH_URL: &str = "https://search.openfoodfacts.org/search";
const FIELDS: &str = "code,product_name,product_name_zh,brands,serving_quantity,nutriments";
const MAX_QUERY: usize = 100;

/// 校验关键词，返回去掉首尾空白后的结果
fn clean_query(q: &str) -> Result<String, String> {
  let q = q.trim();
  if q.is_empty() {
    return Err("请输入搜索关键词".into());
  }
  if q.chars().count() > MAX_QUERY {
    return Err("关键词过长".into());
  }
  Ok(q.to_string())
}

/// 返回原始 hits 数组，字段标准化在前端 off.ts 完成（与 Companion 共用一套逻辑）
#[tauri::command]
pub async fn search_foods(query: String) -> Result<Value, String> {
  let q = clean_query(&query)?;
  let res = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    // Open Food Facts 要求标识调用方
    .user_agent(concat!("CalorieStudio/", env!("CARGO_PKG_VERSION"), " (desktop)"))
    .build()
    .map_err(|e| e.to_string())?
    .get(SEARCH_URL)
    .query(&[("q", q.as_str()), ("page_size", "20"), ("fields", FIELDS)])
    .send()
    .await
    .map_err(|e| format!("无法连接在线食物库：{e}"))?;
  let status = res.status();
  if !status.is_success() {
    return Err(format!("在线食物库暂时不可用（{}），请稍后再试", status.as_u16()));
  }
  let body: Value = res.json().await.map_err(|_| "在线食物库返回的数据格式不正确".to_string())?;
  Ok(body.get("hits").cloned().unwrap_or(Value::Array(vec![])))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn validates_query() {
    assert_eq!(clean_query("  whey ").unwrap(), "whey");
    assert!(clean_query("   ").is_err());
    assert!(clean_query(&"蛋".repeat(101)).is_err());
  }
}
