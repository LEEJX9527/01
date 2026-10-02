use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager};

const SYSTEM_PROMPT: &str = "你是营养师助手。根据用户描述或食物照片，识别每种食物并估算重量与营养。
只输出 JSON，不要任何解释，格式：
{\"items\":[{\"name\":\"食物名\",\"grams\":数字,\"kcal\":数字,\"protein\":数字,\"fat\":数字,\"carbs\":数字}],\"note\":\"一句简短建议\"}
protein/fat/carbs 单位为克，kcal 为千卡，数值对应该份量而非每100g。";
const MAX_TEXT: usize = 2000;
const MAX_IMAGE: usize = 8 * 1024 * 1024;

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderConfig {
  base_url: String,
  api_key: String,
  model: String,
}

/// 返回给前端的状态，不含密钥
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
  configured: bool,
  base_url: String,
  model: String,
  key_hint: String,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct FoodItem {
  name: String,
  grams: f64,
  kcal: f64,
  protein: f64,
  fat: f64,
  carbs: f64,
}

#[derive(Serialize, Debug)]
pub struct AnalyzeResult {
  items: Vec<FoodItem>,
  note: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join("provider.json"))
}

fn load(app: &AppHandle) -> ProviderConfig {
  config_path(app)
    .ok()
    .and_then(|p| fs::read_to_string(p).ok())
    .and_then(|s| serde_json::from_str(&s).ok())
    .unwrap_or_else(|| ProviderConfig { model: "gpt-4o-mini".into(), ..Default::default() })
}

fn mask(k: &str) -> String {
  let chars: Vec<char> = k.chars().collect();
  match chars.len() {
    0 => "(未设置)".into(),
    n if n > 8 => format!("{}…{}", chars[..4].iter().collect::<String>(), chars[n - 4..].iter().collect::<String>()),
    _ => "****".into(),
  }
}

fn is_http_url(s: &str) -> bool {
  s.starts_with("https://") || s.starts_with("http://")
}

#[tauri::command]
pub fn provider_status(app: AppHandle) -> ProviderStatus {
  let c = load(&app);
  ProviderStatus {
    configured: !c.api_key.is_empty() && is_http_url(&c.base_url),
    key_hint: mask(&c.api_key),
    base_url: c.base_url,
    model: c.model,
  }
}

/// api_key 为空时保留原密钥
#[tauri::command]
pub fn save_provider(app: AppHandle, base_url: String, model: String, api_key: Option<String>) -> Result<ProviderStatus, String> {
  let base_url = base_url.trim().trim_end_matches('/').to_string();
  if !is_http_url(&base_url) {
    return Err("API 地址需以 http:// 或 https:// 开头".into());
  }
  let mut c = load(&app);
  c.base_url = base_url;
  c.model = model.trim().to_string();
  if let Some(k) = api_key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty()) {
    c.api_key = k;
  }
  let json = serde_json::to_string_pretty(&c).map_err(|e| e.to_string())?;
  fs::write(config_path(&app)?, json).map_err(|e| format!("保存失败：{e}"))?;
  Ok(provider_status(app))
}

#[tauri::command]
pub async fn analyze_food(app: AppHandle, text: String, image: Option<String>) -> Result<AnalyzeResult, String> {
  let c = load(&app);
  if c.api_key.is_empty() || !is_http_url(&c.base_url) {
    return Err("请先在设置中配置 API 地址和密钥".into());
  }
  let text: String = text.chars().take(MAX_TEXT).collect();
  // 只接受内联图片数据，不转发外部 URL
  if let Some(img) = &image {
    let ok = ["png", "jpeg", "webp", "gif"].iter().any(|t| img.starts_with(&format!("data:image/{t};base64,")));
    if !ok || img.len() > MAX_IMAGE {
      return Err("图片格式不支持或过大".into());
    }
  }
  if text.trim().is_empty() && image.is_none() {
    return Err("请提供文字描述或图片".into());
  }

  let mut content = vec![json!({ "type": "text", "text": if text.trim().is_empty() { "请识别图片中的食物" } else { &text } })];
  if let Some(img) = image {
    content.push(json!({ "type": "image_url", "image_url": { "url": img } }));
  }
  let body = json!({
    "model": c.model,
    "temperature": 0.2,
    "messages": [{ "role": "system", "content": SYSTEM_PROMPT }, { "role": "user", "content": content }],
  });

  let res = reqwest::Client::builder()
    .timeout(Duration::from_secs(60))
    .build()
    .map_err(|e| e.to_string())?
    .post(format!("{}/chat/completions", c.base_url))
    .bearer_auth(&c.api_key)
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("无法连接接口：{e}"))?;

  let status = res.status();
  let raw = res.text().await.map_err(|e| e.to_string())?;
  if raw.trim_start().starts_with('<') {
    return Err(format!("接口返回了网页而不是 JSON（状态 {}），请检查 API 地址，通常需要以 /v1 结尾", status.as_u16()));
  }
  if !status.is_success() {
    return Err(format!("接口错误 {}: {}", status.as_u16(), raw.chars().take(200).collect::<String>()));
  }
  let data: Value = serde_json::from_str(&raw).map_err(|_| "接口返回内容无法解析为 JSON".to_string())?;
  parse_ai_json(data["choices"][0]["message"]["content"].as_str().unwrap_or(""))
}

/// 容错解析：兼容 ```json 代码块包裹与多余文本（与前端 parseAiJson 一致）
fn parse_ai_json(raw: &str) -> Result<AnalyzeResult, String> {
  let (start, end) = match (raw.find('{'), raw.rfind('}')) {
    (Some(s), Some(e)) if e > s => (s, e),
    _ => return Err("模型未返回有效 JSON".into()),
  };
  let obj: Value = serde_json::from_str(&raw[start..=end]).map_err(|_| "模型未返回有效 JSON".to_string())?;
  let num = |v: &Value| -> f64 {
    let n = v.as_f64().or_else(|| v.as_str().and_then(|s| s.trim().parse().ok())).unwrap_or(0.0);
    if n.is_finite() { n.max(0.0) } else { 0.0 }
  };
  let items = obj["items"]
    .as_array()
    .map(|arr| {
      arr
        .iter()
        .map(|i| FoodItem {
          name: i["name"].as_str().unwrap_or("未知食物").to_string(),
          grams: num(&i["grams"]),
          kcal: num(&i["kcal"]).round(),
          protein: num(&i["protein"]),
          fat: num(&i["fat"]),
          carbs: num(&i["carbs"]),
        })
        .collect()
    })
    .unwrap_or_default();
  Ok(AnalyzeResult { items, note: obj["note"].as_str().unwrap_or("").to_string() })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_fenced_json() {
    let r = parse_ai_json("```json\n{\"items\":[{\"name\":\"拉面\",\"grams\":\"400\",\"kcal\":520.4,\"protein\":20,\"fat\":-1,\"carbs\":80}],\"note\":\"注意钠\"}\n```").unwrap();
    assert_eq!(r.items[0], FoodItem { name: "拉面".into(), grams: 400.0, kcal: 520.0, protein: 20.0, fat: 0.0, carbs: 80.0 });
    assert_eq!(r.note, "注意钠");
    assert!(parse_ai_json("抱歉").is_err());
  }

  #[test]
  fn masks_key() {
    assert_eq!(mask(""), "(未设置)");
    assert_eq!(mask("sk-abcdefgh1234"), "sk-a…1234");
    assert_eq!(mask("short"), "****");
  }
}
