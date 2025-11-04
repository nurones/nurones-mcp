use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Policies {
    pub roles: HashMap<String, Vec<String>>,
    pub users: HashMap<String, String>,
    pub fs_allowlist: Vec<String>,
}

impl Default for Policies {
    fn default() -> Self {
        let mut roles = HashMap::new();
        roles.insert("admin".to_string(), vec!["*".to_string()]);
        roles.insert("operator".to_string(), vec!["fs.read".to_string(), "fs.list".to_string()]);
        roles.insert("reader".to_string(), vec!["fs.read".to_string()]);

        let mut users = HashMap::new();
        users.insert("local:dev".to_string(), "admin".to_string());
        users.insert("guest".to_string(), "reader".to_string());

        Self {
            roles,
            users,
            fs_allowlist: vec!["/workspace".to_string(), "/tmp".to_string()],
        }
    }
}

impl Policies {
    /// Load policies from JSON file
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read policies from {:?}", path.as_ref()))?;
        
        let policies: Self = serde_json::from_str(&content)
            .with_context(|| "Failed to parse policies JSON")?;
        
        tracing::info!("Loaded policies from {:?}", path.as_ref());
        Ok(policies)
    }

    /// Save policies to JSON file
    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let content = serde_json::to_string_pretty(self)
            .with_context(|| "Failed to serialize policies")?;
        
        fs::write(&path, content)
            .with_context(|| format!("Failed to write policies to {:?}", path.as_ref()))?;
        
        tracing::info!("Saved policies to {:?}", path.as_ref());
        Ok(())
    }

    /// Check if a user is allowed to execute a specific tool
    pub fn is_tool_allowed(&self, user: &str, tool: &str) -> bool {
        // Get user's role
        let role = match self.users.get(user) {
            Some(r) => r,
            None => {
                tracing::warn!("User '{}' not found in policies, denying access", user);
                return false;
            }
        };

        // Get role's allowed tools
        let allowed_tools = match self.roles.get(role) {
            Some(t) => t,
            None => {
                tracing::warn!("Role '{}' not found in policies, denying access", role);
                return false;
            }
        };

        // Check if tool is allowed (supports wildcard)
        if allowed_tools.contains(&"*".to_string()) {
            return true;
        }

        if allowed_tools.contains(&tool.to_string()) {
            return true;
        }

        // Check prefix matching (e.g., "fs.*" allows all fs tools)
        for allowed in allowed_tools {
            if allowed.ends_with(".*") {
                let prefix = allowed.trim_end_matches(".*");
                if tool.starts_with(prefix) {
                    return true;
                }
            }
        }

        tracing::warn!(
            "User '{}' (role: '{}') not allowed to execute tool '{}'",
            user, role, tool
        );
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_permission() {
        let policies = Policies::default();

        // Admin can do everything
        assert!(policies.is_tool_allowed("local:dev", "fs.read"));
        assert!(policies.is_tool_allowed("local:dev", "fs.write"));
        assert!(policies.is_tool_allowed("local:dev", "db.query"));

        // Reader can only read
        assert!(policies.is_tool_allowed("guest", "fs.read"));
        assert!(!policies.is_tool_allowed("guest", "fs.write"));
    }

    #[test]
    fn test_unknown_user() {
        let policies = Policies::default();
        assert!(!policies.is_tool_allowed("unknown", "fs.read"));
    }
}
