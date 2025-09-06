const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { auth, adminOnly } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);
router.use(adminOnly);

// @desc    Get dashboard stats for admin
// @route   GET /api/admin/dashboard-stats
// @access  Private (Admin only)
router.get('/dashboard-stats', async (req, res) => {
  try {
    console.log('📊 Admin dashboard stats requested');
    
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    const [
      totalAppointments,
      todaysAppointments,
      pendingAppointments,
      monthlyRevenue,
      completedAppointments
    ] = await Promise.all([
      Appointment.countDocuments({}),
      Appointment.countDocuments({
        appointmentDate: { $gte: startOfToday, $lte: endOfToday }
      }),
      Appointment.countDocuments({ status: 'pending' }),
      Appointment.aggregate([
        {
          $match: {
            appointmentDate: { $gte: startOfMonth },
            paymentStatus: 'completed'
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Appointment.countDocuments({ status: 'completed' })
    ]);

    console.log('✅ Dashboard stats calculated successfully');

    res.json({
      success: true,
      data: {
        stats: {
          totalAppointments: totalAppointments || 0,
          todaysAppointments: todaysAppointments || 0,
          pendingAppointments: pendingAppointments || 0,
          monthlyRevenue: monthlyRevenue[0]?.total || 0,
          completedAppointments: completedAppointments || 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
});

// @desc    Get all appointments for admin
// @route   GET /api/admin/appointments
// @access  Private (Admin only)
router.get('/appointments', async (req, res) => {
  try {
    console.log('📋 Admin appointments requested');
    
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const status = req.query.status;
    const startIndex = (page - 1) * limit;

    // Build query
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const total = await Appointment.countDocuments(query);
    
    const appointments = await Appointment.find(query)
      .populate('user', 'firstName lastName email phone dateOfBirth timeOfBirth placeOfBirth')
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .skip(startIndex)
      .limit(limit);

    console.log(`✅ Found ${appointments.length} appointments`);

    res.json({
      success: true,
      count: appointments.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      data: { appointments }
    });

  } catch (error) {
    console.error('❌ Get appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointments',
      error: error.message
    });
  }
});

// @desc    Update appointment status
// @route   PUT /api/admin/appointments/:id/status
// @access  Private (Admin only)
router.put('/appointments/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    appointment.status = status;
    
    if (status === 'confirmed' && appointment.paymentStatus === 'pending') {
      appointment.paymentStatus = 'completed';
    }
    
    await appointment.save();

    res.json({
      success: true,
      message: `Appointment ${status} successfully`,
      data: { appointment }
    });

  } catch (error) {
    console.error('❌ Update appointment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating appointment status'
    });
  }
});

module.exports = router;
