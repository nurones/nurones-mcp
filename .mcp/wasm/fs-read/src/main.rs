use anyhow::{Context, Result};
use serde::Deserialize;
use std::io::{Read, Write};
use std::fs;

#[derive(Deserialize)]
struct Input { path: String }

fn main() -> Result<()> {
    // Read JSON from stdin
    let mut buf = String::new();
    std::io::stdin().read_to_string(&mut buf)?;
    let inp: Input = serde_json::from_str(&buf).context("invalid JSON (expected {\"path\":\"...\"})")?;

    // Read the file (must be inside a preopened dir that maps to this path)
    let content = fs::read_to_string(&inp.path)
        .with_context(|| format!("failed to read: {}", inp.path))?;

    // Emit strict JSON to stdout (WASI contract: write final JSON to stdout)
    let out = serde_json::json!({
        "path": inp.path,
        "bytes": content.as_bytes().len(),
        "content": content,
    });
    let s = serde_json::to_string(&out)?;
    std::io::stdout().write_all(s.as_bytes())?;
    Ok(())
}
