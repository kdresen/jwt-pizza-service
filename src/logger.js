const config = require("./config.js");

class Logger {
  constructor() {
    this.config = config.logging;
  }

  // Convert HTTP status codes into log levels
  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return "error";
    if (statusCode >= 400) return "warn";
    return "info";
  }

  // Generate a timestamp in nanoseconds
  nowString() {
    return (BigInt(Date.now()) * 1000000n).toString();
  }

  // Remove sensitive information from log objects
  sanitize(data) {
    const sensitiveFields = new Set([
      "password",
      "token",
      "authorization",
      "apikey",
      "secret",
      "jwt",
      "cookie",
      "set-cookie",
    ]);

    const seen = new WeakSet();

    return JSON.stringify(data, (key, value) => {
      if (sensitiveFields.has(key.toLowerCase())) {
        return "[REDACTED]";
      }

      if (value && typeof value === "object") {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }

      return value;
    });
  }

  // Send a log entry to Grafana Loki
  async sendLogToGrafana(event) {
    if (!this.config?.endpointUrl || !this.config?.apiKey) {
      console.error("Grafana logging is not configured");
      return;
    }

    try {
      const response = await fetch(this.config.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accountId}:${this.config.apiKey}`,
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        console.error(`Failed to send log to Grafana: ${response.status}`);
      }
    } catch (error) {
      console.error("Grafana logging error:", error.message);
    }
  }

  // General-purpose logging function
  log(level, type, data) {
    try {
      const event = {
        streams: [
          {
            stream: {
              component: this.config.source,
              level,
              type,
            },
            values: [[this.nowString(), this.sanitize(data)]],
          },
        ],
      };

      // Do not block application requests while sending logs
      void this.sendLogToGrafana(event);
    } catch (error) {
      console.error("Failed to construct log:", error.message);
    }
  }

  httpLogger = (req, res, next) => {
    const start = performance.now();

    // Capture the response body
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let responseBody;

    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };

    res.send = (body) => {
      if (responseBody === undefined) {
        responseBody = body;
      }
      return originalSend(body);
    };

    res.on("finish", () => {
      const logData = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        authorized: !!req.headers.authorization,
        userId: req.user?.id ?? null,
        requestBody: req.body,
        responseBody,
        latencyMs: performance.now() - start,
      };

      this.log(this.statusToLogLevel(res.statusCode), "http", logData);
    });

    next();
  };
}

module.exports = new Logger();
