import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ChatUserPremium } from "../../models/Subscriptionchat/ChatUserPremium.js";
import mongoose from "mongoose";

export const checkChatAccess = asyncHandler(async (req, res, next) => {
    const { receiverId: chatId } = req.params; // Changed to match route param
    const userId = req.user._id;

    // Validate chatId format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw new ApiError(400, "Invalid chat ID format");
    }

    // 1. Find and update the most appropriate active plan atomically
    const activePlan = await ChatUserPremium.findOneAndUpdate(
        {
            user: userId,
            isActive: true,
            expiryDate: { $gt: new Date() },
            remainingChats: { $gt: 0 },
            "usedChats.chatId": { $ne: chatId } // Prevent duplicate usage
        },
        [
            { // Using pipeline form for more complex logic
                $set: {
                    remainingChats: { $subtract: ["$remainingChats", 1] },
                    usedChats: { $concatArrays: ["$usedChats", [{ chatId, usedAt: new Date() }]] },
                    isActive: {
                        $and: [
                            { $gt: ["$remainingChats", 1] }, // Will be 1 after decrement
                            { $gt: ["$expiryDate", new Date()] }
                        ]
                    },
                    lastUsedAt: new Date()
                }
            }
        ],
        {
            new: true,
            sort: { purchaseDate: 1 } // Oldest first (FIFO)
        }
    ).populate('plan', 'name chatsAllowed validityDays');

    if (!activePlan) {
        // Check for potential reasons
        const hasInactivePlans = await ChatUserPremium.exists({
            user: userId,
            $or: [
                { isActive: false },
                { expiryDate: { $lte: new Date() } },
                { remainingChats: { $lte: 0 } }
            ]
        });

        throw new ApiError(
            403,
            hasInactivePlans
                ? "Your chat packs have expired or been fully used. Please purchase a new pack."
                : "No active chat packs available. Please purchase a pack to start chatting.",
            null,
            { // Additional data for client
                suggestPurchase: true,
                hasPreviousPlans: hasInactivePlans
            }
        );
    }

    // Attach plan details to request
    req.activePlan = {
        _id: activePlan._id,
        remainingChats: activePlan.remainingChats,
        expiryDate: activePlan.expiryDate,
        plan: activePlan.plan,
        lastUsedAt: activePlan.lastUsedAt
    };

    next();
});