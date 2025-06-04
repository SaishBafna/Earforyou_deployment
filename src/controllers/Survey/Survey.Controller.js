import Survey from "../../models/Survey.js";


// @desc    Create a new survey
// @route   POST /api/surveys
// @access  Public
export const createSurvey = async (req, res) => {
    try {
        const {
            name,
            email,
            mobile,
            nervousnessFrequency,
            panicAttack,
            strategies,
            effectiveness,
            hasResources,
            resourcesUsed,
            diagnosed,
            selfSuspect,
            confidence,
            treatments,
            infoSources,
            stigma,
            awareness,
            likelihood,
            desiredFeatures,
        } = req.body;

        // Validate required fields (example: email or mobile must be provided)
        if (!email && !mobile) {
            return res.status(400).json({
                success: false,
                message: 'Email or mobile number is required.'
            });
        }

        // Check for existing survey (case-insensitive email check, trimmed mobile)
        const existingSurvey = await Survey.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${email}$`, 'i') } }, // Case-insensitive
                { mobile: mobile?.trim() } // Trim whitespace
            ]
        });

        if (existingSurvey) {
            return res.status(400).json({
                success: false,
                message: 'A survey with this email or mobile number already exists.',
                existingSurveyId: existingSurvey._id // Optional: Return existing record ID
            });
        }

        // Create and save the new survey
        const survey = new Survey({
            name,
            email,
            mobile,
            nervousnessFrequency,
            panicAttack,
            strategies,
            effectiveness,
            hasResources,
            resourcesUsed,
            diagnosed,
            selfSuspect,
            confidence,
            treatments,
            infoSources,
            stigma,
            awareness,
            likelihood,
            desiredFeatures,
        });

        const createdSurvey = await survey.save();

        // Success response (201 Created)
        res.status(201).json({
            success: true,
            message: 'Survey created successfully.',
            data: createdSurvey
        });
    } catch (error) {
        // Log the error for debugging (do not expose sensitive details)
        console.error('Survey creation error:', error.message);

        // Generic error response (500 Internal Server Error)
        res.status(500).json({
            success: false,
            message: 'An error occurred while creating the survey.'
        });
    }
};

// @desc    Get all surveys
// @route   GET /api/surveys
// @access  Public
export const getSurveys = async (req, res) => {
    try {
        const surveys = await Survey.find({});
        res.json(surveys);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get survey by ID
// @route   GET /api/surveys/:id
// @access  Public
export const getSurveyById = async (req, res) => {
    try {
        const survey = await Survey.findById(req.params.id);

        if (survey) {
            res.json(survey);
        } else {
            res.status(404).json({ message: 'Survey not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get survey statistics
// @route   GET /api/surveys/stats
// @access  Public
export const getSurveyStats = async (req, res) => {
    try {
        const totalSurveys = await Survey.countDocuments();
        const panicAttackStats = await Survey.aggregate([
            { $group: { _id: '$panicAttack', count: { $sum: 1 } } }
        ]);
        const diagnosedStats = await Survey.aggregate([
            { $group: { _id: '$diagnosed', count: { $sum: 1 } } }
        ]);
        const stigmaStats = await Survey.aggregate([
            { $group: { _id: '$stigma', count: { $sum: 1 } } }
        ]);

        res.json({
            totalSurveys,
            panicAttackStats,
            diagnosedStats,
            stigmaStats,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};