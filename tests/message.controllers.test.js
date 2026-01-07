import mongoose from "mongoose";
import {
  getAllMessages,
  sendMessage,
  deleteMessage,
} from "../../src/controllers/chat-app/message.controllers.js";

import { Chat } from "../../src/models/chat.modal.js";
import { ChatMessage } from "../../src/models/message.models.js";
import User from "../../src/models/Users.js";
import { emitSocketEvent } from "../../src/socket/index.js";

/* ===========================
   MOCKS
=========================== */
jest.mock("../../src/models/chat.modal.js");
jest.mock("../../src/models/message.models.js");
jest.mock("../../src/models/Users.js");

jest.mock("../../src/socket/index.js", () => ({
  emitSocketEvent: jest.fn(),
}));

jest.mock("../../src/utils/helpers.js", () => ({
  getStaticFilePath: jest.fn(() => "static/path/file.png"),
  getLocalPath: jest.fn(() => "/tmp/file.png"),
  removeLocalFile: jest.fn(),
}));

jest.mock("firebase-admin", () => ({
  messaging: () => ({
    send: jest.fn().mockResolvedValue(true),
  }),
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

describe("Message Controllers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ===========================
     getAllMessages
  =========================== */
  describe("getAllMessages", () => {
    it("should fetch paginated messages", async () => {
      Chat.findById.mockResolvedValue({
        participants: ["user1"],
      });

      ChatMessage.aggregate.mockResolvedValue([{ content: "hello" }]);

      const req = {
        params: { chatId: "chat1" },
        query: { page: 1, limit: 20 },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await getAllMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it("should throw error if chat not found", async () => {
      Chat.findById.mockResolvedValue(null);

      const req = {
        params: { chatId: "chat1" },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await expect(getAllMessages(req, res)).rejects.toThrow("Chat does not exist");
    });
  });

  /* ===========================
     sendMessage
  =========================== */
  describe("sendMessage", () => {
    it("should send text message", async () => {
      Chat.findOne.mockResolvedValue({
        _id: "chat1",
        participants: [{ _id: "user1" }, { _id: "user2" }],
      });

      ChatMessage.create.mockResolvedValue({ _id: "msg1" });

      Chat.findByIdAndUpdate.mockResolvedValue(true);

      ChatMessage.aggregate.mockResolvedValue([
        { _id: "msg1", content: "hello" },
      ]);

      User.findById.mockResolvedValue({
        username: "sender",
        avatarUrl: "avatar.png",
      });

      const req = {
        params: { chatId: "chat1" },
        body: { content: "hello" },
        user: { _id: "user1" },
        files: {},
      };
      const res = mockRes();

      await sendMessage(req, res);

      expect(emitSocketEvent).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should throw error if content and attachments missing", async () => {
      const req = {
        params: { chatId: "chat1" },
        body: {},
        user: { _id: "user1" },
        files: {},
      };
      const res = mockRes();

      await expect(sendMessage(req, res)).rejects.toThrow(
        "Message content or attachment is required"
      );
    });
  });

  /* ===========================
     deleteMessage
  =========================== */
  describe("deleteMessage", () => {
    it("should delete message successfully", async () => {
      Chat.findOne.mockResolvedValue({
        _id: "chat1",
        participants: ["user1", "user2"],
        lastMessage: "msg1",
      });

      ChatMessage.findOne.mockResolvedValue({
        _id: "msg1",
        sender: "user1",
        attachments: [],
      });

      ChatMessage.deleteOne.mockResolvedValue(true);
      Chat.findByIdAndUpdate.mockResolvedValue(true);

      const req = {
        params: { chatId: "chat1", messageId: "msg1" },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await deleteMessage(req, res);

      expect(emitSocketEvent).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should throw 403 if not sender", async () => {
      Chat.findOne.mockResolvedValue({
        participants: ["user1", "user2"],
      });

      ChatMessage.findOne.mockResolvedValue({
        sender: "user2",
        attachments: [],
      });

      const req = {
        params: { chatId: "chat1", messageId: "msg1" },
        user: { _id: "user1" },
      };
      const res = mockRes();

      await expect(deleteMessage(req, res)).rejects.toThrow(
        "You are not the authorised to delete the message"
      );
    });
  });
});
