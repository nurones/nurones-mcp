use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize)]
struct Input {
    path: String,
    content: String,
}

#[derive(Serialize)]
struct Output {
    ok: bool,
    bytes: usize,
    error: Option<String>,
}

#[no_mangle]
pub extern "C" fn _start() {
    // Read from stdin (will be implemented via WASI stdio)
    // For now, demonstrate basic file writing capability
    let output = Output {
        ok: true,
        bytes: 0,
        error: None,
    };
    
    // Print JSON to stdout
    if let Ok(json) = serde_json::to_string(&output) {
        println!("{}", json);
    }
}

/// Core file writing logic
pub fn write_file(path: &str, content: &str) -> Output {
    match fs::write(path, content) {
        Ok(_) => Output {
            ok: true,
            bytes: content.len(),
            error: None,
        },
        Err(e) => Output {
            ok: false,
            bytes: 0,
            error: Some(format!("Failed to write file: {}", e)),
        },
    }
}
