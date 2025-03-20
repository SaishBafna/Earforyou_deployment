// routes/plans.js
import express from 'express';
import { createPlan, getAllPlans, buyPlanWithPayment, validatePayment } from "../../controllers/Recharge/PlatfromChareges/Platfrom.js";

// Create a new router instance
const router = express.Router();

// Route to create a new plan (POST /api/plans)
router.post('/PlatfromChargesCreate', createPlan);

// Route to get all plans (GET /api/plans)
router.get('/PlatfromChargesGet', getAllPlans);

router.post('/buyPlanWithPayment', buyPlanWithPayment);

router.get('/validatePayment/:merchantTransactionId/:userId/:planId', validatePayment);

// Export the router
export default router;