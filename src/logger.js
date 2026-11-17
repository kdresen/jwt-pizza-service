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
    const sensitiveKey =
      /password|passwd|secret|token|authorization|api.?key|cookie|credential|jwt|session|email|reporturl|followlink/i;

    const seen = new WeakSet();

    const redactString = (value) => {
      // Remove bearer tokens embedded in strings.
      let result = value.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");

      // Avoid logging URL query parameters, which may contain secrets.
      result = result.replace(
        /https?:\/\/[^\s"'<>]+/gi,
        (url) => url.split("?")[0].split("#")[0],
      );

      return result;
    };

    return JSON.stringify(data, (key, value) => {
      if (sensitiveKey.test(key)) {
        return "[REDACTED]";
      }

      if (typeof value === "string") {
        return redactString(value);
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
      console.error("Grafana logging request failed");
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
      console.error("Failed to construct log");
    }
  }

  httpLogger = (req, res, next) => {
    const start = performance.now();

    const originalSend = res.send;
    let responseBody;

    res.send = function (body) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.on("finish", () => {
      const path = req.path;

      // Only record bodies for endpoints we've reviewed.
      const safeBodyPaths = new Set(["/"]);

      const allowBody = safeBodyPaths.has(path);

      let safeResponseBody = "[OMITTED]";

      if (allowBody && responseBody !== undefined) {
        try {
          safeResponseBody =
            typeof responseBody === "string"
              ? JSON.parse(responseBody)
              : responseBody;
        } catch {
          safeResponseBody = "[NON-JSON RESPONSE OMITTED]";
        }
      }

      this.log(this.statusToLogLevel(res.statusCode), "http", {
        method: req.method,
        path,
        statusCode: res.statusCode,
        authorized: Boolean(req.headers.authorization),
        userId: req.user?.id ?? null,
        requestBody: allowBody ? (req.body ?? null) : "[OMITTED]",
        responseBody: safeResponseBody,
        latencyMs: performance.now() - start,
      });
    });

    next();
  };
}

module.exports = new Logger();
