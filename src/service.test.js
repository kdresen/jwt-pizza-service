const request = require("supertest");

const mockSetAuthUser = jest.fn((req, res, next) => next());

jest.mock("./routes/authRouter.js", () => {
  const express = require("express");
  const router = express.Router();
  router.docs = [{ path: "/auth" }];
  router.get("/", (req, res) => res.json({ router: "auth" }));
  router.get("/error", () => {
    const error = new Error("test failure");
    error.statusCode = 418;
    throw error;
  });
  return { authRouter: router, setAuthUser: mockSetAuthUser };
});

jest.mock("./routes/userRouter.js", () => {
  const express = require("express");
  const router = express.Router();
  router.docs = [{ path: "/user" }];
  router.get("/", (req, res) => res.json({ router: "user" }));
  return router;
});

jest.mock("./routes/orderRouter.js", () => {
  const express = require("express");
  const router = express.Router();
  router.docs = [{ path: "/order" }];
  router.get("/", (req, res) => res.json({ router: "order" }));
  return router;
});

jest.mock("./routes/franchiseRouter.js", () => {
  const express = require("express");
  const router = express.Router();
  router.docs = [{ path: "/franchise" }];
  router.get("/", (req, res) => res.json({ router: "franchise" }));
  return router;
});

const app = require("./service");

test("returns the welcome message", async () => {
  const response = await request(app).get("/");

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    message: "welcome to JWT Pizza",
    version: expect.any(String),
  });
});

test("sets CORS headers and runs the authentication middleware", async () => {
  const response = await request(app)
    .get("/")
    .set("Origin", "https://example.com");

  expect(response.headers["access-control-allow-origin"]).toBe(
    "https://example.com",
  );
  expect(response.headers["access-control-allow-methods"]).toBe(
    "GET, POST, PUT, DELETE",
  );
  expect(response.headers["access-control-allow-headers"]).toBe(
    "Content-Type, Authorization",
  );
  expect(response.headers["access-control-allow-credentials"]).toBe("true");
  expect(mockSetAuthUser).toHaveBeenCalled();
});

test("returns API documentation", async () => {
  const response = await request(app).get("/api/docs");

  expect(response.status).toBe(200);
  expect(response.body.endpoints).toEqual([
    { path: "/auth" },
    { path: "/user" },
    { path: "/order" },
    { path: "/franchise" },
  ]);
  expect(response.body.config).toEqual({
    factory: "https://pizza-factory.cs329.click",
    db: "127.0.0.1",
  });
});

test.each([
  ["auth", "/api/auth"],
  ["user", "/api/user"],
  ["order", "/api/order"],
  ["franchise", "/api/franchise"],
])("mounts the %s router", async (router, path) => {
  const response = await request(app).get(path);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ router });
});

test("returns a 404 response for an unknown endpoint", async () => {
  const response = await request(app).get("/does-not-exist");

  expect(response.status).toBe(404);
  expect(response.body).toEqual({ message: "unknown endpoint" });
});

test("uses the error status code and message in the error handler", async () => {
  const response = await request(app).get("/api/auth/error");

  expect(response.status).toBe(418);
  expect(response.body.message).toBe("test failure");
  expect(response.body.stack).toEqual(expect.any(String));
});
