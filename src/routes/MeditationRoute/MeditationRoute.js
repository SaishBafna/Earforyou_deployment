import express from "express";
import { getMeditations, createMeditation } from "../../controllers/Meditation/MedController.js";

const router = express.Router();

// Route to get all meditations
router.get("/", getMeditations);

// Route to create a new meditation
router.post("/", createMeditation);

export default router;