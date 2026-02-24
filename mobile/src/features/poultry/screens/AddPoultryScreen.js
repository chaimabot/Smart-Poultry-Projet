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

export default function AddPoultryScreen({ navigation, route }) {
  const { colors, darkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const poultryToEdit = route.params?.poultry;
  const isEditing = !!poultryToEdit;

  const [name, setName] = useState(poultryToEdit?.name || "");
  const [breedingType, setBreedingType] = useState(poultryToEdit?.type || null);
  const [animalCount, setAnimalCount] = useState(
    poultryToEdit?.count ? String(poultryToEdit.count) : "",
  );
  const [location, setLocation] = useState(poultryToEdit?.location || "");
  const [photo, setPhoto] = useState(poultryToEdit?.image || null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  const breedingTypes = [
    { id: "pondeuses", label: "Pondeuses", icon: "egg" },
    { id: "chair", label: "Chair", icon: "food-drumstick" },
    { id: "dindes", label: "Dindes", icon: "turkey" },
    { id: "canards", label: "Canards", icon: "duck" },
    { id: "autre", label: "Autre", icon: "bird" },
  ];

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
      setToast({ visible: true, message: "Nous avons besoin de la permission de caméra.", type: "error" });
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
    if (!name.trim()) newErrors.name = "Le nom est requis";
    if (!breedingType) newErrors.breedingType = "Le type est requis";
    if (!animalCount.trim()) newErrors.animalCount = "Requis";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (validate()) {
      setLoading(true);
      try {
        const poultryData = {
          name,
          type: breedingType,
          animalCount: parseInt(animalCount),
          description: location,
          location: location,
          photoUrl: photo,
        };

        if (isEditing) {
          await updatePoultry(poultryToEdit.id, poultryData);
          setToast({ visible: true, message: "Poulailler modifié !", type: "success" });
          setTimeout(() => navigation.goBack(), 1500);
        } else {
          await createPoultry(poultryData);
          setToast({ visible: true, message: "Poulailler ajouté !", type: "success" });
          setTimeout(() => navigation.goBack(), 1500);
        }
      } catch (error) {
        setToast({ visible: true, message: error.error || "Une erreur est survenue", type: "error" });
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

      {/* Action Buttons - Moved to Top */}
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
          scrollEnabled={true}
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
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={[styles.photoBtn, { borderColor: colors.primary }]}
                onPress={handlePhotoPick}
              >
                <Text style={[styles.photoBtnText, { color: colors.primary }]}>
                  {photo ? "Changer la photo" : "Ajouter une photo"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.formContainer}>
            {/* Name */}
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
                Nom du poulailler <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  errors.name && styles.inputError,
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
                placeholder="Ex : Poulailler Nord – A1"
                placeholderTextColor={
                  darkMode ? colors.textSubDark : colors.textSubLight
                }
                value={name}
                onChangeText={setName}
              />
              {errors.name && (
                <Text style={styles.errorText}>{errors.name}</Text>
              )}
            </View>

            {/* Type */}
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
                Type d'élevage <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.typesGrid}>
                {breedingTypes.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.typeCard,
                      {
                        backgroundColor: darkMode
                          ? colors.cardDark
                          : colors.cardLight,
                        borderColor: darkMode
                          ? colors.borderDark
                          : colors.borderLight,
                      },
                      breedingType === type.id && {
                        borderColor: colors.primary,
                        backgroundColor: darkMode
                          ? "rgba(249, 115, 22, 0.1)"
                          : colors.primaryLight,
                      },
                    ]}
                    onPress={() => setBreedingType(type.id)}
                  >
                    <MaterialCommunityIcons
                      name={type.icon}
                      size={24}
                      color={
                        breedingType === type.id
                          ? colors.primary
                          : darkMode
                            ? colors.textSubDark
                            : colors.textSubLight
                      }
                    />
                    <Text
                      style={[
                        styles.typeLabel,
                        {
                          color: darkMode
                            ? colors.textSubDark
                            : colors.textSubLight,
                        },
                        breedingType === type.id && { color: colors.primary },
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.breedingType && (
                <Text style={styles.errorText}>{errors.breedingType}</Text>
              )}
            </View>

            {/* Count */}
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
                Nombre d'animaux <Text style={styles.required}>*</Text>
              </Text>
              <View
                style={[
                  styles.numberInputContainer,
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

            {/* Location */}
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
                Localisation ou description
              </Text>
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
                placeholder="Ex : Menzel Bourguiba, près de la route principale…"
                placeholderTextColor={
                  darkMode ? colors.textSubDark : colors.textSubLight
                }
                value={location}
                onChangeText={setLocation}
                maxLength={200}
              />
              <Text style={styles.charCount}>{location.length}/200</Text>
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
  container: {
    flex: 1,
  },
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
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 20,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: 32,
  },
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
  photoPlaceholder: {
    alignItems: "center",
    gap: 8,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoText: {
    color: "#94a3b8",
    fontWeight: "600",
  },
  photoBtn: {
    borderWidth: 1,
    borderColor: "#f97316",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  photoBtnText: {
    color: "#f97316",
    fontWeight: "700",
  },
  formContainer: {
    gap: 20,
  },
  inputGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  required: {
    color: "#ef4444",
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#0f172a",
  },
  inputError: {
    borderColor: "#ef4444",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 4,
  },
  typesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  typeCard: {
    width: "48%",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    gap: 8,
  },
  typeCardSelected: {
    borderColor: "#f97316",
    backgroundColor: "#fff7ed",
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  typeLabelSelected: {
    color: "#f97316",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
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
  ageContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  unitPicker: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
  },
  unitText: {
    fontWeight: "600",
    color: "#475569",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  charCount: {
    textAlign: "right",
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 4,
  },
  actionBar: {
    flexDirection: "row",
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    alignItems: "center",
    gap: 12,
  },
  footer: {
    flexDirection: "row",
    padding: 20,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#94a3b8",
    alignItems: "center",
  },
  cancelText: {
    fontWeight: "700",
    color: "#64748b",
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
  submitText: {
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 16,
  },
});
