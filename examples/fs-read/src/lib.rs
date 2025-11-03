use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize)]
struct Input {
    path: String,
}

#[derive(Serialize)]
struct Output {
    ok: bool,
    data: Option<String>,
    error: Option<String>,
    bytes: usize,
}

#[no_mangle]
pub extern "C" fn _start() {
    // Read from stdin (will be implemented via WASI stdio)
    // For now, demonstrate basic file reading capability
    let output = Output {
        ok: true,
        data: Some("File read functionality available".to_string()),
        error: None,
        bytes: 0,
    };
    
    // Print JSON to stdout
    if let Ok(json) = serde_json::to_string(&output) {
        println!("{}", json);
    }
}

/// Core file reading logic
pub fn read_file(path: &str) -> Output {
    match fs::read_to_string(path) {
        Ok(content) => {
            let bytes = content.len();
            Output {
                ok: true,
                data: Some(content),
                error: None,
                bytes,
            }
        }
        Err(e) => Output {
            ok: false,
            data: None,
            error: Some(format!("Failed to read file: {}", e)),
            bytes: 0,
        },
    }
}
