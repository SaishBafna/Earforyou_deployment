import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ChatUserPremium } from "../../models/Subscriptionchat/ChatUserPremium.js";
import mongoose from "mongoose";

export const checkChatAccess = asyncHandler(async (req, res, next) => {
    const { receiverId: chatId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw new ApiError(400, "Invalid chat ID format");
    }

    const chatObjectId = new mongoose.Types.ObjectId(chatId);

    // Parallel lookups for better performance
    const [existingChatUsage, activePlan, hasCompletedPlans, hasNonCompletedPlans] = await Promise.all([
        // Check if chat was already used in a COMPLETED or SUCCESS plan
        ChatUserPremium.findOne({
            user: userId,
            "payment.status": { $in: ["COMPLETED", "success"] },
            "usedChats.chatId": chatObjectId
        }).populate('plan').lean(),

        // Find the most recent active, COMPLETED or SUCCESS plan with remaining chats
        ChatUserPremium.findOne({
            user: userId,
            isActive: true,
            "payment.status": { $in: ["COMPLETED", "success"] },
            expiryDate: { $gt: new Date() },
            remainingChats: { $gt: 0 }
        }).sort({ purchaseDate: -1 }).populate('plan'),

        // Check if user has any COMPLETED or SUCCESS plans
        ChatUserPremium.exists({
            user: userId,
            "payment.status": { $in: ["COMPLETED", "success"] }
        }),

        // Check if user has any non-COMPLETED and non-SUCCESS plans
        ChatUserPremium.exists({
            user: userId,
            "payment.status": { $nin: ["COMPLETED", "success"] }
        })
    ]);

    // Case 1: Chat was previously accessed with a valid plan
    if (existingChatUsage) {
        req.activePlan = {
            _id: existingChatUsage._id,
            remainingChats: existingChatUsage.remainingChats,
            expiryDate: existingChatUsage.expiryDate,
            plan: existingChatUsage.plan,
            previouslyUsed: true,
            lastUsedAt: existingChatUsage.usedChats.find(chat => chat.chatId.equals(chatObjectId)).usedAt
        };
        return next();
    }

    // Case 2: Active plan available
    if (activePlan) {
        // Prepare update operations
        const updateOps = {
            $inc: { remainingChats: -1 },
            $push: { usedChats: { chatId: chatObjectId, usedAt: new Date() } }
        };

        // Auto-deactivate if no chats will be left after this operation
        if (activePlan.remainingChats <= 1) {
            updateOps.$set = { isActive: false };
        }

        // Fire-and-forget the update (no need to await for response)
        ChatUserPremium.updateOne({ _id: activePlan._id }, updateOps)
            .catch(err => console.error('Error updating chat plan:', err));

        req.activePlan = {
            _id: activePlan._id,
            remainingChats: activePlan.remainingChats - 1,
            expiryDate: activePlan.expiryDate,
            plan: activePlan.plan,
            lastUsedAt: new Date()
        };
        return next();
    }

    // Case 3: No active plan available
    let errorMessage = "No active chat packs available.";
    const metadata = { suggestPurchase: true };

    if (hasCompletedPlans) {
        errorMessage = "Your chat packs have expired or been fully used. Please purchase a new pack.";
        metadata.hasPreviousPlans = true;
    } else if (hasNonCompletedPlans) {
        errorMessage = "You have pending payments. Please complete your payment to access chats.";
        metadata.hasPendingPayments = true;
    }

    throw new ApiError(403, errorMessage, null, metadata);
});



export const checkandcut = async (req, res) => {
    try {
        const { receiverId: chatId } = req.params;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json(new ApiError(400, "Invalid chat ID format"));
        }

        const chatObjectId = new mongoose.Types.ObjectId(chatId);

        // Parallel lookups for better performance
        const [existingChatUsage, activePlan, hasCompletedPlans, hasNonCompletedPlans] = await Promise.all([
            // Check if chat was already used in a COMPLETED or SUCCESS plan
            ChatUserPremium.findOne({
                user: userId,
                "payment.status": { $in: ["COMPLETED", "success"] },
                "usedChats.chatId": chatObjectId
            }).populate('plan').lean(),

            // Find the most recent active, COMPLETED or SUCCESS plan with remaining chats
            ChatUserPremium.findOne({
                user: userId,
                isActive: true,
                "payment.status": { $in: ["COMPLETED", "success"] },
                expiryDate: { $gt: new Date() },
                remainingChats: { $gt: 0 }
            }).sort({ purchaseDate: -1 }).populate('plan'),

            // Check if user has any COMPLETED or SUCCESS plans
            ChatUserPremium.exists({
                user: userId,
                "payment.status": { $in: ["COMPLETED", "success"] }
            }),

            // Check if user has any non-COMPLETED and non-SUCCESS plans
            ChatUserPremium.exists({
                user: userId,
                "payment.status": { $nin: ["COMPLETED", "success"] }
            })
        ]);

        // Case 1: Chat was previously accessed with a valid plan
        if (existingChatUsage) {
            return res.status(200).json({
                success: true,
                activePlan: {
                    _id: existingChatUsage._id,
                    remainingChats: existingChatUsage.remainingChats,
                    expiryDate: existingChatUsage.expiryDate,
                    plan: existingChatUsage.plan,
                    previouslyUsed: true,
                    lastUsedAt: existingChatUsage.usedChats.find(chat => chat.chatId.equals(chatObjectId)).usedAt
                }
            });
        }

        // Case 2: Active plan available
        if (activePlan) {
            // Prepare update operations
            const updateOps = {
                $inc: { remainingChats: -1 },
                $push: { usedChats: { chatId: chatObjectId, usedAt: new Date() } }
            };

            // Auto-deactivate if no chats will be left after this operation
            if (activePlan.remainingChats <= 1) {
                updateOps.$set = { isActive: false };
            }

            // Fire-and-forget the update (no need to await for response)
            ChatUserPremium.updateOne({ _id: activePlan._id }, updateOps)
                .catch(err => console.error('Error updating chat plan:', err));

            return res.status(200).json({
                success: true,
                activePlan: {
                    _id: activePlan._id,
                    remainingChats: activePlan.remainingChats - 1,
                    expiryDate: activePlan.expiryDate,
                    plan: activePlan.plan,
                    lastUsedAt: new Date()
                }
            });
        }

        // Case 3: No active plan available
        let errorMessage = "No active chat packs available.";
        const metadata = { suggestPurchase: true };

        if (hasCompletedPlans) {
            errorMessage = "Your chat packs have expired or been fully used. Please purchase a new pack.";
            metadata.hasPreviousPlans = true;
        } else if (hasNonCompletedPlans) {
            errorMessage = "You have pending payments. Please complete your payment to access chats.";
            metadata.hasPendingPayments = true;
        }
        else {
            errorMessage = "You don`t have active plan . Please complete your payment to access chats.";
            metadata.hasPendingPayments = true;
        }

        return res.status(403).json(
            new ApiError(403, errorMessage, null, metadata)
        );

    } catch (error) {
        console.error("Error in checkChatAccess:", error);
        return res.status(500).json(
            new ApiError(500, "Internal server error while checking chat access")
        );
    }
};