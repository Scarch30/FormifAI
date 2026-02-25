import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { CopilotStep, walkthroughable } from 'react-native-copilot';
import { formFills, ocrDocuments, templates, transcriptions } from '../../api/client';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';
import useExport from '../../hooks/useExport';
import useOnboarding from '../../hooks/useOnboarding';
import { extractList, formatRelativeDate, sortByCreatedAtDesc } from '../../utils/apiData';
import {
  getDocumentName,
  getSourceName,
  getTranscriptionTitle,
  resolveSourceId,
  resolveSourceType,
} from '../../utils/entityResolvers';

const PARCOURS = [
  {
    icon: '📄',
    title: 'Creer un modele de formulaire',
    subtitle: 'Importer un PDF/image et placer les champs',
    screen: 'TemplateWizardScreen',
  },
  {
    icon: '✏️',
    title: 'Créer mon formulaire',
    subtitle: "Décrivez-le, l'IA le génère pour vous",
    tab: 'FormsStack',
    screen: 'GenerationRequestScreen',
  },
  {
    icon: '📊',
    title: 'Ajouter des donnees',
    subtitle: 'Transcription audio ou scan OCR',
    screen: 'DataWizardScreen',
  },
  {
    icon: '👤',
    title: 'Profils métier',
    subtitle: "Configurez votre secteur d'activité pour des résultats plus précis",
    tab: 'FormsStack',
    screen: 'ProfilesListScreen',
  },
  {
    icon: '✨',
    title: 'Remplir un formulaire',
    subtitle: "A partir d'une transcription ou d'un scan OCR",
    screen: 'FillWizardScreen',
  },
];

const WalkthroughableView = walkthroughable(View);

export default function HomeScreen({ navigation }) {
  const [loadingResume, setLoadingResume] = useState(true);
  const [howItWorksOpen, setHowItWorksOpen] = useState(true);
  const { isExporting, exportWithChoice } = useExport();
  const { maybeStartOnHome } = useOnboarding();
  const [resume, setResume] = useState({
    transcription: null,
    ocr: null,
    form: null,
    result: null,
  });

  const loadResume = useCallback(async () => {
    setLoadingResume(true);
    try {
      const [transRes, ocrRes, formsRes, fillsRes] = await Promise.allSettled([
        transcriptions.list({ limit: 1 }),
        ocrDocuments.listOcrDocuments({ limit: 1 }),
        templates.listByKind('template', { limit: 1 }),
        formFills.listFormFills({ limit: 1 }),
      ]);

      const pickLastItem = (settledResult, sourceLabel) => {
        if (settledResult?.status === 'fulfilled') {
          return sortByCreatedAtDesc(extractList(settledResult.value))[0] || null;
        }
        const statusCode = settledResult?.reason?.response?.status;
        const message = settledResult?.reason?.message || 'Erreur inconnue';
        if (statusCode === 404) {
          // Endpoint absent sur certaines versions backend: on ignore sans bruit.
          return null;
        }
        console.warn(`Resume: impossible de charger ${sourceLabel}: ${message}`);
        return null;
      };

      const lastTranscription = pickLastItem(transRes, 'transcriptions');
      const lastOcr = pickLastItem(ocrRes, 'ocr');
      const lastForm = pickLastItem(formsRes, 'templates');
      const lastResult = pickLastItem(fillsRes, 'form-fills');

      setResume({
        transcription: lastTranscription,
        ocr: lastOcr,
        form: lastForm,
        result: lastResult,
      });
    } catch (error) {
      console.error('Erreur chargement reprise accueil:', error);
      setResume({ transcription: null, ocr: null, form: null, result: null });
    } finally {
      setLoadingResume(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadResume();
    }, [loadResume])
  );

  useEffect(() => {
    void maybeStartOnHome();
  }, [maybeStartOnHome]);

  const resumeItems = useMemo(() => {
    const items = [];
    if (resume.transcription) {
      items.push({
        key: 'transcription',
        icon: '🎤',
        title: getTranscriptionTitle(resume.transcription),
        date: formatRelativeDate(resume.transcription?.created_at || resume.transcription?.createdAt),
        action: 'Continuer',
        onPress: () =>
          navigation.navigate('DataStack', {
            screen: 'TranscriptionDetailScreen',
            params: { transcriptionId: Number(resume.transcription?.id) },
          }),
      });
    }

    if (resume.ocr) {
      items.push({
        key: 'ocr',
        icon: '📷',
        title: getDocumentName(resume.ocr),
        date: formatRelativeDate(resume.ocr?.created_at || resume.ocr?.createdAt),
        action: 'Ouvrir',
        onPress: () =>
          navigation.navigate('DataStack', {
            screen: 'OcrDetailScreen',
            params: { ocrId: Number(resume.ocr?.id) },
          }),
      });
    }

    if (resume.form) {
      items.push({
        key: 'form',
        icon: '📄',
        title: getDocumentName(resume.form),
        date: formatRelativeDate(resume.form?.created_at || resume.form?.createdAt),
        action: 'Modifier',
        onPress: () =>
          navigation.navigate('FormsStack', {
            screen: 'FormDetailScreen',
            params: { formId: Number(resume.form?.id) },
          }),
      });
    }

    if (resume.result) {
      const sourceType = resolveSourceType(resume.result);
      const sourceId = resolveSourceId(resume.result, sourceType);
      const normalizedStatus = String(resume.result?.status || '').toLowerCase();
      const isDone = normalizedStatus === 'done' || normalizedStatus === 'completed';
      const resultId = Number(resume.result?.id);

      items.push({
        key: 'result',
        icon: '✅',
        title: getDocumentName(resume.result),
        subtitle: `${sourceType}: ${getSourceName(resume.result, sourceType, sourceId)}`,
        date: formatRelativeDate(resume.result?.created_at || resume.result?.createdAt),
        action: isDone ? 'Exporter' : 'Ouvrir',
        disabled: isExporting,
        onPress: () => {
          if (isDone) {
            exportWithChoice(resultId, resume.result?.document_name);
            return;
          }
          navigation.navigate('ResultsStack', {
            screen: 'ResultDetailScreen',
            params: {
              formFillId: resultId,
              resultId,
            },
          });
        },
      });
    }

    return items;
  }, [exportWithChoice, isExporting, navigation, resume]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionCard
        style={styles.collapsibleCard}
      >
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => setHowItWorksOpen((prev) => !prev)}
          activeOpacity={0.85}
        >
          <Text style={styles.collapsibleTitle}>Comment ca marche</Text>
          <Feather
            name={howItWorksOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
        {howItWorksOpen ? (
          <View style={styles.stepsWrap}>
            <Text style={styles.stepText}>1. Importez un formulaire et placez les champs</Text>
            <Text style={styles.stepText}>2. Ajoutez des données (voix ou OCR)</Text>
            <Text style={styles.stepText}>3. Associez un profil métier (optionnel mais recommandé)</Text>
            <Text style={styles.stepText}>4. Générez et exportez le document rempli</Text>
          </View>
        ) : null}
      </SectionCard>

      <CopilotStep
        name="onboarding-home-actions"
        order={6}
        text="Ici vous pouvez créer un document pas à pas, il suffit de faire les étapes l’une après l’autre."
      >
        <WalkthroughableView>
          <SectionCard
            title="Que voulez-vous faire ?"
            subtitle="Choisissez un objectif, on vous guide etape par etape."
          >
            {PARCOURS.map((item) => (
              <TouchableOpacity
                key={item.title}
                style={styles.parcoursCard}
                onPress={() => {
                  if (item.tab) {
                    navigation.navigate(item.tab, { screen: item.screen });
                    return;
                  }
                  navigation.navigate(item.screen);
                }}
              >
                <Text style={styles.parcoursIcon}>{item.icon}</Text>
                <View style={styles.parcoursBody}>
                  <Text style={styles.parcoursTitle}>{item.title}</Text>
                  <Text style={styles.parcoursSubtitle}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </SectionCard>
        </WalkthroughableView>
      </CopilotStep>

      <CopilotStep
        name="onboarding-home-resume"
        order={7}
        text="Ici vous retrouverez vos derniers travaux."
      >
        <WalkthroughableView>
          <SectionCard title="Reprendre" subtitle="Revenez rapidement sur vos derniers elements.">
            {loadingResume ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : resumeItems.length === 0 ? (
              <Text style={styles.emptyResume}>Aucun element recent.</Text>
            ) : (
              resumeItems.map((item) => (
                <View key={item.key} style={styles.resumeCard}>
                  <View style={styles.resumeTextWrap}>
                    <Text style={styles.resumeTitle} numberOfLines={1}>{`${item.icon} ${item.title}`}</Text>
                    <Text style={styles.resumeMeta}>{item.date}</Text>
                    {item.subtitle ? (
                      <Text numberOfLines={1} style={styles.resumeMeta}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.resumeButton, item.disabled && styles.resumeButtonDisabled]}
                    onPress={item.onPress}
                    disabled={Boolean(item.disabled)}
                  >
                    <Text style={styles.resumeButtonText}>
                      {item.key === 'result' && isExporting ? 'Export...' : item.action}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </SectionCard>
        </WalkthroughableView>
      </CopilotStep>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
    gap: 14,
  },
  collapsibleCard: {
    paddingTop: 12,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  collapsibleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  parcoursCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    borderRadius: 10,
    backgroundColor: 'rgba(91, 76, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  parcoursIcon: {
    fontSize: 18,
  },
  parcoursBody: {
    flex: 1,
  },
  parcoursTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  parcoursSubtitle: {
    marginTop: 2,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  emptyResume: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  resumeCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  resumeTextWrap: {
    flex: 1,
  },
  resumeTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  resumeMeta: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  resumeButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resumeButtonDisabled: {
    opacity: 0.7,
  },
  resumeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  stepsWrap: {
    gap: 8,
  },
  stepText: {
    fontSize: 14,
    color: Colors.text,
  },
});
