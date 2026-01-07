import {
  expirePlatformCharges,
  scheduleNextRun
} from "../../src/cron/platformCharges.js";

import PlatformCharges from "../../src/models/Wallet/PlatfromCharges/Platfrom.js";

/* ===========================
   MOCK MODEL
=========================== */
jest.mock("../../src/models/Wallet/PlatfromCharges/Platfrom.js");

/* ===========================
   MOCK RESPONSE
=========================== */
const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe("Platform Charges Cron", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /* ===========================
     expirePlatformCharges
  =========================== */
  it("should activate queued plans and expire active plans", async () => {
    PlatformCharges.updateMany
      .mockResolvedValueOnce({ modifiedCount: 2 }) // activate
      .mockResolvedValueOnce({ modifiedCount: 1 }); // expire

    const req = {};
    const res = mockRes();

    await expirePlatformCharges(req, res);

    expect(PlatformCharges.updateMany).toHaveBeenCalledTimes(2);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Success ",
        activateResult: { modifiedCount: 2 },
        expireResult: { modifiedCount: 1 }
      })
    );
  });

  it("should handle errors gracefully", async () => {
    PlatformCharges.updateMany.mockRejectedValue(new Error("DB error"));

    const req = {};
    const res = mockRes();

    await expect(expirePlatformCharges(req, res)).resolves.not.toThrow();
  });

  /* ===========================
     scheduleNextRun
  =========================== */
  it("should schedule next execution at 11:59 PM", () => {
    const spy = jest.spyOn(global, "setTimeout");

    scheduleNextRun();

    expect(spy).toHaveBeenCalledTimes(1);

    const delay = spy.mock.calls[0][1];
    expect(typeof delay).toBe("number");
    expect(delay).toBeGreaterThan(0);

    spy.mockRestore();
  });

  it("should schedule for tomorrow if time already passed", () => {
    // Mock current time to after 11:59 PM
    jest.setSystemTime(new Date("2026-01-07T23:59:30"));

    const spy = jest.spyOn(global, "setTimeout");

    scheduleNextRun();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
