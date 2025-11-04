use std::io::{self, Read};
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Deserialize)]
struct FsReadRequest {
    path: String,
}

#[derive(Serialize)]
struct FsReadResponse {
    content: String,
    path: String,
}

fn main() {
    // Read JSON input from stdin
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("Failed to read stdin");
    
    // Parse request
    let request: FsReadRequest = serde_json::from_str(&input).expect("Invalid JSON");
    
    // Read file (WASI will enforce directory preopens)
    let content = std::fs::read_to_string(&request.path)
        .unwrap_or_else(|e| format!("Error reading file: {}", e));
    
    // Write JSON response to stdout
    let response = FsReadResponse {
        content,
        path: request.path,
    };
    
    println!("{}", serde_json::to_string(&response).unwrap());
}
