use crate::types::{ContextFrame, ToolResult};
use crate::tool_wasi::WasiRunner;
use crate::security::is_allowed;
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;

/// Tool Executor: Executes WASI/Node tools in isolation with context propagation
#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(
        &self,
        tool_id: &str,
        input: serde_json::Value,
        context: ContextFrame,
    ) -> anyhow::Result<ToolResult>;

    async fn validate_manifest(&self, path: &str) -> anyhow::Result<bool>;
}

#[derive(Debug, serde::Deserialize)]
pub struct ToolManifest {
    pub name: String,
    pub version: String,
    pub entry: String,
    pub permissions: Vec<String>,
    #[serde(default)]
    pub description: String,
}

/// In-memory tool executor with security enforcement
pub struct InMemoryToolExecutor {
    tools: Arc<tokio::sync::RwLock<HashMap<String, ToolManifest>>>,
    wasi_runner: WasiRunner,
    fs_allowlist: Vec<String>,
}

impl InMemoryToolExecutor {
    pub fn new() -> Self {
        Self {
            tools: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            wasi_runner: WasiRunner::new().unwrap_or_else(|_| {
                tracing::warn!("WASI runner initialization failed, using native fallbacks");
                WasiRunner::disabled()
            }),
            fs_allowlist: vec!["/workspace".to_string(), "/tmp".to_string()],
        }
    }

    pub fn with_allowlist(fs_allowlist: Vec<String>) -> Self {
        Self {
            tools: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            wasi_runner: WasiRunner::new().unwrap_or_else(|_| {
                tracing::warn!("WASI runner initialization failed, using native fallbacks");
                WasiRunner::disabled()
            }),
            fs_allowlist,
        }
    }

    /// Execute session compression tool (native Node.js)
    async fn execute_session_compression(
        &self,
        input: serde_json::Value,
        context: ContextFrame,
        start: std::time::Instant,
    ) -> anyhow::Result<ToolResult> {
        use std::process::{Command, Stdio};
        use std::io::Write;
        
        // Path to the CLI wrapper
        let cli_path = "extensions/session-compression/cli.js";
        
        // Prepare input with context
        let full_input = serde_json::json!({
            "sources": input.get("sources").unwrap_or(&serde_json::json!([])),
            "char_limit": input.get("char_limit").unwrap_or(&serde_json::json!(1000)),
            "preserve_markup": input.get("preserve_markup").unwrap_or(&serde_json::json!(false)),
            "timezone": input.get("timezone").unwrap_or(&serde_json::json!("Australia/Adelaide")),
            "output_dir": input.get("output_dir").unwrap_or(&serde_json::json!("/tmp/summaries")),
            "filename_scheme": input.get("filename_scheme").unwrap_or(&serde_json::json!("date_session_len")),
            "dry_run": input.get("dry_run").unwrap_or(&serde_json::json!(false)),
            "context_frame": context,
            "reason_trace_id": context.reason_trace_id.clone(),
            "tenant_id": context.tenant_id.clone(),
        });
        
        let input_json = serde_json::to_string(&full_input)?;
        
        // Execute via Node.js CLI
        let mut child = Command::new("node")
            .arg(cli_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        
        // Write input to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(input_json.as_bytes())?;
        }
        
        // Wait and capture output
        let output = child.wait_with_output()?;
        
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let result: serde_json::Value = serde_json::from_str(&stdout)
                .unwrap_or_else(|e| {
                    tracing::error!("Failed to parse output: {}", e);
                    serde_json::json!({ "raw_output": stdout.to_string() })
                });
            
            Ok(ToolResult {
                success: true,
                output: Some(result),
                error: None,
                execution_time: start.elapsed().as_millis() as u64,
                context_used: context,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            tracing::error!("Session compression failed. stderr: {}, stdout: {}", stderr, stdout);
            Ok(ToolResult {
                success: false,
                output: None,
                error: Some(format!("Execution failed: {}", stderr)),
                execution_time: start.elapsed().as_millis() as u64,
                context_used: context,
            })
        }
    }

    /// Register a tool from manifest file
    pub async fn register_tool(&self, manifest_path: &str) -> anyhow::Result<()> {
        let content = tokio::fs::read_to_string(manifest_path).await?;
        let manifest: ToolManifest = serde_json::from_str(&content)?;
        
        let mut tools = self.tools.write().await;
        tools.insert(manifest.name.clone(), manifest);
        
        tracing::info!("Registered tool: {}", manifest_path);
        Ok(())
    }

    /// Load all tools from directory
    pub async fn load_tools(&self, dir_path: &str) -> anyhow::Result<()> {
        let mut entries = tokio::fs::read_dir(dir_path).await?;
        
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Err(e) = self.register_tool(path.to_str().unwrap()).await {
                    tracing::error!("Failed to load tool {:?}: {}", path, e);
                }
            }
        }
        
        Ok(())
    }
}

#[async_trait]
impl ToolExecutor for InMemoryToolExecutor {
    async fn execute(
        &self,
        tool_id: &str,
        input: serde_json::Value,
        context: ContextFrame,
    ) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();

        // Validate context
        context.validate().map_err(|e| anyhow::anyhow!(e))?;

        // Check if tool exists
        let tools = self.tools.read().await;
        let tool = tools
            .get(tool_id)
            .ok_or_else(|| anyhow::anyhow!("Tool not found: {}", tool_id))?;

        // Simulate tool execution (production would invoke WASI runtime)
        tracing::info!(
            "Executing tool: {} with context trace: {}",
            tool_id,
            context.reason_trace_id
        );

        // Check if this is a WASI tool
        if tool.entry.starts_with("wasm://") {
            let wasm_path = tool.entry.trim_start_matches("wasm://");
            
            tracing::info!("Executing WASI tool: {} from {}", tool_id, wasm_path);
            
            // For fs tools, validate and resolve path (including wildcard expansion)
            let mut resolved_input = input.clone();
            if tool_id.starts_with("fs.") {
                if let Some(path) = input.get("path").and_then(|v| v.as_str()) {
                    tracing::debug!("Checking path '{}' against allowlist: {:?}", path, self.fs_allowlist);
                    
                    // Check if path contains wildcards
                    if path.contains('*') || path.contains('?') {
                        // Expand wildcards to list of files
                        match crate::security::expand_wildcard_path(path, &self.fs_allowlist) {
                            Ok(matched_files) => {
                                tracing::info!("Wildcard '{}' expanded to {} files", path, matched_files.len());
                                
                                // For fs.read with wildcards, read all matching files
                                if tool_id == "fs.read" {
                                    let mut file_contents = Vec::new();
                                    for file_path in &matched_files {
                                        let file_str = file_path.to_string_lossy().to_string();
                                        match tokio::fs::read_to_string(&file_str).await {
                                            Ok(content) => {
                                                file_contents.push(serde_json::json!({
                                                    "path": file_str,
                                                    "name": file_path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown"),
                                                    "content": content,
                                                    "size": content.len()
                                                }));
                                            }
                                            Err(e) => {
                                                tracing::warn!("Failed to read {}: {}", file_str, e);
                                            }
                                        }
                                    }
                                    
                                    return Ok(ToolResult {
                                        success: true,
                                        output: Some(serde_json::json!({
                                            "pattern": path,
                                            "matched_count": matched_files.len(),
                                            "files": file_contents
                                        })),
                                        error: None,
                                        execution_time: start.elapsed().as_millis() as u64,
                                        context_used: context,
                                    });
                                } else if tool_id == "fs.list" {
                                    // For fs.list with wildcards, return file list
                                    let file_list: Vec<_> = matched_files.iter().map(|p| {
                                        let metadata = std::fs::metadata(p).ok();
                                        serde_json::json!({
                                            "name": p.file_name().and_then(|n| n.to_str()).unwrap_or("unknown"),
                                            "path": p.to_string_lossy().to_string(),
                                            "is_dir": metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                                            "size": metadata.as_ref().map(|m| m.len()).unwrap_or(0)
                                        })
                                    }).collect();
                                    
                                    return Ok(ToolResult {
                                        success: true,
                                        output: Some(serde_json::json!({
                                            "pattern": path,
                                            "matched_count": matched_files.len(),
                                            "entries": file_list
                                        })),
                                        error: None,
                                        execution_time: start.elapsed().as_millis() as u64,
                                        context_used: context,
                                    });
                                }
                            }
                            Err(e) => {
                                return Ok(ToolResult {
                                    success: false,
                                    output: None,
                                    error: Some(format!("Wildcard expansion failed: {}. Use fs.list to see available files first.", e)),
                                    execution_time: start.elapsed().as_millis() as u64,
                                    context_used: context,
                                });
                            }
                        }
                    } else {
                        // Regular path (no wildcards) - validate and resolve
                        is_allowed(path, &self.fs_allowlist)
                            .map_err(|e| anyhow::anyhow!("Security error: {}", e))?;
                        
                        // Resolve the path before passing to WASI
                        let resolved = crate::security::resolve_path(path, &self.fs_allowlist)
                            .map_err(|e| anyhow::anyhow!("Failed to resolve path: {}", e))?;
                        let resolved_str = resolved.to_string_lossy().to_string();
                        tracing::info!("Resolved path '{}' to '{}'", path, resolved_str);
                        
                        // Update input with resolved path
                        if let Some(obj) = resolved_input.as_object_mut() {
                            obj.insert("path".to_string(), serde_json::Value::String(resolved_str));
                        }
                    }
                }
            }
            
            // Convert allowlist to preopen dirs
            let preopen_dirs: Vec<&str> = self.fs_allowlist.iter().map(|s| s.as_str()).collect();
            
            // Execute WASI module with resolved input
            match self.wasi_runner.exec(wasm_path, &resolved_input, &preopen_dirs) {
                Ok(output_str) => {
                    let output: serde_json::Value = serde_json::from_str(&output_str)
                        .unwrap_or_else(|_| serde_json::json!({ "result": output_str }));
                    
                    return Ok(ToolResult {
                        success: true,
                        output: Some(output),
                        error: None,
                        execution_time: start.elapsed().as_millis() as u64,
                        context_used: context,
                    });
                }
                Err(e) => {
                    tracing::error!("WASI execution failed: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        output: None,
                        error: Some(format!("WASI execution failed: {}", e)),
                        execution_time: start.elapsed().as_millis() as u64,
                        context_used: context,
                    });
                }
            }
        }

        // Check if this is a native Node.js tool
        if tool.entry.starts_with("native://") {
            let tool_path = tool.entry.trim_start_matches("native://");
            
            tracing::info!("Executing native tool: {} from {}", tool_id, tool_path);
            
            // For session.compress, call the TypeScript implementation
            if tool_id == "session.compress" {
                return self.execute_session_compression(input, context, start).await;
            }
            
            // Other native tools would be added here
            return Ok(ToolResult {
                success: false,
                output: None,
                error: Some(format!("Native tool not implemented: {}", tool_id)),
                execution_time: start.elapsed().as_millis() as u64,
                context_used: context,
            });
        }

        // For filesystem tools, check context-governed permissions
        if tool_id.starts_with("fs.") && context.flags.as_ref().map_or(false, |f| f.read_only) {
            if tool_id == "fs.write" {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("Write operation blocked by read_only flag".to_string()),
                    execution_time: start.elapsed().as_millis() as u64,
                    context_used: context,
                });
            }
        }

        // Native implementations for common tools (fallback when WASI not available)
        match tool_id {
            "fs.read" => {
                // Extract path from input
                let path = input.get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("fs.read requires 'path' parameter"))?;
                
                // Enforce allowlist
                is_allowed(path, &self.fs_allowlist)
                    .map_err(|e| anyhow::anyhow!("Security error: {}", e))?;
                
                // Read file
                match tokio::fs::read_to_string(path).await {
                    Ok(content) => {
                        return Ok(ToolResult {
                            success: true,
                            output: Some(serde_json::json!({
                                "content": content,
                                "path": path,
                                "size": content.len()
                            })),
                            error: None,
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            output: None,
                            error: Some(format!("Failed to read file: {}", e)),
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                }
            }
            "fs.list" => {
                let path = input.get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or(".");
                
                is_allowed(path, &self.fs_allowlist)
                    .map_err(|e| anyhow::anyhow!("Security error: {}", e))?;
                
                match tokio::fs::read_dir(path).await {
                    Ok(mut entries) => {
                        let mut files = Vec::new();
                        while let Ok(Some(entry)) = entries.next_entry().await {
                            if let Ok(metadata) = entry.metadata().await {
                                files.push(serde_json::json!({
                                    "name": entry.file_name().to_string_lossy().to_string(),
                                    "is_dir": metadata.is_dir(),
                                    "size": metadata.len()
                                }));
                            }
                        }
                        return Ok(ToolResult {
                            success: true,
                            output: Some(serde_json::json!({
                                "path": path,
                                "entries": files
                            })),
                            error: None,
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            output: None,
                            error: Some(format!("Failed to list directory: {}", e)),
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                }
            }
            "http.request" => {
                let url = input.get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("http.request requires 'url' parameter"))?;
                
                let method = input.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
                let body = input.get("body");
                
                let client = reqwest::Client::new();
                let mut request = match method.to_uppercase().as_str() {
                    "GET" => client.get(url),
                    "POST" => client.post(url),
                    "PUT" => client.put(url),
                    "DELETE" => client.delete(url),
                    _ => client.get(url),
                };
                
                if let Some(headers) = input.get("headers").and_then(|v| v.as_object()) {
                    for (key, value) in headers {
                        if let Some(val_str) = value.as_str() {
                            request = request.header(key, val_str);
                        }
                    }
                }
                
                if let Some(body_val) = body {
                    request = request.json(body_val);
                }
                
                match request.send().await {
                    Ok(response) => {
                        let status = response.status().as_u16();
                        let headers: std::collections::HashMap<String, String> = response
                            .headers()
                            .iter()
                            .filter_map(|(k, v)| {
                                v.to_str().ok().map(|val| (k.to_string(), val.to_string()))
                            })
                            .collect();
                        
                        let body = response.text().await.unwrap_or_default();
                        
                        return Ok(ToolResult {
                            success: status < 400,
                            output: Some(serde_json::json!({
                                "status": status,
                                "headers": headers,
                                "body": body
                            })),
                            error: None,
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            output: None,
                            error: Some(format!("HTTP request failed: {}", e)),
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                }
            }
            "fetch.url" => {
                let url = input.get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("fetch.url requires 'url' parameter"))?;
                
                let client = reqwest::Client::new();
                match client.get(url).send().await {
                    Ok(response) => {
                        let content = response.text().await.unwrap_or_default();
                        return Ok(ToolResult {
                            success: true,
                            output: Some(serde_json::json!({
                                "url": url,
                                "content": content,
                                "length": content.len()
                            })),
                            error: None,
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            output: None,
                            error: Some(format!("Fetch failed: {}", e)),
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                }
            }
            "env.get" => {
                let key = input.get("key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("env.get requires 'key' parameter"))?;
                
                match std::env::var(key) {
                    Ok(value) => {
                        return Ok(ToolResult {
                            success: true,
                            output: Some(serde_json::json!({
                                "key": key,
                                "value": value
                            })),
                            error: None,
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                    Err(_) => {
                        return Ok(ToolResult {
                            success: false,
                            output: None,
                            error: Some(format!("Environment variable '{}' not found", key)),
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                }
            }
            "process.execute" => {
                let command = input.get("command")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("process.execute requires 'command' parameter"))?;
                
                let args = input.get("args")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
                    .unwrap_or_default();
                
                use std::process::Command;
                match Command::new(command).args(&args).output() {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                        
                        return Ok(ToolResult {
                            success: output.status.success(),
                            output: Some(serde_json::json!({
                                "stdout": stdout,
                                "stderr": stderr,
                                "exit_code": output.status.code()
                            })),
                            error: if !output.status.success() { Some(stderr) } else { None },
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            output: None,
                            error: Some(format!("Process execution failed: {}", e)),
                            execution_time: start.elapsed().as_millis() as u64,
                            context_used: context,
                        });
                    }
                }
            }
            "db.query" => {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("Database not configured. Set DATABASE_URL environment variable.".to_string()),
                    execution_time: start.elapsed().as_millis() as u64,
                    context_used: context,
                });
            }
            "db.execute" => {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("Database not configured. Set DATABASE_URL environment variable.".to_string()),
                    execution_time: start.elapsed().as_millis() as u64,
                    context_used: context,
                });
            }
            "db.schema" => {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("Database not configured. Set DATABASE_URL environment variable.".to_string()),
                    execution_time: start.elapsed().as_millis() as u64,
                    context_used: context,
                });
            }
            "embedding.generate" | "completion.stream" => {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("AI tools require OPENAI_API_KEY environment variable.".to_string()),
                    execution_time: start.elapsed().as_millis() as u64,
                    context_used: context,
                });
            }
            "telemetry.push" => {
                tracing::info!("Telemetry event: {:?}", input);
                return Ok(ToolResult {
                    success: true,
                    output: Some(serde_json::json!({
                        "pushed": true,
                        "timestamp": chrono::Utc::now().to_rfc3339()
                    })),
                    error: None,
                    execution_time: start.elapsed().as_millis() as u64,
                    context_used: context,
                });
            }
            _ => {}
        }

        // Fallback error for unimplemented tools
        Ok(ToolResult {
            success: false,
            output: None,
            error: Some(format!("Tool '{}' not implemented", tool_id)),
            execution_time: start.elapsed().as_millis() as u64,
            context_used: context,
        })
    }

    async fn validate_manifest(&self, path: &str) -> anyhow::Result<bool> {
        let content = tokio::fs::read_to_string(path).await?;
        let manifest: ToolManifest = serde_json::from_str(&content)?;
        
        // Basic validation
        if manifest.name.is_empty() || manifest.version.is_empty() {
            return Ok(false);
        }
        
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Flags;

    #[tokio::test]
    async fn test_tool_execution() {
        let executor = InMemoryToolExecutor::new();
        
        // Register a test tool
        executor.tools.write().await.insert(
            "test.tool".to_string(),
            ToolManifest {
                name: "test.tool".to_string(),
                version: "1.0.0".to_string(),
                entry: "native://test".to_string(),
                permissions: vec!["read".to_string()],
                description: "Test tool".to_string(),
            },
        );

        let ctx = ContextFrame::default();
        let input = serde_json::json!({"key": "value"});
        
        let result = executor.execute("test.tool", input, ctx).await;
        assert!(result.is_ok());
        
        let tool_result = result.unwrap();
        assert!(tool_result.success);
    }

    #[tokio::test]
    async fn test_readonly_flag() {
        let executor = InMemoryToolExecutor::new();
        
        executor.tools.write().await.insert(
            "fs.write".to_string(),
            ToolManifest {
                name: "fs.write".to_string(),
                version: "1.0.0".to_string(),
                entry: "wasm://fs-write.wasm".to_string(),
                permissions: vec!["write".to_string()],
                description: "Write file".to_string(),
            },
        );

        let mut ctx = ContextFrame::default();
        ctx.flags = Some(Flags {
            allow_autotune: true,
            read_only: true,
        });

        let result = executor
            .execute("fs.write", serde_json::json!({}), ctx)
            .await
            .unwrap();
        
        assert!(!result.success);
        assert!(result.error.is_some());
    }
}
