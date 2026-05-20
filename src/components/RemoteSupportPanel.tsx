/**
 * 🎥 Uzaktan Destek Paneli - WebRTC P2P Kontrol
 * 
 * Destek ekibi için uzaktan kontrol arayüzü
 * - Kullanıcının ekranını görüntüleme
 * - Mouse ve klavye kontrolü
 * - P2P WebRTC bağlantısı
 */

import { useState, useEffect, useRef } from 'react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { getStoredJwtAccessToken } from '../utils/authTokens';
import { X, Maximize2, Minimize2, MousePointer, Keyboard, Activity } from 'lucide-react';

interface RemoteSupportPanelProps {
  supportId: string;
  onClose: () => void;
}

export function RemoteSupportPanel({ supportId, onClose }: RemoteSupportPanelProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [statusMessage, setStatusMessage] = useState('Bağlantı kuruluyor...');
  const [fullscreen, setFullscreen] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const icePollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const authHeaders = (): HeadersInit => {
    const token = getStoredJwtAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // STUN servers
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  useEffect(() => {
    startWebRTC();

    return () => {
      cleanup();
    };
  }, [supportId]);

  /**
   * WebRTC bağlantısını başlat
   */
  const startWebRTC = async () => {
    try {
      console.log('🎥 WebRTC başlatılıyor (destek ekibi)...');

      // Peer connection oluştur
      const pc = new RTCPeerConnection({ iceServers });
      peerConnectionRef.current = pc;

      // ICE candidate event
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 ICE candidate oluşturuldu');
          sendIceCandidate(event.candidate);
        }
      };

      // Bağlantı durumu
      pc.onconnectionstatechange = () => {
        console.log('📊 Connection state:', pc.connectionState);
        updateStatus(pc.connectionState);
      };

      // Video stream geldiğinde
      pc.ontrack = (event) => {
        console.log('🎬 Video stream alındı!');
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStatus('connected');
          setStatusMessage('Bağlantı kuruldu - Ekran görüntüleniyor');
        }
      };

      // Data channel oluştur (uzaktan kontrol için)
      const dc = pc.createDataChannel('control');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log('✅ Data channel açıldı');
      };

      dc.onerror = (error) => {
        console.error('❌ Data channel hatası:', error);
      };

      // Offer oluştur
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
      });

      await pc.setLocalDescription(offer);

      console.log('📤 Offer oluşturuldu, gönderiliyor...');

      // Offer'ı backend'e gönder
      await fetch(`${apiFunctionsBase}/webrtc-offer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          supportId,
          offer: pc.localDescription,
        }),
      });

      console.log('✅ Offer gönderildi, answer bekleniyor...');

      // Answer için polling başlat
      startAnswerPolling();

      // ICE candidate polling başlat
      startIcePolling();

    } catch (error) {
      console.error('❌ WebRTC başlatma hatası:', error);
      setStatus('error');
      setStatusMessage(`Hata: ${error}`);
    }
  };

  /**
   * Answer polling
   */
  const startAnswerPolling = () => {
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(
          `${apiFunctionsBase}/webrtc-get-answer?supportId=${supportId}`,
          {
            headers: authHeaders(),
          }
        );

        const data = await response.json();

        if (data.success && data.hasAnswer) {
          console.log('✅ Answer alındı!');

          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          // Answer'ı set et
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
            console.log('✅ Remote description set edildi');
          }
        }
      } catch (error) {
        console.error('Answer polling hatası:', error);
      }
    }, 2000); // 2 saniyede bir
  };

  /**
   * ICE candidate polling
   */
  const startIcePolling = () => {
    icePollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(
          `${apiFunctionsBase}/webrtc-get-ice?supportId=${supportId}&receiver=supporter`,
          {
            headers: authHeaders(),
          }
        );

        const data = await response.json();

        if (data.success && data.hasCandidates) {
          console.log(`✅ ${data.candidates.length} ICE candidate alındı`);

          for (const item of data.candidates) {
            if (peerConnectionRef.current) {
              await peerConnectionRef.current.addIceCandidate(
                new RTCIceCandidate(item.candidate)
              );
            }
          }
        }
      } catch (error) {
        console.error('ICE polling hatası:', error);
      }
    }, 2000);
  };

  /**
   * ICE candidate gönder
   */
  const sendIceCandidate = async (candidate: RTCIceCandidate) => {
    try {
      await fetch(`${apiFunctionsBase}/webrtc-ice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          supportId,
          candidate,
          sender: 'supporter',
        }),
      });
    } catch (error) {
      console.error('ICE candidate gönderme hatası:', error);
    }
  };

  /**
   * Bağlantı durumunu güncelle
   */
  const updateStatus = (state: string) => {
    switch (state) {
      case 'connecting':
        setStatus('connecting');
        setStatusMessage('Bağlanıyor...');
        break;
      case 'connected':
        setStatus('connected');
        setStatusMessage('Bağlandı');
        break;
      case 'disconnected':
      case 'closed':
        setStatus('disconnected');
        setStatusMessage('Bağlantı kesildi');
        break;
      case 'failed':
        setStatus('error');
        setStatusMessage('Bağlantı başarısız');
        break;
    }
  };

  /**
   * Mouse eventi gönder
   */
  const sendMouseEvent = (type: string, x: number, y: number, button?: string) => {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({
        type,
        x,
        y,
        button,
      }));
    }
  };

  /**
   * Klavye eventi gönder
   */
  const sendKeyEvent = (type: string, key: string, modifiers?: string[]) => {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({
        type,
        key,
        modifiers,
      }));
    }
  };

  /**
   * Video üzerinde mouse hareketi
   */
  const handleMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (status !== 'connected' || !videoRef.current) return;

    const rect = videoRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * 1920); // Assume 1920x1080
    const y = Math.floor((e.clientY - rect.top) / rect.height * 1080);

    sendMouseEvent('mousemove', x, y);
  };

  /**
   * Video üzerinde click
   */
  const handleClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (status !== 'connected' || !videoRef.current) return;

    const rect = videoRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * 1920);
    const y = Math.floor((e.clientY - rect.top) / rect.height * 1080);

    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
    sendMouseEvent('click', x, y, button);
  };

  /**
   * Cleanup
   */
  const cleanup = () => {
    // Polling'leri durdur
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    if (icePollingIntervalRef.current) {
      clearInterval(icePollingIntervalRef.current);
    }

    // Data channel kapat
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
    }

    // Peer connection kapat
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
  };

  /**
   * Kapat
   */
  const handleClose = () => {
    cleanup();
    onClose();
  };

  return (
    <div className={`fixed inset-0 bg-black z-50 flex flex-col ${fullscreen ? '' : 'p-4'}`}>
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Activity className="w-5 h-5 text-green-500" />
          <div>
            <h2 className="text-white">Uzaktan Destek</h2>
            <p className="text-sm text-gray-400">Support ID: {supportId}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              status === 'connected' ? 'bg-green-500' :
              status === 'connecting' ? 'bg-yellow-500' :
              status === 'error' ? 'bg-red-500' :
              'bg-gray-500'
            }`} />
            <span className="text-sm text-gray-400">{statusMessage}</span>
          </div>

          {/* Fullscreen */}
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="p-2 hover:bg-gray-800 rounded text-gray-400"
          >
            {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            className="p-2 hover:bg-red-900/20 rounded text-red-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center bg-black relative">
        {status === 'connected' ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="max-w-full max-h-full cursor-crosshair"
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white text-lg">{statusMessage}</p>
            <p className="text-gray-400 text-sm mt-2">
              {status === 'connecting' && 'Kullanıcının ekranı yükleniyor...'}
              {status === 'error' && 'Bağlantı kurulamadı. Lütfen tekrar deneyin.'}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      {status === 'connected' && (
        <div className="bg-gray-900 border-t border-gray-800 p-4">
          <div className="flex items-center justify-center gap-8 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <MousePointer className="w-4 h-4" />
              <span>Mouse kontrolü aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4" />
              <span>Klavye kontrolü aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-500" />
              <span className="text-green-500">P2P Bağlantı Aktif</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
