import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TemplatesScreen from '../screens/TemplatesScreen';
import FormDetailScreen from '../screens/forms/FormDetailScreen';
import ImportFormScreen from '../screens/forms/ImportFormScreen';
import ImportTemplateScreen from '../screens/ImportTemplateScreen';
import ProfilesListScreen from '../screens/forms/ProfilesListScreen';
import ProfileCreateScreen from '../screens/forms/ProfileCreateScreen';
import ProfileDetailScreen from '../screens/forms/ProfileDetailScreen';
import ProfilePickerScreen from '../screens/forms/ProfilePickerScreen';
import TemplateEditorScreen from '../screens/TemplateEditorScreen';
import TemplateDetailScreen from '../screens/TemplateDetailScreen';
import TemplateSetupScreen from '../screens/TemplateSetupScreen';
import FormFillScreen from '../screens/FormFillScreen';
import GenerationRequestScreen from '../screens/forms/GenerationRequestScreen';
import GenerationRecordScreen from '../screens/forms/GenerationRecordScreen';
import ConfigEditorScreen from '../screens/forms/ConfigEditorScreen';
import FillDocScreen from '../screens/forms/FillDocScreen';
import RecordScreen from '../screens/RecordScreen';

const Stack = createNativeStackNavigator();

export default function FormsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="FormsListScreen" component={TemplatesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TemplatesScreen" component={TemplatesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="FormDetailScreen" component={FormDetailScreen} options={{ title: 'Detail formulaire' }} />
      <Stack.Screen name="ImportFormScreen" component={ImportFormScreen} options={{ title: 'Importer' }} />
      <Stack.Screen
        name="ImportTemplateScreen"
        component={ImportTemplateScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="GenerationRequestScreen"
        component={GenerationRequestScreen}
        options={{ title: 'Créer mon formulaire' }}
      />
      <Stack.Screen
        name="GenerationRecordScreen"
        component={GenerationRecordScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="RecordScreen"
        component={RecordScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen name="ConfigEditorScreen" component={ConfigEditorScreen} options={{ title: 'Mon formulaire' }} />
      <Stack.Screen name="FillDocScreen" component={FillDocScreen} options={{ title: 'Remplissage' }} />
      <Stack.Screen name="TemplateEditorScreen" component={TemplateEditorScreen} options={{ headerShown: false }} />
      <Stack.Screen name="FormFill" component={FormFillScreen} options={{ headerShown: false }} />

      <Stack.Screen name="ProfilesListScreen" component={ProfilesListScreen} options={{ title: 'Profils metier' }} />
      <Stack.Screen name="ProfileCreateScreen" component={ProfileCreateScreen} options={{ title: 'Nouveau profil' }} />
      <Stack.Screen name="ProfileDetailScreen" component={ProfileDetailScreen} options={{ title: 'Detail profil' }} />
      <Stack.Screen name="ProfilePickerScreen" component={ProfilePickerScreen} options={{ title: 'Associer un profil' }} />

      <Stack.Screen name="TemplateDetailScreen" component={TemplateDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TemplateSetupScreen" component={TemplateSetupScreen} options={{ title: 'Configuration template' }} />
      <Stack.Screen name="WorkProfilesScreen" component={ProfilesListScreen} options={{ title: 'Profils metier' }} />
    </Stack.Navigator>
  );
}
