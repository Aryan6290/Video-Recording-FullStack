import React, { useState, useContext } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { AppContext } from '../../Router';
import { showToast } from '../../utils/toast';
import { styles } from './styles';

export const LoginScreen = () => {
  const { login } = useContext(AppContext);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!emailOrPhone.trim()) {
      showToast('Please enter your email or phone number');
      return;
    }
    if (!password || password.length < 6) {
      showToast('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await login(emailOrPhone.trim());
      showToast('Logged in successfully!');
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Login failed';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.headerContainer}>
          <Text style={styles.title}>LOCARA</Text>
          <Text style={styles.subtitle}>EgoCentric Video Capture System</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Worker Login</Text>
          <Text style={styles.cardDesc}>Enter your registered email or phone to sync captured video data.</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>EMAIL OR PHONE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. worker123@locaralabs.com"
              placeholderTextColor="#475569"
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#475569"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Authenticate Session</Text>
            )}
          </TouchableOpacity>
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>Locara Labs Engineering Hiring 2025</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
