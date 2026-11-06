use std::path::PathBuf;

/// 剥掉可能越出下载目录的字符。
/// 文件名是前端拼的，不信任它：斜杠和上级目录引用一律去掉。
fn sanitize_filename(raw: &str) -> String {
    let safe: String = raw
        .chars()
        .filter(|c| c.is_alphanumeric() || " -_.()".contains(*c))
        .collect();
    if safe.trim().is_empty() {
        "pomolog.csv".to_string()
    } else {
        safe
    }
}

/// 把文本写进用户的下载目录，返回完整路径。
///
/// 为什么不直接用前端的 `a[download]`：WKWebView 不实现浏览器的下载流程，
/// 点了没反应也不报错。导出是应用的立身之本（"记录不该上锁"），
/// 所以走原生写盘，失败至少能拿到错误信息。
#[tauri::command]
fn save_text(filename: String, content: String) -> Result<String, String> {
    let safe = sanitize_filename(&filename);

    let home = std::env::var("HOME").map_err(|e| format!("读不到 HOME: {e}"))?;
    let path = PathBuf::from(home).join("Downloads").join(&safe);

    std::fs::write(&path, content).map_err(|e| format!("写入失败: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// 入口拆成 lib 而不是只有 main.rs，是为了移动端：
/// iOS / Android 需要一个能被平台调用的库入口，`mobile_entry_point` 就是那颗钩子。
/// 桌面端由 main.rs 调它，行为完全一样。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_text])
        .run(tauri::generate_context!())
        .expect("failed to start Pomolog");
}

#[cfg(test)]
mod tests {
    use super::{sanitize_filename, save_text};

    #[test]
    fn strips_path_separators() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "....etcpasswd");
        assert_eq!(sanitize_filename("a/b\\c"), "abc");
    }

    #[test]
    fn keeps_chinese_and_date() {
        assert_eq!(sanitize_filename("番茄钟_2026-11-07.csv"), "番茄钟_2026-11-07.csv");
    }

    #[test]
    fn falls_back_when_empty() {
        assert_eq!(sanitize_filename(""), "pomolog.csv");
        assert_eq!(sanitize_filename("///"), "pomolog.csv");
    }

    /// 真写一次盘再删掉：路径拼装、目录存在、编码往返，只有真写才知道对不对
    #[test]
    fn save_text_actually_writes() {
        let payload = "日期,科目\n2026-11-07,英语\n";
        let path = save_text("pomolog_selftest.csv".to_string(), payload.to_string())
            .expect("写盘应当成功");

        let p = std::path::Path::new(&path);
        assert!(p.exists(), "文件应已落盘: {path}");
        assert_eq!(std::fs::read_to_string(p).expect("应能读回"), payload);

        std::fs::remove_file(p).ok();
    }
}
