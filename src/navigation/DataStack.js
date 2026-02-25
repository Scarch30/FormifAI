import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DataListScreen from '../screens/data/DataListScreen';
import TranscriptionDetailScreen from '../screens/data/TranscriptionDetailScreen';
import OcrDetailScreen from '../screens/data/OcrDetailScreen';
import CreateTranscriptionScreen from '../screens/data/CreateTranscriptionScreen';
import CreateOcrScreen from '../screens/data/CreateOcrScreen';
import RecordScreen from '../screens/RecordScreen';

const Stack = createNativeStackNavigator();

export default function DataStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="DataListScreen" component={DataListScreen} options={{ title: 'Donnees' }} />
      <Stack.Screen name="TranscriptionDetailScreen" component={TranscriptionDetailScreen} options={{ title: 'Transcription' }} />
      <Stack.Screen name="OcrDetailScreen" component={OcrDetailScreen} options={{ title: 'OCR' }} />
      <Stack.Screen name="CreateTranscriptionScreen" component={CreateTranscriptionScreen} options={{ title: 'Nouvelle transcription' }} />
      <Stack.Screen name="CreateOcrScreen" component={CreateOcrScreen} options={{ title: 'Nouveau scan OCR' }} />
      <Stack.Screen
        name="RecordScreen"
        component={RecordScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}
