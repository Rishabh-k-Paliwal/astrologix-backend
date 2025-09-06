const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  appointmentDate: {
    type: Date,
    required: [true, 'Please provide appointment date']
  },
  appointmentTime: {
    type: String,
    required: [true, 'Please provide appointment time']
  },
  consultationType: {
    type: String,
    required: [true, 'Please provide consultation type']
  },
  package: {
    type: String,
    enum: ['basic', 'premium', 'advanced'],
    required: [true, 'Please select a package']
  },
  amount: {
    type: Number,
    required: [true, 'Please provide amount']
  },
  duration: {
    type: Number, // in minutes
    required: [true, 'Please provide duration']
  },
  clientQuestions: [{
    question: String,
    answer: String
  }],
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
   videoCall: {
    roomName: String,
    roomUrl: String,
    isActive: {
      type: Boolean,
      default: false
    },
    startedAt: Date,
    endedAt: Date,
    recordingUrl: String
  },
  paymentId: String,
  orderId: String,
  videoRoomUrl: String,
  videoRoomName: String,
  notes: String,
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  review: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Appointment', appointmentSchema);
