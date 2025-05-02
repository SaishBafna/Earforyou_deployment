import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ChatUserPremium } from "../../models/Subscriptionchat/ChatUserPremium.js";
import mongoose from "mongoose";


// Add debug configuration
const debug = require('debug')('chat:access');
debug.enabled = process.env.NODE_ENV !== 'production';

export const checkChatAccess = asyncHandler(async (req, res, next) => {
    const { receiverId: chatId } = req.params;
    const userId = req.user._id;

    debug(`Checking chat access for user ${userId} to chat ${chatId}`);

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
        debug(`Invalid chat ID format: ${chatId}`);
        throw new ApiError(400, "Invalid chat ID format");
    }

    // Convert to ObjectId for consistent comparison
    const chatObjectId = new mongoose.Types.ObjectId(chatId);

    debug(`Looking for active plans for user ${userId}`);
    
    // Find the most recent active plan that hasn't been used for this chat
    const activePlan = await ChatUserPremium.findOne({
        user: userId,
        isActive: true,
        "payment.status": "COMPLETED",
        expiryDate: { $gt: new Date() },
        remainingChats: { $gt: 0 },
        "usedChats.chatId": { $ne: chatObjectId }
    }).sort({ purchaseDate: -1 }).populate('plan');

    if (activePlan) {
        debug(`Found active plan ${activePlan._id} with ${activePlan.remainingChats} chats remaining`);
        
        // Check if this chat was already used in any plan (active or inactive)
        const chatUsedInAnyPlan = await ChatUserPremium.exists({
            user: userId,
            "usedChats.chatId": chatObjectId
        });

        if (chatUsedInAnyPlan) {
            debug(`Chat ${chatId} was already used in another plan`);
            throw new ApiError(403, "This chat was already accessed using a different chat pack", null, {
                suggestPurchase: true,
                chatAlreadyUsed: true
            });
        }

        // Decrement remaining chats & update usedChats
        activePlan.remainingChats -= 1;
        activePlan.usedChats.push({ 
            chatId: chatObjectId, 
            usedAt: new Date() 
        });

        // Auto-deactivate if no chats left or expired
        if (activePlan.remainingChats <= 0 || activePlan.expiryDate <= new Date()) {
            debug(`Auto-deactivating plan ${activePlan._id}`);
            activePlan.isActive = false;
        }

        await activePlan.save();
        debug(`Plan ${activePlan._id} updated. Remaining chats: ${activePlan.remainingChats}`);

        req.activePlan = {
            _id: activePlan._id,
            remainingChats: activePlan.remainingChats,
            expiryDate: activePlan.expiryDate,
            plan: activePlan.plan,
            lastUsedAt: new Date()
        };

        return next();
    }

    debug(`No active plan found for user ${userId}`);
    
    // Check if user has any inactive plans (for better error messaging)
    const hasInactivePlans = await ChatUserPremium.exists({
        user: userId,
        $or: [
            { isActive: false },
            { "payment.status": { $ne: "COMPLETED" } },
            { expiryDate: { $lte: new Date() } },
            { remainingChats: { $lte: 0 } }
        ]
    });

    // Check if this specific chat was already used
    const chatWasUsed = await ChatUserPremium.exists({
        user: userId,
        "usedChats.chatId": chatObjectId
    });

    if (chatWasUsed) {
        debug(`Chat ${chatId} was previously used by user ${userId}`);
        throw new ApiError(403, "This chat was already accessed using a different chat pack", null, {
            suggestPurchase: true,
            chatAlreadyUsed: true
        });
    }

    throw new ApiError(
        403,
        hasInactivePlans
            ? "Your chat packs have expired or been fully used. Please purchase a new pack."
            : "No active chat packs available. Please purchase a pack to start chatting.",
        null,
        {
            suggestPurchase: true,
            hasPreviousPlans: hasInactivePlans
        }
    );
});

// export const checkChatAccess = asyncHandler(async (req, res, next) => {
//     const { receiverId: chatId } = req.params; // Changed to match route param
//     const userId = req.user._id;

//     // Validate chatId format
//     if (!mongoose.Types.ObjectId.isValid(chatId)) {
//         throw new ApiError(400, "Invalid chat ID format");
//     }

//     // 1. Find and update the most appropriate active plan atomically
//     const activePlan = await ChatUserPremium.findOneAndUpdate(
//         {
//             user: userId,
//             isActive: true,
//             expiryDate: { $gt: new Date() },
//             remainingChats: { $gt: 0 },
//             "usedChats.chatId": { $ne: chatId } // Prevent duplicate usage
//         },
//         [
//             { // Using pipeline form for more complex logic
//                 $set: {
//                     remainingChats: { $subtract: ["$remainingChats", 1] },
//                     usedChats: { $concatArrays: ["$usedChats", [{ chatId, usedAt: new Date() }]] },
//                     isActive: {
//                         $and: [
//                             { $gt: ["$remainingChats", 1] }, // Will be 1 after decrement
//                             { $gt: ["$expiryDate", new Date()] }
//                         ]
//                     },
//                     lastUsedAt: new Date()
//                 }
//             }
//         ],
//         {
//             new: true,
//             sort: { purchaseDate: 1 } // Oldest first (FIFO)
//         }
//     ).populate('plan', 'name chatsAllowed validityDays');

//     if (!activePlan) {
//         // Check for potential reasons
//         const hasInactivePlans = await ChatUserPremium.exists({
//             user: userId,
//             $or: [
//                 { isActive: false },
//                 { expiryDate: { $lte: new Date() } },
//                 { remainingChats: { $lte: 0 } }
//             ]
//         });

//         throw new ApiError(
//             403,
//             hasInactivePlans
//                 ? "Your chat packs have expired or been fully used. Please purchase a new pack."
//                 : "No active chat packs available. Please purchase a pack to start chatting.",
//             null,
//             { // Additional data for client
//                 suggestPurchase: true,
//                 hasPreviousPlans: hasInactivePlans
//             }
//         );
//     }

//     // Attach plan details to request
//     req.activePlan = {
//         _id: activePlan._id,
//         remainingChats: activePlan.remainingChats,
//         expiryDate: activePlan.expiryDate,
//         plan: activePlan.plan,
//         lastUsedAt: activePlan.lastUsedAt
//     };

//     next();
// });