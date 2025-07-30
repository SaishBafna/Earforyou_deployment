import mongoose from "mongoose";
import User from "../../models/Users.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";

export const checkChatStatus = asyncHandler(async (req, res, next) => {
    const { receiverId } = req.params;


    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        throw new ApiError(400, "Invalid receiver ID format");
    }

    const receiver = await User.findById(receiverId)
        .select("ChatStatus")
        .lean()
        .exec();

    if (!receiver) {
        throw new ApiError(404, "User not found", null, { receiverId });
    }

    if (receiver.ChatStatus !== 'Active') {
        throw new ApiError(403, "Chat is not available with this user", null, {
            receiverId,
            status: receiver.ChatStatus
        });
    }

    req.chatStatus = receiver.ChatStatus;
    next();
});