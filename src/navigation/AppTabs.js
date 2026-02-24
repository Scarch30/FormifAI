import React, { useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { CopilotStep, walkthroughable } from 'react-native-copilot';
import HomeStack from './HomeStack';
import DataStack from './DataStack';
import FormsStack from './FormsStack';
import ResultsStack from './ResultsStack';
import Colors from '../constants/Colors';
import GlobalFAB from '../components/GlobalFAB';

const Tab = createBottomTabNavigator();

const HIDE_FAB_ROUTES = new Set([
  'FillWizardScreen',
  'TemplateWizardScreen',
  'DataWizardScreen',
  'TemplateEditorScreen',
  'GenerationRequestScreen',
  'ConfigEditorScreen',
  'FillDocScreen',
]);

const ICON_BY_ROUTE = {
  HomeStack: 'home',
  DataStack: 'database',
  FormsStack: 'file-text',
  ResultsStack: 'check-circle',
};

const LABEL_BY_ROUTE = {
  HomeStack: 'Accueil',
  DataStack: 'Donnees',
  FormsStack: 'Formulaires',
  ResultsStack: 'Resultats',
};

const TAB_ONBOARDING_STEP_BY_ROUTE = {
  HomeStack: {
    name: 'onboarding-tab-home',
    order: 1,
    text: "ici c’est pour revenir à l'accueil et voir votre tableau de bord.",
  },
  DataStack: {
    name: 'onboarding-tab-data',
    order: 3,
    text: 'Vos sources de données : transcriptions audio, documents scannés et profils métier.',
  },
  FormsStack: {
    name: 'onboarding-tab-forms',
    order: 4,
    text: "Vos formulaires et templates. Importez un formulaire, l'IA le détecte et crée un template réutilisable.",
  },
  ResultsStack: {
    name: 'onboarding-tab-results',
    order: 5,
    text: 'Retrouvez tous vos formulaires remplis. Exportez-les en PDF ou JPG et partagez-les.',
  },
};

const WalkthroughableTabButton = walkthroughable(TouchableOpacity);

function OnboardingTabButton({ step, ...props }) {
  return (
    <CopilotStep name={step.name} order={step.order} text={step.text}>
      <WalkthroughableTabButton {...props} />
    </CopilotStep>
  );
}

const getDeepestRouteName = (state) => {
  if (!state || !Array.isArray(state.routes) || state.routes.length === 0) return null;
  const route = state.routes[state.index ?? 0];
  if (route?.state) return getDeepestRouteName(route.state) || route.name;
  return route?.name || null;
};

export default function AppTabs({ route }) {
  const activeRouteName = useMemo(() => getDeepestRouteName(route?.state) || 'HomeScreen', [route?.state]);
  const hideFab = HIDE_FAB_ROUTES.has(activeRouteName);

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route: tabRoute }) => ({
          tabBarButton: (props) => {
            const step = TAB_ONBOARDING_STEP_BY_ROUTE[tabRoute.name];
            if (!step) return <TouchableOpacity {...props} />;
            return <OnboardingTabButton step={step} {...props} />;
          },
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textTertiary,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
          tabBarIcon: ({ color, size }) => (
            <Feather name={ICON_BY_ROUTE[tabRoute.name]} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="HomeStack" component={HomeStack} options={{ title: LABEL_BY_ROUTE.HomeStack }} />
        <Tab.Screen
          name="DataStack"
          component={DataStack}
          options={{
            title: LABEL_BY_ROUTE.DataStack,
            popToTopOnBlur: true,
          }}
          listeners={({ navigation }) => ({
            tabPress: (event) => {
              event.preventDefault();
              navigation.navigate('DataStack', { screen: 'DataListScreen' });
            },
          })}
        />
        <Tab.Screen
          name="FormsStack"
          component={FormsStack}
          options={{
            title: LABEL_BY_ROUTE.FormsStack,
            popToTopOnBlur: true,
          }}
          listeners={({ navigation }) => ({
            tabPress: (event) => {
              event.preventDefault();
              navigation.navigate('FormsStack', {
                screen: 'FormsListScreen',
                params: { tab: 'documents' },
                initial: false,
              });
            },
          })}
        />
        <Tab.Screen name="ResultsStack" component={ResultsStack} options={{ title: LABEL_BY_ROUTE.ResultsStack }} />
      </Tab.Navigator>
      <GlobalFAB hidden={hideFab} rootRouteName="AppTabs" />
    </>
  );
}
