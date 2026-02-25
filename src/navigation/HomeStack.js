import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/home/HomeScreen';
import FillWizardScreen from '../screens/home/FillWizardScreen';
import TemplateWizardScreen from '../screens/home/TemplateWizardScreen';
import DataWizardScreen from '../screens/home/DataWizardScreen';
import HomeHeaderMenu from '../components/HomeHeaderMenu';

const Stack = createNativeStackNavigator();
const HOME_TITLE_IMAGE = require('../../assets/titreformifai.png');

export default function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={{
          headerTitleAlign: 'center',
          headerTitle: () => (
            <Image source={HOME_TITLE_IMAGE} style={styles.headerLogo} resizeMode="contain" />
          ),
          headerRight: () => <HomeHeaderMenu />,
        }}
      />
      <Stack.Screen name="FillWizardScreen" component={FillWizardScreen} options={{ title: 'Nouveau remplissage' }} />
      <Stack.Screen name="TemplateWizardScreen" component={TemplateWizardScreen} options={{ title: 'Wizard formulaire' }} />
      <Stack.Screen name="DataWizardScreen" component={DataWizardScreen} options={{ title: 'Wizard donnees' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  headerLogo: {
    width: 170,
    height: 28,
  },
});
