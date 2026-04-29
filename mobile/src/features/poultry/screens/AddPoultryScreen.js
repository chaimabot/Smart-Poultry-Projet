import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";

import { useTheme } from "../../../context/ThemeContext";
import * as ImagePicker from "expo-image-picker";
import { createPoultry, updatePoultry } from "../../../services/poultry";
import Toast from "../../../components/Toast";

// Génère un nom automatique style "Poulailler-A3F2"
function generateAutoName() {
  return (
    "Poulailler-" + Math.random().toString(36).substring(2, 6).toUpperCase()
  );
}

export default function AddPoultryScreen({ navigation, route }) {
  const { colors, darkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const poultryToEdit = route.params?.poultry;
  const isEditing = !!poultryToEdit;

  const [name, setName] = useState(poultryToEdit?.name || "");
  const [animalCount, setAnimalCount] = useState(
    poultryToEdit?.count ? String(poultryToEdit.count) : "",
  );
  const [surface, setSurface] = useState(
    poultryToEdit?.surface ? String(poultryToEdit.surface) : "",
  );
  const [remarque, setRemarque] = useState(poultryToEdit?.remarque || "");
  const [address, setAddress] = useState(poultryToEdit?.address || "");
  const [photo, setPhoto] = useState(poultryToEdit?.image || null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  // Densité calculée automatiquement (volailles / m²)
  const densite = (() => {
    const count = parseFloat(animalCount);
    const surf = parseFloat(surface);
    if (count > 0 && surf > 0) {
      return (count / surf).toFixed(2);
    }
    return null;
  })();

  // Indicateur de densité
  const densiteStatus = (() => {
    if (!densite) return null;
    const d = parseFloat(densite);
    if (d <= 6) return { label: "Optimale", color: "#22c55e" };
    if (d <= 10) return { label: "Acceptable", color: "#f59e0b" };
    return { label: "Trop dense", color: "#ef4444" };
  })();

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setToast({
        visible: true,
        message: "Nous avons besoin de la permission de caméra.",
        type: "error",
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handlePhotoPick = () => {
    Alert.alert(
      "Choisir une photo",
      "Voulez-vous prendre une nouvelle photo ou en choisir une depuis la galerie ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Galerie", onPress: pickImage },
        { text: "Caméra", onPress: takePhoto },
      ],
    );
  };

  const validate = () => {
    let newErrors = {};
    if (
      !animalCount.trim() ||
      isNaN(parseInt(animalCount)) ||
      parseInt(animalCount) < 1
    )
      newErrors.animalCount = "Requis (nombre valide)";
    if (
      !surface.trim() ||
      isNaN(parseFloat(surface)) ||
      parseFloat(surface) <= 0
    )
      newErrors.surface = "La surface est requise (ex: 25)";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (validate()) {
      setLoading(true);
      try {
        const finalName = name.trim() || generateAutoName();
        const poultryData = {
          name: finalName,
          animalCount: parseInt(animalCount),
          surface: parseFloat(surface),
          remarque: remarque,
          address: address,
          photoUrl: photo,
        };

        if (isEditing) {
          await updatePoultry(poultryToEdit.id, poultryData);
          setToast({
            visible: true,
            message: "Poulailler modifié !",
            type: "success",
          });
          setTimeout(() => navigation.goBack(), 1500);
        } else {
          await createPoultry(poultryData);
          setToast({
            visible: true,
            message: "Poulailler ajouté !",
            type: "success",
          });
          setTimeout(() => navigation.goBack(), 1500);
        }
      } catch (error) {
        setToast({
          visible: true,
          message: error.error || "Une erreur est survenue",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor: darkMode
            ? colors.backgroundDark
            : colors.backgroundLight,
        },
      ]}
      edges={["top", "bottom"]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: darkMode ? colors.cardDark : colors.cardLight,
            borderBottomColor: darkMode
              ? colors.borderDark
              : colors.borderLight,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={darkMode ? colors.textMainDark : colors.textMainLight}
          />
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: darkMode ? colors.textMainDark : colors.textMainLight },
          ]}
        >
          {isEditing ? "Modifier le poulailler" : "Ajouter un poulailler"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Action Bar */}
      <View
        style={[
          styles.actionBar,
          {
            backgroundColor: darkMode ? colors.cardDark : colors.cardLight,
            borderBottomColor: darkMode
              ? colors.borderDark
              : colors.borderLight,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <MaterialIcons name="check" size={20} color="#ffffff" />
          <Text style={styles.submitText}>
            {isEditing ? "Modifier" : "Ajouter le poulailler"}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: dynamicPaddingBottom },
          ]}
        >
          {/* Photo Section */}
          <View style={styles.photoSection}>
            <View
              style={[
                styles.photoContainer,
                {
                  backgroundColor: darkMode ? colors.slate800 : colors.slate100,
                  borderColor: darkMode
                    ? colors.borderDark
                    : colors.borderLight,
                },
              ]}
            >
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photo} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <MaterialIcons
                    name="add-a-photo"
                    size={40}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.photoText,
                      {
                        color: darkMode
                          ? colors.textSubDark
                          : colors.textSubLight,
                      },
                    ]}
                  >
                    Ajoutez une photo
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[styles.photoBtn, { borderColor: colors.primary }]}
              onPress={handlePhotoPick}
            >
              <Text style={[styles.photoBtnText, { color: colors.primary }]}>
                {photo ? "Changer la photo" : "Ajouter une photo"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields */}
          <View style={styles.formContainer}>
            {/* Nom (optionnel) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text
                  style={[
                    styles.label,
                    {
                      color: darkMode
                        ? colors.textMainDark
                        : colors.textMainLight,
                    },
                  ]}
                >
                  Nom du poulailler
                </Text>
                <Text style={styles.optionalBadge}>Optionnel</Text>
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: darkMode
                      ? colors.cardDark
                      : colors.cardLight,
                    borderColor: darkMode
                      ? colors.borderDark
                      : colors.borderLight,
                    color: darkMode
                      ? colors.textMainDark
                      : colors.textMainLight,
                  },
                ]}
                placeholder="Généré automatiquement si vide"
                placeholderTextColor={
                  darkMode ? colors.textSubDark : colors.textSubLight
                }
                value={name}
                onChangeText={setName}
              />
              <Text
                style={[
                  styles.hintText,
                  {
                    color: darkMode ? colors.textSubDark : colors.textSubLight,
                  },
                ]}
              >
                Ex : Poulailler Nord – A1
              </Text>
            </View>

            {/* NB Volailles */}
            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.label,
                  {
                    color: darkMode
                      ? colors.textMainDark
                      : colors.textMainLight,
                  },
                ]}
              >
                Nombre de volailles <Text style={styles.required}>*</Text>
              </Text>
              <View
                style={[
                  styles.numberInputContainer,
                  {
                    backgroundColor: darkMode
                      ? colors.cardDark
                      : colors.cardLight,
                    borderColor: errors.animalCount
                      ? "#ef4444"
                      : darkMode
                        ? colors.borderDark
                        : colors.borderLight,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() =>
                    setAnimalCount((prev) =>
                      String(Math.max(0, (parseInt(prev) || 0) - 10)),
                    )
                  }
                  style={[
                    styles.roundBtn,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.slate100,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="remove"
                    size={16}
                    color={
                      darkMode ? colors.textMainDark : colors.textMainLight
                    }
                  />
                </TouchableOpacity>
                <TextInput
                  style={[
                    styles.numberInput,
                    {
                      color: darkMode
                        ? colors.textMainDark
                        : colors.textMainLight,
                    },
                  ]}
                  keyboardType="numeric"
                  value={animalCount}
                  onChangeText={setAnimalCount}
                  placeholder="0"
                  placeholderTextColor={
                    darkMode ? colors.textSubDark : colors.textSubLight
                  }
                />
                <TouchableOpacity
                  onPress={() =>
                    setAnimalCount((prev) => String((parseInt(prev) || 0) + 10))
                  }
                  style={[
                    styles.roundBtn,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.slate100,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="add"
                    size={16}
                    color={
                      darkMode ? colors.textMainDark : colors.textMainLight
                    }
                  />
                </TouchableOpacity>
              </View>
              {errors.animalCount && (
                <Text style={styles.errorText}>{errors.animalCount}</Text>
              )}
            </View>

            {/* Surface */}
            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.label,
                  {
                    color: darkMode
                      ? colors.textMainDark
                      : colors.textMainLight,
                  },
                ]}
              >
                Surface <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputFlex,
                    errors.surface && styles.inputError,
                    {
                      backgroundColor: darkMode
                        ? colors.cardDark
                        : colors.cardLight,
                      borderColor: errors.surface
                        ? "#ef4444"
                        : darkMode
                          ? colors.borderDark
                          : colors.borderLight,
                      color: darkMode
                        ? colors.textMainDark
                        : colors.textMainLight,
                    },
                  ]}
                  placeholder="Ex : 50"
                  placeholderTextColor={
                    darkMode ? colors.textSubDark : colors.textSubLight
                  }
                  keyboardType="decimal-pad"
                  value={surface}
                  onChangeText={setSurface}
                />
                <View
                  style={[
                    styles.unitTag,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.slate100,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.unitText,
                      {
                        color: darkMode
                          ? colors.textMainDark
                          : colors.textMainLight,
                      },
                    ]}
                  >
                    m²
                  </Text>
                </View>
              </View>
              {errors.surface && (
                <Text style={styles.errorText}>{errors.surface}</Text>
              )}
            </View>

            {/* Densité calculée automatiquement */}
            <View
              style={[
                styles.densiteCard,
                {
                  backgroundColor: darkMode
                    ? colors.cardDark
                    : colors.cardLight,
                  borderColor: densiteStatus
                    ? densiteStatus.color
                    : darkMode
                      ? colors.borderDark
                      : colors.borderLight,
                },
              ]}
            >
              <View style={styles.densiteHeader}>
                <MaterialCommunityIcons
                  name="calculator-variant"
                  size={18}
                  color={
                    densiteStatus
                      ? densiteStatus.color
                      : darkMode
                        ? colors.textSubDark
                        : colors.textSubLight
                  }
                />
                <Text
                  style={[
                    styles.densiteTitle,
                    {
                      color: darkMode
                        ? colors.textMainDark
                        : colors.textMainLight,
                    },
                  ]}
                >
                  Densité (calculée auto)
                </Text>
              </View>
              {densite ? (
                <View style={styles.densiteResult}>
                  <Text
                    style={[
                      styles.densiteValue,
                      { color: densiteStatus.color },
                    ]}
                  >
                    {densite} vol/m²
                  </Text>
                  <View
                    style={[
                      styles.densiteBadge,
                      { backgroundColor: densiteStatus.color + "22" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.densiteBadgeText,
                        { color: densiteStatus.color },
                      ]}
                    >
                      {densiteStatus.label}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text
                  style={[
                    styles.densitePlaceholder,
                    {
                      color: darkMode
                        ? colors.textSubDark
                        : colors.textSubLight,
                    },
                  ]}
                >
                  Renseignez le nombre de volailles et la surface
                </Text>
              )}
            </View>

            {/* Remarque (optionnel) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text
                  style={[
                    styles.label,
                    {
                      color: darkMode
                        ? colors.textMainDark
                        : colors.textMainLight,
                    },
                  ]}
                >
                  Remarque
                </Text>
                <Text style={styles.optionalBadge}>Optionnel</Text>
              </View>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: darkMode
                      ? colors.cardDark
                      : colors.cardLight,
                    borderColor: darkMode
                      ? colors.borderDark
                      : colors.borderLight,
                    color: darkMode
                      ? colors.textMainDark
                      : colors.textMainLight,
                  },
                ]}
                multiline
                numberOfLines={3}
                placeholder="Notes, observations, conditions particulières…"
                placeholderTextColor={
                  darkMode ? colors.textSubDark : colors.textSubLight
                }
                value={remarque}
                onChangeText={setRemarque}
                maxLength={200}
              />
              <Text style={styles.charCount}>{remarque.length}/200</Text>
            </View>

            {/* Adresse du poulailler (optionnel) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text
                  style={[
                    styles.label,
                    {
                      color: darkMode
                        ? colors.textMainDark
                        : colors.textMainLight,
                    },
                  ]}
                >
                  Adresse du poulailler
                </Text>
                <Text style={styles.optionalBadge}>Optionnel</Text>
              </View>
              <View style={styles.addressInputWrapper}>
                <MaterialIcons
                  name="location-on"
                  size={18}
                  color={colors.primary}
                  style={styles.addressIcon}
                />
                <TextInput
                  style={[
                    styles.input,
                    styles.inputFlex,
                    styles.inputWithIcon,
                    {
                      backgroundColor: darkMode
                        ? colors.cardDark
                        : colors.cardLight,
                      borderColor: darkMode
                        ? colors.borderDark
                        : colors.borderLight,
                      color: darkMode
                        ? colors.textMainDark
                        : colors.textMainLight,
                    },
                  ]}
                  placeholder="Si différente de l'adresse principale"
                  placeholderTextColor={
                    darkMode ? colors.textSubDark : colors.textSubLight
                  }
                  value={address}
                  onChangeText={setAddress}
                />
              </View>
              <Text
                style={[
                  styles.hintText,
                  {
                    color: darkMode ? colors.textSubDark : colors.textSubLight,
                  },
                ]}
              >
                Ex : Route de Bizerte, Km 12, Menzel Bourguiba
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  actionBar: {
    flexDirection: "row",
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    alignItems: "center",
  },
  submitButton: {
    flex: 1,
    backgroundColor: "#f97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#f97316",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitText: { fontWeight: "700", color: "#ffffff", fontSize: 16 },
  scrollContent: { padding: 24, paddingBottom: 20 },

  // Photo
  photoSection: { alignItems: "center", marginBottom: 32 },
  photoContainer: {
    width: 220,
    height: 220,
    borderRadius: 24,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    marginBottom: 16,
    overflow: "hidden",
  },
  photoPlaceholder: { alignItems: "center", gap: 8 },
  photo: { width: "100%", height: "100%" },
  photoText: { color: "#94a3b8", fontWeight: "600" },
  photoBtn: {
    borderWidth: 1,
    borderColor: "#f97316",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  photoBtnText: { color: "#f97316", fontWeight: "700" },

  // Form
  formContainer: { gap: 20 },
  inputGroup: { marginBottom: 4 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  label: { fontSize: 14, fontWeight: "700", color: "#334155" },
  required: { color: "#ef4444" },
  optionalBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  hintText: { fontSize: 12, marginTop: 4, color: "#94a3b8" },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#0f172a",
  },
  inputFlex: { flex: 1 },
  inputError: { borderColor: "#ef4444" },
  errorText: { color: "#ef4444", fontSize: 12, marginTop: 4 },
  inputWithUnit: { flexDirection: "row", gap: 10, alignItems: "center" },
  unitTag: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  unitText: { fontWeight: "700", fontSize: 15, color: "#475569" },

  // Number input
  numberInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 4,
  },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  numberInput: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
    paddingVertical: 8,
  },

  // Densité
  densiteCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  densiteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  densiteTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  densiteResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  densiteValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  densiteBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  densiteBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  densitePlaceholder: {
    fontSize: 13,
    color: "#94a3b8",
  },

  // Textarea
  textArea: { height: 100, textAlignVertical: "top" },
  charCount: {
    textAlign: "right",
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 4,
  },

  // Address
  addressInputWrapper: { flexDirection: "row", alignItems: "center" },
  addressIcon: { position: "absolute", left: 14, zIndex: 1 },
  inputWithIcon: { paddingLeft: 40 },
});
