import EarningWallet from "../../models/Wallet/EarningWallet.js";
import WithdrawalRequest from "../../models/Wallet/WithWrdal.js";
import mongoose from "mongoose";



export const requestWithdrawal = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { amount } = req.body;

        // Define the daily withdrawal limit
        const DAILY_LIMIT = 1000; // ₹29 per day

        // Validate amount
        if (amount <= 0) {
            return res.status(400).json({ error: "Invalid withdrawal amount." });
        }

        // Fetch user earnings wallet
        const wallet = await EarningWallet.findOne({ userId });
        if (!wallet) {
            return res.status(404).json({ error: "Earning wallet not found." });
        }

        // Check if user has enough balance
        if (wallet.balance < amount) {
            return res.status(400).json({ error: "Insufficient balance." });
        }

        const existingPendingRequest = await WithdrawalRequest.findOne({
            userId,
            status: 'pending',
        });
        
        if (existingPendingRequest) {
            return res.status(400).json({ error: "You already have a pending withdrawal request." });
        }

        // Get today's date range (00:00:00 to 23:59:59)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // Calculate total withdrawn today (INCLUDING pending & completed, EXCLUDING rejected)
        const totalWithdrawnToday = await WithdrawalRequest.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    requestedAt: { $gte: todayStart, $lte: todayEnd },
                    status: { $ne: 'rejected' }, // Exclude rejected withdrawals
                },
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" },
                },
            },
        ]);

        const withdrawnToday = totalWithdrawnToday.length > 0 ? totalWithdrawnToday[0].totalAmount : 0;
        const remainingLimit = DAILY_LIMIT - withdrawnToday;

        // Check if the new request would exceed the daily limit
        if (amount > remainingLimit) {
            return res.status(400).json({
                error: `Daily withdrawal limit of ₹${DAILY_LIMIT} exceeded. You can withdraw up to ₹${remainingLimit} more today.`,
            });
        }

        // Deduct the requested amount from the wallet
        wallet.deductions.push({
            amount,
            reason: "Withdrawal request",
            createdAt: new Date(),
        });

        // Manually calculate new balance
        const totalDeductions = wallet.deductions.reduce((sum, deduction) => sum + deduction.amount, 0);
        const totalEarnings = wallet.earnings.reduce((sum, earning) => sum + earning.amount, 0);

        // Update balance in the wallet
        wallet.balance = totalEarnings - totalDeductions;
        wallet.lastUpdated = new Date();

        // Save wallet changes
        await wallet.save();

        // Create a withdrawal request
        const withdrawalRequest = new WithdrawalRequest({
            userId,
            amount,
        });

        await withdrawalRequest.save();

        return res.status(200).json({
            message: "Withdrawal request submitted successfully.",
            request: withdrawalRequest,
            newBalance: wallet.balance, // Returning the updated balance for confirmation
            remainingLimit: remainingLimit - amount, // Correct remaining limit after request
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error." });
    }
};



export const getWithdrawal = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;

        // Pagination parameters
        const page = parseInt(req.query.page, 10) || 1; // Default page is 1
        const limit = parseInt(req.query.limit, 10) || 20; // Default limit is 20

        // Validate pagination parameters
        if (page <= 0 || limit <= 0) {
            return res.status(400).json({ error: 'Invalid page or limit value. Page and limit must be positive integers.' });
        }

        // Fetch withdrawal requests with pagination
        const totalTransactions = await WithdrawalRequest.countDocuments({ userId });
        const totalPages = Math.ceil(totalTransactions / limit);

        if (totalTransactions === 0) {
            return res.status(404).json({ message: 'No withdrawal transactions found.' });
        }

        const withdrawals = await WithdrawalRequest.find({ userId })
            .sort({ requestedAt: -1 }) // Sort by most recent first
            .skip((page - 1) * limit)
            .limit(limit);

        return res.status(200).json({
            message: 'Withdrawal transactions retrieved successfully.',
            withdrawals,
            currentPage: page,
            totalPages,
            totalTransactions,
        });
    } catch (error) {
        console.error('Error fetching withdrawal transactions:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};




