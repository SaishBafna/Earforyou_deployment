import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK AUTH MIDDLEWARE
=========================== */
jest.mock("../../src/middlewares/auth/authMiddleware.js", () => ({
  protect: (req, res, next) => {
    req.user = { _id: "507f1f77bcf86cd799439011" };
    next();
  },
}));

/* ===========================
   MOCK RECHARGE WALLET CONTROLLERS
=========================== */
jest.mock("../../src/controllers/Recharge/RechargeWallet.js", () => ({
  validatePayment: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: "Payment validated" })
  ),

  getRechargeHistory: jest.fn((req, res) =>
    res.status(200).json({ success: true, recharges: [] })
  ),

  getAllPlans: jest.fn((req, res) =>
    res.status(200).json({ success: true, plans: [] })
  ),

  transferEarningsToWallet: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: "Transferred successfully" })
  ),

  getEarningHistory: jest.fn((req, res) =>
    res.status(200).json({ success: true, earnings: [] })
  ),
}));

/* ===========================
   MOCK DEDUCTION CONTROLLERS
=========================== */
jest.mock("../../src/controllers/Recharge/Decudition.js", () => ({
  deductPerMinute: jest.fn((req, res) =>
    res.status(200).json({ success: true, deducted: true })
  ),

  getCallRate: jest.fn((req, res) =>
    res.status(200).json({ success: true, rate: 5 })
  ),
}));

/* ===========================
   MOCK WITHDRAWAL CONTROLLERS
=========================== */
jest.mock("../../src/controllers/Withdrawal/Withdrawal.js", () => ({
  requestWithdrawal: jest.fn((req, res) =>
    res.status(201).json({ success: true, message: "Withdrawal requested" })
  ),

  getWithdrawal: jest.fn((req, res) =>
    res.status(200).json({ success: true, withdrawals: [] })
  ),
}));

/* ===========================
   MOCK CALL RATE CONTROLLERS
=========================== */
jest.mock(
  "../../src/controllers/Recharge/RatePerMinController.js",
  () => ({
    createCallRate: jest.fn((req, res) =>
      res.status(201).json({ success: true, message: "Call rate created" })
    ),

    updateCallRate: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Call rate updated" })
    ),

    getAllCallRates: jest.fn((req, res) =>
      res.status(200).json({ success: true, rates: [] })
    ),

    getCallRateByCategory: jest.fn((req, res) =>
      res.status(200).json({ success: true, rates: [] })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Recharge & Wallet Routes API", () => {
  const userId = "507f1f77bcf86cd799439012";

  it("GET /api/recharge/getCallRate", async () => {
    const res = await request(app).get("/api/recharge/getCallRate");
    expect(res.statusCode).toBe(200);
    expect(res.body.rate).toBe(5);
  });

  it("POST /api/recharge/validate - validate payment", async () => {
    const res = await request(app)
      .post("/api/recharge/validate")
      .send({ transactionId: "txn_123" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Payment validated");
  });

  it("GET /api/recharge/getAllPlans", async () => {
    const res = await request(app).get("/api/recharge/getAllPlans");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.plans)).toBe(true);
  });

  it("POST /api/recharge/recharges/:userId", async () => {
    const res = await request(app).post(
      `/api/recharge/recharges/${userId}`
    );

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.recharges)).toBe(true);
  });

  it("POST /api/recharge/earning/:userId", async () => {
    const res = await request(app).post(
      `/api/recharge/earning/${userId}`
    );

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.earnings)).toBe(true);
  });

  it("POST /api/recharge/deductPerMinute", async () => {
    const res = await request(app)
      .post("/api/recharge/deductPerMinute")
      .send({ minutes: 2 });

    expect(res.statusCode).toBe(200);
    expect(res.body.deducted).toBe(true);
  });

  it("POST /api/recharge/transferEarningsToWallet", async () => {
    const res = await request(app)
      .post("/api/recharge/transferEarningsToWallet")
      .send({ amount: 100 });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Transferred successfully");
  });

  it("POST /api/recharge/requestWithdrawal", async () => {
    const res = await request(app)
      .post("/api/recharge/requestWithdrawal")
      .send({ amount: 200 });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Withdrawal requested");
  });

  it("GET /api/recharge/getWithdrawal", async () => {
    const res = await request(app).get("/api/recharge/getWithdrawal");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.withdrawals)).toBe(true);
  });

  it("POST /api/recharge/create - create call rate", async () => {
    const res = await request(app)
      .post("/api/recharge/create")
      .send({ rate: 10 });

    expect(res.statusCode).toBe(201);
  });

  it("PUT /api/recharge/update - update call rate", async () => {
    const res = await request(app)
      .put("/api/recharge/update")
      .send({ rate: 12 });

    expect(res.statusCode).toBe(200);
  });

  it("GET /api/recharge/all - get all call rates", async () => {
    const res = await request(app).get("/api/recharge/all");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.rates)).toBe(true);
  });

  it("GET /api/recharge/category - get call rate by category", async () => {
    const res = await request(app)
      .get("/api/recharge/category")
      .query({ category: "Mechanic" });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.rates)).toBe(true);
  });
});
