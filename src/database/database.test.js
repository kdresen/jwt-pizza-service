const mockConnection = {
  execute: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
};

jest.mock("mysql2/promise", () => ({
  createConnection: jest.fn().mockResolvedValue(mockConnection),
}));

mockConnection.execute.mockResolvedValue([[{ SCHEMA_NAME: "pizza" }], []]);
mockConnection.query.mockResolvedValue([[]]);

const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const { DB, Role } = require("./database");

beforeEach(() => {
  jest.restoreAllMocks();
  DB.initialized = Promise.resolve();
  mockConnection.execute.mockReset();
  mockConnection.query.mockReset();
  mockConnection.end.mockReset();
  mockConnection.beginTransaction.mockReset();
  mockConnection.commit.mockReset();
  mockConnection.rollback.mockReset();
  mockConnection.execute.mockResolvedValue([[], []]);
  mockConnection.query.mockResolvedValue([[]]);
  jest.spyOn(DB, "getConnection").mockResolvedValue(mockConnection);
});

test("gets menu items and closes the connection", async () => {
  const menu = [{ id: 1, title: "Margherita" }];
  jest.spyOn(DB, "query").mockResolvedValue(menu);

  await expect(DB.getMenu()).resolves.toEqual(menu);
  expect(DB.query).toHaveBeenCalledWith(mockConnection, "SELECT * FROM menu");
  expect(mockConnection.end).toHaveBeenCalled();
});

test("adds a menu item", async () => {
  jest.spyOn(DB, "query").mockResolvedValue({ insertId: 4 });
  const item = {
    title: "Veggie",
    description: "Fresh",
    image: "veg.jpg",
    price: 12,
  };

  await expect(DB.addMenuItem(item)).resolves.toEqual({ ...item, id: 4 });
  expect(mockConnection.end).toHaveBeenCalled();
});

test("adds a user and assigns a role", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce({ insertId: 7 })
    .mockResolvedValueOnce({});

  const user = {
    name: "Diner",
    email: "diner@test.com",
    password: "secret",
    roles: [{ role: Role.Diner }],
  };
  const result = await DB.addUser(user);

  expect(result).toMatchObject({ name: user.name, id: 7, password: undefined });
  expect(DB.query).toHaveBeenCalledTimes(2);
  expect(mockConnection.end).toHaveBeenCalled();
});

test("adds a franchisee user using the franchise ID", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce({ insertId: 8 })
    .mockResolvedValueOnce({});
  jest.spyOn(DB, "getID").mockResolvedValue(3);

  await DB.addUser({
    name: "Owner",
    email: "owner@test.com",
    password: "secret",
    roles: [{ role: Role.Franchisee, object: "Main" }],
  });

  expect(DB.getID).toHaveBeenCalledWith(
    mockConnection,
    "name",
    "Main",
    "franchise",
  );
});

test("gets a user and maps roles", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce([
      { id: 7, email: "diner@test.com", password: "hash" },
    ])
    .mockResolvedValueOnce([{ role: Role.Diner, objectId: 0 }]);
  jest.spyOn(bcrypt, "compare").mockResolvedValue(true);

  await expect(DB.getUser("diner@test.com", "secret")).resolves.toMatchObject({
    id: 7,
    roles: [{ role: Role.Diner, objectId: undefined }],
    password: undefined,
  });
});

test("rejects an unknown user", async () => {
  jest.spyOn(DB, "query").mockResolvedValue([]);

  await expect(DB.getUser("missing@test.com")).rejects.toMatchObject({
    message: "unknown user",
    statusCode: 404,
  });
});

test("updates a user and returns the updated user", async () => {
  const updated = { id: 7, name: "Updated" };
  jest.spyOn(DB, "query").mockResolvedValue([]);
  jest.spyOn(DB, "getUser").mockResolvedValue(updated);

  await expect(
    DB.updateUser(7, "Updated", "updated@test.com", "new-password"),
  ).resolves.toBe(updated);
  expect(DB.getUser).toHaveBeenCalledWith("updated@test.com", "new-password");
});

test("stores, checks, and removes a login token signature", async () => {
  const query = jest.spyOn(DB, "query").mockResolvedValue([]);

  await DB.loginUser(7, "header.payload.signature");
  query.mockResolvedValueOnce([{ userId: 7 }]);
  await expect(DB.isLoggedIn("header.payload.signature")).resolves.toBe(true);
  await DB.logoutUser("header.payload.signature");

  expect(query).toHaveBeenCalledTimes(3);
  expect(mockConnection.end).toHaveBeenCalledTimes(3);
});

test("gets orders with their items", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce([{ id: 10 }])
    .mockResolvedValueOnce([{ menuId: 2 }]);

  await expect(DB.getOrders({ id: 7 }, 2)).resolves.toEqual({
    dinerId: 7,
    orders: [{ id: 10, items: [{ menuId: 2 }] }],
    page: 2,
  });
});

test("adds a diner order and its items", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce({ insertId: 11 })
    .mockResolvedValueOnce({});
  jest.spyOn(DB, "getID").mockResolvedValue(2);
  const order = {
    franchiseId: 3,
    storeId: 4,
    items: [{ menuId: 2, description: "Pizza", price: 10 }],
  };

  await expect(DB.addDinerOrder({ id: 7 }, order)).resolves.toEqual({
    ...order,
    id: 11,
  });
  expect(DB.getID).toHaveBeenCalledWith(mockConnection, "id", 2, "menu");
});

test("creates a franchise and assigns its admins", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce([{ id: 7, name: "Admin" }])
    .mockResolvedValueOnce({ insertId: 5 })
    .mockResolvedValueOnce({});
  const franchise = { name: "Main", admins: [{ email: "admin@test.com" }] };

  await expect(DB.createFranchise(franchise)).resolves.toBe(franchise);
  expect(franchise).toEqual({
    id: 5,
    name: "Main",
    admins: [{ email: "admin@test.com", id: 7, name: "Admin" }],
  });
});

test("throws a 404 when a franchise admin does not exist", async () => {
  jest.spyOn(DB, "query").mockResolvedValueOnce([]);
  const franchise = { name: "Main", admins: [{ email: "missing@test.com" }] };

  await expect(DB.createFranchise(franchise)).rejects.toMatchObject({
    message: "unknown user for franchise admin missing@test.com provided",
    statusCode: 404,
  });
  expect(mockConnection.end).toHaveBeenCalled();
});

test("rolls back a failed franchise deletion", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error("delete failed"));

  await expect(DB.deleteFranchise(5)).rejects.toMatchObject({
    message: "unable to delete franchise",
    statusCode: 500,
  });
  expect(mockConnection.rollback).toHaveBeenCalled();
});

test("gets franchises for a non-admin user", async () => {
  const franchises = [{ id: 5, name: "Main" }];
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce(franchises)
    .mockResolvedValueOnce([]);
  jest.spyOn(DB, "getFranchise").mockResolvedValue(franchises[0]);
  const authUser = { isRole: jest.fn().mockReturnValue(false) };

  await expect(DB.getFranchises(authUser, 0, 10, "Main*")).resolves.toEqual([
    franchises,
    false,
  ]);
  expect(authUser.isRole).toHaveBeenCalledWith(Role.Admin);
  expect(franchises[0].stores).toEqual([]);
});

test("gets a user's franchises", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce([{ objectId: 5 }])
    .mockResolvedValueOnce([{ id: 5, name: "Main" }]);
  const franchise = { id: 5, name: "Main" };
  jest.spyOn(DB, "getFranchise").mockResolvedValue(franchise);

  await expect(DB.getUserFranchises(7)).resolves.toEqual([franchise]);
  expect(DB.getFranchise).toHaveBeenCalledWith(franchise);
});

test("gets franchise admins and stores", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce([{ id: 7, name: "Admin" }])
    .mockResolvedValueOnce([{ id: 8, name: "Downtown" }]);
  const franchise = { id: 5, name: "Main" };

  await expect(DB.getFranchise(franchise)).resolves.toBe(franchise);
  expect(franchise.admins).toEqual([{ id: 7, name: "Admin" }]);
  expect(franchise.stores).toEqual([{ id: 8, name: "Downtown" }]);
});

test("creates and deletes a store", async () => {
  jest
    .spyOn(DB, "query")
    .mockResolvedValueOnce({ insertId: 8 })
    .mockResolvedValueOnce([]);
  const store = { name: "Downtown" };

  await expect(DB.createStore(5, store)).resolves.toEqual({
    id: 8,
    franchiseId: 5,
    name: "Downtown",
  });
  await expect(DB.deleteStore(5, 8)).resolves.toBeUndefined();
});

test("calculates a database offset", () => {
  expect(DB.getOffset(3, 10)).toBe(20);
});

test("extracts a token signature or returns an empty string", () => {
  expect(DB.getTokenSignature("header.payload.signature")).toBe("signature");
  expect(DB.getTokenSignature("invalid-token")).toBe("");
});

test("executes a query and returns its rows", async () => {
  mockConnection.execute.mockResolvedValue([[{ id: 1 }], []]);

  await expect(DB.query(mockConnection, "SELECT 1", [1])).resolves.toEqual([
    { id: 1 },
  ]);
  expect(mockConnection.execute).toHaveBeenCalledWith("SELECT 1", [1]);
});

test("gets an ID or throws when no row exists", async () => {
  mockConnection.execute.mockResolvedValueOnce([[{ id: 9 }], []]);
  await expect(
    DB.getID(mockConnection, "name", "Main", "franchise"),
  ).resolves.toBe(9);

  mockConnection.execute.mockResolvedValueOnce([[], []]);
  await expect(
    DB.getID(mockConnection, "name", "Missing", "franchise"),
  ).rejects.toThrow("No ID found");
});

test("waits for initialization before getting a connection", async () => {
  const connection = {};
  DB.initialized = Promise.resolve();
  DB.getConnection.mockRestore();
  jest.spyOn(DB, "_getConnection").mockResolvedValue(connection);

  await expect(DB.getConnection()).resolves.toBe(connection);
});

test("creates a connection and selects the configured database", async () => {
  await expect(DB._getConnection()).resolves.toBe(mockConnection);
  expect(mysql.createConnection).toHaveBeenCalled();
  expect(mockConnection.query).toHaveBeenCalledWith(
    expect.stringContaining("USE"),
  );
});

test("checks whether the database exists", async () => {
  mockConnection.execute.mockResolvedValue([[{ SCHEMA_NAME: "pizza" }], []]);

  await expect(DB.checkDatabaseExists(mockConnection)).resolves.toBe(true);
});

test("initializes an existing database", async () => {
  jest.spyOn(DB, "_getConnection").mockResolvedValue(mockConnection);
  jest.spyOn(DB, "checkDatabaseExists").mockResolvedValue(true);

  await expect(DB.initializeDatabase()).resolves.toBeUndefined();
  expect(mockConnection.query).toHaveBeenCalled();
  expect(mockConnection.end).toHaveBeenCalled();
});

test("initializes the default admin when the database is new", async () => {
  jest.spyOn(DB, "_getConnection").mockResolvedValue(mockConnection);
  jest.spyOn(DB, "checkDatabaseExists").mockResolvedValue(false);
  jest.spyOn(DB, "addUser").mockResolvedValue({});
  mockConnection.query.mockResolvedValue([[]]);

  await DB.initializeDatabase();

  expect(DB.addUser).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "a@jwt.com",
      roles: [{ role: Role.Admin }],
    }),
  );
});

test("logs database initialization errors", async () => {
  const error = new Error("connection failed");
  jest.spyOn(DB, "_getConnection").mockRejectedValue(error);
  const consoleError = jest.spyOn(console, "error").mockImplementation();

  await DB.initializeDatabase();

  expect(consoleError).toHaveBeenCalled();
  consoleError.mockRestore();
});
