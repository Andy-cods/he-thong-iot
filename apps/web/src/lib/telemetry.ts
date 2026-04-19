/**
 * V1.4 Phase E — OpenTelemetry SDK init.
 *
 * File này được lazy-import từ `instrumentation.ts` (Next.js 14 hook) chỉ
 * khi `NEXT_RUNTIME === "nodejs"`. Dependency nặng (auto-instrumentations)
 * KHÔNG vào Edge bundle.
 *
 * Hành vi:
 *  - Nếu `OTEL_EXPORTER_OTLP_ENDPOINT` trống → skip init, log warn.
 *  - Nếu có endpoint + token → start NodeSDK push OTLP/HTTP tới Grafana
 *    Cloud (hoặc bất kỳ OTLP collector nào) mỗi 15s.
 *  - Auto-instrumentations: HTTP, pg (Postgres), Pino. `fs` tắt vì noisy.
 *
 * Custom metrics được khai báo trong `metrics.ts` — meter global,
 * an toàn gọi trước khi SDK start (OTel no-op meter fallback).
 */
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { env } from "./env";

let sdk: NodeSDK | null = null;
let started = false;

/**
 * Parse env `OTEL_EXPORTER_OTLP_HEADERS` kiểu "k1=v1,k2=v2" + fallback
 * `GRAFANA_CLOUD_TOKEN` (Basic auth).
 */
function resolveHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.OTEL.headers) {
    for (const pair of env.OTEL.headers.split(",")) {
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k) headers[k] = v;
    }
  }
  if (env.OTEL.token && !headers.authorization && !headers.Authorization) {
    headers.authorization = `Basic ${env.OTEL.token}`;
  }
  return headers;
}

export function startTelemetry(): void {
  if (started) return;
  started = true;

  if (!env.OTEL.endpoint) {
    // eslint-disable-next-line no-console
    console.warn(
      "[telemetry] OTEL_EXPORTER_OTLP_ENDPOINT trống → telemetry disabled (dev mode)",
    );
    return;
  }

  if (process.env.OTEL_DEBUG === "1") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const headers = resolveHeaders();
  const base = env.OTEL.endpoint.replace(/\/+$/, "");

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: env.OTEL.serviceName,
    [ATTR_SERVICE_VERSION]:
      process.env.NEXT_PUBLIC_BUILD_VERSION ?? "0.1.0",
    "deployment.environment": env.NODE_ENV,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${base}/v1/traces`,
      headers,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${base}/v1/metrics`,
        headers,
      }),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // noisy + làm chậm cold start
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Next.js tự handle HTTP route — auto instrumentation vẫn lấy span gốc
        "@opentelemetry/instrumentation-net": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    // eslint-disable-next-line no-console
    console.log(
      `[telemetry] OTLP SDK started → ${base} (service=${env.OTEL.serviceName})`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[telemetry] SDK start failed", err);
  }

  const shutdown = async (signal: string) => {
    if (!sdk) return;
    // eslint-disable-next-line no-console
    console.log(`[telemetry] flushing OTLP before exit (${signal})`);
    try {
      await sdk.shutdown();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[telemetry] shutdown error", err);
    }
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
