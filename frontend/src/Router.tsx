import React, { createContext, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import { apiService } from './services/api';
import { databaseService } from './services/database';
import { syncEngine } from './services/syncEngine';
import { LoginScreen } from './screens/Login';
import { CaptureScreen } from './screens/Capture';
import { DashboardScreen } from './screens/Dashboard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface IAppContext {
  token: string | null;
  workerId: string | null;
  currentTab: 'capture' | 'dashboard';
  setTab: (tab: 'capture' | 'dashboard') => void;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AppContext = createContext<IAppContext>({
  token: null,
  workerId: null,
  currentTab: 'capture',
  setTab: () => {},
  login: async () => {},
  logout: async () => {},
});

export const Router = () => {
  const [token, setToken] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [currentTab, setTab] = useState<'capture' | 'dashboard'>('capture');
  const [isLoading, setIsLoading] = useState(true);

  // Restore session and initialize SQLite database on mount
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        // Initialize SQLite local tables
        await databaseService.initDb();
        console.log('Router: Local SQLite tables initialized');

        // Check if there is an active mock session
        const session = await apiService.getSession();
        if (session.token && session.workerId) {
          setToken(session.token);
          setWorkerId(session.workerId);
          console.log(`Router: Restored session for worker ${session.workerId}`);
          
          // Trigger sync engine to check for any outstanding videos
          syncEngine.triggerSync();
        }
      } catch (e) {
        console.error('Failed bootstrapping application session / database', e);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  const handleLogin = async (emailOrPhone: string) => {
    const data = await apiService.login(emailOrPhone);
    setToken(data.access_token);
    setWorkerId(data.worker_id);
    
    // Trigger sync engine to run on successful login
    syncEngine.triggerSync();
  };

  const handleLogout = async () => {
    await apiService.logout();
    setToken(null);
    setWorkerId(null);
    setTab('capture'); // reset tab
  };

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.splashText}>Restoring session...</Text>
      </View>
    );
  }

  // Auth Guard
  if (!token) {
    return (
      <AppContext.Provider value={{ token, workerId, currentTab, setTab, login: handleLogin, logout: handleLogout }}>
        <LoginScreen />
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={{ token, workerId, currentTab, setTab, login: handleLogin, logout: handleLogout }}>
      <SafeAreaView style={styles.mainContainer}>
        {/* Active Screen Area */}
        <View style={styles.screenContainer}>
          {currentTab === 'capture' ? <CaptureScreen /> : <DashboardScreen />}
        </View>

        {/* Customized Bottom Tab Navigation Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, currentTab === 'capture' && styles.activeTabItem]}
            onPress={() => setTab('capture')}
            activeOpacity={0.8}
          >
            <Icon 
              name={currentTab === 'capture' ? 'video-vintage' : 'video-outline'} 
              size={22} 
              color={currentTab === 'capture' ? '#ef4444' : '#94a3b8'} 
              style={{ marginBottom: 4 }}
            />
            <Text style={[styles.tabLabel, currentTab === 'capture' && styles.activeTabLabel]}>
              Camera
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, currentTab === 'dashboard' && styles.activeTabItem]}
            onPress={() => setTab('dashboard')}
            activeOpacity={0.8}
          >
            <Icon 
              name={currentTab === 'dashboard' ? 'view-dashboard' : 'view-dashboard-outline'} 
              size={22} 
              color={currentTab === 'dashboard' ? '#3b82f6' : '#94a3b8'} 
              style={{ marginBottom: 4 }}
            />
            <Text style={[styles.tabLabel, currentTab === 'dashboard' && styles.activeTabLabel]}>
              Dashboard
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </AppContext.Provider>
  );
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashText: {
    color: '#64748b',
    marginTop: 12,
    fontSize: 14,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 76 : 64,
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderColor: '#1e293b',
    paddingBottom: Platform.OS === 'ios' ? 16 : 0,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    opacity: 0.6,
  },
  activeTabItem: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  activeTabLabel: {
    color: '#ffffff',
  },
});
