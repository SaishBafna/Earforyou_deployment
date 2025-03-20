import CallRatePerMin from "../../models/Wallet/RatePerMin.js";

/**
 * Create a new call rate
 */
export const createCallRate = async (req, res) => {
    try {
        const { userCategory, userType, ratePerMinute, adminCommissionPercent } = req.body;

        if (!userCategory || !ratePerMinute || !adminCommissionPercent) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Check if rate already exists
        const existingRate = await CallRatePerMin.findOne({ userCategory, userType });

        if (existingRate) {
            return res.status(400).json({ success: false, message: 'Rate already exists for this category/type' });
        }

        const newCallRate = new CallRatePerMin({
            userCategory,
            userType,
            ratePerMinute,
            adminCommissionPercent
        });

        await newCallRate.save();

        res.status(201).json({
            success: true,
            message: 'Call rate created successfully',
            data: newCallRate
        });
    } catch (error) {
        console.error('Error creating call rate:', error);
        res.status(500).json({ success: false, message: 'Failed to create call rate', error: error.message });
    }
};

/**
 * Update an existing call rate
 */
export const updateCallRate = async (req, res) => {
    try {
        const { userCategory, userType, ratePerMinute, adminCommissionPercent } = req.body;

        if (!userCategory || ratePerMinute === undefined || adminCommissionPercent === undefined) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const updatedRate = await CallRatePerMin.findOneAndUpdate(
            { userCategory, userType },
            { ratePerMinute, adminCommissionPercent },
            { new: true }
        );

        if (!updatedRate) {
            return res.status(404).json({ success: false, message: 'Call rate not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Call rate updated successfully',
            data: updatedRate
        });
    } catch (error) {
        console.error('Error updating call rate:', error);
        res.status(500).json({ success: false, message: 'Failed to update call rate', error: error.message });
    }
};

/**
 * Get all call rates
 */
export const getAllCallRates = async (req, res) => {
    try {
        const callRates = await CallRatePerMin.find();
        res.status(200).json({ success: true, data: callRates });
    } catch (error) {
        console.error('Error fetching call rates:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch call rates', error: error.message });
    }
};

/**
 * Get call rate by category and user type
 */

export const getCallRateByCategory = async (req, res) => {
    try {
        const { userCategory, userType } = req.query;

        if (!userCategory) {
            return res.status(400).json({ success: false, message: 'User category is required' });
        }

        const callRate = await CallRatePerMin.findOne({ userCategory, userType });

        if (!callRate) {
            return res.status(404).json({ success: false, message: 'Call rate not found' });
        }

        res.status(200).json({ success: true, data: callRate });
    } catch (error) {
        console.error('Error fetching call rate:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch call rate', error: error.message });
    }
};
