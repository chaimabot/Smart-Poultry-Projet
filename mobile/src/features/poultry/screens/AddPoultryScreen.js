import React, { useState } from "react";
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
import * as DocumentPicker from "expo-document-picker";
import { createPoultry, updatePoultry } from "../../../services/poultry";
import Toast from "../../../components/Toast";

function generateAutoName() {
  return (
    "Poulailler-" + Math.random().toString(36).substring(2, 6).toUpperCase()
  );
}

function calculerDensite(animalCount, surface) {
  const c = parseFloat(animalCount);
  const s = parseFloat(surface);
  if (c > 0 && s > 0) return parseFloat((c / s).toFixed(2));
  return null;
}

function getFileIcon(type) {
  if (!type) return "insert-drive-file";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "picture-as-pdf";
  return "folder-zip"; // archive
}

function getFileColor(type, primaryColor) {
  if (!type) return "#64748b";
  if (type.startsWith("image/")) return primaryColor;
  if (type === "application/pdf") return "#ef4444";
  return "#8b5cf6";
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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
  const [attachments, setAttachments] = useState(
    poultryToEdit?.attachments || [],
  );
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  const densite = calculerDensite(animalCount, surface);
  const densiteStatus = (() => {
    if (!densite) return null;
    if (densite <= 6) return { label: "Optimale", color: "#22c55e" };
    if (densite <= 10) return { label: "Acceptable", color: "#f59e0b" };
    return { label: "Trop dense", color: "#ef4444" };
  })();

  // ── Galerie images ──────────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled) {
      const newFiles = result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName || `photo_${Date.now()}.jpg`,
        type: "image/jpeg",
        size: a.fileSize || null,
        base64: a.base64 ? `data:image/jpeg;base64,${a.base64}` : null,
      }));
      addAttachments(newFiles);
    }
  };

  // ── Caméra ──────────────────────────────────────────────────
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setToast({
        visible: true,
        message: "Permission caméra refusée.",
        type: "error",
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled) {
      const a = result.assets[0];
      addAttachments([
        {
          uri: a.uri,
          name: `photo_${Date.now()}.jpg`,
          type: "image/jpeg",
          size: a.fileSize || null,
          base64: a.base64 ? `data:image/jpeg;base64,${a.base64}` : null,
        },
      ]);
    }
  };

  // ── PDF / Archives ──────────────────────────────────────────
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/zip",
          "application/x-zip-compressed",
          "application/x-rar-compressed",
          "application/x-tar",
          "application/x-7z-compressed",
          "multipart/x-zip",
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const newFiles = result.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          type: a.mimeType || "application/octet-stream",
          size: a.size || null,
          base64: null,
        }));
        addAttachments(newFiles);
      }
    } catch {
      setToast({
        visible: true,
        message: "Erreur lors de la sélection.",
        type: "error",
      });
    }
  };

  const addAttachments = (newFiles) => {
    setAttachments((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const unique = newFiles.filter((f) => !existing.has(f.name));
      if (unique.length < newFiles.length)
        setToast({
          visible: true,
          message: "Certains fichiers déjà ajoutés ont été ignorés.",
          type: "error",
        });
      return [...prev, ...unique];
    });
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Validation ──────────────────────────────────────────────
  const validate = () => {
    const newErrors = {};
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

  // ── Soumission ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const finalName = name.trim() || generateAutoName();
      const poultryData = {
        name: finalName,
        animalCount: parseInt(animalCount),
        surface: parseFloat(surface),
        densite: calculerDensite(animalCount, surface),
        remarque,
        address,
        attachments: attachments.map((f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
          uri: f.uri,
          base64: f.base64 || null,
        })),
      };
      if (isEditing) {
        await updatePoultry(poultryToEdit.id, poultryData);
        setToast({
          visible: true,
          message: "Poulailler modifié !",
          type: "success",
        });
      } else {
        await createPoultry(poultryData);
        setToast({
          visible: true,
          message: "Poulailler ajouté !",
          type: "success",
        });
      }
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error) {
      setToast({
        visible: true,
        message: error.error || "Une erreur est survenue",
        type: "error",
      });
    } finally {
      setLoading(false);
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
          style={[
            styles.submitButton,
            { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 },
          ]}
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
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: dynamicPaddingBottom },
          ]}
        >
          <View style={styles.formContainer}>
            {/* Nom */}
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
                    setAnimalCount((p) =>
                      String(Math.max(0, (parseInt(p) || 0) - 10)),
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
                    setAnimalCount((p) => String((parseInt(p) || 0) + 10))
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

            {/* Densité */}
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

            {/* Remarque */}
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

            {/* Adresse */}
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

            {/* ── Pièces jointes ──────────────────────────────── */}
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
                  Pièces jointes
                </Text>
                <Text style={styles.optionalBadge}>Optionnel</Text>
              </View>

              {/* 3 boutons : Image | PDF | Dossier */}
              <View style={styles.attachBtnRow}>
                <TouchableOpacity
                  style={[
                    styles.attachBtn,
                    {
                      backgroundColor: darkMode ? colors.cardDark : "#fff7ed",
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() =>
                    Alert.alert("Ajouter une image", "", [
                      { text: "Annuler", style: "cancel" },
                      { text: "Galerie", onPress: pickImage },
                      { text: "Caméra", onPress: takePhoto },
                    ])
                  }
                >
                  <MaterialIcons
                    name="image"
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.attachBtnText, { color: colors.primary }]}
                  >
                    Image
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.attachBtn,
                    {
                      backgroundColor: darkMode ? colors.cardDark : "#fff1f2",
                      borderColor: "#ef4444",
                    },
                  ]}
                  onPress={pickDocument}
                >
                  <MaterialIcons
                    name="picture-as-pdf"
                    size={20}
                    color="#ef4444"
                  />
                  <Text style={[styles.attachBtnText, { color: "#ef4444" }]}>
                    PDF
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.attachBtn,
                    {
                      backgroundColor: darkMode ? colors.cardDark : "#f5f3ff",
                      borderColor: "#8b5cf6",
                    },
                  ]}
                  onPress={pickDocument}
                >
                  <MaterialCommunityIcons
                    name="folder-zip"
                    size={20}
                    color="#8b5cf6"
                  />
                  <Text style={[styles.attachBtnText, { color: "#8b5cf6" }]}>
                    Dossier
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Liste fichiers */}
              {attachments.length > 0 ? (
                <View
                  style={[
                    styles.attachList,
                    {
                      backgroundColor: darkMode
                        ? colors.cardDark
                        : colors.cardLight,
                      borderColor: darkMode
                        ? colors.borderDark
                        : colors.borderLight,
                    },
                  ]}
                >
                  {attachments.map((file, index) => {
                    const isImage = file.type?.startsWith("image/");
                    const iconName = getFileIcon(file.type);
                    const iconColor = getFileColor(file.type, colors.primary);
                    const isArchive =
                      !isImage && file.type !== "application/pdf";

                    return (
                      <View
                        key={index}
                        style={[
                          styles.attachItem,
                          index < attachments.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: darkMode
                              ? colors.borderDark
                              : "#e2e8f0",
                          },
                        ]}
                      >
                        {/* Aperçu ou icône */}
                        {isImage && (file.base64 || file.uri) ? (
                          <Image
                            source={{ uri: file.base64 || file.uri }}
                            style={styles.attachThumb}
                          />
                        ) : (
                          <View
                            style={[
                              styles.attachIconBox,
                              { backgroundColor: iconColor + "18" },
                            ]}
                          >
                            {isArchive ? (
                              <MaterialCommunityIcons
                                name="folder-zip"
                                size={22}
                                color={iconColor}
                              />
                            ) : (
                              <MaterialIcons
                                name={iconName}
                                size={22}
                                color={iconColor}
                              />
                            )}
                          </View>
                        )}

                        {/* Nom + meta */}
                        <View style={styles.attachInfo}>
                          <Text
                            style={[
                              styles.attachName,
                              {
                                color: darkMode
                                  ? colors.textMainDark
                                  : colors.textMainLight,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {file.name}
                          </Text>
                          <Text
                            style={[
                              styles.attachMeta,
                              {
                                color: darkMode
                                  ? colors.textSubDark
                                  : colors.textSubLight,
                              },
                            ]}
                          >
                            {isImage
                              ? "Image"
                              : file.type === "application/pdf"
                                ? "PDF"
                                : "Archive"}
                            {file.size
                              ? `  ·  ${formatFileSize(file.size)}`
                              : ""}
                          </Text>
                        </View>

                        {/* Supprimer */}
                        <TouchableOpacity
                          onPress={() => removeAttachment(index)}
                          style={styles.attachRemove}
                        >
                          <MaterialIcons
                            name="close"
                            size={18}
                            color="#94a3b8"
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text
                  style={[
                    styles.attachEmpty,
                    {
                      color: darkMode
                        ? colors.textSubDark
                        : colors.textSubLight,
                    },
                  ]}
                >
                  Aucun fichier joint — images, PDF ou dossiers compressés
                  acceptés
                </Text>
              )}
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
    borderBottomWidth: 1,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 20, fontWeight: "800" },
  actionBar: {
    flexDirection: "row",
    padding: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  submitButton: {
    flex: 1,
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
  scrollContent: { padding: 24 },
  formContainer: { gap: 20 },
  inputGroup: { marginBottom: 4 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  label: { fontSize: 14, fontWeight: "700" },
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
  hintText: { fontSize: 12, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15 },
  inputFlex: { flex: 1 },
  inputWithUnit: { flexDirection: "row", gap: 10, alignItems: "center" },
  unitTag: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  unitText: { fontWeight: "700", fontSize: 15 },
  numberInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
  },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  numberInput: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 8,
  },
  errorText: { color: "#ef4444", fontSize: 12, marginTop: 4 },
  densiteCard: { borderWidth: 1.5, borderRadius: 14, padding: 16, gap: 10 },
  densiteHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  densiteTitle: { fontSize: 14, fontWeight: "700" },
  densiteResult: { flexDirection: "row", alignItems: "center", gap: 12 },
  densiteValue: { fontSize: 22, fontWeight: "800" },
  densiteBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  densiteBadgeText: { fontSize: 12, fontWeight: "700" },
  densitePlaceholder: { fontSize: 13 },
  textArea: { height: 100, textAlignVertical: "top" },
  charCount: {
    textAlign: "right",
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 4,
  },
  addressInputWrapper: { flexDirection: "row", alignItems: "center" },
  addressIcon: { position: "absolute", left: 14, zIndex: 1 },
  inputWithIcon: { paddingLeft: 40 },
  // Pièces jointes
  attachBtnRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  attachBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  attachBtnText: { fontSize: 13, fontWeight: "700" },
  attachList: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  attachItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  attachThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#e2e8f0",
  },
  attachIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  attachInfo: { flex: 1 },
  attachName: { fontSize: 14, fontWeight: "600" },
  attachMeta: { fontSize: 12, marginTop: 2 },
  attachRemove: { padding: 4 },
  attachEmpty: {
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 4,
  },
});
