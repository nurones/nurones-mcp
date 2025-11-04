use anyhow::{bail, Result};
use path_absolutize::Absolutize;
use std::path::{Path, PathBuf};

/// Validates that a given file path is within the allowed filesystem directories
/// Supports both absolute paths and relative paths (resolved against base_dir if provided)
pub fn is_allowed(path: &str, allow_list: &[String]) -> Result<()> {
    is_allowed_with_base(path, allow_list, None)
}

/// Validates path with optional base directory for relative path resolution
pub fn is_allowed_with_base(path: &str, allow_list: &[String], base_dir: Option<&str>) -> Result<()> {
    tracing::info!("=== SECURITY CHECK: path='{}', allowlist={:?} ===", path, allow_list);
    
    // Try to resolve the path
    let abs = if path.starts_with('/') {
        // Absolute path - use as-is for now
        Path::new(path).absolutize()?.to_path_buf()
    } else if let Some(base) = base_dir {
        // Relative path with base_dir - resolve against base
        let base_path = Path::new(base);
        base_path.join(path).absolutize()?.to_path_buf()
    } else {
        // Relative path without base_dir - resolve against current dir
        Path::new(path).absolutize()?.to_path_buf()
    };
    
    tracing::info!("  Resolved to absolute path: '{}'", abs.display());
    
    // Collect all candidate paths to check
    let mut candidates = vec![];
    
    for base in allow_list {
        let base_abs = Path::new(base).absolutize()?.to_path_buf();
        tracing::info!("  Checking against base: '{}' (resolved: '{}')", base, base_abs.display());
        
        // Direct match: check if resolved path is under this base
        if abs.starts_with(&base_abs) {
            tracing::info!("  ✓ ALLOWED: Direct match!");
            return Ok(());
        }
        
        // Smart resolution: try to match path fragments
        // e.g., "/contracts/file.txt" with allowlist "/home/.../nurones-cide/contracts"
        if let Some(base_name) = base_abs.file_name().and_then(|n| n.to_str()) {
            tracing::info!("  Base filename: '{}'", base_name);
            // Check if the input path starts with "/<basename>/" or is exactly "/<basename>"
            let with_slash = format!("/{}/", base_name);
            tracing::info!("  Checking if '{}' starts with '{}'", path, with_slash);
            if let Some(after_base) = path.strip_prefix(&with_slash) {
                // Input is like "/contracts/subdir/file.txt"
                // Reconstruct as: /home/.../contracts + subdir/file.txt
                let candidate = base_abs.join(after_base);
                tracing::info!("  Candidate path: '{}'", candidate.display());
                candidates.push(candidate.display().to_string());
                
                if candidate.starts_with(&base_abs) {
                    tracing::info!("  ✓ ALLOWED: Smart resolution match!");
                    return Ok(());
                }
            } else if path == format!("/{}", base_name) {
                // Exact match: "/contracts" matches ".../contracts"
                tracing::info!("  ✓ ALLOWED: Exact base match!");
                return Ok(());
            }
        }
    }
    
    tracing::error!("  ✗ DENIED: No match found");
    bail!(
        "Security error: Path '{}' not in filesystem allowlist. Allowed: {:?}",
        path,
        allow_list
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allowed_path() {
        let allowlist = vec!["/workspace".to_string(), "/tmp".to_string()];
        assert!(is_allowed("/workspace/file.txt", &allowlist).is_ok());
        assert!(is_allowed("/tmp/test", &allowlist).is_ok());
    }

    #[test]
    fn test_blocked_path() {
        let allowlist = vec!["/workspace".to_string()];
        assert!(is_allowed("/etc/passwd", &allowlist).is_err());
        assert!(is_allowed("/home/user/.ssh/id_rsa", &allowlist).is_err());
    }
    
    #[test]
    fn test_relative_path_resolution() {
        let allowlist = vec!["/home/user/nurones-cide/contracts".to_string()];
        // Should resolve /contracts/... to /home/user/nurones-cide/contracts/...
        assert!(is_allowed("/contracts/COIDE-001/file.txt", &allowlist).is_ok());
    }
}
