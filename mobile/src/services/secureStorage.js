/**
 * ✅ Secure Token Storage
 * Uses expo-secure-store for sensitive data (encrypted)
 * Fallback to async-storage for non-sensitive data
 *
 * IMPORTANT: Install expo-secure-store with:
 *   npx expo install expo-secure-store
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

let SecureStore;
try {
  SecureStore = require("expo-secure-store").default;
} catch (e) {
  console.warn(
    "⚠️ expo-secure-store not installed. Token stored in AsyncStorage (NOT encrypted).",
  );
  console.warn("Install with: npx expo install expo-secure-store");
  SecureStore = null;
}

// List of sensitive keys to store securely
const SECURE_KEYS = ["userToken", "refreshToken"];

/**
 * Store a value securely (encrypted on device)
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
export const secureSet = async (key, value) => {
  try {
    if (SECURE_KEYS.includes(key) && SecureStore) {
      // ✅ Use SecureStore for sensitive data
      await SecureStore.setItemAsync(key, value);
      console.log(`✅ Secure token stored: ${key}`);
    } else if (SecureStore) {
      // Non-sensitive data in AsyncStorage
      await AsyncStorage.setItem(key, value);
    } else {
      // Fallback: AsyncStorage only
      console.warn(
        `⚠️ Storing ${key} in AsyncStorage (not encrypted). Install expo-secure-store.`,
      );
      await AsyncStorage.setItem(key, value);
    }
  } catch (error) {
    console.error(`❌ Error storing ${key}:`, error);
    throw error;
  }
};

/**
 * Retrieve a value securely
 * @param {string} key - Storage key
 * @returns {Promise<string|null>}
 */
export const secureGet = async (key) => {
  try {
    if (SECURE_KEYS.includes(key) && SecureStore) {
      // ✅ Get from SecureStore
      return await SecureStore.getItemAsync(key);
    } else {
      // Get from AsyncStorage
      return await AsyncStorage.getItem(key);
    }
  } catch (error) {
    console.error(`❌ Error retrieving ${key}:`, error);
    return null;
  }
};

/**
 * Remove a value
 * @param {string} key - Storage key
 */
export const secureRemove = async (key) => {
  try {
    if (SECURE_KEYS.includes(key) && SecureStore) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
    console.log(`✅ Removed: ${key}`);
  } catch (error) {
    console.error(`❌ Error removing ${key}:`, error);
    throw error;
  }
};

/**
 * Clear all storage
 */
export const secureClearAll = async () => {
  try {
    await AsyncStorage.clear();
    if (SecureStore) {
      // SecureStore doesn't have clearAll, must remove individually
      for (const key of SECURE_KEYS) {
        await secureRemove(key);
      }
    }
    console.log("✅ All storage cleared");
  } catch (error) {
    console.error("❌ Error clearing storage:", error);
    throw error;
  }
};

export default {
  secureSet,
  secureGet,
  secureRemove,
  secureClearAll,
};
