const axios = require('axios');

class DailyService {
  constructor() {
    this.apiKey = process.env.DAILY_API_KEY;
    this.baseURL = 'https://api.daily.co/v1';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Create a new room for consultation
  async createRoom(appointmentId, expiryTime = null) {
    try {
      const roomName = `consultation-${appointmentId}`;
      const expiresAt = expiryTime || new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      
      const roomConfig = {
        name: roomName,
        properties: {
          start_video_off: false,
          start_audio_off: false,
          exp: Math.floor(expiresAt.getTime() / 1000),
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: 'cloud',
          max_participants: 2, // Client + Astrologer
          lang: 'en'
        }
      };

      const response = await this.client.post('/rooms', roomConfig);
      
      console.log('✅ Daily.co room created:', response.data.name);
      return {
        roomName: response.data.name,
        roomUrl: response.data.url,
        config: response.data.config
      };
      
    } catch (error) {
      console.error('❌ Failed to create Daily.co room:', error.response?.data || error.message);
      throw new Error('Failed to create video call room');
    }
  }

  // Get room info
  async getRoomInfo(roomName) {
    try {
      const response = await this.client.get(`/rooms/${roomName}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get room info:', error.response?.data || error.message);
      throw new Error('Failed to get room information');
    }
  }

  // Delete room after consultation
  async deleteRoom(roomName) {
    try {
      await this.client.delete(`/rooms/${roomName}`);
      console.log('✅ Daily.co room deleted:', roomName);
    } catch (error) {
      console.error('❌ Failed to delete room:', error.response?.data || error.message);
    }
  }

  // Generate meeting token for participant
  async createMeetingToken(roomName, userId, userRole = 'participant') {
    try {
      const tokenConfig = {
        properties: {
          room_name: roomName,
          user_name: userId,
          is_owner: userRole === 'admin',
          start_video_off: false,
          start_audio_off: false,
          enable_recording: userRole === 'admin'
        }
      };

      const response = await this.client.post('/meeting-tokens', tokenConfig);
      return response.data.token;
      
    } catch (error) {
      console.error('❌ Failed to create meeting token:', error.response?.data || error.message);
      throw new Error('Failed to create meeting access token');
    }
  }
}

module.exports = new DailyService();
