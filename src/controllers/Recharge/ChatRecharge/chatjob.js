
import cron from "node-cron";
import mongoose from "mongoose";
import { ChatUserPremium } from "../../../models/Subscriptionchat/ChatUserPremium.js";
import logger from "../../../logger/winston.logger.js";

const TIMEZONE = "Asia/Kolkata";

// Schedule the cron job
cron.schedule("58 23 * * *", async () => {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const now = new Date();
            logger.info(`[SubscriptionCron] Running at ${now.toISOString()}`);

            const result = await ChatUserPremium.updateMany(
                {
                    expiryDate: { $lt: now },
                    isActive: true,
                },
                { $set: { isActive: false } },
                { session }
            );

            if (result.modifiedCount > 0) {
                logger.info(`[SubscriptionCron] Deactivated ${result.modifiedCount} subscriptions`);
            } else {
                logger.info("[SubscriptionCron] No expired subscriptions found");
            }
        });
    } catch (error) {
        logger.error("[SubscriptionCron] Error:", error);
    } finally {
        await session.endSession();
    }
}, {
    timezone: TIMEZONE
});
