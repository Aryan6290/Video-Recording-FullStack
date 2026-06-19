import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../styles';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface HudOverlayProps {
  isSimulationMode: boolean;
  cameraPosition: 'back' | 'front';
  timerSeconds: number;
  maxDuration: number;
  isRecording: boolean;
  formatTimer: (secs: number) => string;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  isSimulationMode,
  cameraPosition,
  timerSeconds,
  maxDuration,
  isRecording,
  formatTimer,
}) => {
  return (
    <View style={styles.hudContainer}>
      <View style={styles.hudRow}>
        <View style={styles.badge}>
          <Icon 
            name={isSimulationMode ? 'monitor-shimmer' : 'cpu'} 
            size={12} 
            color="#94a3b8" 
          />
          <Text style={styles.badgeText}>
            {isSimulationMode ? 'SIM MODE' : 'HARDWARE CAM'}
          </Text>
        </View>
        <View style={styles.badge}>
          <Icon name="camera-flip-outline" size={12} color="#94a3b8" />
          <Text style={styles.badgeText}>{cameraPosition.toUpperCase()}</Text>
        </View>
      </View>

      {/* Time & Counter indicator */}
      <View style={styles.timerContainer}>
        <Text style={[styles.timerText, isRecording && styles.timerTextRecording]}>
          {formatTimer(timerSeconds)}
        </Text>
        <Text style={styles.durationLimitText}>LIMIT: {maxDuration}s</Text>
      </View>
    </View>
  );
};
