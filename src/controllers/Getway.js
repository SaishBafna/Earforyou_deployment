import PaymentGateway from "../models/PaymentGetway.js";
// Get the current active payment gateway
export const getPaymentGateway = async (req, res) => {
    try {
        const gateway = await PaymentGateway.findOne();
        if (!gateway) {
            return res.status(404).json({ message: 'No payment gateway found' });
        }
        res.status(200).json(gateway);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching gateway', error });
    }
};

// Create or update the payment gateway (only one allowed)
export const createOrUpdateGateway = async (req, res) => {
    const { gatewayType, isActive } = req.body;

    if (!gatewayType) {
        return res.status(400).json({ message: 'gatewayType is required' });
    }

    try {
        let gateway = await PaymentGateway.findOne();

        if (gateway) {
            // Update existing
            gateway.gatewayType = gatewayType;
            if (typeof isActive === 'boolean') gateway.isActive = isActive;
            await gateway.save();
            return res.status(200).json({ message: 'Gateway updated', gateway });
        } else {
            // Create new
            gateway = await PaymentGateway.create({ gatewayType, isActive });
            return res.status(201).json({ message: 'Gateway created', gateway });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error creating/updating gateway', error });
    }
};
