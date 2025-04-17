import express from "express";
import {
    getAllGroupChats,
    getGroupChatsForUser,
    markMessageAsRead,
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

} from "../controllers/chat-app/groupchat/Groupcontrollers";
import { protect } from "../middlewares/auth/authMiddleware.js"; // Adjust path to your auth middleware file

const router = express.Router();


// Routes

// Get all group chats for the current user
router.get("/group", protect, getAllGroupChats);

// Get all group chats for a specific user (admin only)
router.get("/group/:userId", protect, getGroupChatsForUser);

// Mark a message as read
router.post("/messages/:messageId/read", protect, markMessageAsRead);

// Create a new group chat
router.post("/group", protect, createGroupChat);

// Get group chat details with paginated messages
router.get("/group/:chatId", protect, getGroupChatDetails);

// Update group chat details (name, avatar)
router.put("/group/:chatId", protect, updateGroupChatDetails);

// Add participants to a group chat
router.put("/group/:chatId/add", protect, addParticipantsToGroup);

// Remove a participant from a group chat
router.put("/group/:chatId/remove", protect, removeParticipantFromGroup);

// Leave a group chat
router.put("/group/:chatId/leave", protect, leaveGroupChat);

// Delete a group chat (admin only)
router.delete("/group/:chatId", protect, deleteGroupChat);

router.post("/group/:chatId/join", protect, requestToJoinGroup);
router.put("/group/:chatId/join/:userId", protect, approveJoinRequest);

router.get("/getPendingJoinRequests/:chatId", protect, getPendingJoinRequests);

export default router;