import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ResultsListScreen from '../screens/results/ResultsListScreen';
import ResultDetailScreen from '../screens/results/ResultDetailScreen';
import ResultExportScreen from '../screens/results/ResultExportScreen';
import FormFillScreen from '../screens/FormFillScreen';

const Stack = createNativeStackNavigator();

export default function ResultsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ResultsListScreen" component={ResultsListScreen} options={{ title: 'Resultats' }} />
      <Stack.Screen name="ResultDetailScreen" component={ResultDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ResultExportScreen" component={ResultExportScreen} options={{ title: 'Export' }} />
      <Stack.Screen name="FormFill" component={FormFillScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
