const logger = require("./logger.js");

describe("Logger sanitization", () => {
  test("redacts sensitive fields", () => {
    const input = {
      userId: 4,
      password: "secret123",
      jwt: "abc123",
      accessToken: "private-token",
      email: "test@example.com",
      nested: {
        apiKey: "my-api-key",
      },
    };

    const result = JSON.parse(logger.sanitize(input));

    expect(result).toEqual({
      userId: 4,
      password: "[REDACTED]",
      jwt: "[REDACTED]",
      accessToken: "[REDACTED]",
      email: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
      },
    });
  });

  test("redacts bearer tokens in strings", () => {
    const result = JSON.parse(
      logger.sanitize({
        message: "Authorization: Bearer abc123",
      }),
    );

    expect(result.message).not.toContain("abc123");
  });

  test("removes query strings from URLs", () => {
    const result = JSON.parse(
      logger.sanitize({
        url: "https://example.com/report?token=abc123",
      }),
    );

    expect(result.url).toBe("https://example.com/report");
  });

  test("does not modify the original object", () => {
    const input = {
      password: "secret123",
    };

    logger.sanitize(input);

    expect(input.password).toBe("secret123");
  });
});
