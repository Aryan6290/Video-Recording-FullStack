import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface ControlPanelProps {
  isSimulationMode: boolean;
  onToggleSimulate: () => void;
  toggleCamera: () => void;
  maxDuration: number;
  onSetDuration: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isSimulationMode,
  onToggleSimulate,
  toggleCamera,
  maxDuration,
  onSetDuration,
  isRecording,
  onStartRecording,
  onStopRecording,
}) => {
  return (
    <View style={styles.controlsContainer}>
      {/* Toggle Controls row */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.smallBtn, isSimulationMode && styles.activeToggleBtn]}
          onPress={onToggleSimulate}
          activeOpacity={0.7}
        >
          <Icon name="cube-outline" size={14} color="#ffffff" />
          <Text style={styles.smallBtnText}>Simulate</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.smallBtn} onPress={toggleCamera} activeOpacity={0.7}>
          <Icon name="camera-flip" size={14} color="#ffffff" />
          <Text style={styles.smallBtnText}>Flip Lens</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.smallBtn} onPress={onSetDuration} activeOpacity={0.7}>
          <Icon name="timer-cog-outline" size={14} color="#ffffff" />
          <Text style={styles.smallBtnText}>{maxDuration}s limit</Text>
        </TouchableOpacity>
      </View>

      {/* Main Recording Button */}
      <View style={styles.recordButtonWrapper}>
        {isRecording ? (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={onStopRecording}
            activeOpacity={0.8}
          >
            <View style={styles.stopIconInner} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.recordButton}
            onPress={onStartRecording}
            activeOpacity={0.8}
          >
            <View style={styles.recordIconInner} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.helpText}>
        {isRecording ? 'TAP SQUARE TO COMPUTE & SAVE SESSION' : 'TAP BUTTON TO INITIALIZE RECORDING'}
      </Text>
    </View>
  );
};
