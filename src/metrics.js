const config = require("./config");
const os = require("os");
const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");

const { resourceFromAttributes } = require("@opentelemetry/resources");

const {
  OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-http");

const httpMetrics = {
  requestCount: 0,
  totalLatency: 0,
  statusCodes: {},
  methods: {},
  endpoints: {},
};

function requestTracker(req, res, next) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (instruments) {
      const attributes = {
        method: req.method,
        status_code: String(res.statusCode),
        endpoint: req.route?.path
          ? `${req.baseUrl}${req.route.path}`
          : req.originalUrl.split("?")[0],
      };

      instruments.httpRequests.add(1, attributes);
      instruments.httpLatency.record(durationMs, attributes);
    }
    httpMetrics.requestCount++;
    httpMetrics.totalLatency += durationMs;

    const status = res.statusCode;
    httpMetrics.statusCodes[status] =
      (httpMetrics.statusCodes[status] || 0) + 1;

    const method = req.method;
    httpMetrics.methods[method] = (httpMetrics.methods[method] || 0) + 1;

    const endpoint = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.path;

    httpMetrics.endpoints[endpoint] =
      (httpMetrics.endpoints[endpoint] || 0) + 1;
  });

  next();
}

let previousCpuUsage = process.cpuUsage();
let previousCpuTime = process.hrtime.bigint();

function getCpuUsagePercentage() {
  const currentCpuTime = process.hrtime.bigint();

  const elapsedMicroseconds = Number(currentCpuTime - previousCpuTime) / 1000;

  const cpuDifference = process.cpuUsage(previousCpuUsage);

  previousCpuUsage = process.cpuUsage();
  previousCpuTime = currentCpuTime;

  const cpuMicroseconds = cpuDifference.user + cpuDifference.system;

  if (elapsedMicroseconds <= 0) return 0;

  return Number(((cpuMicroseconds / elapsedMicroseconds) * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

  return Number((((totalMemory - freeMemory) / totalMemory) * 100).toFixed(2));
}

function getSystemMetrics() {
  return {
    cpuUsage: getCpuUsagePercentage(),
    memoryUsage: getMemoryUsagePercentage(),
  };
}

const purchaseMetrics = {
  successfulPurchases: 0,
  failedPurchases: 0,
  totalPizzas: 0,
  totalRevenue: 0,
  totalLatency: 0,
};

function pizzaPurchase(success, latency, price, quantity) {
  if (success) {
    purchaseMetrics.successfulPurchases++;
    purchaseMetrics.totalPizzas += quantity;
    purchaseMetrics.totalRevenue += price;
  } else {
    purchaseMetrics.failedPurchases++;
  }

  purchaseMetrics.totalLatency += latency;
  if (instruments) {
    instruments.purchases.add(1, {
      status: success ? "success" : "failure",
    });

    instruments.purchaseLatency.record(latency);

    if (success) {
      instruments.pizzasSold.add(quantity);
      instruments.revenue.add(price);
    }
  }
}

let instruments = null;

function startMetricsExporter() {
  if (
    !config.metrics?.endpointUrl ||
    !config.metrics?.apiKey ||
    !config.metrics?.accountId
  ) {
    console.log("Grafana metrics configuration missing");
    return;
  }

  const endpoint = config.metrics.endpointUrl.replace(/\/$/, "");

  const exporter = new OTLPMetricExporter({
    url: endpoint.endsWith("/v1/metrics") ? endpoint : `${endpoint}/v1/metrics`,

    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${config.metrics.accountId}:${config.metrics.apiKey}`,
        ).toString("base64"),
    },
  });

  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 15000,
  });

  const provider = new MeterProvider({
    resource: resourceFromAttributes({
      "service.name": "jwt-pizza-service",
    }),
    readers: [reader],
  });

  const meter = provider.getMeter("jwt-pizza-service");
  instruments = {
    httpRequests: meter.createCounter("http_requests_total", {
      description: "Total HTTP requests",
    }),

    httpLatency: meter.createHistogram("http_request_duration_ms", {
      description: "HTTP request duration",
      unit: "ms",
    }),

    purchases: meter.createCounter("pizza_purchases_total", {
      description: "Total pizza purchase attempts",
    }),

    pizzasSold: meter.createCounter("pizza_sold_total", {
      description: "Total pizzas sold",
    }),

    revenue: meter.createCounter("pizza_revenue_total", {
      description: "Total pizza revenue",
    }),

    purchaseLatency: meter.createHistogram("pizza_purchase_duration_ms", {
      description: "Pizza purchase duration",
      unit: "ms",
    }),
    authAttempts: meter.createCounter("auth_attempts_total", {
      description: "Total authentication attempts",
    }),
    userRegistrations: meter.createCounter("user_registrations_total", {
      description: "Total successful user registrations",
    }),
    activeUserRequests: meter.createCounter("active_user_requests_total", {
      description: "Authenticated API requests by user",
    }),
  };

  const cpuGauge = meter.createObservableGauge("system_cpu_usage_percent", {
    description: "Node.js process CPU utilization",
    unit: "%",
  });

  const memoryGauge = meter.createObservableGauge(
    "system_memory_usage_percent",
    {
      description: "System memory utilization",
      unit: "%",
    },
  );

  cpuGauge.addCallback((result) => {
    result.observe(getCpuUsagePercentage());
  });

  memoryGauge.addCallback((result) => {
    result.observe(getMemoryUsagePercentage());
  });

  console.log("Grafana metrics exporter initialized");

  return { provider, meter };
}

function recordAuthAttempt(success) {
  if (instruments) {
    instruments.authAttempts.add(1, {
      status: success ? "success" : "failure",
    });
  }
}
function trackActiveUser(userId) {
  if (instruments && userId != null) {
    instruments.activeUserRequests.add(1, {
      user_id: String(userId),
    });
  }
}

function recordUserRegistration() {
  if (instruments) {
    instruments.userRegistrations.add(1);
  }
}

module.exports = {
  requestTracker,
  httpMetrics,
  getSystemMetrics,
  pizzaPurchase,
  purchaseMetrics,
  startMetricsExporter,
  recordAuthAttempt,
  recordUserRegistration,
  trackActiveUser,
};
