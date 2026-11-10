const {
  requestTracker,
  httpMetrics,
  getSystemMetrics,
  pizzaPurchase,
  purchaseMetrics,
  startMetricsExporter,
} = require("./metrics");

function resetMetrics() {
  httpMetrics.requestCount = 0;
  httpMetrics.totalLatency = 0;
  httpMetrics.statusCodes = {};
  httpMetrics.methods = {};
  httpMetrics.endpoints = {};

  purchaseMetrics.successfulPurchases = 0;
  purchaseMetrics.failedPurchases = 0;
  purchaseMetrics.totalPizzas = 0;
  purchaseMetrics.totalRevenue = 0;
  purchaseMetrics.totalLatency = 0;
}

beforeEach(() => {
  resetMetrics();
});

test("tracks a completed request by status, method, and route", () => {
  const finishHandlers = [];
  const req = {
    method: "GET",
    baseUrl: "/api/order",
    route: { path: "/menu" },
    path: "/menu",
    originalUrl: "/api/order/menu?page=2",
  };
  const res = {
    statusCode: 200,
    on: jest.fn((event, handler) => {
      if (event === "finish") finishHandlers.push(handler);
    }),
  };
  const next = jest.fn();

  requestTracker(req, res, next);
  finishHandlers[0]();

  expect(next).toHaveBeenCalledTimes(1);
  expect(httpMetrics.requestCount).toBe(1);
  expect(httpMetrics.statusCodes).toEqual({ 200: 1 });
  expect(httpMetrics.methods).toEqual({ GET: 1 });
  expect(httpMetrics.endpoints).toEqual({ "/api/order/menu": 1 });
  expect(httpMetrics.totalLatency).toEqual(expect.any(Number));
  expect(httpMetrics.totalLatency).toBeGreaterThanOrEqual(0);
});

test("uses the request URL when a route is unavailable", () => {
  const finishHandlers = [];
  const req = {
    method: "POST",
    originalUrl: "/api/auth/login?redirect=/",
    path: "/api/auth/login",
  };
  const res = {
    statusCode: 401,
    on: jest.fn((event, handler) => finishHandlers.push(handler)),
  };

  requestTracker(req, res, jest.fn());
  finishHandlers[0]();

  expect(httpMetrics.statusCodes).toEqual({ 401: 1 });
  expect(httpMetrics.methods).toEqual({ POST: 1 });
  expect(httpMetrics.endpoints).toEqual({ "/api/auth/login": 1 });
});

test("tracks successful and failed pizza purchases", () => {
  pizzaPurchase(true, 125, 24.5, 2);
  pizzaPurchase(false, 80, 18, 1);

  expect(purchaseMetrics).toEqual({
    successfulPurchases: 1,
    failedPurchases: 1,
    totalPizzas: 2,
    totalRevenue: 24.5,
    totalLatency: 205,
  });
});

test("returns numeric CPU and memory system metrics", () => {
  const metrics = getSystemMetrics();

  expect(metrics).toEqual({
    cpuUsage: expect.any(Number),
    memoryUsage: expect.any(Number),
  });
  expect(metrics.cpuUsage).toBeGreaterThanOrEqual(0);
  expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0);
  expect(metrics.memoryUsage).toBeLessThanOrEqual(100);
});

test("does not start the exporter when Grafana configuration is missing", () => {
  const originalMetricsConfig = require("./config").metrics;
  require("./config").metrics = undefined;

  expect(startMetricsExporter()).toBeUndefined();

  require("./config").metrics = originalMetricsConfig;
});
