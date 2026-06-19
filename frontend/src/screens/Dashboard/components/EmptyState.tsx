import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface EmptyStateProps {
  onRefresh: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onRefresh }) => {
  return (
    <View style={styles.emptyContainer}>
      <Icon name="video-off-outline" size={48} color="#475569" style={{ marginBottom: 16 }} />
      <Text style={styles.emptyTitle}>No Recorded Sessions</Text>
      <Text style={styles.emptyDesc}>
        Videos you capture on the camera page will display here along with their cloud upload progress.
      </Text>
      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
        <Text style={styles.refreshBtnText}>Check Queue</Text>
      </TouchableOpacity>
    </View>
  );
};
