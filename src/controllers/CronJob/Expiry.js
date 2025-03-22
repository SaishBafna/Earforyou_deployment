import cron from 'node-cron';
import mongoose from 'mongoose';
import PlatformCharges from '../../models/Wallet/PlatfromCharges/Platfrom.js';

export const expirePlatformCharges = async (req, res) => {
    try {
        // Get today's date at start and end of day
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0); // Start of day (12:00:00 AM)

        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999); // End of day (11:59:59 PM)

        // Activate plans that are queued or whose start date is today
        const activateResult = await PlatformCharges.updateMany(
            {
                status: { $in: ['queued'] }, // Plans that are queued or pending
                startDate: { $gte: startOfDay, $lte: endOfDay }
            },
            { $set: { status: 'active' } }
        );

        // Expire plans that are active and whose end date is today
        const expireResult = await PlatformCharges.updateMany(
            {
                status: 'active',
                endDate: { $gte: startOfDay, $lte: endOfDay }
            },
            { $set: { status: 'expired' } }
        );

        // console.log(`[CRON] Platform charges activated: ${activateResult.modifiedCount}`);
        // console.log(`[CRON] Platform charges expired: ${expireResult.modifiedCount}`);

        res.status(200).json({
            message: "Success ",
            activateResult,
            expireResult
        })

    } catch (error) {
        console.error('[CRON] Error updating platform charges:', error);
    }
};

// // Schedule the cron job to run daily at 11:55 PM IST
// cron.schedule('59 23 * * *', expirePlatformCharges, {
//     scheduled: true,
//     timezone: 'Asia/Kolkata'
// });




// Function to update platform charges
const updatePlatformCharges = async () => {
    try {
        // Get today's date at start and end of day
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0); // Start of day (12:00:00 AM)

        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999); // End of day (11:59:59 PM)

        // Activate plans that are queued or whose start date is today
        const activateResult = await PlatformCharges.updateMany(
            {
                status: { $in: ['queued', 'pending'] }, // Plans that are queued or pending
                startDate: { $gte: startOfDay, $lte: endOfDay }
            },
            { $set: { status: 'active' } }
        );

        // Expire plans that are active and whose end date is today
        const expireResult = await PlatformCharges.updateMany(
            {
                status: 'active',
                endDate: { $gte: startOfDay, $lte: endOfDay }
            },
            { $set: { status: 'expired' } }
        );

        console.log(`[SCHEDULED] Platform charges activated: ${activateResult.modifiedCount}`);
        console.log(`[SCHEDULED] Platform charges expired: ${expireResult.modifiedCount}`);

    } catch (error) {
        console.error('[SCHEDULED] Error updating platform charges:', error);
    }

    // Schedule next run at exactly 11:59 PM
    scheduleNextRun();
};

// Function to calculate time until the next 11:59 PM and schedule the next execution
export const scheduleNextRun = () => {
    console.log("Run THe Function ")
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(23, 59, 0, 0); // Set time to 11:59 PM

    if (now >= nextRun) {
        // If current time is already past 11:59 PM, schedule for tomorrow
        nextRun.setDate(nextRun.getDate() + 1);
    }

    const timeUntilNextRun = nextRun - now; // Milliseconds until next run

    console.log(`[SCHEDULED] Next execution at: ${nextRun.toLocaleString()}`);

    setTimeout(updatePlatformCharges, timeUntilNextRun);
};


