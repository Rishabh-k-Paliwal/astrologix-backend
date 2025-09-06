const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Create transporter
  const transporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // Define email options
  const mailOptions = {
    from: `${process.env.ASTROLOGER_NAME} <${process.env.EMAIL_FROM}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html || options.message.replace(/\n/g, '<br>')
  };

  // Send email
  const info = await transporter.sendMail(mailOptions);
  console.log('Email sent:', info.messageId);
  
  return info;
};

// Email templates
const emailTemplates = {
  // Appointment confirmation
  appointmentConfirmation: (appointment, client) => ({
    subject: `Appointment Confirmed - ${appointment.formattedDate} at ${appointment.timeSlot.startTime}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4A90E2;">Appointment Confirmed! ✨</h2>
        
        <p>Dear ${client.firstName},</p>
        
        <p>Your astrology consultation has been confirmed. Here are the details:</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Appointment Details</h3>
          <p><strong>Date:</strong> ${appointment.formattedDate}</p>
          <p><strong>Time:</strong> ${appointment.formattedTime}</p>
          <p><strong>Duration:</strong> ${appointment.package.duration} minutes</p>
          <p><strong>Consultation Type:</strong> ${appointment.consultationType.charAt(0).toUpperCase() + appointment.consultationType.slice(1)}</p>
          <p><strong>Package:</strong> ${appointment.package.name.charAt(0).toUpperCase() + appointment.package.name.slice(1)}</p>
          <p><strong>Amount:</strong> ₹${appointment.payment.amount}</p>
        </div>
        
        <p><strong>What to expect:</strong></p>
        <ul>
          <li>You'll receive a video call link 15 minutes before your appointment</li>
          <li>Please be ready 5 minutes early</li>
          <li>Have your questions prepared</li>
          <li>Ensure stable internet connection</li>
        </ul>
        
        <p><strong>Cancellation Policy:</strong> You can cancel up to 2 hours before your appointment for a full refund.</p>
        
        <p>If you have any questions, please don't hesitate to contact us.</p>
        
        <p>Looking forward to our session!</p>
        
        <p>Best regards,<br>
        ${process.env.ASTROLOGER_NAME}<br>
        ${process.env.EMAIL_FROM}</p>
      </div>
    `
  }),

  // Appointment reminder
  appointmentReminder: (appointment, client, timeUntil) => ({
    subject: `Reminder: Your consultation ${timeUntil}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4A90E2;">Appointment Reminder 🔔</h2>
        
        <p>Dear ${client.firstName},</p>
        
        <p>This is a reminder that your astrology consultation is scheduled ${timeUntil}.</p>
        
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3 style="margin-top: 0; color: #856404;">Appointment Details</h3>
          <p><strong>Date:</strong> ${appointment.formattedDate}</p>
          <p><strong>Time:</strong> ${appointment.formattedTime}</p>
          <p><strong>Duration:</strong> ${appointment.package.duration} minutes</p>
        </div>
        
        ${appointment.videoCall.roomUrl ? `
          <div style="background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #17a2b8;">
            <h3 style="margin-top: 0; color: #0c5460;">Join Video Call</h3>
            <p>Click the link below to join your consultation:</p>
            <a href="${appointment.videoCall.roomUrl}" 
               style="display: inline-block; background: #17a2b8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
              Join Video Call
            </a>
          </div>
        ` : ''}
        
        <p><strong>Please ensure:</strong></p>
        <ul>
          <li>Stable internet connection</li>
          <li>Quiet environment</li>
          <li>Camera and microphone working</li>
          <li>Your questions are ready</li>
        </ul>
        
        <p>Best regards,<br>
        ${process.env.ASTROLOGER_NAME}</p>
      </div>
    `
  }),

  // Appointment cancellation
  appointmentCancellation: (appointment, client, cancelledBy, reason) => ({
    subject: `Appointment Cancelled - ${appointment.formattedDate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Appointment Cancelled</h2>
        
        <p>Dear ${client.firstName},</p>
        
        <p>Your appointment scheduled for <strong>${appointment.formattedDate} at ${appointment.formattedTime}</strong> has been cancelled.</p>
        
        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
          <p><strong>Cancelled by:</strong> ${cancelledBy === 'client' ? 'You' : 'Admin'}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        </div>
        
        ${appointment.cancellation.refundEligible ? `
          <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="margin-top: 0; color: #155724;">Refund Information</h3>
            <p>Your refund of ₹${appointment.payment.amount} will be processed within 5-7 business days.</p>
          </div>
        ` : ''}
        
        <p>You can book a new appointment anytime through our website.</p>
        
        <p>Best regards,<br>
        ${process.env.ASTROLOGER_NAME}</p>
      </div>
    `
  }),

  // Payment confirmation
  paymentConfirmation: (appointment, client) => ({
    subject: `Payment Received - ₹${appointment.payment.amount}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Payment Confirmed! 💳</h2>
        
        <p>Dear ${client.firstName},</p>
        
        <p>We have received your payment successfully.</p>
        
        <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3 style="margin-top: 0; color: #155724;">Payment Details</h3>
          <p><strong>Amount:</strong> ₹${appointment.payment.amount}</p>
          <p><strong>Transaction ID:</strong> ${appointment.payment.transactionId}</p>
          <p><strong>Payment Method:</strong> ${appointment.payment.method}</p>
          <p><strong>Date:</strong> ${new Date(appointment.payment.paidAt).toLocaleDateString('en-IN')}</p>
        </div>
        
        <p>Your appointment is now confirmed and scheduled for <strong>${appointment.formattedDate} at ${appointment.formattedTime}</strong>.</p>
        
        <p>Best regards,<br>
        ${process.env.ASTROLOGER_NAME}</p>
      </div>
    `
  })
};

// Send templated email
const sendTemplatedEmail = async (template, data) => {
  const emailContent = emailTemplates[template](data.appointment, data.client, data.timeUntil, data.reason);
  
  await sendEmail({
    email: data.client.email,
    subject: emailContent.subject,
    html: emailContent.html
  });
};

module.exports = { sendEmail, sendTemplatedEmail, emailTemplates };