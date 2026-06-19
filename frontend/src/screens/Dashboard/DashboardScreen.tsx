import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { AppContext } from '../../Router';
import { databaseService } from '../../services/database';
import { syncEngine } from '../../services/syncEngine';
import { VideoResponse } from '../../models';
import { showToast } from '../../utils/toast';
import { styles } from './styles';
import { EmptyState } from './components/EmptyState';
import { VideoCard } from './components/VideoCard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export const DashboardScreen = () => {
  const { workerId, logout } = useContext(AppContext);
  const [videos, setVideos] = useState<VideoResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Tracks active upload progress per video ID
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // Keep references to prevent duplicate paging requests
  const isFetchingRef = useRef(false);

  // Fetch initial batch
  const fetchInitialVideos = async () => {
    if (!workerId) return;
    setLoading(true);
    isFetchingRef.current = true;
    try {
      const paged = await databaseService.getVideosPaged(workerId, 15);
      setVideos(paged);
      setHasMore(paged.length === 15);
    } catch (e) {
      showToast('Error loading video history');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  // Pull to Refresh
  const handleRefresh = async () => {
    if (!workerId || isFetchingRef.current) return;
    setRefreshing(true);
    isFetchingRef.current = true;
    try {
      const paged = await databaseService.getVideosPaged(workerId, 15);
      setVideos(paged);
      setHasMore(paged.length === 15);
      setUploadProgress({});
    } catch (e) {
      showToast('Refresh failed');
    } finally {
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  };

  // Load More (Cursor-based Keyset Pagination)
  const handleLoadMore = async () => {
    if (!workerId || !hasMore || loadingMore || isFetchingRef.current || videos.length === 0) return;

    setLoadingMore(true);
    isFetchingRef.current = true;
    try {
      const lastVideo = videos[videos.length - 1];
      const paged = await databaseService.getVideosPaged(
        workerId,
        15,
        lastVideo.started_at,
        lastVideo.video_id
      );

      if (paged.length > 0) {
        setVideos((prev) => [...prev, ...paged]);
        setHasMore(paged.length === 15);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.warn('Failed to paginate video list', e);
    } finally {
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  };

  // Subscribe to SyncEngine notifications for live updates
  useEffect(() => {
    fetchInitialVideos();

    const unsubscribe = syncEngine.subscribe((event) => {
      if (event.type === 'status_change' && event.videoId) {
        setVideos((prevList) =>
          prevList.map((v) => {
            if (v.video_id === event.videoId) {
              return {
                ...v,
                upload_state: event.status || v.upload_state,
                last_error: event.error !== undefined ? event.error : v.last_error,
              };
            }
            return v;
          })
        );
      } else if (event.type === 'progress' && event.videoId && event.percent !== undefined) {
        setUploadProgress((prev) => ({
          ...prev,
          [event.videoId!]: event.percent!,
        }));
      } else if (event.type === 'queue_change') {
        handleRefresh();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [workerId]);

  // Clean local file action
  const handleDeleteLocalFile = (videoId: string, localPath: string) => {
    if (!localPath) {
      showToast('Local file is already cleaned up.');
      return;
    }

    Alert.alert(
      'Clean Local File',
      'This removes the heavy video MP4 binary from your phone to free up space. The record metadata remains intact. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Storage',
          style: 'destructive',
          onPress: async () => {
            await databaseService.clearLocalPath(videoId);
            showToast('Local video space cleared.');
            handleRefresh();
          },
        },
      ]
    );
  };

  // Retry failed upload action
  const handleRetryUpload = (video: VideoResponse) => {
    syncEngine.forceRetry(video.video_id, video);
    showToast('Retrying upload...');
  };

  return (
    <View style={styles.container}>
      {/* Top Navbar Header */}
      <View style={localStyles.header}>
        <View>
          <Text style={localStyles.headerTitle}>ACTIVE WORKER SESSION</Text>
          <Text style={localStyles.headerSubtitle}>{workerId}</Text>
        </View>
        <TouchableOpacity style={localStyles.logoutBtn} onPress={logout} activeOpacity={0.7}>
          <Icon name="logout" size={14} color="#ef4444" />
          <Text style={localStyles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Fetching database feed...</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.video_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#3b82f6"
              colors={['#3b82f6']}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={() => {
            if (!loadingMore) return null;
            return (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            );
          }}
          ListEmptyComponent={() => <EmptyState onRefresh={handleRefresh} />}
          renderItem={({ item }) => (
            <VideoCard
              item={item}
              progress={uploadProgress[item.video_id] ?? 0}
              onRetry={handleRetryUpload}
              onDelete={handleDeleteLocalFile}
            />
          )}
        />
      )}
    </View>
  );
};

const localStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#3b82f6',
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    gap: 6,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
});
