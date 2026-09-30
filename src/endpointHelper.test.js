const { StatusCodeError } = require("./endpointHelper");

test("StatusCodeError stores the message and status code", () => {
  const error = new StatusCodeError("Bad request", 400);

  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe("Bad request");
  expect(error.statusCode).toBe(400);
});
