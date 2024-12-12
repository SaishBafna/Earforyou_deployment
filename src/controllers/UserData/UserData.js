import Review from "../../models/LeaderBoard/Review.js";
import CallLog from "../../models/Talk-to-friend/callLogModel.js";
import User from "../../models/Users.js";

export const userStatics = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        console.log("userId", userId);
        // Total reviews by the user
        const totalReviews = await Review.countDocuments({ user: userId });
        console.log("totalReviews", totalReviews)
        // Total ongoing calls (assuming ongoing calls have no endTime)
        const totalOutgoingCalls = await CallLog.countDocuments({
            caller: userId, // Only match calls initiated by the user
            endTime: { $exists: false } // Ongoing calls (without an endTime)
        });


        // Total incoming calls for the user
        const totalIncomingCalls = await CallLog.countDocuments({ receiver: userId });
        console.log("totalIncomingCalls", totalIncomingCalls)
        // Total calls involving the user (both incoming and outgoing)
        const totalCalls = await CallLog.countDocuments({
            $or: [{ caller: userId }, { receiver: userId }]
        });

        return res.status(200).json({
            totalReviews,
            totalOutgoingCalls,
            totalIncomingCalls,
            totalCalls
        });
    } catch (error) {
        console.error("Error fetching user statistics:", error);
        return res.status(500).json({ message: "Error fetching user statistics", error });
    }
};