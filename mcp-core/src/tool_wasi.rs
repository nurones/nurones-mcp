use anyhow::Result;
use serde_json::Value;
use std::path::Path;
use std::process::{Command, Stdio};
use std::io::Write;

/// WASI Tool Runtime - executes WebAssembly tools via wasmtime CLI
/// Note: Using wasmtime CLI for rapid delivery; will migrate to embedded runtime in Week 2
pub struct WasiRunner {
    wasmtime_bin: String,
}

impl WasiRunner {
    /// Create new WASI runtime
    pub fn new() -> Result<Self> {
        // Use wasmtime CLI for rapid delivery
        let wasmtime_bin = "wasmtime".to_string();
        
        Ok(Self { wasmtime_bin })
    }

    /// Execute a WASI module with JSON input
    pub fn exec(&self, wasm_path: &str, input: &Value) -> Result<String> {
        // Validate WASM file exists
        if !Path::new(wasm_path).exists() {
            anyhow::bail!("WASM file not found: {}", wasm_path);
        }

        tracing::debug!("Executing WASI module: {} with wasmtime", wasm_path);

        // Execute via wasmtime CLI
        let mut child = Command::new(&self.wasmtime_bin)
            .arg("run")
            .arg(wasm_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        // Write input JSON to stdin
        if let Some(mut stdin) = child.stdin.take() {
            let input_str = serde_json::to_string(input)?;
            stdin.write_all(input_str.as_bytes())?;
        }

        // Wait for completion and capture output
        let output = child.wait_with_output()?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            tracing::debug!("WASI execution succeeded: {}", stdout);
            Ok(stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            tracing::error!("WASI execution failed: {}", stderr);
            anyhow::bail!("WASI execution failed: {}", stderr)
        }
    }

    /// Check if a WASM file is valid
    pub fn validate(&self, wasm_path: &str) -> Result<bool> {
        Ok(Path::new(wasm_path).exists() && wasm_path.ends_with(".wasm"))
    }
}

impl Default for WasiRunner {
    fn default() -> Self {
        Self::new().expect("Failed to create default WASI runner")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasi_runner_creation() {
        let runner = WasiRunner::new();
        assert!(runner.is_ok());
    }

    #[test]
    fn test_validate_missing_file() {
        let runner = WasiRunner::new().unwrap();
        let result = runner.validate("nonexistent.wasm");
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }
}
