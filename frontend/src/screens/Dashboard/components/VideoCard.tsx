import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles';
import { VideoResponse } from '../../../models';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface VideoCardProps {
  item: VideoResponse;
  progress: number;
  onRetry: (item: VideoResponse) => void;
  onDelete: (videoId: string, path: string) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  item,
  progress,
  onRetry,
  onDelete,
}) => {
  const hasLocal = !!item.local_path;

  // Format file size into MB
  const formatSize = (bytes: number) => {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format duration
  const formatDuration = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render Upload Badge Color
  const getBadgeStyle = (state: string) => {
    switch (state) {
      case 'uploaded':
        return styles.badgeSuccess;
      case 'uploading':
        return styles.badgeProgress;
      case 'failed':
        return styles.badgeDanger;
      default:
        return styles.badgeWarning;
    }
  };

  const getBadgeText = (state: string) => {
    switch (state) {
      case 'uploaded':
        return '● Synced';
      case 'uploading':
        return '● Uploading';
      case 'failed':
        return '● Failed';
      default:
        return '● Pending';
    }
  };

  return (
    <View style={styles.card}>
      {/* Header row in card */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardId} numberOfLines={1}>
          ID: {item.video_id.substring(0, 8)}...
        </Text>
        <View style={[styles.badgeBase, getBadgeStyle(item.upload_state)]}>
          <Text style={styles.badgeText}>{getBadgeText(item.upload_state)}</Text>
        </View>
      </View>

      {/* Subtitle details */}
      <Text style={styles.cardDate}>
        Recorded: {new Date(item.started_at).toLocaleString()}
      </Text>

      {/* Main grid parameters */}
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>LENGTH</Text>
          <Text style={styles.gridValue}>{formatDuration(item.duration_ms)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>SIZE</Text>
          <Text style={styles.gridValue}>{formatSize(item.file_size_bytes)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>TIER</Text>
          <Text style={styles.gridValue}>{item.fps_tier.toUpperCase()}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>RES</Text>
          <Text style={styles.gridValue}>{item.resolution}</Text>
        </View>
      </View>

      {/* Live upload progress bar */}
      {item.upload_state === 'uploading' && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressPct}>{progress}% Uploaded</Text>
        </View>
      )}

      {/* Last attempt errors */}
      {item.upload_state === 'failed' && item.last_error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText} numberOfLines={2}>
            Error: {item.last_error}
          </Text>
        </View>
      )}

      {/* Actions Section */}
      <View style={styles.actionsContainer}>
        {item.upload_state === 'failed' && (
          <TouchableOpacity
            style={styles.actionBtnRetry}
            onPress={() => onRetry(item)}
            activeOpacity={0.7}
          >
            <Icon name="cloud-upload" size={14} color="#ffffff" />
            <Text style={styles.actionBtnText}>Retry Upload</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionBtnDelete, !hasLocal && styles.disabledBtn]}
          onPress={() => onDelete(item.video_id, item.local_path)}
          disabled={!hasLocal}
          activeOpacity={0.7}
        >
          <Icon 
            name={hasLocal ? 'delete-outline' : 'checkbox-marked-circle-outline'} 
            size={14} 
            color={hasLocal ? '#ef4444' : '#475569'} 
          />
          <Text style={[styles.actionBtnTextDelete, !hasLocal && styles.disabledText]}>
            {hasLocal ? 'Delete Local' : 'Space Reclaimed'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
