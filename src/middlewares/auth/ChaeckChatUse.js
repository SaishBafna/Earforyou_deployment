// import { asyncHandler } from "../../utils/asyncHandler.js";
// import { ApiError } from "../../utils/ApiError.js";
// import { ChatUserPremium } from "../../models/Subscriptionchat/ChatUserPremium.js";
// import mongoose from "mongoose";

// export const checkChatAccess = asyncHandler(async (req, res, next) => {
//     const { receiverId: chatId } = req.params;
//     const userId = req.user._id;

//     console.log(`Checking chat access for user ${userId} to chat ${chatId}`);

//     if (!mongoose.Types.ObjectId.isValid(chatId)) {
//         console.log(`Invalid chat ID format: ${chatId}`);
//         throw new ApiError(400, "Invalid chat ID format");
//     }

//     // Convert to ObjectId for consistent comparison
//     const chatObjectId = new mongoose.Types.ObjectId(chatId);

//     // First, check if this chat was already used in any COMPLETED plan
//     const existingChatUsage = await ChatUserPremium.findOne({
//         user: userId,
//         "payment.status": "COMPLETED",
//         "usedChats.chatId": chatObjectId
//     }).populate('plan');

//     if (existingChatUsage) {
//         console.log(`Chat ${chatId} was already used in plan ${existingChatUsage._id}`);

//         // Allow access since chat was previously accessed with a valid plan
//         req.activePlan = {
//             _id: existingChatUsage._id,
//             remainingChats: existingChatUsage.remainingChats,
//             expiryDate: existingChatUsage.expiryDate,
//             plan: existingChatUsage.plan,
//             previouslyUsed: true,
//             lastUsedAt: existingChatUsage.usedChats.find(chat => chat.chatId.equals(chatObjectId)).usedAt
//         };

//         return next();
//     }

//     // Find the most recent active, COMPLETED plan with remaining chats
//     const activePlan = await ChatUserPremium.findOne({
//         user: userId,
//         isActive: true,
//         "payment.status": "COMPLETED",
//         expiryDate: { $gt: new Date() },
//         remainingChats: { $gt: 0 }
//     }).sort({ purchaseDate: -1 }).populate('plan');

//     if (activePlan) {
//         console.log(`Found active plan ${activePlan._id} with ${activePlan.remainingChats} chats remaining`);

//         // Decrement remaining chats & update usedChats
//         activePlan.remainingChats -= 1;
//         activePlan.usedChats.push({
//             chatId: chatObjectId,
//             usedAt: new Date()
//         });

//         // Auto-deactivate if no chats left
//         if (activePlan.remainingChats <= 0) {
//             console.log(`Auto-deactivating plan ${activePlan._id} (no chats remaining)`);
//             activePlan.isActive = false;
//         }

//         await activePlan.save();
//         console.log(`Plan ${activePlan._id} updated. Remaining chats: ${activePlan.remainingChats}`);

//         req.activePlan = {
//             _id: activePlan._id,
//             remainingChats: activePlan.remainingChats,
//             expiryDate: activePlan.expiryDate,
//             plan: activePlan.plan,
//             lastUsedAt: new Date()
//         };

//         return next();
//     }

//     console.log(`No active plan found for user ${userId}`);

//     // Check if user has any COMPLETED plans (even if expired/used up)
//     const hasCompletedPlans = await ChatUserPremium.exists({
//         user: userId,
//         "payment.status": "COMPLETED"
//     });

//     // Check if user has any plans that are not COMPLETED
//     const hasNonCompletedPlans = await ChatUserPremium.exists({
//         user: userId,
//         "payment.status": { $ne: "COMPLETED" }
//     });

//     let errorMessage = "No active chat packs available.";
//     let metadata = { suggestPurchase: true };

//     if (hasCompletedPlans) {
//         errorMessage = "Your chat packs have expired or been fully used. Please purchase a new pack.";
//         metadata.hasPreviousPlans = true;
//     } else if (hasNonCompletedPlans) {
//         errorMessage = "You have pending payments. Please complete your payment to access chats.";
//         metadata.hasPendingPayments = true;
//     }

//     throw new ApiError(403, errorMessage, null, metadata);
// });



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
        // Check if chat was already used in a COMPLETED plan
        ChatUserPremium.findOne({
            user: userId,
            "payment.status": "COMPLETED",
            "usedChats.chatId": chatObjectId
        }).populate('plan').lean(),

        // Find the most recent active, COMPLETED plan with remaining chats
        ChatUserPremium.findOne({
            user: userId,
            isActive: true,
            "payment.status": "COMPLETED",
            expiryDate: { $gt: new Date() },
            remainingChats: { $gt: 0 }
        }).sort({ purchaseDate: -1 }).populate('plan'),

        // Check if user has any COMPLETED plans
        ChatUserPremium.exists({
            user: userId,
            "payment.status": "COMPLETED"
        }),

        // Check if user has any non-COMPLETED plans
        ChatUserPremium.exists({
            user: userId,
            "payment.status": { $ne: "COMPLETED" }
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