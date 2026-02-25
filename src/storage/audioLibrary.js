import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const LIBRARY_KEY_PREFIX = '@formvox_audio_library:';
const RECORDINGS_DIR = `${FileSystem.documentDirectory}recordings`;

const ensureRecordingsDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  }
};

const getLibraryKey = (transcriptionId) => `${LIBRARY_KEY_PREFIX}${transcriptionId}`;

const readLibrary = async (transcriptionId) => {
  const raw = await AsyncStorage.getItem(getLibraryKey(transcriptionId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const writeLibrary = async (transcriptionId, items) => {
  await AsyncStorage.setItem(getLibraryKey(transcriptionId), JSON.stringify(items));
};

export const persistRecordingFile = async (sourceUri) => {
  if (!sourceUri) return null;
  await ensureRecordingsDir();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `recording_${id}.m4a`;
  const destUri = `${RECORDINGS_DIR}/${fileName}`;

  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return { id, uri: destUri, fileName };
};

export const addRecordingToLibrary = async (transcriptionId, recording) => {
  if (!transcriptionId || !recording) return [];
  const existing = await readLibrary(transcriptionId);
  const updated = [recording, ...existing];
  await writeLibrary(transcriptionId, updated);
  return updated;
};

export const getRecordings = async (transcriptionId) => {
  if (!transcriptionId) return [];
  const items = await readLibrary(transcriptionId);
  if (!items.length) return [];

  const filtered = [];
  for (const item of items) {
    if (!item?.uri) continue;
    try {
      const info = await FileSystem.getInfoAsync(item.uri);
      if (info.exists) {
        filtered.push(item);
      }
    } catch (error) {
      // Ignore broken entries; they will be pruned below.
    }
  }

  if (filtered.length !== items.length) {
    await writeLibrary(transcriptionId, filtered);
  }

  return filtered;
};
