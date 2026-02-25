import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CopilotProvider } from 'react-native-copilot';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import OnboardingTooltip from './src/components/onboarding/OnboardingTooltip';
import { OnboardingProvider } from './src/hooks/useOnboarding';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import RootNavigator from './src/navigation/RootNavigator';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#5B4CFF" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Root" component={RootNavigator} />
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <CopilotProvider
          overlay="view"
          animated={false}
          stopOnOutsideClick
          tooltipComponent={OnboardingTooltip}
          backdropColor="rgba(0, 0, 0, 0.55)"
        >
          <OnboardingProvider>
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          </OnboardingProvider>
        </CopilotProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}
