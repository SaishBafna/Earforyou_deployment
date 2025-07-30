import Meditation from "../../models/Meditation.js";

// Create a new meditation
export const createMeditation = async (req, res) => {
    try {
        const { title, description, duration } = req.body;

        const newMeditation = new Meditation({
            title,
            description,
            duration,
        });

        await newMeditation.save();
        res.status(201).json({ message: "Meditation created successfully", newMeditation });
    } catch (error) {
        res.status(500).json({ message: "Error creating meditation", error });
    }
};

// Get meditations with pagination and search by title
export const getMeditations = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = "" } = req.query;

        const query = search
            ? { title: { $regex: search, $options: "i" } } // Case-insensitive search
            : {};

        const meditations = await Meditation.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Meditation.countDocuments(query);

        res.status(200).json({
            meditations,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching meditations", error });
    }
};