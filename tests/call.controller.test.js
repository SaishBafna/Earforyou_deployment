import {
  getRecentCalls,
  initiateCall,
  acceptCall,
  rejectCall,
  endCall,
  handleMissedCall,
} from "../../src/controllers/CallController/CallController.js";

import createService from "../../src/servises/CallServices.js";
import CallLog from "../../src/models/Talk-to-friend/callLogModel.js";

/* ===========================
   MOCKS
=========================== */
jest.mock("../../src/servises/CallServices.js");
jest.mock("../../src/models/Talk-to-friend/callLogModel.js");
jest.mock("../../src/logger/winston.logger.js", () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

/* ===========================
   MOCK RESPONSE
=========================== */
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn();
  return res;
};

describe("Call Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ===========================
     getRecentCalls
  =========================== */
  describe("getRecentCalls", () => {
    it("should return recent calls successfully", async () => {
      const mockCalls = [
        {
          _id: "call1",
          status: "completed",
          duration: 120,
          caller: { _id: "user1" },
          receiver: { _id: "user2" },
        },
      ];

      CallLog.find.mockReturnValue({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              populate: () => ({
                populate: () => ({
                  lean: () => ({
                    exec: jest.fn().mockResolvedValue(mockCalls),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      CallLog.countDocuments.mockResolvedValue(1);

      const req = {
        user: { id: "user1" },
        query: { page: 1 },
      };
      const res = mockRes();

      await getRecentCalls(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          recentCalls: expect.any(Array),
          totalCalls: 1,
        })
      );
    });

    it("should return 404 if no calls found", async () => {
      CallLog.find.mockReturnValue({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              populate: () => ({
                populate: () => ({
                  lean: () => ({
                    exec: jest.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const req = {
        user: { id: "user1" },
        query: {},
      };
      const res = mockRes();

      await getRecentCalls(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  /* ===========================
     initiateCall
  =========================== */
  describe("initiateCall", () => {
    it("should initiate call successfully", async () => {
      createService.initiateCall.mockResolvedValue({
        success: true,
      });

      const req = {
        body: { callerId: "user1", receiverId: "user2" },
      };
      const res = mockRes();

      await initiateCall(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("should return 409 if receiver is busy", async () => {
      createService.initiateCall.mockResolvedValue({
        success: false,
        message: "Receiver busy",
      });

      const req = {
        body: { callerId: "user1", receiverId: "user2" },
      };
      const res = mockRes();

      await initiateCall(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  /* ===========================
     acceptCall
  =========================== */
  describe("acceptCall", () => {
    it("should accept call", async () => {
      createService.acceptCall.mockResolvedValue({ accepted: true });

      const req = {
        body: { callerId: "user1", receiverId: "user2" },
      };
      const res = mockRes();

      await acceptCall(req, res);

      expect(res.json).toHaveBeenCalledWith({ accepted: true });
    });
  });

  /* ===========================
     rejectCall
  =========================== */
  describe("rejectCall", () => {
    it("should reject call", async () => {
      createService.rejectCall.mockResolvedValue({ rejected: true });

      const req = {
        body: { callerId: "user1", receiverId: "user2" },
      };
      const res = mockRes();

      await rejectCall(req, res);

      expect(res.json).toHaveBeenCalledWith({ rejected: true });
    });
  });

  /* ===========================
     endCall
  =========================== */
  describe("endCall", () => {
    it("should end call", async () => {
      createService.endCall.mockResolvedValue({ ended: true });

      const req = {
        body: { callerId: "user1", receiverId: "user2" },
      };
      const res = mockRes();

      await endCall(req, res);

      expect(res.json).toHaveBeenCalledWith({ ended: true });
    });
  });

  /* ===========================
     handleMissedCall
  =========================== */
  describe("handleMissedCall", () => {
    it("should handle missed call", async () => {
      createService.handleMissedCall.mockResolvedValue({
        missed: true,
      });

      const req = {
        body: { callerId: "user1", receiverId: "user2" },
      };
      const res = mockRes();

      await handleMissedCall(req, res);

      expect(res.json).toHaveBeenCalledWith({ missed: true });
    });
  });
});
