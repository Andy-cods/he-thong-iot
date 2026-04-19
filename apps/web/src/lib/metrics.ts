/**
 * V1.4 Phase E — Custom application metrics.
 *
 * Dùng OTel `@opentelemetry/api` meter toàn cục. Nếu SDK chưa start
 * (telemetry disabled), meter là no-op — mọi .add()/.record() silently
 * discard → safe gọi từ mọi nơi không cần guard ENV.
 *
 * Metric chuẩn:
 *  - iot_login_total{result=success|fail}          Counter
 *  - iot_api_error_total{route, status}            Counter
 *  - iot_bom_explode_duration_seconds              Histogram
 *  - iot_receiving_scan_total{qc_status}           Counter
 *  - iot_bullmq_queue_depth{queue}                 ObservableGauge
 */
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("iot-web", "1.4.0");

export const loginCounter = meter.createCounter("iot_login_total", {
  description: "Số lần login chia theo result (success/fail/locked/invalid)",
});

export const apiErrorCounter = meter.createCounter("iot_api_error_total", {
  description: "Số lần API trả 5xx hoặc 4xx non-validation (bug / throttle)",
});

export const receivingScanCounter = meter.createCounter(
  "iot_receiving_scan_total",
  {
    description: "Số scan receiving xử lý (phân biệt QC status)",
  },
);

export const bomExplodeHistogram = meter.createHistogram(
  "iot_bom_explode_duration_seconds",
  {
    description: "Thời gian explodeSnapshot() (1 revision → N snapshot line)",
    unit: "s",
  },
);

/**
 * ObservableGauge: callback được OTel gọi mỗi lần push (15s). Worker
 * side gọi `registerQueueDepthGauge(fn)` 1 lần; fn trả snapshot realtime.
 */
type QueueDepthSnapshot = Record<string, number>;
let queueDepthProvider: (() => Promise<QueueDepthSnapshot> | QueueDepthSnapshot) | null = null;

const queueDepthGauge = meter.createObservableGauge("iot_bullmq_queue_depth", {
  description: "Waiting + active + delayed job count cho mỗi BullMQ queue",
});
queueDepthGauge.addCallback(async (observer) => {
  if (!queueDepthProvider) return;
  try {
    const snapshot = await queueDepthProvider();
    for (const [queue, count] of Object.entries(snapshot)) {
      observer.observe(count, { queue });
    }
  } catch {
    // nuốt lỗi — metric push không được phá main loop
  }
});

export function registerQueueDepthProvider(
  fn: () => Promise<QueueDepthSnapshot> | QueueDepthSnapshot,
): void {
  queueDepthProvider = fn;
}
