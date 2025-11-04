use anyhow::{Context, Result};
use serde_json::Value;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

/// WASI Tool Runtime - executes WebAssembly tools via wasmtime CLI
/// Using wasmtime CLI for production-grade isolation and security
pub struct WasiRunner {
    wasmtime_bin: String,
}

impl WasiRunner {
    /// Create new WASI runtime
    pub fn new() -> Result<Self> {
        // Try to find wasmtime, but don't fail if not found
        let wasmtime_bin = which::which("wasmtime")
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| {
                tracing::warn!("wasmtime not found in PATH. WASI tools disabled. Install: curl https://wasmtime.dev/install.sh -sSf | bash");
                String::new()
            });
        
        Ok(Self { wasmtime_bin })
    }

    /// Create a disabled WASI runner (for when wasmtime is not available)
    pub fn disabled() -> Self {
        Self { wasmtime_bin: String::new() }
    }

    /// Execute a WASI module with JSON input and directory preopens
    pub fn exec(
        &self,
        wasm_path: &str,
        input: &Value,
        preopen_dirs: &[&str],
    ) -> Result<String> {
        // Check if wasmtime is available
        if self.wasmtime_bin.is_empty() {
            anyhow::bail!("WASI execution not available: wasmtime not installed");
        }
        
        // Validate WASM file exists
        if !Path::new(wasm_path).exists() {
            anyhow::bail!("WASM file not found: {}", wasm_path);
        }

        tracing::debug!("Executing WASI module: {} with wasmtime CLI", wasm_path);

        // Build wasmtime command with preopens
        let mut cmd = Command::new(&self.wasmtime_bin);
        cmd.arg("run")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Add directory preopens (wasmtime --dir flag BEFORE the wasm file)
        for dir in preopen_dirs {
            if Path::new(dir).exists() {
                cmd.arg(format!("--dir={}", dir));
                tracing::debug!("Preopening directory: {}", dir);
            }
        }
        
        // Add the wasm file path
        cmd.arg(wasm_path);

        // Execute
        let mut child = cmd.spawn()
            .with_context(|| format!("Failed to spawn wasmtime for {}", wasm_path))?;

        // Write input JSON to stdin
        if let Some(mut stdin) = child.stdin.take() {
            let input_str = serde_json::to_string(input)?;
            stdin.write_all(input_str.as_bytes())
                .with_context(|| "Failed to write input to WASI stdin")?;
        }

        // Wait for completion and capture output
        let output = child.wait_with_output()
            .with_context(|| "WASI process failed")?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            tracing::debug!("WASI execution succeeded, output length: {}", stdout.len());
            Ok(stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            tracing::error!("WASI execution failed: {}", stderr);
            anyhow::bail!("WASI execution failed: {}", stderr)
        }
    }

    /// Check if a WASM file is valid
    pub fn validate(&self, wasm_path: &str) -> Result<bool> {
        if !Path::new(wasm_path).exists() || !wasm_path.ends_with(".wasm") {
            return Ok(false);
        }
        
        // Try to validate the module with wasmtime validate
        let output = Command::new(&self.wasmtime_bin)
            .arg("compile")
            .arg("--check")
            .arg(wasm_path)
            .output();
        
        match output {
            Ok(out) => Ok(out.status.success()),
            Err(e) => {
                tracing::warn!("Failed to validate WASM file {}: {}", wasm_path, e);
                Ok(false)
            }
        }
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
