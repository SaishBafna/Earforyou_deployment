import express from "express";
import { validateChatPayment,createChatPremium,getAllChatPremiumPlans } from "../../controllers/Recharge/ChatRecharge/ChatPayment.js";
const router = express.Router();
router.post("/createChatPremium", createChatPremium);
router.get("/getAllChatPremiumPlans", getAllChatPremiumPlans); // Get all chat premium plans
router.post("/validateChatPayment", validateChatPayment); // Validate chat payment

export default router;
