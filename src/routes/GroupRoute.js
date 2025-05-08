import express from "express";
import { protect } from "../middlewares/auth/authMiddleware.js";
import { upload } from "../middlewares/multer.middlewares.js";
import { sendMessageValidator } from "../validators/chat-app/message.validators.js";
import { mongoIdPathVariableValidator } from "../validators/common/mongodb.validators.js";
import { validate } from "../validators/validate.js";
import {
    getAllGroupChats,
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
    sendGroupMessage,
    generateGroupInviteLink,
    joinGroupViaLink,
    revokeGroupInviteLink,
    getAllGroups,
} from "../controllers/chat-app/GroupChat/GroupChat.js";
import { checkChatAccess } from "../middlewares/auth/ChaeckChatUse.js";


const router = express.Router();

// Apply protect middleware to all routes

// Group Chat Routes
router.route("/group")
    .get(protect, getAllGroupChats)                // Get all group chats for current user
    .post(protect, checkChatAccess, createGroupChat);
// Create new group chat
router.route("/getAllGroups")
    .get(protect, getAllGroups)                // Get all group chats for current user

router.route("/group/:chatId")
    .get(mongoIdPathVariableValidator("chatId"), validate, protect, getGroupChatDetails)     // Get group details
    .put(mongoIdPathVariableValidator("chatId"), validate, protect, updateGroupChatDetails)  // Update group details
    .delete(mongoIdPathVariableValidator("chatId"), validate, protect, deleteGroupChat);     // Delete group chat

router.route("/group/:chatId/participants")
    .put(mongoIdPathVariableValidator("chatId"), validate, protect, addParticipantsToGroup); // Add participants

router.route("/group/:chatId/participants/remove")
    .put(mongoIdPathVariableValidator("chatId"), validate, protect, removeParticipantFromGroup); // Remove participant

router.route("/group/:chatId/leave")
    .put(mongoIdPathVariableValidator("chatId"), validate, protect, leaveGroupChat); // Leave group

// Group Messages
router.route("/group/:chatId/messages")
    .get(mongoIdPathVariableValidator("chatId"), validate, protect, getAllGroupMessages) // Get all messages
    .post(
        upload.fields([{ name: "attachments", maxCount: 10 }]), // Updated to allow 10 attachments
        mongoIdPathVariableValidator("chatId"),
        sendMessageValidator(),
        validate,
        protect,
        sendGroupMessage
    ); // Send new message

// Group Join Requests
router.route("/group/:chatId/join")
    .post(mongoIdPathVariableValidator("chatId"), validate, protect, requestToJoinGroup); // Request to join

router.route("/group/:chatId/join/:userId")
    .put(
        mongoIdPathVariableValidator("chatId"),
        mongoIdPathVariableValidator("userId"),
        validate,
        protect,
        approveJoinRequest
    ); // Approve join request

router.route("/group/:chatId/requests")
    .get(mongoIdPathVariableValidator("chatId"), validate, protect, getPendingJoinRequests); // Get pending requests

router.route("/:chatId/generate-link")
    .post(protect, generateGroupInviteLink);

router.route("/join/:token")
    .post(protect, joinGroupViaLink);

router.route("/:chatId/revoke-link")
    .delete(protect, revokeGroupInviteLink);


export default router;