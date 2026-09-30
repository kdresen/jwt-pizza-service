const express = require("express");
const request = require("supertest");

const mockDB = {
  getFranchises: jest.fn(),
  getUserFranchises: jest.fn(),
  createFranchise: jest.fn(),
  deleteFranchise: jest.fn(),
  getFranchise: jest.fn(),
  createStore: jest.fn(),
  deleteStore: jest.fn(),
};

let mockCurrentUser = {
  id: 1,
  isRole: jest.fn().mockReturnValue(false),
};

const mockAuthenticateToken = jest.fn((req, res, next) => {
  req.user = mockCurrentUser;
  next();
});

jest.mock("../database/database.js", () => ({
  DB: mockDB,
  Role: {
    Diner: "diner",
    Franchisee: "franchisee",
    Admin: "admin",
  },
}));

jest.mock("./authRouter.js", () => ({
  authRouter: {
    authenticateToken: mockAuthenticateToken,
  },
}));

const franchiseRouter = require("./franchiseRouter");
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = mockCurrentUser;
  next();
});
app.use("/franchise", franchiseRouter);
app.use((err, req, res, next) => {
  void next;
  res.status(err.statusCode ?? 500).json({ message: err.message });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = {
    id: 1,
    isRole: jest.fn().mockReturnValue(false),
  };
});

test("lists franchises with query parameters", async () => {
  const franchises = [{ id: 5, name: "Main" }];
  mockDB.getFranchises.mockResolvedValue([franchises, true]);

  const response = await request(app)
    .get("/franchise")
    .query({ page: 2, limit: 5, name: "Main" });

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ franchises, more: true });
  expect(mockDB.getFranchises).toHaveBeenCalledWith(
    mockCurrentUser,
    "2",
    "5",
    "Main",
  );
});

test("lists franchises for the authenticated user", async () => {
  const franchises = [{ id: 5, name: "Main" }];
  mockDB.getUserFranchises.mockResolvedValue(franchises);

  const response = await request(app).get("/franchise/1");

  expect(response.status).toBe(200);
  expect(response.body).toEqual(franchises);
  expect(mockDB.getUserFranchises).toHaveBeenCalledWith(1);
});

test("allows an admin to list another user's franchises", async () => {
  mockCurrentUser.isRole.mockImplementation((role) => role === "admin");
  mockDB.getUserFranchises.mockResolvedValue([]);

  const response = await request(app).get("/franchise/9");

  expect(response.status).toBe(200);
  expect(mockDB.getUserFranchises).toHaveBeenCalledWith(9);
});

test("returns no franchises when a user is not authorized to view them", async () => {
  const response = await request(app).get("/franchise/9");

  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
  expect(mockDB.getUserFranchises).not.toHaveBeenCalled();
});

test("allows an admin to create a franchise", async () => {
  mockCurrentUser.isRole.mockImplementation((role) => role === "admin");
  const franchise = { name: "Main", admins: [{ email: "admin@test.com" }] };
  mockDB.createFranchise.mockResolvedValue({ ...franchise, id: 5 });

  const response = await request(app).post("/franchise").send(franchise);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...franchise, id: 5 });
  expect(mockDB.createFranchise).toHaveBeenCalledWith(franchise);
});

test("rejects franchise creation for a non-admin", async () => {
  const response = await request(app)
    .post("/franchise")
    .send({ name: "Main", admins: [] });

  expect(response.status).toBe(403);
  expect(response.body).toEqual({ message: "unable to create a franchise" });
  expect(mockDB.createFranchise).not.toHaveBeenCalled();
});

test("deletes a franchise", async () => {
  const response = await request(app).delete("/franchise/5");

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ message: "franchise deleted" });
  expect(mockDB.deleteFranchise).toHaveBeenCalledWith(5);
});

test("allows an admin to create a store", async () => {
  mockCurrentUser.isRole.mockImplementation((role) => role === "admin");
  const store = { name: "Downtown" };
  mockDB.getFranchise.mockResolvedValue({ id: 5, admins: [] });
  mockDB.createStore.mockResolvedValue({ id: 8, franchiseId: 5, ...store });

  const response = await request(app).post("/franchise/5/store").send(store);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ id: 8, franchiseId: 5, name: "Downtown" });
  expect(mockDB.getFranchise).toHaveBeenCalledWith({ id: 5 });
  expect(mockDB.createStore).toHaveBeenCalledWith(5, store);
});

test("allows a franchise admin to create a store", async () => {
  mockDB.getFranchise.mockResolvedValue({ id: 5, admins: [{ id: 1 }] });
  mockDB.createStore.mockResolvedValue({
    id: 8,
    franchiseId: 5,
    name: "Downtown",
  });

  const response = await request(app)
    .post("/franchise/5/store")
    .send({ name: "Downtown" });

  expect(response.status).toBe(200);
  expect(mockDB.createStore).toHaveBeenCalled();
});

test("rejects store creation for an unauthorized user", async () => {
  mockDB.getFranchise.mockResolvedValue({ id: 5, admins: [{ id: 9 }] });

  const response = await request(app)
    .post("/franchise/5/store")
    .send({ name: "Downtown" });

  expect(response.status).toBe(403);
  expect(response.body).toEqual({ message: "unable to create a store" });
  expect(mockDB.createStore).not.toHaveBeenCalled();
});

test("deletes a store for an authorized franchise admin", async () => {
  mockDB.getFranchise.mockResolvedValue({ id: 5, admins: [{ id: 1 }] });

  const response = await request(app).delete("/franchise/5/store/8");

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ message: "store deleted" });
  expect(mockDB.deleteStore).toHaveBeenCalledWith(5, 8);
});

test("rejects store deletion when the franchise does not exist", async () => {
  mockDB.getFranchise.mockResolvedValue(null);

  const response = await request(app).delete("/franchise/5/store/8");

  expect(response.status).toBe(403);
  expect(response.body).toEqual({ message: "unable to delete a store" });
  expect(mockDB.deleteStore).not.toHaveBeenCalled();
});
