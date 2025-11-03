// @nurones/mcp v0.5 — Core library exports

pub mod types;
pub mod config;
pub mod context;
pub mod event_bus;
pub mod tool_executor;
pub mod tool_wasi;
pub mod observability;
pub mod contracts;

pub use types::*;
pub use config::*;
pub use context::*;

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert_eq!(VERSION, "0.5.0");
    }
}
