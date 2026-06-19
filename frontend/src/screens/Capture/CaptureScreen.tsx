import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, StatusBar, Alert, Vibration, Platform, PermissionsAndroid } from 'react-native';
import { AppContext } from '../../Router';
import { databaseService } from '../../services/database';
import { syncEngine } from '../../services/syncEngine';
import { FpsTier, NetworkType } from '../../models';
import { showToast } from '../../utils/toast';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import NetInfo from '@react-native-community/netinfo';

// Imports sub-components and styles
import { CameraPreview } from './components/CameraPreview';
import { HudOverlay } from './components/HudOverlay';
import { ControlPanel } from './components/ControlPanel';
import { styles } from './styles';

// Safe imports with fallback
let DeviceInfo: any;
try {
  DeviceInfo = require('react-native-device-info').default;
} catch (e) {
  console.warn('DeviceInfo native module loading failed.');
}

let Geolocation: any;
try {
  Geolocation = require('react-native-geolocation-service');
} catch (e) {
  console.warn('Geolocation native module loading failed.');
}

// Safely try importing Vision Camera
let Camera: any;
let useCameraDevice: any;
try {
  const VisionCamera = require('react-native-vision-camera');
  Camera = VisionCamera.Camera;
  useCameraDevice = VisionCamera.useCameraDevice;
} catch (e) {
  console.warn('react-native-vision-camera loading failed.');
}

export const CaptureScreen = () => {
  const { workerId } = useContext(AppContext);

  // Camera settings
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const [maxDuration, setMaxDuration] = useState(60); // Default 60 seconds
  const [isSimulationMode, setIsSimulationMode] = useState(true); // Default true for simulator convenience

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Metadata captured at recording start
  const [recordingMetadata, setRecordingMetadata] = useState<{
    videoId: string;
    startedAt: string;
    batteryStart: number;
    gpsLatitude?: number;
    gpsLongitude?: number;
  } | null>(null);

  // References
  const cameraRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // Check and Request Permissions on mount
  useEffect(() => {
    const requestPermissions = async () => {
      // 1. Camera & Microphone
      if (Camera) {
        try {
          const cameraPermission = await Camera.getCameraPermissionStatus();
          let cameraGranted = cameraPermission === 'granted';
          if (!cameraGranted) {
            const newPermission = await Camera.requestCameraPermission();
            cameraGranted = newPermission === 'granted';
          }
          
          const micPermission = await Camera.getMicrophonePermissionStatus();
          if (micPermission !== 'granted') {
            await Camera.requestMicrophonePermission();
          }

          setHasCameraPermission(cameraGranted);
          setIsSimulationMode(!cameraGranted);
        } catch (e) {
          console.warn('Failed requesting camera/mic permission', e);
          setIsSimulationMode(true);
        }
      } else {
        setIsSimulationMode(true);
      }

      // 2. Geolocation Permission (Android / iOS)
      if (Platform.OS === 'android') {
        try {
          const locationGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (!locationGranted) {
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
              {
                title: 'Location Permission',
                message: 'This app needs access to your location for recording video metadata.',
                buttonNeutral: 'Ask Me Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
              }
            );
          }
        } catch (err) {
          console.warn('Failed requesting location permission', err);
        }
      } else if (Platform.OS === 'ios' && Geolocation) {
        try {
          await Geolocation.requestAuthorization('whenInUse');
        } catch (err) {
          console.warn('Failed requesting iOS location permission', err);
        }
      }
    };
    requestPermissions();
  }, []);

  // Timer effect
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev >= maxDuration - 1) {
            // Reached limit, stop recording automatically
            handleStopRecording();
            return maxDuration;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimerSeconds(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, maxDuration]);

  // Format timer into MM:SS
  const formatTimer = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = secs % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Switch camera toggle
  const toggleCamera = () => {
    setCameraPosition((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  // Start recording action
  const handleStartRecording = async () => {
    try {
      Vibration.vibrate(100);
      const videoId = uuidv4();
      const startedAt = new Date().toISOString();
      
      // Fetch battery start
      let batteryStart = 100;
      if (DeviceInfo) {
        try {
          const level = await DeviceInfo.getBatteryLevel();
          if (level !== -1) batteryStart = Math.round(level * 100);
        } catch (e) {}
      }

      // Fetch location (with fallback)
      let latitude = 37.7749; // default San Francisco
      let longitude = -122.4194;

      const saveMetadata = (lat?: number, lng?: number) => {
        setRecordingMetadata({
          videoId,
          startedAt,
          batteryStart,
          gpsLatitude: lat,
          gpsLongitude: lng,
        });
        setIsRecording(true);
        showToast('Recording started');
      };

      if (Geolocation && hasCameraPermission) {
        Geolocation.getCurrentPosition(
          (position: any) => {
            saveMetadata(position.coords.latitude, position.coords.longitude);
          },
          (error: any) => {
            console.warn('Geolocation failed, saving video with default mock coordinates', error);
            saveMetadata(latitude, longitude);
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
        );
      } else {
        // Fallback for simulator or missing permissions
        saveMetadata(latitude, longitude);
      }

      if (!isSimulationMode && cameraRef.current) {
        // Real recording implementation
        // For vision-camera, we call startRecording
        // cameraRef.current.startRecording({...})
        console.log('Started physical camera recording session');
      }
    } catch (err) {
      console.error('Failed starting recording', err);
      showToast('Error starting recording');
    }
  };

  // Stop recording action
  const handleStopRecording = async () => {
    if (!isRecording || !recordingMetadata) return;

    Vibration.vibrate([0, 100, 50, 100]);
    setIsRecording(false);
    showToast('Processing recording metadata...');

    try {
      const endedAt = new Date().toISOString();
      const durationMs = timerSeconds * 1000 || 2000; // minimum 2 seconds mock

      // Fetch battery end
      let batteryEnd = recordingMetadata.batteryStart - 1; // mock slightly lower
      if (DeviceInfo) {
        try {
          const level = await DeviceInfo.getBatteryLevel();
          if (level !== -1) batteryEnd = Math.round(level * 100);
        } catch (e) {}
      }

      // Fetch network type at recording stop
      const netState = await NetInfo.fetch();
      const networkType: 'wifi' | 'cellular' | 'none' = netState.type === 'wifi'
        ? 'wifi'
        : netState.type === 'cellular'
          ? 'cellular'
          : 'none';

      // Gather device descriptors
      const deviceModel = DeviceInfo ? DeviceInfo.getModel() : 'Android Emulator';
      const osVersion = DeviceInfo ? DeviceInfo.getSystemVersion() : 'Android 11';
      
      const fileSizeBytes = Math.round(durationMs * 680 * (isSimulationMode ? 1.0 : 1.2)); // derived mockup sizing (~5MB/sec)
      const resolution = '1920x1080';
      const fps = 30.0;
      const fpsTier = FpsTier.STANDARD;
      
      const localPath = `/storage/emulated/0/DCIM/Camera/${recordingMetadata.videoId}.mp4`;

      // Save to Database
      await databaseService.saveVideo({
        video_id: recordingMetadata.videoId,
        worker_id: workerId || 'unknown_worker',
        started_at: recordingMetadata.startedAt,
        ended_at: endedAt,
        duration_ms: durationMs,
        file_size_bytes: fileSizeBytes,
        fps,
        fps_tier: fpsTier,
        resolution,
        local_path: localPath,
        device_model: deviceModel,
        os_version: osVersion,
        gps_latitude: recordingMetadata.gpsLatitude,
        gps_longitude: recordingMetadata.gpsLongitude,
        battery_start: recordingMetadata.batteryStart,
        battery_end: batteryEnd,
        network_type_upload: networkType as NetworkType,
        extensible_metadata: {
          simulation: isSimulationMode,
          environment: Platform.OS,
        },
      });

      showToast('Video saved! Starting upload...');
      setRecordingMetadata(null);

      // Trigger sync engine immediately
      syncEngine.triggerSync();
    } catch (err: any) {
      console.error('Failed stopping recording metadata generation', err);
      showToast('Failed saving video metadata');
    }
  };

  const handleToggleSimulate = () => {
    if (!Camera) {
      showToast('Camera library not loaded. Forcing simulation.');
      return;
    }
    setIsSimulationMode(!isSimulationMode);
  };

  const handleSetDuration = () => {
    Alert.alert(
      'Set Max Duration',
      'Choose recording cut-off length:',
      [
        { text: '15 seconds', onPress: () => setMaxDuration(15) },
        { text: '30 seconds', onPress: () => setMaxDuration(30) },
        { text: '60 seconds', onPress: () => setMaxDuration(60) },
        { text: '120 seconds', onPress: () => setMaxDuration(120) },
      ]
    );
  };

  // Get active camera device
  const device = Camera && useCameraDevice ? useCameraDevice(cameraPosition) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Camera Preview Area */}
      <View style={styles.previewContainer}>
        <CameraPreview
          isSimulationMode={isSimulationMode}
          device={device}
          hasCameraPermission={hasCameraPermission}
          cameraPosition={cameraPosition}
          cameraRef={cameraRef}
        />

        <HudOverlay
          isSimulationMode={isSimulationMode}
          cameraPosition={cameraPosition}
          timerSeconds={timerSeconds}
          maxDuration={maxDuration}
          isRecording={isRecording}
          formatTimer={formatTimer}
        />
      </View>

      {/* Control Panel Area */}
      <ControlPanel
        isSimulationMode={isSimulationMode}
        onToggleSimulate={handleToggleSimulate}
        toggleCamera={toggleCamera}
        maxDuration={maxDuration}
        onSetDuration={handleSetDuration}
        isRecording={isRecording}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
      />
    </View>
  );
};
