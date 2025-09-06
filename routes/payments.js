const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Appointment = require('../models/Appointment');

// Simple authentication middleware (inline)
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// @desc    Create Razorpay order
// @route   POST /api/payment/create-order
// @access  Private
router.post('/create-order', authenticate, async (req, res) => {
  try {
    const { appointmentId } = req.body;

    // Get appointment details
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user owns this appointment
    if (appointment.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // For testing purposes - mock order creation
    const mockOrder = {
      id: `order_${Date.now()}`,
      amount: appointment.amount * 100, // Amount in paise
      currency: 'INR',
      receipt: `appointment_${appointmentId}`,
    };

    // Update appointment with order ID
    appointment.razorpayOrderId = mockOrder.id;
    await appointment.save();

    res.json({
      success: true,
      data: {
        orderId: mockOrder.id,
        amount: mockOrder.amount,
        currency: mockOrder.currency,
        appointment: appointment
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment order'
    });
  }
});

// @desc    Verify payment signature (mock implementation)
// @route   POST /api/payment/verify
// @access  Private
router.post('/verify', authenticate, async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      appointmentId
    } = req.body;

    // For testing purposes - always return success
    // In production, you'd verify the Razorpay signature here

    // Update appointment payment status
    await Appointment.findByIdAndUpdate(appointmentId, {
      paymentStatus: 'completed',
      status: 'confirmed',
      razorpayPaymentId: razorpayPaymentId,
      paidAt: new Date()
    });

    res.json({
      success: true,
      message: 'Payment verified successfully'
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment'
    });
  }
});

// @desc    Handle payment failure
// @route   POST /api/payment/failed
// @access  Private
router.post('/failed', authenticate, async (req, res) => {
  try {
    const { appointmentId, error } = req.body;

    await Appointment.findByIdAndUpdate(appointmentId, {
      paymentStatus: 'failed',
      status: 'cancelled'
    });

    res.json({
      success: true,
      message: 'Payment failure recorded'
    });

  } catch (error) {
    console.error('Payment failed error:', error);
    res.status(500).json({
      success: false,
      message: 'Error handling payment failure'
    });
  }
});

// @desc    Test route
// @route   GET /api/payment/test
// @access  Public
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Payment routes are working!'
  });
});

module.exports = router;
