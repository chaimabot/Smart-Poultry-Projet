import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Modal,
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

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
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
  if (
    type.includes("zip") ||
    type.includes("rar") ||
    type.includes("tar") ||
    type.includes("7z")
  )
    return "folder-zip";
  if (type.startsWith("video/")) return "videocam";
  if (type.startsWith("audio/")) return "audiotrack";
  if (type.includes("word") || type.includes("document")) return "description";
  if (type.includes("sheet") || type.includes("excel")) return "table-chart";
  return "insert-drive-file";
}

function getFileColor(type, primaryColor) {
  if (!type) return "#64748b";
  if (type.startsWith("image/")) return primaryColor;
  if (type === "application/pdf") return "#ef4444";
  if (type.startsWith("video/")) return "#8b5cf6";
  if (type.startsWith("audio/")) return "#f59e0b";
  if (type.includes("zip") || type.includes("rar")) return "#8b5cf6";
  if (type.includes("word") || type.includes("document")) return "#3b82f6";
  if (type.includes("sheet") || type.includes("excel")) return "#22c55e";
  return "#64748b";
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileLabel(type) {
  if (!type) return "Fichier";
  if (type.startsWith("image/")) return "Image";
  if (type === "application/pdf") return "PDF";
  if (type.startsWith("video/")) return "Vidéo";
  if (type.startsWith("audio/")) return "Audio";
  if (type.includes("zip") || type.includes("rar") || type.includes("7z"))
    return "Archive";
  if (type.includes("word") || type.includes("document")) return "Document";
  if (type.includes("sheet") || type.includes("excel")) return "Tableur";
  return "Fichier";
}

// ─────────────────────────────────────────────
// FilePickerModal — cross-platform (web + mobile)
// Remplace Alert.alert qui ne fonctionne que sur mobile natif
// ─────────────────────────────────────────────
function FilePickerModal({
  visible,
  onClose,
  onCamera,
  onGallery,
  onFiles,
  colors,
  darkMode,
}) {
  const options = [
    {
      key: "camera",
      icon: "photo-camera",
      label: "Prendre une photo",
      sub: "Ouvrir l'appareil photo",
      color: "#3b82f6",
      bg: "#3b82f620",
      // Sur web, la caméra n'est pas toujours accessible via expo-image-picker
      disabled: Platform.OS === "web",
      disabledNote: "Non disponible sur web",
      onPress: onCamera,
    },
    {
      key: "gallery",
      icon: "photo-library",
      label: "Galerie — photos & vidéos",
      sub: "Sélectionner depuis la galerie",
      color: "#8b5cf6",
      bg: "#8b5cf620",
      onPress: onGallery,
    },
    {
      key: "files",
      icon: "folder-open",
      label: "Fichiers",
      sub:
        Platform.OS === "web"
          ? "PDF, doc, archive… depuis votre ordinateur"
          : "PDF, doc, archive… depuis le stockage",
      color: "#f59e0b",
      bg: "#f59e0b20",
      onPress: onFiles,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Overlay */}
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Sheet — stop propagation so tapping inside doesn't close */}
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.modalSheet,
            {
              backgroundColor: darkMode ? colors.cardDark : "#ffffff",
              shadowColor: "#000",
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.modalHandle} />

          <Text
            style={[
              styles.modalTitle,
              { color: darkMode ? colors.textMainDark : colors.textMainLight },
            ]}
          >
            Ajouter un fichier
          </Text>
          <Text
            style={[
              styles.modalSub,
              { color: darkMode ? colors.textSubDark : colors.textSubLight },
            ]}
          >
            Choisissez la source
          </Text>

          <View style={styles.modalOptions}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor: darkMode
                      ? colors.backgroundDark
                      : "#f8fafc",
                    borderColor: darkMode ? colors.borderDark : "#e2e8f0",
                    opacity: opt.disabled ? 0.45 : 1,
                  },
                ]}
                onPress={() => {
                  if (opt.disabled) return;
                  onClose();
                  // Léger délai pour laisser le modal se fermer avant d'ouvrir le picker
                  setTimeout(() => opt.onPress(), 200);
                }}
                disabled={opt.disabled}
              >
                <View
                  style={[styles.modalOptionIcon, { backgroundColor: opt.bg }]}
                >
                  <MaterialIcons name={opt.icon} size={24} color={opt.color} />
                </View>
                <View style={styles.modalOptionText}>
                  <Text
                    style={[
                      styles.modalOptionLabel,
                      {
                        color: darkMode
                          ? colors.textMainDark
                          : colors.textMainLight,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text
                    style={[
                      styles.modalOptionSub,
                      {
                        color: darkMode
                          ? colors.textSubDark
                          : colors.textSubLight,
                      },
                    ]}
                  >
                    {opt.disabled ? opt.disabledNote : opt.sub}
                  </Text>
                </View>
                {!opt.disabled && (
                  <MaterialIcons
                    name="chevron-right"
                    size={20}
                    color="#94a3b8"
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Bouton Annuler explicite */}
          <TouchableOpacity
            style={[
              styles.modalCancelBtn,
              { borderColor: darkMode ? colors.borderDark : "#e2e8f0" },
            ]}
            onPress={onClose}
          >
            <Text style={[styles.modalCancelText, { color: "#64748b" }]}>
              Annuler
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────
export default function AddPoultryScreen({ navigation, route }) {
  const { colors, darkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const poultryToEdit = route.params?.poultry;
  const isEditing = !!poultryToEdit;

  const [name, setName] = useState(poultryToEdit?.name || "");
  const [animalCount, setAnimalCount] = useState(
    poultryToEdit?.animalCount != null ? String(poultryToEdit.animalCount) : "",
  );
  const [surface, setSurface] = useState(
    poultryToEdit?.surface != null ? String(poultryToEdit.surface) : "",
  );
  const [remarque, setRemarque] = useState(poultryToEdit?.remarque || "");
  const [address, setAddress] = useState(poultryToEdit?.address || "");
  const [attachments, setAttachments] = useState(
    poultryToEdit?.attachments || [],
  );
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false); // ← remplace Alert
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

  // ─────────────────────────────────────────────
  // Prise de photo via caméra
  // ─────────────────────────────────────────────
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
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const a = result.assets[0];
      const mimeType = a.mimeType || "image/jpeg";
      addAttachments([
        {
          uri: a.uri,
          name: `photo_${Date.now()}.jpg`,
          type: mimeType,
          size: a.fileSize || null,
          base64: a.base64 ? `data:${mimeType};base64,${a.base64}` : null,
        },
      ]);
    }
  };

  // ─────────────────────────────────────────────
  // Galerie (photos + vidéos) — mobile & web
  // Sur web, expo-image-picker utilise <input type="file"> en interne
  // ─────────────────────────────────────────────
  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setToast({
        visible: true,
        message: "Permission galerie refusée.",
        type: "error",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const newFiles = result.assets.map((a) => {
        const mimeType =
          a.mimeType || (a.type === "video" ? "video/mp4" : "image/jpeg");
        return {
          uri: a.uri,
          name:
            a.fileName ||
            `media_${Date.now()}.${a.type === "video" ? "mp4" : "jpg"}`,
          type: mimeType,
          size: a.fileSize || null,
          base64: a.base64 ? `data:${mimeType};base64,${a.base64}` : null,
        };
      });
      addAttachments(newFiles);
    }
  };

  // ─────────────────────────────────────────────
  // Fichiers depuis le stockage / explorateur natif
  // Sur web  : ouvre le sélecteur de fichiers du navigateur
  // Sur mobile : ouvre le gestionnaire de fichiers natif
  // ─────────────────────────────────────────────
  const pickFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const assets = result.assets ?? [];
      if (assets.length === 0) return;

      const newFiles = assets.map((a) => ({
        uri: a.uri,
        name: a.name ?? `fichier_${Date.now()}`,
        type: a.mimeType ?? "application/octet-stream",
        size: a.size ?? null,
        base64: null,
      }));

      addAttachments(newFiles);
    } catch (err) {
      if (!DocumentPicker.isCancel?.(err)) {
        setToast({
          visible: true,
          message: "Erreur lors de la sélection du fichier.",
          type: "error",
        });
      }
    }
  };

  // ─────────────────────────────────────────────
  // Ouvre le modal cross-platform (remplace Alert.alert)
  // ─────────────────────────────────────────────
  const handlePickFile = () => {
    setPickerVisible(true);
  };

  // ─────────────────────────────────────────────
  // Gestion pièces jointes
  // ─────────────────────────────────────────────
  const addAttachments = (newFiles) => {
    setAttachments((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const unique = newFiles.filter((f) => !existing.has(f.name));
      if (unique.length < newFiles.length) {
        setToast({
          visible: true,
          message: "Certains fichiers déjà ajoutés ont été ignorés.",
          type: "error",
        });
      }
      return [...prev, ...unique];
    });
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ─────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────
  const validate = () => {
    const newErrors = {};
    if (
      !animalCount.trim() ||
      isNaN(parseInt(animalCount)) ||
      parseInt(animalCount) < 1
    )
      newErrors.animalCount = "Requis (nombre valide ≥ 1)";
    if (
      !surface.trim() ||
      isNaN(parseFloat(surface)) ||
      parseFloat(surface) <= 0
    )
      newErrors.surface = "La surface est requise (ex: 25)";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─────────────────────────────────────────────
  // Soumission
  // ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const finalName = name.trim() || generateAutoName();

      const poultryData = {
        name: finalName,
        animalCount: parseInt(animalCount),
        surface: parseFloat(surface),
        remarque: remarque || null,
        address: address || null,
        attachments: attachments.map((f) => ({
          name: f.name,
          type: f.type,
          size: f.size ?? null,
          uri: f.uri ?? null,
          base64: f.base64 ?? null,
        })),
      };

      if (isEditing) {
        await updatePoultry(poultryToEdit._id || poultryToEdit.id, poultryData);
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
        message: error?.error || error?.message || "Une erreur est survenue",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────
  // Rendu
  // ─────────────────────────────────────────────
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
      {/* ── Modal cross-platform (web + mobile) ── */}
      <FilePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onCamera={takePhoto}
        onGallery={pickFromGallery}
        onFiles={pickFromFiles}
        colors={colors}
        darkMode={darkMode}
      />

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
            {isEditing
              ? "Enregistrer les modifications"
              : "Ajouter le poulailler"}
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

            {/* Nombre de volailles */}
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

            {/* ── Pièces jointes ─────────────────────────────── */}
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

              {/* Bouton → ouvre FilePickerModal */}
              <TouchableOpacity
                style={[
                  styles.uploadBtn,
                  {
                    backgroundColor: darkMode ? colors.cardDark : "#f8fafc",
                    borderColor: colors.primary,
                  },
                ]}
                onPress={handlePickFile}
              >
                <View
                  style={[
                    styles.uploadIconWrap,
                    { backgroundColor: colors.primary + "18" },
                  ]}
                >
                  <MaterialIcons
                    name="attach-file"
                    size={22}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.uploadTextWrap}>
                  <Text
                    style={[styles.uploadBtnLabel, { color: colors.primary }]}
                  >
                    Ajouter un fichier
                  </Text>
                  <Text
                    style={[
                      styles.uploadBtnSub,
                      {
                        color: darkMode
                          ? colors.textSubDark
                          : colors.textSubLight,
                      },
                    ]}
                  >
                    {Platform.OS === "web"
                      ? "Galerie · Fichiers depuis l'ordinateur"
                      : "Caméra · Galerie · Stockage du téléphone"}
                  </Text>
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>

              {/* Compteur */}
              {attachments.length > 0 && (
                <Text
                  style={[
                    styles.attachCount,
                    {
                      color: darkMode
                        ? colors.textSubDark
                        : colors.textSubLight,
                    },
                  ]}
                >
                  {attachments.length} fichier
                  {attachments.length > 1 ? "s" : ""} joint
                  {attachments.length > 1 ? "s" : ""}
                </Text>
              )}

              {/* Liste */}
              {attachments.length > 0 && (
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
                      file.type?.includes("zip") ||
                      file.type?.includes("rar") ||
                      file.type?.includes("7z") ||
                      file.type?.includes("tar");

                    return (
                      <View
                        key={`${file.name}-${index}`}
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
                            {getFileLabel(file.type)}
                            {file.size
                              ? `  ·  ${formatFileSize(file.size)}`
                              : ""}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => removeAttachment(index)}
                          style={styles.attachRemove}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
              )}

              {attachments.length === 0 && (
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
                  Aucun fichier joint
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

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
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
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  uploadIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadTextWrap: { flex: 1 },
  uploadBtnLabel: { fontSize: 15, fontWeight: "700" },
  uploadBtnSub: { fontSize: 12, marginTop: 2 },
  attachCount: { fontSize: 12, marginBottom: 8, marginLeft: 2 },
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

  // ── Modal styles ──────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end", // bottom sheet sur mobile
    alignItems: "center",
    // Sur web on centre plutôt verticalement
    ...(Platform.OS === "web" && {
      justifyContent: "center",
    }),
  },
  modalSheet: {
    width: "100%",
    maxWidth: 480, // cap sur grands écrans web
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...(Platform.OS === "web" && {
      borderRadius: 20,
      marginHorizontal: 16,
      width: "auto",
      minWidth: 340,
    }),
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    marginBottom: 20,
    // Caché sur web (pas de bottom sheet)
    ...(Platform.OS === "web" && { display: "none" }),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 13,
    marginBottom: 20,
  },
  modalOptions: { gap: 10 },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  modalOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOptionText: { flex: 1 },
  modalOptionLabel: { fontSize: 15, fontWeight: "700" },
  modalOptionSub: { fontSize: 12, marginTop: 2 },
  modalCancelBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontWeight: "600" },
});
