/**
 * V1.4 Phase E — Worker telemetry.
 *
 * Lazy init NodeSDK nếu OTEL_EXPORTER_OTLP_ENDPOINT có giá trị. Khác
 * với apps/web, worker là Node.js process thuần → không cần Next.js
 * instrumentation hook.
 *
 * Tách file riêng (không import từ apps/web) để tránh phụ thuộc chéo.
 */
import type { Queue } from "bullmq";
import { metrics } from "@opentelemetry/api";

let started = false;

function parseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "";
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) headers[k] = v;
  }
  const token = process.env.GRAFANA_CLOUD_TOKEN;
  if (token && !headers.authorization && !headers.Authorization) {
    headers.authorization = `Basic ${token}`;
  }
  return headers;
}

export async function startWorkerTelemetry(): Promise<void> {
  if (started) return;
  started = true;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // eslint-disable-next-line no-console
    console.warn(
      "[worker-telemetry] OTEL_EXPORTER_OTLP_ENDPOINT trống → telemetry disabled",
    );
    return;
  }

  // Lazy import để khi ENV disabled, worker container không phải load
  // auto-instrumentations ~40MB.
  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { PeriodicExportingMetricReader },
    { getNodeAutoInstrumentations },
    { resourceFromAttributes },
    { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/exporter-metrics-otlp-http"),
    import("@opentelemetry/sdk-metrics"),
    import("@opentelemetry/auto-instrumentations-node"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/semantic-conventions"),
  ]);

  const base = endpoint.replace(/\/+$/, "");
  const headers = parseHeaders();

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "iot-worker",
      [ATTR_SERVICE_VERSION]: "0.1.0",
      "deployment.environment": process.env.NODE_ENV ?? "production",
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${base}/v1/traces`,
      headers,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${base}/v1/metrics`,
        headers,
      }),
      exportIntervalMillis: 10_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });

  sdk.start();
  // eslint-disable-next-line no-console
  console.log(`[worker-telemetry] OTLP SDK started → ${base}`);

  const shutdown = async () => {
    try {
      await sdk.shutdown();
    } catch {
      // ignore
    }
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

/**
 * Đăng ký observable gauge depth per queue. Gọi sau khi khởi tạo tất
 * cả Worker/Queue instance (10s push interval).
 */
export function registerQueueDepthGauge(
  queues: Record<string, Queue>,
): void {
  const meter = metrics.getMeter("iot-worker", "1.4.0");
  const gauge = meter.createObservableGauge("iot_bullmq_queue_depth", {
    description: "BullMQ queue depth (waiting + active + delayed)",
  });
  gauge.addCallback(async (observer) => {
    for (const [name, queue] of Object.entries(queues)) {
      try {
        const counts = await queue.getJobCounts(
          "waiting",
          "active",
          "delayed",
          "failed",
        );
        const total =
          (counts.waiting ?? 0) +
          (counts.active ?? 0) +
          (counts.delayed ?? 0);
        observer.observe(total, { queue: name });
      } catch {
        // queue có thể chưa ready — bỏ qua lần này
      }
    }
  });
}
