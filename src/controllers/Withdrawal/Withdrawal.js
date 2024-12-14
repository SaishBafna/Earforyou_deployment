import EarningWallet from "../../models/Wallet/EarningWallet.js";
import WithdrawalRequest from "../../models/Wallet/WithWrdal.js";

export const requestWithdrawal = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { amount } = req.body;

        // Fetch user earnings
        const wallet = await EarningWallet.findOne({ userId });
        if (!wallet) {
            return res.status(404).json({ error: 'Earning wallet not found.' });
        }

        // Check if the user has sufficient balance
        if (wallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance.' });
        }

        // Create a withdrawal request
        const withdrawalRequest = new WithdrawalRequest({
            userId,
            amount,
        });

        await withdrawalRequest.save();

        // Optionally, notify admin (e.g., via email or dashboard update)

        return res.status(200).json({
            message: 'Withdrawal request submitted successfully.',
            request: withdrawalRequest,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error.' });
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
            return res.status(400).json({ error: 'Invalid page or limit value.' });
        }

        // Fetch user earnings with pagination
        const wallet = await EarningWallet.findOne({ userId });

        if (!wallet) {
            return res.status(404).json({ error: 'Earning wallet not found.' });
        }

        // Assuming withdrawals are stored in an array field like `transactions` in the wallet
        const transactions = wallet.transactions || [];

        // Paginate the transactions
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        const paginatedTransactions = transactions.slice(startIndex, endIndex);

        return res.status(200).json({
            message: 'Withdrawal transactions retrieved successfully.',
            transactions: paginatedTransactions,
            currentPage: page,
            totalPages: Math.ceil(transactions.length / limit),
            totalTransactions: transactions.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};



