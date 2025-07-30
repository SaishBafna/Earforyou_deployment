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
                dailyLogs: [{ date: new Date(), }],
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
            streak.dailyLogs.push({ date: new Date() });
        }

        await streak.save();
        console.log("Streak created/updated successfully:", streak);
    } catch (error) {
        console.error("createStreak error:", error);
    }
};


export const getStreak = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: "userId is required." });
        }

        let streak = await Streak.findOne({ userId });

        if (!streak) {
            return res.status(404).json({ message: "Streak not found." });
        }

        const today = moment().startOf('day');
        const lastUpdated = moment(streak.lastUpdated).startOf('day');
        const daysSinceLastUpdate = today.diff(lastUpdated, 'days');

        // Calculate current streak by checking consecutive days from today backwards
        let currentStreak = 0;
        let checkingDay = today.clone();

        // Sort logs by date in descending order for easier processing
        const sortedLogs = [...streak.dailyLogs].sort((a, b) =>
            moment(b.date).valueOf() - moment(a.date).valueOf()
        );

        // Check if today was logged
        const todayLogged = sortedLogs.some(log =>
            moment(log.date).isSame(today, 'day')
        );

        if (todayLogged) {
            currentStreak = 1;
            checkingDay.subtract(1, 'day');

            // Count consecutive previous days
            for (const log of sortedLogs) {
                const logDate = moment(log.date).startOf('day');
                if (logDate.isSame(checkingDay, 'day')) {
                    currentStreak++;
                    checkingDay.subtract(1, 'day');
                } else if (logDate.isBefore(checkingDay, 'day')) {
                    // If we find a log before our checking day, break the streak
                    break;
                }
            }
        } else {
            // If today wasn't logged, check yesterday's streak
            checkingDay.subtract(1, 'day');

            for (const log of sortedLogs) {
                const logDate = moment(log.date).startOf('day');
                if (logDate.isSame(checkingDay, 'day')) {
                    currentStreak++;
                    checkingDay.subtract(1, 'day');
                } else if (logDate.isBefore(checkingDay, 'day')) {
                    break;
                }
            }
        }

        // Update streak count in database if different
        if (streak.streakCount !== currentStreak) {
            streak.streakCount = currentStreak;
            streak.lastUpdated = today.toDate();
            await streak.save();
        }

        res.status(200).json({
            message: "Streak data retrieved successfully!",
            currentStreak,
            dailyLogs: streak.dailyLogs,
            lastUpdated: streak.lastUpdated
        });

    } catch (error) {
        console.error("getStreak error:", error);
        res.status(500).json({ message: "An error occurred while retrieving the streak." });
    }
};