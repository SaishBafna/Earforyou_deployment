import {
  blockUser,
  unblockUser,
  checkBlockStatus,
  getBlockedUsers,
} from "../../src/controllers/BlockUser/BlockController.js";

import Block from "../../src/models/Block.js";
import User from "../../src/models/Users.js";

/* ===========================
   MOCK MODELS
=========================== */
jest.mock("../../src/models/Block.js");
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

describe("Block Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ===========================
     blockUser
  =========================== */
  describe("blockUser", () => {
    it("should block a user successfully", async () => {
      User.findById
        .mockResolvedValueOnce({ _id: "user1" })
        .mockResolvedValueOnce({ _id: "user2" });

      Block.findOne.mockResolvedValue(null);
      Block.prototype.save = jest.fn().mockResolvedValue(true);

      const req = {
        body: { blockerId: "user1", blockedId: "user2" },
      };
      const res = mockRes();

      await blockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "User blocked successfully",
        })
      );
    });

    it("should return 404 if user not found", async () => {
      User.findById.mockResolvedValue(null);

      const req = {
        body: { blockerId: "user1", blockedId: "user2" },
      };
      const res = mockRes();

      await blockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "User not found",
      });
    });

    it("should return 400 if already blocked", async () => {
      User.findById
        .mockResolvedValueOnce({ _id: "user1" })
        .mockResolvedValueOnce({ _id: "user2" });

      Block.findOne.mockResolvedValue({ _id: "block123" });

      const req = {
        body: { blockerId: "user1", blockedId: "user2" },
      };
      const res = mockRes();

      await blockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "User is already blocked",
      });
    });
  });

  /* ===========================
     unblockUser
  =========================== */
  describe("unblockUser", () => {
    it("should unblock a user successfully", async () => {
      Block.findOneAndDelete.mockResolvedValue({ _id: "block123" });

      const req = {
        body: { blockerId: "user1", blockedId: "user2" },
      };
      const res = mockRes();

      await unblockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "User unblocked successfully",
        })
      );
    });

    it("should return 404 if block not found", async () => {
      Block.findOneAndDelete.mockResolvedValue(null);

      const req = {
        body: { blockerId: "user1", blockedId: "user2" },
      };
      const res = mockRes();

      await unblockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Block relationship not found",
      });
    });
  });

  /* ===========================
     checkBlockStatus
  =========================== */
  describe("checkBlockStatus", () => {
    it("should return blocked status true", async () => {
      Block.findOne.mockResolvedValue({ _id: "block123" });

      const req = {
        query: { blockerId: "user1", blockedId: "user2" },
      };
      const res = mockRes();

      await checkBlockStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        isBlocked: true,
        block: { _id: "block123" },
      });
    });

    it("should return blocked status false", async () => {
      Block.findOne.mockResolvedValue(null);

      const req = {
        query: { blockerId: "user1", blockedId: "user2" },
      };
      const res = mockRes();

      await checkBlockStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        isBlocked: false,
        block: null,
      });
    });
  });

  /* ===========================
     getBlockedUsers
  =========================== */
  describe("getBlockedUsers", () => {
    it("should return blocked users list", async () => {
      const mockPopulate = jest.fn().mockReturnThis();
      const mockSort = jest.fn().mockResolvedValue([]);

      Block.find.mockReturnValue({
        populate: mockPopulate,
        sort: mockSort,
      });

      const req = {
        params: { userId: "user1" },
      };
      const res = mockRes();

      await getBlockedUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });
  });
});
