const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { auth, clientOnly } = require('../middleware/auth'); // Fixed: Added auth import
const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Please upload only images'));
    }
  }
});

// @desc    Update user profile
// @route   PUT /api/user/profile
// @access  Private (Client only)
router.put('/profile', clientOnly, [
  body('firstName', 'First name is required').optional().notEmpty().trim(),
  body('lastName', 'Last name is required').optional().notEmpty().trim(),
  body('phone', 'Phone number must be 10 digits').optional().matches(/^[6-9]\d{9}$/),
  body('dateOfBirth', 'Valid date of birth is required').optional().isISO8601(),
  body('timeOfBirth', 'Valid time of birth is required').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('gender', 'Gender is required').optional().isIn(['male', 'female', 'other']),
  body('placeOfBirth.city', 'Birth city is required').optional().notEmpty(),
  body('placeOfBirth.state', 'Birth state is required').optional().notEmpty(),
  body('placeOfBirth.country', 'Birth country is required').optional().notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'firstName', 'lastName', 'phone', 'dateOfBirth', 
      'timeOfBirth', 'placeOfBirth', 'gender'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    // Update notification preferences
    if (req.body.notifications) {
      user.notifications = {
        ...user.notifications,
        ...req.body.notifications
      };
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth,
          timeOfBirth: user.timeOfBirth,
          placeOfBirth: user.placeOfBirth,
          gender: user.gender,
          age: user.age,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          avatar: user.avatar,
          totalConsultations: user.totalConsultations,
          totalSpent: user.totalSpent,
          notifications: user.notifications,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Upload profile picture
// @route   POST /api/user/avatar
// @access  Private (Client only)
router.post('/avatar', clientOnly, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please select an image to upload'
      });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    try {
      // Delete existing avatar from Cloudinary if exists
      if (user.avatar) {
        const publicId = user.avatar.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`avatars/${publicId}`);
      }

      // Upload new avatar to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'avatars',
            public_id: `user_${user._id}_${Date.now()}`,
            transformation: [
              { width: 300, height: 300, crop: 'fill', gravity: 'face' },
              { quality: 'auto:good' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.file.buffer);
      });

      // Update user avatar URL
      user.avatar = uploadResult.secure_url;
      await user.save();

      res.json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: {
          avatar: user.avatar
        }
      });

    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload avatar'
      });
    }

  } catch (error) {
    next(error);
  }
});

// @desc    Delete profile picture
// @route   DELETE /api/user/avatar
// @access  Private (Client only)
router.delete('/avatar', clientOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.avatar) {
      return res.status(400).json({
        success: false,
        message: 'No avatar to delete'
      });
    }

    try {
      // Delete avatar from Cloudinary
      const publicId = user.avatar.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`avatars/${publicId}`);
    } catch (deleteError) {
      console.error('Cloudinary delete error:', deleteError);
    }

    // Remove avatar URL from user
    user.avatar = '';
    await user.save();

    res.json({
      success: true,
      message: 'Avatar deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get user dashboard data
// @route   GET /api/user/dashboard
// @access  Private (Client only)
router.get('/dashboard', clientOnly, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    
    // Fixed: Use 'user' instead of 'client' to match your Appointment model
    const [
      totalAppointments,
      upcomingAppointments,
      completedAppointments,
      cancelledAppointments,
      totalSpent,
      nextAppointment,
      recentAppointments,
      averageRating
    ] = await Promise.all([
      Appointment.countDocuments({ user: userId }), // Fixed: user instead of client
      Appointment.countDocuments({ 
        user: userId, // Fixed: user instead of client
        appointmentDate: { $gte: today },
        status: { $in: ['confirmed', 'pending'] }
      }),
      Appointment.countDocuments({ user: userId, status: 'completed' }), // Fixed
      Appointment.countDocuments({ user: userId, status: 'cancelled' }), // Fixed
      Appointment.aggregate([
        { 
          $match: { 
            user: userId, // Fixed: user instead of client
            paymentStatus: 'completed' // Fixed: direct field instead of nested
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } } // Fixed: amount instead of payment.amount
      ]),
      Appointment.findOne({
        user: userId, // Fixed: user instead of client
        appointmentDate: { $gte: today },
        status: { $in: ['confirmed', 'pending'] }
      })
        .sort({ appointmentDate: 1, appointmentTime: 1 }), // Fixed: appointmentTime instead of timeSlot.startTime
      Appointment.find({ user: userId }) // Fixed: user instead of client
        .sort({ appointmentDate: -1 })
        .limit(5),
      Appointment.aggregate([
        { 
          $match: { 
            user: userId, // Fixed: user instead of client
            rating: { $exists: true } // Fixed: direct field instead of nested
          } 
        },
        { $group: { _id: null, average: { $avg: '$rating' } } } // Fixed: direct rating field
      ])
    ]);

    // Get consultation type breakdown
    const consultationBreakdown = await Appointment.aggregate([
      { $match: { user: userId } }, // Fixed: user instead of client
      { 
        $group: { 
          _id: '$consultationType',
          count: { $sum: 1 }
        } 
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        stats: { // Fixed: changed from 'statistics' to match frontend expectation
          totalAppointments,
          upcomingAppointments,
          completedAppointments,
          cancelledAppointments,
          totalSpent: totalSpent[0]?.total || 0,
          averageRating: Math.round((averageRating[0]?.average || 0) * 10) / 10
        },
        nextAppointment,
        recentAppointments,
        consultationBreakdown
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Get user's appointment history
// @route   GET /api/user/appointments
// @access  Private (Client only)
router.get('/appointments', clientOnly, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const status = req.query.status;
    const startIndex = (page - 1) * limit;

    // Build query - Fixed: use 'user' instead of 'client'
    const query = { user: req.user.id };
    if (status && status !== 'all') {
      query.status = status;
    }

    const total = await Appointment.countDocuments(query);
    
    const appointments = await Appointment.find(query)
      .sort({ appointmentDate: -1, appointmentTime: -1 }) // Fixed: appointmentTime instead of timeSlot
      .skip(startIndex)
      .limit(limit);

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
    next(error);
  }
});

// @desc    Get notifications for user
// @route   GET /api/user/notifications
// @access  Private (Client only)
router.get('/notifications', clientOnly, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Generate notifications based on appointments
    const notifications = [];

    // Upcoming appointments (next 24 hours)
    const upcomingAppointments = await Appointment.find({
      user: userId, // Fixed: user instead of client
      appointmentDate: { 
        $gte: today,
        $lte: tomorrow 
      },
      status: 'confirmed'
    }).sort({ appointmentDate: 1, appointmentTime: 1 }); // Fixed: appointmentTime

    upcomingAppointments.forEach(appointment => {
      const appointmentTime = new Date(appointment.appointmentDate);
      const [hours, minutes] = appointment.appointmentTime.split(':').map(Number); // Fixed: appointmentTime
      appointmentTime.setHours(hours, minutes, 0, 0);
      
      const timeDiff = appointmentTime.getTime() - today.getTime();
      const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
      
      if (hoursUntil <= 24 && hoursUntil > 0) {
        notifications.push({
          id: `upcoming-${appointment._id}`,
          type: 'upcoming_appointment',
          title: 'Upcoming Appointment',
          message: `You have a consultation in ${hoursUntil} hour${hoursUntil > 1 ? 's' : ''} at ${appointment.appointmentTime}`, // Fixed
          priority: hoursUntil <= 1 ? 'high' : 'medium',
          appointmentId: appointment._id,
          createdAt: today
        });
      }
    });

    // Pending payments
    const pendingPayments = await Appointment.find({
      user: userId, // Fixed: user instead of client
      paymentStatus: 'pending', // Fixed: direct field instead of nested
      status: 'pending'
    });

    pendingPayments.forEach(appointment => {
      notifications.push({
        id: `payment-${appointment._id}`,
        type: 'pending_payment',
        title: 'Payment Required',
        message: `Complete payment for your appointment on ${new Date(appointment.appointmentDate).toLocaleDateString()}`, // Fixed
        priority: 'high',
        appointmentId: appointment._id,
        createdAt: appointment.createdAt
      });
    });

    // Completed appointments awaiting review
    const unratedAppointments = await Appointment.find({
      user: userId, // Fixed: user instead of client
      status: 'completed',
      rating: { $exists: false }, // Fixed: direct field instead of nested
      updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    });

    unratedAppointments.forEach(appointment => {
      notifications.push({
        id: `review-${appointment._id}`,
        type: 'review_request',
        title: 'Share Your Feedback',
        message: `Please rate your consultation from ${new Date(appointment.appointmentDate).toLocaleDateString()}`, // Fixed
        priority: 'low',
        appointmentId: appointment._id,
        createdAt: appointment.updatedAt
      });
    });

    // Sort notifications by priority and date
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    notifications.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      success: true,
      count: notifications.length,
      data: { notifications }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Update notification preferences
// @route   PUT /api/user/notification-preferences
// @access  Private (Client only)
router.put('/notification-preferences', clientOnly, [
  body('email', 'Email preference must be boolean').optional().isBoolean(),
  body('browser', 'Browser preference must be boolean').optional().isBoolean()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update notification preferences
    if (req.body.email !== undefined) {
      user.notifications.email = req.body.email;
    }
    
    if (req.body.browser !== undefined) {
      user.notifications.browser = req.body.browser;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        notifications: user.notifications
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Delete user account
// @route   DELETE /api/user/account
// @access  Private (Client only)
router.delete('/account', clientOnly, [
  body('password', 'Password is required for account deletion').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete account'
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password
    const isPasswordCorrect = await user.comparePassword(req.body.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    // Check for upcoming confirmed appointments
    const upcomingAppointments = await Appointment.countDocuments({
      user: user._id, // Fixed: user instead of client
      appointmentDate: { $gte: new Date() },
      status: 'confirmed'
    });

    if (upcomingAppointments > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete account with ${upcomingAppointments} upcoming confirmed appointment${upcomingAppointments > 1 ? 's' : ''}. Please cancel them first.`
      });
    }

    // Cancel any pending appointments
    await Appointment.updateMany(
      {
        user: user._id, // Fixed: user instead of client
        status: 'pending'
      },
      {
        status: 'cancelled',
        notes: 'Cancelled due to account deletion' // Simplified instead of nested cancellation object
      }
    );

    // Delete avatar from Cloudinary if exists
    if (user.avatar) {
      try {
        const publicId = user.avatar.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`avatars/${publicId}`);
      } catch (deleteError) {
        console.error('Avatar deletion error:', deleteError);
      }
    }

    // Soft delete - deactivate account instead of hard delete to maintain appointment history
    user.isActive = false;
    user.email = `deleted_${user._id}@deleted.com`;
    user.phone = null;
    user.firstName = 'Deleted';
    user.lastName = 'User';
    user.avatar = '';
    
    await user.save();

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Export user data
// @route   GET /api/user/export-data
// @access  Private (Client only)
router.get('/export-data', clientOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const appointments = await Appointment.find({ user: req.user.id }); // Fixed: user instead of client

    const userData = {
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
        timeOfBirth: user.timeOfBirth,
        placeOfBirth: user.placeOfBirth,
        gender: user.gender,
        totalConsultations: user.totalConsultations,
        totalSpent: user.totalSpent,
        createdAt: user.createdAt
      },
      appointments: appointments.map(apt => ({
        id: apt._id,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime, // Fixed: direct field instead of nested
        consultationType: apt.consultationType,
        package: apt.package,
        status: apt.status,
        amount: apt.amount, // Fixed: direct field instead of nested payment object
        paymentStatus: apt.paymentStatus, // Fixed: direct field
        rating: apt.rating,
        createdAt: apt.createdAt
      })),
      exportedAt: new Date(),
      exportVersion: '1.0'
    };

    res.json({
      success: true,
      data: userData
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
