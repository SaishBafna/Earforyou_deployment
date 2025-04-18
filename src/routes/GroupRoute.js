import express from "express";
import {
    getAllGroupChats,
    // getGroupChatsForUser,
    // markMessageAsRead,
    createGroupChat,
    getGroupChatDetails,
    updateGroupChatDetails,
    addParticipantsToGroup,
    removeParticipantFromGroup,
    leaveGroupChat,
    deleteGroupChat,
    requestToJoinGroup,
    approveJoinRequest,
    getPendingJoinRequests,
    getAllGroupMessages,
    sendGroupMessage
} from "../controllers/chat-app/groupchat/Groupcontrollers.js";
import { protect } from "../middlewares/auth/authMiddleware.js";
import { upload } from "../middlewares/multer.middlewares.js";
import { sendMessageValidator } from "../validators/chat-app/message.validators.js";
import { mongoIdPathVariableValidator } from "../validators/common/mongodb.validators.js";
import { validate } from "../validators/validate.js";

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Group Chat Routes
router.route("/group")
    .get(getAllGroupChats)                // Get all group chats for current user
    .post(createGroupChat);               // Create new group chat

// router.route("/group/user/:userId")
//     .get(getGroupChatsForUser);          // Get all group chats for specific user (admin only)

router.route("/group/:chatId")
    .get(mongoIdPathVariableValidator("chatId"), validate, getGroupChatDetails)     // Get group details
    .put(mongoIdPathVariableValidator("chatId"), validate, updateGroupChatDetails)  // Update group details
    .delete(mongoIdPathVariableValidator("chatId"), validate, deleteGroupChat);     // Delete group chat

router.route("/group/:chatId/participants")
    .put(mongoIdPathVariableValidator("chatId"), validate, addParticipantsToGroup); // Add participants

router.route("/group/:chatId/participants/remove")
    .put(mongoIdPathVariableValidator("chatId"), validate, removeParticipantFromGroup); // Remove participant

router.route("/group/:chatId/leave")
    .put(mongoIdPathVariableValidator("chatId"), validate, leaveGroupChat); // Leave group

// Group Join Requests
router.route("/group/:chatId/join")
    .post(mongoIdPathVariableValidator("chatId"), validate, requestToJoinGroup); // Request to join

router.route("/group/:chatId/join/:userId")
    .put(
        mongoIdPathVariableValidator("chatId"),
        mongoIdPathVariableValidator("userId"),
        validate,
        approveJoinRequest
    ); // Approve join request

router.route("/group/:chatId/requests")
    .get(mongoIdPathVariableValidator("chatId"), validate, getPendingJoinRequests); // Get pending requests

// // Message Routes
// router.route("/messages/:messageId/read")
//     .post(markMessageAsRead); // Mark message as read

router.route("/:chatId/messages")
    .get(mongoIdPathVariableValidator("chatId"), validate, getAllGroupMessages) // Get all messages
    .post(
        upload.fields([{ name: "attachments", maxCount: 5 }]),
        mongoIdPathVariableValidator("chatId"),
        sendMessageValidator(),
        validate,
        sendGroupMessage
    ); // Send new message

export default router;