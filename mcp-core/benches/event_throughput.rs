use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use nurones_mcp::*;
use tokio::runtime::Runtime;

fn benchmark_event_publish(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let bus = event_bus::InMemoryEventBus::new();

    let mut group = c.benchmark_group("event_publish");
    group.throughput(Throughput::Elements(1));

    group.bench_function("single_event", |b| {
        b.to_async(&rt).iter(|| async {
            let event = event_bus::Event {
                stream_id: "bench-stream".to_string(),
                event_type: "bench.event".to_string(),
                data: serde_json::json!({"key": "value"}),
                metadata: types::EventMetadata {
                    correlation_id: format!("bench-{}", uuid::Uuid::new_v4()),
                    causation_id: None,
                    user_id: None,
                },
                context: types::ContextFrame::default(),
            };
            
            black_box(bus.publish(event).await.unwrap());
        });
    });

    group.finish();
}

criterion_group!(benches, benchmark_event_publish);
criterion_main!(benches);
