import { Schema, model } from 'mongoose';

const PaymentGatewaySchema = new Schema({
    gatewayType: {
        type: String,
        required: true,
        enum: ['RazorPay', 'PhonePay'], // Replace with your actual gateway types
    },

    isActive: {
        type: Boolean,
        default: true,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const PaymentGateway = model('PaymentGateway', PaymentGatewaySchema);

export default PaymentGateway;