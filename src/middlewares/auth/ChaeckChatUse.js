import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ChatUserPremium } from "../../models/Subscriptionchat/ChatUserPremium.js";

export const checkChatAccess = asyncHandler(async (req, res, next) => {
    const { chatId } = req.params;
    const userId = req.user._id;

    // Validate chatId format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw new ApiError(400, "Invalid chat ID format");
    }

    // 1. Find the most appropriate active plan
    const activePlan = await ChatUserPremium.findOneAndUpdate(
        {
            user: userId,
            isActive: true,
            expiryDate: { $gt: new Date() },
            remainingChats: { $gt: 0 },
            "usedChats.chatId": { $ne: chatId }
        },
        {
            $inc: { remainingChats: -1 }, // Atomically decrement
            $push: { usedChats: { chatId } },
            $set: {
                isActive: { $cond: [{ $eq: ["$remainingChats", 1] }, false, "$isActive"] }
            }
        },
        {
            new: true,
            sort: { purchaseDate: 1 } // Oldest first (FIFO)
        }
    ).populate('plan', 'name chatsAllowed validityDays');

    if (!activePlan) {
        // Check if user has any expired plans for better error messaging
        const hasExpiredPlans = await ChatUserPremium.exists({
            user: userId,
            $or: [
                { expiryDate: { $lte: new Date() } },
                { remainingChats: { $lte: 0 } }
            ]
        });

        throw new ApiError(
            403,
            hasExpiredPlans
                ? "Your chat packs have expired or been fully used. Please purchase a new pack."
                : "No active chat packs available. Please purchase a pack to start chatting."
        );
    }

    // Attach plan details to request
    req.activePlan = {
        _id: activePlan._id,
        remainingChats: activePlan.remainingChats,
        expiryDate: activePlan.expiryDate,
        plan: activePlan.plan,
        lastUsedAt: new Date()
    };

    next();
});