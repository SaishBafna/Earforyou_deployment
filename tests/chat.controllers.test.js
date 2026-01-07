import mongoose from "mongoose";
import {
  markMessageAsRead,
  createOrGetAOneOnOneChat,
  deleteOneOnOneChat,
  searchAvailableUsers,
  getAllChats,
  getUnreadMessagesCount,
} from "../../src/controllers/chat-app/chat.controllers.js";

import { Chat } from "../../src/models/chat.modal.js";
import { ChatMessage } from "../../src/models/message.models.js";
import User from "../../src/models/Users.js";
import { emitSocketEvent } from "../../src/socket/index.js";

/* ===========================
   MOCKS
=========================== */
jest.mock("../../src/models/Users.js");
jest.mock("../../src/models/chat.modal.js");
jest.mock("../../src/models/message.models.js");
jest.mock("../../src/socket/index.js", () => ({
  emitSocketEvent: jest.fn(),
}));

jest.mock("../../src/utils/helpers.js", () => ({
  removeLocalFile: jest.fn(),
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

describe("Chat Controllers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ===========================
     markMessageAsRead
  =========================== */
  describe("markMessageAsRead", () => {
    it("should mark message as read", async () => {
      const saveMock = jest.fn();

      ChatMessage.findById.mockResolvedValue({
        _id: "msg1",
        chat: "chat1",
        seenBy: [],
        save: saveMock,
      });

      const req = {
        params: { messageId: "msg1" },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await markMessageAsRead(req, res);

      expect(saveMock).toHaveBeenCalled();
      expect(emitSocketEvent).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return already read", async () => {
      ChatMessage.findById.mockResolvedValue({
        seenBy: ["user1"],
      });

      const req = {
        params: { messageId: "msg1" },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await markMessageAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  /* ===========================
     searchAvailableUsers
  =========================== */
  describe("searchAvailableUsers", () => {
    it("should fetch users excluding logged-in user", async () => {
      User.aggregate.mockResolvedValue([{ username: "test" }]);

      const req = { user: { _id: "user1" } };
      const res = mockRes();

      await searchAvailableUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });
  });

  /* ===========================
     createOrGetAOneOnOneChat
  =========================== */
  describe("createOrGetAOneOnOneChat", () => {
    it("should return existing chat", async () => {
      User.findById.mockResolvedValue({ _id: "user2" });
      Chat.findOne.mockResolvedValue({ _id: "chat1" });

      const req = {
        params: { receiverId: "user2" },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await createOrGetAOneOnOneChat(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should create new chat", async () => {
      User.findById.mockResolvedValue({ _id: "user2" });
      Chat.findOne.mockResolvedValue(null);

      Chat.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          _id: "chat1",
          participants: [{ _id: "user1" }, { _id: "user2" }],
        },
      ]);

      Chat.create.mockResolvedValue({ _id: "chat1" });

      const req = {
        params: { receiverId: "user2" },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await createOrGetAOneOnOneChat(req, res);

      expect(emitSocketEvent).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  /* ===========================
     deleteOneOnOneChat
  =========================== */
  describe("deleteOneOnOneChat", () => {
    it("should delete chat", async () => {
      Chat.aggregate.mockResolvedValue([
        {
          _id: "chat1",
          participants: [{ _id: "user1" }, { _id: "user2" }],
        },
      ]);

      Chat.findByIdAndDelete.mockResolvedValue(true);

      const req = {
        params: { chatId: "chat1" },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await deleteOneOnOneChat(req, res);

      expect(emitSocketEvent).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  /* ===========================
     getAllChats
  =========================== */
  describe("getAllChats", () => {
    it("should return all chats", async () => {
      Chat.aggregate.mockResolvedValue([]);

      const req = { user: { _id: "user1" } };
      const res = mockRes();

      await getAllChats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  /* ===========================
     getUnreadMessagesCount
  =========================== */
  describe("getUnreadMessagesCount", () => {
    it("should return unread count", async () => {
      Chat.findOne.mockResolvedValue({ _id: "chat1" });
      ChatMessage.countDocuments.mockResolvedValue(3);

      const req = {
        user: { _id: "user1" },
        query: { otherParticipantId: "user2" },
      };
      const res = mockRes();

      await getUnreadMessagesCount(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ count: 3 }),
        })
      );
    });

    it("should return zero if chat not found", async () => {
      Chat.findOne.mockResolvedValue(null);

      const req = {
        user: { _id: "user1" },
        query: { otherParticipantId: "user2" },
      };
      const res = mockRes();

      await getUnreadMessagesCount(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
