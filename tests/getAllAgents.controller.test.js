import { getAllAgents } from "../../src/controllers/chat-app/getAllAgentController.js";
import User from "../../src/models/Users.js";

/* ===========================
   MOCK MODEL
=========================== */
jest.mock("../../src/models/Users.js");

/* ===========================
   MOCK RESPONSE
=========================== */
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn();
  return res;
};

describe("getAllAgents Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return agents successfully", async () => {
    const agentsMock = [
      { _id: "1", username: "Agent One", serviceType: "Agent" },
      { _id: "2", username: "Agent Two", serviceType: "Agent" },
    ];

    User.find.mockReturnValue({
      select: () => ({
        sort: jest.fn().mockResolvedValue(agentsMock),
      }),
    });

    const req = {};
    const res = mockRes();

    await getAllAgents(req, res);

    expect(User.find).toHaveBeenCalledWith({ serviceType: "Agent" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 200,
        data: agentsMock,
      })
    );
  });

  it("should return 404 if no agents found", async () => {
    User.find.mockReturnValue({
      select: () => ({
        sort: jest.fn().mockResolvedValue([]),
      }),
    });

    const req = {};
    const res = mockRes();

    await getAllAgents(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        data: [],
      })
    );
  });

  it("should handle database error", async () => {
    User.find.mockImplementation(() => {
      throw new Error("DB Error");
    });

    const req = {};
    const res = mockRes();

    await expect(getAllAgents(req, res)).rejects.toThrow("DB Error");
  });
});
