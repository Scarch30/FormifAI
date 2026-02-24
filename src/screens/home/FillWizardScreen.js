import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { formFills, ocrDocuments, templates, transcriptions } from '../../api/client';
import Colors from '../../constants/Colors';
import EmptyState from '../../components/EmptyState';
import SectionCard from '../../components/SectionCard';
import SourceIcon from '../../components/SourceIcon';
import StatusBadge from '../../components/StatusBadge';
import WizardStepper from '../../components/WizardStepper';
import { extractItem, extractList, formatDate, sortByCreatedAtDesc } from '../../utils/apiData';
import {
  getDocumentName,
  getFieldsCount,
  getPagesCount,
  getSourceName,
  getTranscriptionTitle,
  resolveSourceId,
  resolveSourceType,
} from '../../utils/entityResolvers';

const STEPS = ['Formulaire', 'Donnees', 'Generer'];
const SOURCE_TABS = [
  { key: 'transcription', label: 'Transcriptions' },
  { key: 'ocr', label: 'Scans OCR' },
  { key: 'form_fill', label: 'Formulaires remplis' },
];

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeTemplatePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  return payload.template || payload.item || payload.result || payload.data || payload;
};

const getDocumentAppliedTemplateId = (item) =>
  toNumber(item?.applied_template_id ?? item?.appliedTemplateId);

const getDocumentInlineTemplateDescription = (item) => {
  if (!item || typeof item !== 'object') return null;
  const nestedTemplate = item?.applied_template || item?.appliedTemplate || null;
  const raw =
    item?.applied_template_description ??
    item?.appliedTemplateDescription ??
    nestedTemplate?.description;
  if (raw === null || raw === undefined) return null;
  return String(raw);
};

export default function FillWizardScreen({ route, navigation }) {
  const preselectedFormId = route?.params?.preselectedFormId ?? null;
  const preselectedSourceType = route?.params?.preselectedSourceType ?? null;
  const preselectedSourceId = route?.params?.preselectedSourceId ?? null;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [transcriptionItems, setTranscriptionItems] = useState([]);
  const [ocrItems, setOcrItems] = useState([]);
  const [formFillItems, setFormFillItems] = useState([]);
  const [templateDescriptionById, setTemplateDescriptionById] = useState({});

  const [selectedDocumentId, setSelectedDocumentId] = useState(preselectedFormId);
  const [selectedSourceType, setSelectedSourceType] = useState(preselectedSourceType || 'transcription');
  const [selectedSourceId, setSelectedSourceId] = useState(preselectedSourceId);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, transRes, ocrRes, fillsRes] = await Promise.all([
        templates.listDocuments(),
        transcriptions.list(),
        ocrDocuments.listOcrDocuments(),
        formFills.listFormFills(),
      ]);

      const documentItems = extractList(docsRes).filter(
        (item) => (item?.applied_template_id || item?.appliedTemplateId) != null
      );
      const transItems = sortByCreatedAtDesc(extractList(transRes));
      const ocrList = sortByCreatedAtDesc(extractList(ocrRes));
      const fillList = sortByCreatedAtDesc(extractList(fillsRes)).filter((item) => {
        const status = String(item?.status || '').toLowerCase();
        return status === 'done' || status === 'completed';
      });

      setDocuments(documentItems);
      setTranscriptionItems(transItems);
      setOcrItems(ocrList);
      setFormFillItems(fillList);

      if (preselectedFormId) {
        const exists = documentItems.some((item) => Number(item?.id) === Number(preselectedFormId));
        if (!exists) {
          Alert.alert('Info', 'Formulaire preselectionne introuvable. Choisissez-en un autre.');
          setSelectedDocumentId(null);
        }
      }

      if (preselectedSourceType) {
        setSelectedSourceType(preselectedSourceType);
      }
      if (preselectedSourceId != null) {
        setSelectedSourceId(preselectedSourceId);
      }
    } catch (error) {
      console.error('Erreur chargement wizard remplissage:', error);
      Alert.alert('Erreur', 'Impossible de charger les donnees du wizard');
    } finally {
      setLoading(false);
    }
  }, [preselectedFormId, preselectedSourceId, preselectedSourceType]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const selectedDocument = useMemo(
    () => documents.find((item) => Number(item?.id) === Number(selectedDocumentId)) || null,
    [documents, selectedDocumentId]
  );

  const selectedDocumentTemplateId = useMemo(
    () => getDocumentAppliedTemplateId(selectedDocument),
    [selectedDocument]
  );

  const selectedDocumentInlineTemplateDescription = useMemo(
    () => getDocumentInlineTemplateDescription(selectedDocument),
    [selectedDocument]
  );

  useEffect(() => {
    if (!selectedDocumentTemplateId) return;
    if (selectedDocumentInlineTemplateDescription !== null) return;
    if (Object.prototype.hasOwnProperty.call(templateDescriptionById, selectedDocumentTemplateId)) return;

    let cancelled = false;
    const loadTemplateDescription = async () => {
      try {
        const response = await templates.get(selectedDocumentTemplateId);
        const raw = response?.data?.data || response?.data;
        const data = normalizeTemplatePayload(raw);
        const nextDescription = String(data?.description ?? '');
        if (!cancelled) {
          setTemplateDescriptionById((prev) => ({
            ...prev,
            [selectedDocumentTemplateId]: nextDescription,
          }));
        }
      } catch (error) {
        console.error('Erreur chargement description template (wizard):', error);
        if (!cancelled) {
          setTemplateDescriptionById((prev) => ({
            ...prev,
            [selectedDocumentTemplateId]: '',
          }));
        }
      }
    };

    loadTemplateDescription();
    return () => {
      cancelled = true;
    };
  }, [selectedDocumentInlineTemplateDescription, selectedDocumentTemplateId, templateDescriptionById]);

  const selectedTemplateDescription = useMemo(() => {
    if (selectedDocumentInlineTemplateDescription !== null) {
      return selectedDocumentInlineTemplateDescription;
    }
    if (!selectedDocumentTemplateId) return '';
    return String(templateDescriptionById[selectedDocumentTemplateId] ?? '');
  }, [
    selectedDocumentInlineTemplateDescription,
    selectedDocumentTemplateId,
    templateDescriptionById,
  ]);

  const isSelectedTemplateDescriptionKnown = useMemo(() => {
    if (!selectedDocumentTemplateId) return false;
    if (selectedDocumentInlineTemplateDescription !== null) return true;
    return Object.prototype.hasOwnProperty.call(templateDescriptionById, selectedDocumentTemplateId);
  }, [
    selectedDocumentInlineTemplateDescription,
    selectedDocumentTemplateId,
    templateDescriptionById,
  ]);

  const isSelectedTemplateDescriptionMissing =
    isSelectedTemplateDescriptionKnown && selectedTemplateDescription.trim().length === 0;

  const handleOpenSelectedTemplateDescription = useCallback(() => {
    if (!selectedDocumentTemplateId) return;
    navigation.navigate('FormsStack', {
      screen: 'TemplateSetupScreen',
      params: {
        templateId: Number(selectedDocumentTemplateId),
      },
    });
  }, [navigation, selectedDocumentTemplateId]);

  const sourceList = useMemo(() => {
    if (selectedSourceType === 'ocr') return ocrItems;
    if (selectedSourceType === 'form_fill') return formFillItems;
    return transcriptionItems;
  }, [formFillItems, ocrItems, selectedSourceType, transcriptionItems]);

  const selectedSource = useMemo(() => {
    return sourceList.find((item) => Number(item?.id) === Number(selectedSourceId)) || null;
  }, [selectedSourceId, sourceList]);

  const selectedSourceLabel = useMemo(() => {
    if (!selectedSource) return '';
    if (selectedSourceType === 'transcription') return getTranscriptionTitle(selectedSource);
    if (selectedSourceType === 'ocr') return getDocumentName(selectedSource);
    if (selectedSourceType === 'form_fill') {
      const type = resolveSourceType(selectedSource);
      const id = resolveSourceId(selectedSource, type);
      return getSourceName(selectedSource, type, id);
    }
    return getDocumentName(selectedSource);
  }, [selectedSource, selectedSourceType]);

  const handleGenerate = async () => {
    if (isGenerating) return;

    if (!selectedDocumentId || !selectedSourceType || !selectedSourceId) {
      Alert.alert('Validation', 'Selectionnez un formulaire et une source.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await formFills.createFormFill(
        Number(selectedDocumentId),
        selectedSourceType,
        Number(selectedSourceId)
      );
      const created = extractItem(response) || null;
      const createdId = created?.id;
      if (!createdId) {
        throw new Error('Le remplissage est cree mais son identifiant est manquant.');
      }

      navigation.navigate('ResultsStack', {
        screen: 'ResultDetailScreen',
        params: {
          formFillId: Number(createdId),
          resultId: Number(createdId),
        },
      });
    } catch (error) {
      const statusCode = Number(error?.response?.status);
      const responsePayload = error?.response?.data || {};
      const existingFormFillId =
        responsePayload?.existing_form_fill_id ??
        responsePayload?.existingFormFillId ??
        responsePayload?.data?.existing_form_fill_id ??
        responsePayload?.item?.existing_form_fill_id ??
        null;
      const backendMessage =
        responsePayload?.error ||
        responsePayload?.message ||
        responsePayload?.data?.error ||
        error?.message ||
        'Impossible de generer le document';

      if (statusCode === 409 && existingFormFillId) {
        setIsGenerating(false);
        Alert.alert(
          'Remplissage deja en cours',
          backendMessage,
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Voir le resultat',
              onPress: () =>
                navigation.navigate('ResultsStack', {
                  screen: 'ResultDetailScreen',
                  params: {
                    formFillId: Number(existingFormFillId),
                    resultId: Number(existingFormFillId),
                  },
                }),
            },
          ]
        );
        return;
      }

      console.error('Erreur creation remplissage:', error);
      Alert.alert('Erreur', backendMessage);
      setIsGenerating(false);
    }
  };

  const renderStep1 = () => {
    if (documents.length === 0) {
      return (
        <EmptyState
          icon="📄"
          title="Aucun formulaire pret"
          subtitle="Importez un formulaire et configurez ses champs."
          actions={[
            {
              label: 'Importer',
              onPress: () =>
                navigation.navigate('FormsStack', {
                  screen: 'ImportFormScreen',
                }),
            },
          ]}
        />
      );
    }

    return (
      <View style={styles.listWrap}>
        {documents.map((item) => {
          const selected = Number(selectedDocumentId) === Number(item?.id);
          const appliedTemplateId = item?.applied_template_id || item?.appliedTemplateId;
          return (
            <TouchableOpacity
              key={String(item?.id)}
              style={[styles.selectCard, selected && styles.selectCardActive]}
              onPress={() => {
                setSelectedDocumentId(Number(item?.id));
                setStep(1);
              }}
            >
              <Text style={styles.cardTitle}>{getDocumentName(item)}</Text>
              <Text style={styles.cardSubtitle}>
                {getFieldsCount(item)} champs • {getPagesCount(item)} pages
              </Text>
              <Text style={styles.cardMeta}>Template applique: #{appliedTemplateId}</Text>
              {selected && isSelectedTemplateDescriptionMissing && selectedDocumentTemplateId ? (
                <View style={styles.descriptionWarningBox}>
                  <Text style={styles.descriptionWarningText}>
                    ⚠️ Ce template n'a pas de description. L'IA sera moins précise.
                  </Text>
                  <TouchableOpacity
                    style={styles.descriptionWarningLink}
                    onPress={handleOpenSelectedTemplateDescription}
                  >
                    <Text style={styles.descriptionWarningLinkText}>Ajouter une description</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderSourceItemTitle = (item) => {
    if (selectedSourceType === 'ocr') return getDocumentName(item);
    if (selectedSourceType === 'form_fill') return getDocumentName(item);
    return getTranscriptionTitle(item);
  };

  const renderSourceEmpty = () => {
    if (selectedSourceType === 'ocr') {
      return (
        <EmptyState
          icon="📷"
          title="Aucun scan OCR"
          subtitle="Ajoutez un scan pour l'utiliser comme source."
          actions={[
            {
              label: 'Nouveau scan OCR',
              onPress: () =>
                navigation.navigate('DataStack', {
                  screen: 'CreateOcrScreen',
                }),
            },
          ]}
        />
      );
    }

    if (selectedSourceType === 'form_fill') {
      return (
        <EmptyState
          icon="📋"
          title="Aucun formulaire rempli"
          subtitle="Generez un premier resultat pour le reutiliser comme source."
          actions={[]}
        />
      );
    }

    return (
      <EmptyState
        icon="🎤"
        title="Aucune transcription"
        subtitle="Ajoutez une transcription pour continuer."
        actions={[
          {
            label: 'Nouvelle transcription',
            onPress: () =>
              navigation.navigate('DataStack', {
                screen: 'CreateTranscriptionScreen',
              }),
          },
        ]}
      />
    );
  };

  const renderStep2 = () => {
    return (
      <>
        <View style={styles.toggleWrap}>
          {SOURCE_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.toggleButton, selectedSourceType === tab.key && styles.toggleButtonActive]}
              onPress={() => {
                setSelectedSourceType(tab.key);
                setSelectedSourceId(null);
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  selectedSourceType === tab.key && styles.toggleTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedDocument && isSelectedTemplateDescriptionMissing && selectedDocumentTemplateId ? (
          <View style={styles.descriptionWarningBox}>
            <Text style={styles.descriptionWarningText}>
              ⚠️ Ce template n'a pas de description. L'IA sera moins précise.
            </Text>
            <TouchableOpacity
              style={styles.descriptionWarningLink}
              onPress={handleOpenSelectedTemplateDescription}
            >
              <Text style={styles.descriptionWarningLinkText}>Ajouter une description</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {sourceList.length === 0 ? (
          renderSourceEmpty()
        ) : (
          <View style={styles.listWrap}>
            {sourceList.map((item) => {
              const selected = Number(selectedSourceId) === Number(item?.id);
              const itemStatus = item?.status || (selectedSourceType === 'form_fill' ? 'done' : null);
              return (
                <TouchableOpacity
                  key={String(item?.id)}
                  style={[styles.selectCard, selected && styles.selectCardActive]}
                  onPress={() => {
                    setSelectedSourceId(Number(item?.id));
                    setStep(2);
                  }}
                >
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{renderSourceItemTitle(item)}</Text>
                    {itemStatus ? <StatusBadge status={itemStatus} /> : null}
                  </View>
                  <Text style={styles.cardSubtitle}>{formatDate(item?.created_at || item?.createdAt)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </>
    );
  };

  const renderStep3 = () => {
    return (
      <View style={styles.summaryWrap}>
        <SectionCard title="Recapitulatif">
          <TouchableOpacity
            style={styles.summaryLine}
            onPress={() => {
              if (!selectedDocumentId) return;
              navigation.navigate('FormsStack', {
                screen: 'FormDetailScreen',
                params: { formId: Number(selectedDocumentId) },
              });
            }}
          >
            <Text style={styles.summaryLabel}>📄 Formulaire</Text>
            <Text style={styles.summaryValue}>{selectedDocument ? getDocumentName(selectedDocument) : 'Non selectionne'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.summaryLine}
            onPress={() => {
              if (!selectedSourceId) return;
              if (selectedSourceType === 'ocr') {
                navigation.navigate('DataStack', {
                  screen: 'OcrDetailScreen',
                  params: { ocrId: Number(selectedSourceId) },
                });
                return;
              }
              if (selectedSourceType === 'transcription') {
                navigation.navigate('DataStack', {
                  screen: 'TranscriptionDetailScreen',
                  params: { transcriptionId: Number(selectedSourceId) },
                });
              }
            }}
          >
            <Text style={styles.summaryLabel}>📊 Source</Text>
            <View style={styles.summarySourceValue}>
              <SourceIcon sourceType={selectedSourceType} />
              <Text style={styles.summaryValue}>{selectedSourceLabel || 'Non selectionnee'}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.summaryLine}
            onPress={() => {
              if (!selectedDocument?.id) return;
              navigation.navigate('FormsStack', {
                screen: 'ProfilePickerScreen',
                params: {
                  formId: Number(selectedDocument.id),
                  currentProfileId:
                    selectedDocument?.work_profile_id ?? selectedDocument?.workProfileId ?? null,
                },
              });
            }}
          >
            <Text style={styles.summaryLabel}>👤 Profil metier</Text>
            <Text style={styles.summaryValue}>
              {selectedDocument?.work_profile?.name || selectedDocument?.workProfile?.name || 'Aucun'}
            </Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard>
          <Text style={styles.infoText}>
            L'IA va analyser vos donnees et remplir automatiquement les champs du formulaire.
          </Text>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              isGenerating && styles.primaryButtonLoading,
              isGenerating && styles.primaryButtonDisabled,
            ]}
            onPress={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <View style={styles.primaryButtonContent}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.primaryButtonText}>Génération en cours…</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>✨ Générer le document</Text>
            )}
          </TouchableOpacity>
        </SectionCard>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <WizardStepper steps={STEPS} currentStep={step} />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <SectionCard
            title={step === 0 ? 'Choisir le formulaire' : step === 1 ? 'Choisir la source' : 'Generer'}
          >
            {step === 0 ? renderStep1() : null}
            {step === 1 ? renderStep2() : null}
            {step === 2 ? renderStep3() : null}
          </SectionCard>
        )}
      </ScrollView>

      {!loading ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerButton, step === 0 && styles.footerButtonDisabled]}
            onPress={() => setStep((prev) => Math.max(0, prev - 1))}
            disabled={step === 0}
          >
            <Text style={styles.footerButtonText}>Retour</Text>
          </TouchableOpacity>

          {step < 2 ? (
            <TouchableOpacity
              style={[styles.footerButton, styles.footerPrimary]}
              onPress={() => {
                if (step === 0 && !selectedDocumentId) {
                  Alert.alert('Validation', 'Choisissez un formulaire.');
                  return;
                }
                if (step === 1 && !selectedSourceId) {
                  Alert.alert('Validation', 'Choisissez une source.');
                  return;
                }
                setStep((prev) => Math.min(2, prev + 1));
              }}
            >
              <Text style={[styles.footerButtonText, styles.footerPrimaryText]}>Continuer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
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
    gap: 12,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  listWrap: {
    gap: 10,
  },
  selectCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
  },
  selectCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  cardSubtitle: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  cardMeta: {
    marginTop: 2,
    color: Colors.textTertiary,
    fontSize: 12,
  },
  descriptionWarningBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  descriptionWarningText: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  descriptionWarningLink: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  descriptionWarningLinkText: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  toggleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  toggleButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  toggleText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryWrap: {
    gap: 10,
  },
  summaryLine: {
    marginBottom: 10,
    gap: 4,
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  summaryValue: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  summarySourceValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonLoading: {
    backgroundColor: '#A9A3FF',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#fff',
  },
  footerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  footerButtonDisabled: {
    opacity: 0.5,
  },
  footerButtonText: {
    color: Colors.text,
    fontWeight: '600',
  },
  footerPrimary: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  footerPrimaryText: {
    color: '#fff',
  },
});
