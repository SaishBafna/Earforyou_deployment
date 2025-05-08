import express from "express";
import { validateChatPayment,createChatPremium,getAllChatPremiumPlans } from "../../controllers/Recharge/ChatRecharge/ChatPayment.js";
import { getPremiumUserDetails } from "../../controllers/Recharge/ChatRecharge/ChatPayment.js";
import { validateCoupon } from "../../middlewares/Copunmiddleware/ValidateCopun.js";
const router = express.Router();
router.post("/createChatPremium", createChatPremium);
router.get("/getAllChatPremiumPlans", getAllChatPremiumPlans); // Get all chat premium plans
router.post("/validateChatPayment", validateChatPayment); // Validate chat payment
router.post("/validateCoupon", validateCoupon); // Validate coupon

router.get("/getPremiumUserDetails/:userId", getPremiumUserDetails); // Validate chat payment

export default router;
