const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Appointment = require('../models/Appointment');
const dailyService = require('../services/dailyService');

// Create video call room for appointment
router.post('/create-room/:appointmentId', auth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user is authorized (client or admin)
    const isAuthorized = appointment.user.toString() === req.user.id || req.user.role === 'admin';
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this appointment'
      });
    }

    // Create Daily.co room
    const appointmentDate = new Date(appointment.appointmentDate);
    const roomExpiry = new Date(appointmentDate.getTime() + 3 * 60 * 60 * 1000); // 3 hours

    const roomData = await dailyService.createRoom(req.params.appointmentId, roomExpiry);
    
    // Update appointment with room info
    appointment.videoCall = {
      roomName: roomData.roomName,
      roomUrl: roomData.roomUrl,
      isActive: false
    };
    
    await appointment.save();

    res.json({
      success: true,
      data: {
        roomName: roomData.roomName,
        roomUrl: roomData.roomUrl,
        appointmentId: appointment._id
      }
    });

  } catch (error) {
    console.error('❌ Create room error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create video call room'
    });
  }
});

// Get meeting token for participant
router.get('/meeting-token/:appointmentId', auth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId)
      .populate('user', 'firstName lastName email');

    if (!appointment || !appointment.videoCall?.roomName) {
      return res.status(404).json({
        success: false,
        message: 'Video call room not found'
      });
    }

    // Check authorization
    const isAuthorized = appointment.user._id.toString() === req.user.id || req.user.role === 'admin';
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const userRole = req.user.role === 'admin' ? 'admin' : 'participant';
    const userName = `${req.user.firstName} ${req.user.lastName}`;
    
    const meetingToken = await dailyService.createMeetingToken(
      appointment.videoCall.roomName,
      userName,
      userRole
    );

    res.json({
      success: true,
      data: {
        token: meetingToken,
        roomUrl: appointment.videoCall.roomUrl,
        roomName: appointment.videoCall.roomName,
        userRole
      }
    });

  } catch (error) {
    console.error('❌ Meeting token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate meeting token'
    });
  }
});

// Mark call as started/ended
router.put('/call-status/:appointmentId', auth, async (req, res) => {
  try {
    const { status } = req.body; // 'started' or 'ended'
    
    const appointment = await Appointment.findById(req.params.appointmentId);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (status === 'started') {
      appointment.videoCall.isActive = true;
      appointment.videoCall.startedAt = new Date();
      appointment.status = 'in-progress';
    } else if (status === 'ended') {
      appointment.videoCall.isActive = false;
      appointment.videoCall.endedAt = new Date();
      appointment.status = 'completed';
      
      // Schedule room deletion (optional, after some time)
      setTimeout(async () => {
        try {
          await dailyService.deleteRoom(appointment.videoCall.roomName);
        } catch (error) {
          console.error('Failed to delete room:', error);
        }
      }, 60 * 60 * 1000); // Delete after 1 hour
    }

    await appointment.save();

    res.json({
      success: true,
      message: `Call ${status} successfully`
    });

  } catch (error) {
    console.error('❌ Call status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update call status'
    });
  }
});

module.exports = router;
