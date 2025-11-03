use crate::types::{ContextFrame, ToolResult};
use crate::tool_wasi::WasiRunner;
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

/// In-memory tool executor (production would support WASI runtime)
pub struct InMemoryToolExecutor {
    tools: Arc<tokio::sync::RwLock<HashMap<String, ToolManifest>>>,
    wasi_runner: WasiRunner,
}

impl InMemoryToolExecutor {
    pub fn new() -> Self {
        Self {
            tools: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            wasi_runner: WasiRunner::new().expect("Failed to create WASI runner"),
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
            
            // Execute WASI module
            match self.wasi_runner.exec(wasm_path, &input) {
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

        // Simulate successful execution
        let output = serde_json::json!({
            "tool": tool_id,
            "input": input,
            "result": "success",
            "context_trace": context.reason_trace_id
        });

        Ok(ToolResult {
            success: true,
            output: Some(output),
            error: None,
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
