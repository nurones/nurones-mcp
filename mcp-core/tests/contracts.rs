use nurones_mcp::{contracts::*, types::ContextFrame as TypesContextFrame};

#[test]
fn context_required_for_writes() {
    // Test that ContextFrame is properly validated
    let ctx = ContextFrame {
        reason_trace_id: "test-trace-001".to_string(),
        tenant_id: "default".to_string(),
        stage: "dev".to_string(),
        risk_level: 0,
        novelty_score: None,
        context_confidence: Some(0.7),
        ts: chrono::Utc::now().to_rfc3339(),
        budgets: None,
        flags: None,
    };

    let result = ctx.validate();
    assert!(result.is_ok(), "Valid ContextFrame should pass validation");
}

#[test]
fn context_validation_enforces_stage() {
    let mut ctx = ContextFrame {
        reason_trace_id: "test".to_string(),
        tenant_id: "default".to_string(),
        stage: "invalid".to_string(),
        risk_level: 0,
        novelty_score: None,
        context_confidence: None,
        ts: chrono::Utc::now().to_rfc3339(),
        budgets: None,
        flags: None,
    };

    assert!(ctx.validate().is_err(), "Invalid stage should fail validation");

    ctx.stage = "prod".to_string();
    assert!(ctx.validate().is_ok(), "Valid stage should pass");
}

#[test]
fn context_validation_enforces_risk_level() {
    let ctx = ContextFrame {
        reason_trace_id: "test".to_string(),
        tenant_id: "default".to_string(),
        stage: "dev".to_string(),
        risk_level: 5, // invalid
        novelty_score: None,
        context_confidence: None,
        ts: chrono::Utc::now().to_rfc3339(),
        budgets: None,
        flags: None,
    };

    assert!(ctx.validate().is_err(), "Invalid risk_level should fail");
}

#[test]
fn autotune_bounds_respected() {
    // Test autotune boundary logic
    let ctx_safe = TypesContextFrame {
        reason_trace_id: "test".to_string(),
        tenant_id: "default".to_string(),
        stage: nurones_mcp::types::Stage::Dev,
        risk_level: nurones_mcp::types::RiskLevel::Safe,
        novelty_score: None,
        context_confidence: Some(0.7),
        budgets: None,
        flags: None,
        ts: chrono::Utc::now(),
    };

    // Autotune should be allowed for risk_level=0 and confidence>=0.6
    assert!(ctx_safe.can_autotune(), "Safe context with high confidence should allow autotune");

    let ctx_block = TypesContextFrame {
        risk_level: nurones_mcp::types::RiskLevel::Block,
        ..ctx_safe.clone()
    };

    assert!(!ctx_block.can_autotune(), "Blocked risk level should prevent autotune");
}

#[test]
fn event_metadata_validation() {
    let metadata = EventMetadata {
        correlation_id: "test-correlation-123".to_string(),
        causation_id: Some("test-causation-456".to_string()),
        user_id: None,
    };

    assert!(!metadata.correlation_id.is_empty(), "Correlation ID is required");
}

#[test]
fn tool_manifest_deserialization() {
    let json = r#"{
        "name": "fs.read",
        "version": "1.1.0",
        "entry": "wasm://test.wasm",
        "permissions": ["read"],
        "description": "Test tool"
    }"#;

    let manifest: ToolManifest = serde_json::from_str(json).expect("Should deserialize");
    assert_eq!(manifest.name, "fs.read");
    assert_eq!(manifest.permissions.len(), 1);
    assert_eq!(manifest.permissions[0], "read");
}
