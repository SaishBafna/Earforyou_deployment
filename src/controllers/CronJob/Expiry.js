import cron from 'node-cron';
import mongoose from 'mongoose';
import PlatformCharges from '../../models/Wallet/PlatfromCharges/Platfrom.js';

export const expirePlatformCharges = async () => {
    try {
        // Get today's date at start and end of day
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0); // Start of day (12:00:00 AM)

        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999); // End of day (11:59:59 PM)

        // Expire plans whose `endDate` is exactly today (not earlier)
        const expiredResult = await PlatformCharges.updateMany(
            {
                endDate: {
                    $gte: startOfDay,
                    $lte: endOfDay
                },
                status: { $ne: 'expired' }
            },
            { $set: { status: 'expired' } }
        );

        // Activate plans whose `startDate` is exactly today and are still pending
        const activeResult = await PlatformCharges.updateMany(
            {
                startDate: {
                    $gte: startOfDay,
                    $lte: endOfDay
                },
                status: 'pending'
            },
            { $set: { status: 'active' } }
        );

        console.log(`[CRON] Platform charges expired: ${expiredResult.modifiedCount}`);
        console.log(`[CRON] Platform charges activated: ${activeResult.modifiedCount}`);

    } catch (error) {
        console.error('[CRON] Error updating platform charges:', error);
    }
};

// Schedule the cron job to run daily at 11:50 PM
cron.schedule('50 23 * * *', expirePlatformCharges, {
    scheduled: true,
    timezone: 'Asia/Kolkata' // Set your server timezone if needed
});


