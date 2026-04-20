import AsyncStorage from "@react-native-async-storage/async-storage";

let SecureStore;
try {
  SecureStore = require("expo-secure-store").default;
} catch (e) {
  console.warn(
    " expo-secure-store not installed. Token stored in AsyncStorage (NOT encrypted).",
  );
  console.warn("Install with: npx expo install expo-secure-store");
  SecureStore = null;
}

const SECURE_KEYS = ["userToken", "refreshToken"];

// Stocke une donnée (sécurisée si c’est un token)
export const secureSet = async (key, value) => {
  try {
    if (SECURE_KEYS.includes(key) && SecureStore) {
      await SecureStore.setItemAsync(key, value);
      console.log(` Secure token stored: ${key}`);
    } else if (SecureStore) {
      await AsyncStorage.setItem(key, value);
    } else {
      console.warn(
        ` Storing ${key} in AsyncStorage (not encrypted). Install expo-secure-store.`,
      );
      await AsyncStorage.setItem(key, value);
    }
  } catch (error) {
    console.error(` Error storing ${key}:`, error);
    throw error;
  }
};

// Récupère une donnée stockée
export const secureGet = async (key) => {
  try {
    if (SECURE_KEYS.includes(key) && SecureStore) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  } catch (error) {
    console.error(` Error retrieving ${key}:`, error);
    return null;
  }
};

// Supprime une donnée du stockage
export const secureRemove = async (key) => {
  try {
    if (SECURE_KEYS.includes(key) && SecureStore) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
    console.log(` Removed: ${key}`);
  } catch (error) {
    console.error(` Error removing ${key}:`, error);
    throw error;
  }
};

// Supprime toutes les données stockées
export const secureClearAll = async () => {
  try {
    await AsyncStorage.clear();
    if (SecureStore) {
      for (const key of SECURE_KEYS) {
        await secureRemove(key);
      }
    }
    console.log(" All storage cleared");
  } catch (error) {
    console.error(" Error clearing storage:", error);
    throw error;
  }
};

export default {
  secureSet,
  secureGet,
  secureRemove,
  secureClearAll,
};
