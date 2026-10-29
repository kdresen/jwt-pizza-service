const { StatusCodeError } = require("./endpointHelper");
const request = require("supertest");
const app = require("./service");

test("StatusCodeError stores the message and status code", () => {
  const error = new StatusCodeError("Bad request", 400);

  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe("Bad request");
  expect(error.statusCode).toBe(400);
});

test("list users unauthorized", async () => {
  const listUsersRes = await request(app).get("/api/user");
  expect(listUsersRes.status).toBe(401);
});

test("list users", async () => {
  const adminToken = await loginAsAdmin(request(app));
  const listUsersRes = await request(app)
    .get("/api/user")
    .set("Authorization", "Bearer " + adminToken);
  expect(listUsersRes.status).toBe(200);
});

test("delete user unauthorized", async () => {
  const deleteUserRes = await request(app).delete("/api/user/1");
  expect(deleteUserRes.status).toBe(401);
});

test("delete user not admin", async () => {
  const [, userToken] = await registerUser(request(app));
  const deleteUserRes = await request(app)
    .delete("/api/user/1")
    .set("Authorization", "Bearer " + userToken);
  expect(deleteUserRes.status).toBe(403);
});

test("delete another user as admin", async () => {
  const adminToken = await loginAsAdmin(request(app));
  const [userToDelete] = await registerUser(request(app));
  const deleteUserRes = await request(app)
    .delete(`/api/user/${userToDelete.id}`)
    .set("Authorization", "Bearer " + adminToken);
  expect(deleteUserRes.status).toBe(200);
});

test("delete user with correct user ID", async () => {
  const [user, token] = await registerUser(request(app));
  const deleteUserRes = await request(app)
    .delete(`/api/user/${user.id}`)
    .set("Authorization", "Bearer " + token);
  expect(deleteUserRes.status).toBe(403);
});

async function loginAsAdmin(service) {
  const loginRes = await service
    .put("/api/auth")
    .send({ email: "a@jwt.com", password: "admin" });

  console.log("Admin login status:", loginRes.status);
  console.log("Admin login response:", loginRes.body);
  return loginRes.body.token;
}

async function registerUser(service) {
  const testUser = {
    name: "pizza diner",
    email: `${randomName()}@test.com`,
    password: "a",
  };
  const registerRes = await service.post("/api/auth").send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}
