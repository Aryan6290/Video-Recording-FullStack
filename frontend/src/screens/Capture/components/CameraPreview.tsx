import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { styles } from '../styles';

// Safely try importing Vision Camera preview
let Camera: any;
try {
  Camera = require('react-native-vision-camera').Camera;
} catch (e) {}

interface CameraPreviewProps {
  isSimulationMode: boolean;
  device: any;
  hasCameraPermission: boolean;
  cameraPosition: 'back' | 'front';
  cameraRef: React.RefObject<any>;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  isSimulationMode,
  device,
  hasCameraPermission,
  cameraPosition,
  cameraRef,
}) => {
  if (!isSimulationMode && device && hasCameraPermission && Camera) {
    return (
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        video={true}
        audio={true}
      />
    );
  }

  // Simulated Preview Frame
  return (
    <View style={styles.simulationPreview}>
      <View style={styles.scanningLine} />
      <Text style={styles.simText}>SIMULATOR SCAN MODE ACTIVE</Text>
      <Text style={styles.simSubtext}>
        {cameraPosition.toUpperCase()} CAMERA SCANNING FEED
      </Text>
      <View style={styles.crosshairCenter} />
      <View style={styles.borderCornerTL} />
      <View style={styles.borderCornerTR} />
      <View style={styles.borderCornerBL} />
      <View style={styles.borderCornerBR} />
    </View>
  );
};
