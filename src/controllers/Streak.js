import Streak from "../models/StreakMannnagement.js";
import moment from "moment";

// Create or update user's streak
export const createStreak = async (userId) => {
    try {
        if (!userId) {
            return console.error("userId is required.");
        }

        let streak = await Streak.findOne({ userId });
        const today = moment().startOf('day');

        if (!streak) {
            // New streak
            streak = new Streak({
                userId,
                streakCount: 1,
                lastUpdated: new Date(),
                dailyLogs: [{ date: new Date(),  }],
            });
        } else {
            const lastUpdated = moment(streak.lastUpdated).startOf('day');

            if (today.isSame(lastUpdated)) {
                // Already logged today, no action needed
                return console.log("Streak already logged for today.");
            }

            // Continue existing streak
            streak.streakCount += 1;
            streak.lastUpdated = new Date();
            streak.dailyLogs.push({ date: new Date(), activity });
        }

        await streak.save();
        console.log("Streak created/updated successfully:", streak);
    } catch (error) {
        console.error("createStreak error:", error);
    }
};

// Get user's streak and weekly stats
export const getStreak = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: "userId is required." });
        }

        const streak = await Streak.findOne({ userId });

        if (!streak) {
            return res.status(404).json({ message: "Streak not found." });
        }

        const today = moment().startOf('day');
        const lastUpdated = moment(streak.lastUpdated).startOf('day');
        const startOfWeek = moment().startOf('isoWeek');
        const endOfWeek = moment().endOf('isoWeek');

        // Track missed days in current week (excluding today)
        const missedDays = [];
        for (let day = moment(startOfWeek); day.isSameOrBefore(endOfWeek); day.add(1, 'days')) {
            const hasActivity = streak.dailyLogs.some(log =>
                moment(log.date).startOf('day').isSame(day)
            );
            if (!hasActivity && day.isBefore(today)) {
                missedDays.push(day.format('YYYY-MM-DD'));
            }
        }

        if (missedDays.length > 0) {
            streak.streakCount = 0;
            await streak.save();
            return res.status(200).json({
                message: "Streak reset due to missed days.",
                missedDays,
                streak,
            });
        }

        // Weekly streak percentage
        const totalDaysInWeek = 7;
        const activeDays = streak.dailyLogs.filter(log =>
            moment(log.date).isBetween(startOfWeek, endOfWeek, 'day', '[]')
        ).length;
        const weeklyPercentage = (activeDays / totalDaysInWeek) * 100;

        res.status(200).json({
            message: "Streak retrieved successfully!",
            streak,
            weeklyPercentage: `${weeklyPercentage.toFixed(2)}%`,
        });
    } catch (error) {
        console.error("getStreak error:", error);
        res.status(500).json({ message: "An error occurred while retrieving the streak." });
    }
};
