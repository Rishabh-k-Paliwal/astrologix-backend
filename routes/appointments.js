const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Appointment = require('../models/Appointment');

// Simple auth middleware
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

// GET available slots
router.get('/available-slots/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const dayOfWeek = new Date(date).getDay();

    if (dayOfWeek === 0) {
      return res.json({ success: true, data: { availableSlots: [] } });
    }

    const slots = [
      { time: '17:00', label: '5:00 PM - 5:30 PM' },
      { time: '17:30', label: '5:30 PM - 6:00 PM' },
      { time: '18:00', label: '6:00 PM - 6:30 PM' },
      { time: '18:30', label: '6:30 PM - 7:00 PM' },
      { time: '19:00', label: '7:00 PM - 7:30 PM' },
      { time: '19:30', label: '7:30 PM - 8:00 PM' },
    ];

    res.json({ success: true, data: { availableSlots: slots } });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST create appointment
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('Received request body:', req.body);

    const {
      appointmentDate,
      appointmentTime,
      consultationType,
      package: packageInfo,
      clientQuestions
    } = req.body;

    // Validation
    if (!appointmentDate || !appointmentTime || !consultationType || !packageInfo) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        received: { appointmentDate, appointmentTime, consultationType, packageInfo }
      });
    }

    // Map frontend package names to schema enum values
    const packageMapping = {
      'Basic Consultation': 'basic',
      'Premium Consultation': 'premium',
      'Advanced Consultation': 'advanced',
      'basic': 'basic',
      'premium': 'premium',
      'advanced': 'advanced'
    };

    const mappedPackage = packageMapping[packageInfo.name] || packageInfo.name?.toLowerCase();

    if (!mappedPackage || !['basic', 'premium', 'advanced'].includes(mappedPackage)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package type',
        received: packageInfo.name,
        allowed: ['basic', 'premium', 'advanced']
      });
    }

    console.log('Creating appointment with data:', {
      user: req.user.id,
      appointmentDate,
      appointmentTime,
      consultationType,
      package: mappedPackage,
      amount: packageInfo.price,
      duration: packageInfo.duration
    });
    // In routes/appointments.js - after saving appointment
    const { sendAppointmentNotification } = require('../services/emailService');

    await appointment.save();

    // Send email notification to astrologer
    await sendAppointmentNotification({
      ...appointment.toObject(),
      user: await User.findById(appointment.user)
    });

    // Create appointment
    const appointment = new Appointment({
      user: req.user.id,
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      consultationType,
      package: mappedPackage,
      amount: packageInfo.price,
      duration: packageInfo.duration,
      clientQuestions: clientQuestions || [],
      status: 'pending',
      paymentStatus: 'pending'
    });

    await appointment.save();

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: { appointment }
    });

  } catch (error) {
    console.error('Create appointment error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating appointment',
      error: error.message
    });
  }
});

// ✅ ADD THIS MISSING CANCEL ROUTE
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    console.log(`📋 Cancel request for appointment ID: ${req.params.id} by user: ${req.user.id}`);

    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      console.log(`❌ Appointment ${req.params.id} not found`);
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user owns this appointment
    if (appointment.user.toString() !== req.user.id) {
      console.log(`❌ User ${req.user.id} not authorized for appointment ${req.params.id}`);
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this appointment'
      });
    }

    // Check if appointment can be cancelled (2 hours before)
    const now = new Date();
    const appointmentDateTime = new Date(appointment.appointmentDate);
    const timeDiff = appointmentDateTime.getTime() - now.getTime();
    const hoursUntil = timeDiff / (1000 * 60 * 60);

    if (hoursUntil < 2 && appointment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Appointments can only be cancelled 2 hours before the scheduled time'
      });
    }

    // Update appointment status
    appointment.status = 'cancelled';
    appointment.paymentStatus = 'refunded';
    await appointment.save();

    console.log(`✅ Appointment ${req.params.id} cancelled successfully`);

    res.json({
      success: true,
      message: 'Appointment cancelled successfully',
      data: { appointment }
    });

  } catch (error) {
    console.error('❌ Cancel appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling appointment'
    });
  }
});

// ✅ ADD THIS MISSING REVIEW ROUTE
router.post('/:id/review', authenticate, async (req, res) => {
  try {
    console.log(`⭐ Review submission for appointment ID: ${req.params.id} by user: ${req.user.id}`);

    const { rating, review } = req.body;

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const appointment = await Appointment.findById(req.params.id);

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
        message: 'Not authorized to review this appointment'
      });
    }

    // Check if appointment is completed
    if (appointment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed appointments'
      });
    }

    // Update appointment with rating and review
    appointment.rating = rating;
    appointment.review = review || '';
    await appointment.save();

    console.log(`✅ Review submitted for appointment ${req.params.id}`);

    res.json({
      success: true,
      message: 'Review submitted successfully',
      data: { appointment }
    });

  } catch (error) {
    console.error('❌ Submit review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while submitting review'
    });
  }
});

module.exports = router;
