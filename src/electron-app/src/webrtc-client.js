/**
 * 🎥 WebRTC P2P Client - Electron (Kullanıcı tarafı)
 * 
 * Bu modül:
 * - Destek ekibi ile P2P WebRTC bağlantısı kurar
 * - Ekran paylaşımı yapar
 * - Uzaktan kontrol (mouse/keyboard) dinler
 * - Robot.js ile kontrol uygular
 */

const robot = require('robotjs');
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = require('wrtc');
const fetch = require('node-fetch');

class WebRTCClient {
  constructor(supportId, backendUrl) {
    this.supportId = supportId;
    this.backendUrl = backendUrl;
    this.peerConnection = null;
    this.dataChannel = null;
    this.pollingInterval = null;
    this.icePollingInterval = null;
    
    // STUN/TURN servers (Google'ın ücretsiz STUN server'ı)
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];

    console.log('🎥 WebRTC Client oluşturuldu:', supportId);
  }

  /**
   * WebRTC bağlantısını başlat
   */
  async start() {
    try {
      console.log('🚀 WebRTC bağlantısı başlatılıyor...');

      // Peer connection oluştur
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.iceServers,
      });

      // ICE candidate event
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 ICE candidate oluşturuldu');
          this.sendIceCandidate(event.candidate);
        }
      };

      // Bağlantı durumu
      this.peerConnection.onconnectionstatechange = () => {
        console.log('📊 Connection state:', this.peerConnection.connectionState);
        this.sendStatus(this.peerConnection.connectionState);
      };

      // Data channel (uzaktan kontrol için)
      this.peerConnection.ondatachannel = (event) => {
        console.log('📡 Data channel alındı');
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };

      // Offer için polling başlat
      this.startOfferPolling();

      // ICE candidate polling başlat
      this.startIcePolling();

      console.log('✅ WebRTC başlatıldı, offer bekleniyor...');
    } catch (error) {
      console.error('❌ WebRTC başlatma hatası:', error);
      throw error;
    }
  }

  /**
   * Ekran paylaşımını başlat
   */
  async startScreenShare() {
    try {
      console.log('🖥️ Ekran paylaşımı başlatılıyor...');

      // Electron'da desktopCapturer kullan
      const { desktopCapturer } = require('electron');
      
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });

      if (sources.length === 0) {
        throw new Error('Ekran kaynağı bulunamadı');
      }

      // İlk ekranı al
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080
          }
        }
      });

      console.log('✅ Ekran stream alındı');

      // Stream'i peer connection'a ekle
      stream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, stream);
        console.log('📹 Track eklendi:', track.kind);
      });

      return stream;
    } catch (error) {
      console.error('❌ Ekran paylaşımı hatası:', error);
      throw error;
    }
  }

  /**
   * Offer polling (Destek ekibi offer gönderince alırız)
   */
  startOfferPolling() {
    console.log('🔄 Offer polling başlatıldı (3 saniye)');
    
    this.pollingInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${this.backendUrl}/functions/v1/make-server-47081311/webrtc-get-offer?supportId=${this.supportId}`
        );
        
        const data = await response.json();
        
        if (data.success && data.hasOffer) {
          console.log('✅ Offer alındı!');
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
          
          await this.handleOffer(data.offer);
        }
      } catch (error) {
        console.error('Offer polling hatası:', error);
      }
    }, 3000); // 3 saniyede bir kontrol
  }

  /**
   * ICE candidate polling
   */
  startIcePolling() {
    this.icePollingInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${this.backendUrl}/functions/v1/make-server-47081311/webrtc-get-ice?supportId=${this.supportId}&receiver=user`
        );
        
        const data = await response.json();
        
        if (data.success && data.hasCandidates) {
          console.log(`✅ ${data.candidates.length} ICE candidate alındı`);
          
          for (const item of data.candidates) {
            await this.peerConnection.addIceCandidate(
              new RTCIceCandidate(item.candidate)
            );
          }
        }
      } catch (error) {
        console.error('ICE polling hatası:', error);
      }
    }, 2000); // 2 saniyede bir
  }

  /**
   * Offer'ı işle ve answer oluştur
   */
  async handleOffer(offer) {
    try {
      console.log('📥 Offer işleniyor...');

      // Remote description set et
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      // Ekran paylaşımını başlat
      await this.startScreenShare();

      // Answer oluştur
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      console.log('📤 Answer oluşturuldu, gönderiliyor...');

      // Answer'ı backend'e gönder
      await fetch(
        `${this.backendUrl}/functions/v1/make-server-47081311/webrtc-answer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supportId: this.supportId,
            answer: this.peerConnection.localDescription,
          }),
        }
      );

      console.log('✅ Answer gönderildi!');
    } catch (error) {
      console.error('❌ Offer işleme hatası:', error);
      throw error;
    }
  }

  /**
   * ICE candidate gönder
   */
  async sendIceCandidate(candidate) {
    try {
      await fetch(
        `${this.backendUrl}/functions/v1/make-server-47081311/webrtc-ice`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supportId: this.supportId,
            candidate,
            sender: 'user',
          }),
        }
      );
    } catch (error) {
      console.error('ICE candidate gönderme hatası:', error);
    }
  }

  /**
   * Bağlantı durumunu gönder
   */
  async sendStatus(status) {
    try {
      await fetch(
        `${this.backendUrl}/functions/v1/make-server-47081311/webrtc-status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supportId: this.supportId,
            status,
            sender: 'user',
          }),
        }
      );
    } catch (error) {
      console.error('Status gönderme hatası:', error);
    }
  }

  /**
   * Data channel kur (uzaktan kontrol için)
   */
  setupDataChannel() {
    console.log('🔧 Data channel kuruluyor...');

    this.dataChannel.onopen = () => {
      console.log('✅ Data channel açıldı - Uzaktan kontrol hazır!');
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleRemoteControl(message);
      } catch (error) {
        console.error('Data channel mesaj hatası:', error);
      }
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel hatası:', error);
    };
  }

  /**
   * Uzaktan kontrol komutlarını işle
   */
  handleRemoteControl(message) {
    const { type, x, y, button, key, modifiers } = message;

    try {
      switch (type) {
        case 'mousemove':
          robot.moveMouse(x, y);
          break;

        case 'mousedown':
          robot.mouseToggle('down', button || 'left');
          break;

        case 'mouseup':
          robot.mouseToggle('up', button || 'left');
          break;

        case 'click':
          robot.moveMouse(x, y);
          robot.mouseClick(button || 'left');
          break;

        case 'doubleclick':
          robot.moveMouse(x, y);
          robot.mouseClick(button || 'left', true); // double click
          break;

        case 'scroll':
          robot.scrollMouse(x, y); // x: horizontal, y: vertical
          break;

        case 'keypress':
          if (modifiers && modifiers.length > 0) {
            // Modifier tuşları (Ctrl, Alt, Shift)
            robot.keyTap(key, modifiers);
          } else {
            robot.keyTap(key);
          }
          break;

        case 'keydown':
          robot.keyToggle(key, 'down', modifiers);
          break;

        case 'keyup':
          robot.keyToggle(key, 'up', modifiers);
          break;

        case 'type':
          // Metin yaz
          robot.typeString(message.text);
          break;

        default:
          console.warn('Bilinmeyen kontrol tipi:', type);
      }
    } catch (error) {
      console.error('Robot kontrol hatası:', error);
    }
  }

  /**
   * Bağlantıyı kapat
   */
  async close() {
    console.log('🔴 WebRTC bağlantısı kapatılıyor...');

    // Polling'leri durdur
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.icePollingInterval) {
      clearInterval(this.icePollingInterval);
      this.icePollingInterval = null;
    }

    // Data channel kapat
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    // Peer connection kapat
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    console.log('✅ WebRTC bağlantısı kapatıldı');
  }

  /**
   * Bağlantı durumunu kontrol et
   */
  isConnected() {
    return this.peerConnection?.connectionState === 'connected';
  }

  /**
   * İstatistikleri al
   */
  async getStats() {
    if (!this.peerConnection) {
      return null;
    }

    const stats = await this.peerConnection.getStats();
    const result = {
      connection: this.peerConnection.connectionState,
      ice: this.peerConnection.iceConnectionState,
      signaling: this.peerConnection.signalingState,
    };

    return result;
  }
}

module.exports = WebRTCClient;
