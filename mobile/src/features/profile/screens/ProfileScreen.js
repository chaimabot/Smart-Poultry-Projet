import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  Switch,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { LinearGradient as LG } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

import {
  logout,
  getUserData,
  updateProfile,
  updatePassword as updatePassService,
} from "../../../services/auth";
import { useEffect } from "react";
import { Modal } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Toast from "../../../components/Toast";

export default function ProfileScreen({ navigation }) {
  const { colors, darkMode, toggleDarkMode } = useTheme();
  const insets = useSafeAreaInsets();

  const [userInfo, setUserInfo] = useState({
    firstName: "",
    lastName: "",
    email: "...",
    phone: "...",
    photoUrl: null,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    photoUrl: null,
  });
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  // Password Modal State
  const [passModalVisible, setPassModalVisible] = useState(false);
  const [passData, setPassData] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  useEffect(() => {
    loadUser();
  }, []);

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  const loadUser = async () => {
    const data = await getUserData();
    if (data) {
      setUserInfo({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || "Non renseigné",
        photoUrl: data.photoUrl,
      });
      setEditedUser({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || "",
        photoUrl: data.photoUrl,
      });
    }
  };

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Êtes-vous sûr de vouloir vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnexion",
        style: "destructive",
        onPress: async () => {
          await logout();
          navigation.reset({
            index: 0,
            routes: [{ name: "Login" }],
          });
        },
      },
    ]);
  };

  const showToast = (message, type = "success") => {
    setToast({ visible: true, message, type });
  };

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel
      setIsEditing(false);
      setEditedUser({
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        phone: userInfo.phone === "Non renseigné" ? "" : userInfo.phone,
        photoUrl: userInfo.photoUrl,
      });
    } else {
      setIsEditing(true);
    }
  };

  const handleSaveProfile = async () => {
    if (!editedUser.firstName || !editedUser.lastName) {
      showToast("Le nom et le prénom sont obligatoires", "error");
      return;
    }

    setLoading(true);
    try {
      await updateProfile(editedUser);
      await loadUser();
      setIsEditing(false);
      showToast("Profil mis à jour !");
    } catch (error) {
      showToast(error.error || "Échec de la mise à jour", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!passData.current || !passData.new || !passData.confirm) {
      showToast("Tous les champs sont obligatoires", "error");
      return;
    }
    if (passData.new !== passData.confirm) {
      showToast("Les mots de passe ne correspondent pas", "error");
      return;
    }

    setLoading(true);
    try {
      await updatePassService({
        currentPassword: passData.current,
        newPassword: passData.new,
      });
      setPassModalVisible(false);
      setPassData({ current: "", new: "", confirm: "" });
      showToast("Mot de passe modifié !");
    } catch (error) {
      showToast(error.error || "Échec de la modification", "error");
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const base64Photo = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setEditedUser((prev) => ({ ...prev, photoUrl: base64Photo }));

      if (!isEditing) {
        try {
          setLoading(true);
          await updateProfile({ ...editedUser, photoUrl: base64Photo });
          await loadUser();
          showToast("Photo mise à jour !");
        } catch (e) {
          showToast("Échec de l'enregistrement de la photo", "error");
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showToast("Permission de caméra requise.", "error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const base64Photo = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setEditedUser((prev) => ({ ...prev, photoUrl: base64Photo }));

      if (!isEditing) {
        try {
          setLoading(true);
          await updateProfile({ ...editedUser, photoUrl: base64Photo });
          await loadUser();
          showToast("Photo mise à jour !");
        } catch (e) {
          showToast("Échec de l'enregistrement de la photo", "error");
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handlePhotoPick = () => {
    Alert.alert(
      "Photo de profil",
      "Voulez-vous prendre une photo ou choisir depuis la galerie ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Galerie", onPress: pickImage },
        { text: "Caméra", onPress: takePhoto },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container]} edges={["top", "bottom"]}>
      {/* Premium Background */}
      <LG
        colors={
          darkMode ? [colors.slate950, colors.slate900] : ["#F8FAFC", "#E2E8F0"]
        }
        style={StyleSheet.absoluteFill}
      />
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: darkMode
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <BlurView
            intensity={20}
            tint={darkMode ? "dark" : "light"}
            style={styles.iconButtonBlur}
          >
            <MaterialIcons
              name="arrow-back"
              size={24}
              color={darkMode ? colors.textMainDark : colors.textMainLight}
            />
          </BlurView>
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: darkMode ? colors.textMainDark : colors.textMainLight },
          ]}
        >
          Mon Profil
        </Text>
        <TouchableOpacity onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color={colors.danger} />
        </TouchableOpacity>
      </View>

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
            style={[styles.photoContainer, { borderColor: colors.primary }]}
          >
            <Image
              source={{
                uri:
                  (isEditing ? editedUser.photoUrl : userInfo.photoUrl) ||
                  "https://lh3.googleusercontent.com/aida-public/AB6AXuBz4XHKJiseVJJY9S9n-8H_RP_Odl9lzVbVYYPO8m8PBfQgSkX6plbKjlmNifSM6c9GiqASTE7mvqGULsl00E71-5VB7K4FYfRXg4aD9Q1rvR9ljUv70hFsZWAOefPBZpbZPkiV9X76ng308IXETLF_Z3py3htht0IAACM589ENteRfWybbOz5bR-aCACHgE4Jm_g-vN56eyW6PB7tn_rfX9yi1kiWtk-5pvaxZIpYTgMwWfvC9hKdipA0Tt0YMSZ_rPCL6MwvyAZA",
              }}
              style={styles.profileImage}
            />
            <TouchableOpacity
              style={[styles.cameraBadge, { backgroundColor: colors.primary }]}
              onPress={handlePhotoPick}
            >
              <MaterialIcons name="camera-alt" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text
            style={[
              styles.userName,
              { color: darkMode ? colors.textMainDark : colors.textMainLight },
            ]}
          >
            {userInfo.firstName} {userInfo.lastName}
          </Text>
          <View style={styles.roleBadge}>
            <Text style={[styles.userRole, { color: colors.primary }]}>
              Éleveur Certifié
            </Text>
          </View>
        </View>

        {/* Personal Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: darkMode ? colors.slate400 : colors.slate500 },
              ]}
            >
              INFORMATIONS PERSONNELLES
            </Text>
            {isEditing && (
              <TouchableOpacity onPress={handleSaveProfile} disabled={loading}>
                <Text style={[styles.saveText, { color: colors.primary }]}>
                  {loading ? "..." : "ENREGISTRER"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: darkMode ? colors.cardDark : colors.cardLight,
              },
            ]}
          >
            {isEditing ? (
              <>
                <EditItem
                  icon="person"
                  label="Prénom"
                  value={editedUser.firstName}
                  onChange={(v) =>
                    setEditedUser({ ...editedUser, firstName: v })
                  }
                  colors={colors}
                  darkMode={darkMode}
                />
                <Divider colors={colors} darkMode={darkMode} />
                <EditItem
                  icon="person"
                  label="Nom"
                  value={editedUser.lastName}
                  onChange={(v) =>
                    setEditedUser({ ...editedUser, lastName: v })
                  }
                  colors={colors}
                  darkMode={darkMode}
                />
                <Divider colors={colors} darkMode={darkMode} />
                <EditItem
                  icon="phone"
                  label="Téléphone"
                  value={editedUser.phone}
                  onChange={(v) => setEditedUser({ ...editedUser, phone: v })}
                  colors={colors}
                  darkMode={darkMode}
                  keyboardType="phone-pad"
                />
              </>
            ) : (
              <>
                <InfoItem
                  icon="person"
                  label="Prénom"
                  value={userInfo.firstName}
                  colors={colors}
                  darkMode={darkMode}
                />
                <Divider colors={colors} darkMode={darkMode} />
                <InfoItem
                  icon="person"
                  label="Nom"
                  value={userInfo.lastName}
                  colors={colors}
                  darkMode={darkMode}
                />
                <Divider colors={colors} darkMode={darkMode} />
                <InfoItem
                  icon="email"
                  label="Email"
                  value={userInfo.email}
                  colors={colors}
                  darkMode={darkMode}
                />
                <Divider colors={colors} darkMode={darkMode} />
                <InfoItem
                  icon="phone"
                  label="Téléphone"
                  value={userInfo.phone}
                  colors={colors}
                  darkMode={darkMode}
                />
              </>
            )}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: darkMode ? colors.slate400 : colors.slate500 },
            ]}
          >
            PARAMÈTRES
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: darkMode ? colors.cardDark : colors.cardLight,
              },
            ]}
          >
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <MaterialIcons
                  name="dark-mode"
                  size={20}
                  color={colors.slate400}
                />
                <Text
                  style={[
                    styles.rowLabel,
                    {
                      color: darkMode
                        ? colors.textMainDark
                        : colors.textMainLight,
                    },
                  ]}
                >
                  Mode Sombre
                </Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={toggleDarkMode}
                trackColor={{ false: colors.slate200, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { borderColor: isEditing ? colors.slate400 : colors.primary },
            ]}
            onPress={handleEditToggle}
          >
            <Text
              style={[
                styles.actionButtonText,
                { color: isEditing ? colors.slate400 : colors.primary },
              ]}
            >
              {isEditing ? "Annuler les modifications" : "Modifier mon profil"}
            </Text>
          </TouchableOpacity>

          {!isEditing && (
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: colors.slate400 }]}
              onPress={() => setPassModalVisible(true)}
            >
              <Text
                style={[styles.actionButtonText, { color: colors.slate400 }]}
              >
                Changer mon mot de passe
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Password Modal */}
      <Modal visible={passModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: darkMode ? colors.cardDark : "#fff" },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: darkMode ? colors.textMainDark : "#000" },
              ]}
            >
              Changement de mot de passe
            </Text>

            <View style={styles.modalInputBox}>
              <Text style={[styles.modalLabel, { color: colors.slate400 }]}>
                MOT DE PASSE ACTUEL
              </Text>
              <TextInput
                secureTextEntry
                style={[
                  styles.modalInput,
                  {
                    color: darkMode ? "#fff" : "#000",
                    borderColor: colors.slate200,
                  },
                ]}
                placeholder="••••••••"
                placeholderTextColor={colors.slate300}
                value={passData.current}
                onChangeText={(v) => setPassData({ ...passData, current: v })}
              />
            </View>

            <View style={styles.modalInputBox}>
              <Text style={[styles.modalLabel, { color: colors.slate400 }]}>
                NOUVEAU MOT DE PASSE
              </Text>
              <TextInput
                secureTextEntry
                style={[
                  styles.modalInput,
                  {
                    color: darkMode ? "#fff" : "#000",
                    borderColor: colors.slate200,
                  },
                ]}
                placeholder="••••••••"
                placeholderTextColor={colors.slate300}
                value={passData.new}
                onChangeText={(v) => setPassData({ ...passData, new: v })}
              />
            </View>

            <View style={styles.modalInputBox}>
              <Text style={[styles.modalLabel, { color: colors.slate400 }]}>
                CONFIRMER LE NOUVEAU
              </Text>
              <TextInput
                secureTextEntry
                style={[
                  styles.modalInput,
                  {
                    color: darkMode ? "#fff" : "#000",
                    borderColor: colors.slate200,
                  },
                ]}
                placeholder="••••••••"
                placeholderTextColor={colors.slate300}
                value={passData.confirm}
                onChangeText={(v) => setPassData({ ...passData, confirm: v })}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.slate100 },
                ]}
                onPress={() => setPassModalVisible(false)}
              >
                <Text style={{ color: colors.slate600, fontWeight: "700" }}>
                  ANNULER
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handlePasswordUpdate}
                disabled={loading}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {loading ? "..." : "CONFIRMER"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const EditItem = ({
  icon,
  label,
  value,
  onChange,
  colors,
  darkMode,
  keyboardType = "default",
}) => (
  <View style={styles.infoItem}>
    <View
      style={[
        styles.iconBox,
        { backgroundColor: darkMode ? colors.slate800 : colors.slate100 },
      ]}
    >
      <MaterialIcons name={icon} size={20} color={colors.primary} />
    </View>
    <View style={styles.infoContent}>
      <Text
        style={[
          styles.infoLabel,
          { color: darkMode ? colors.textSubDark : colors.textSubLight },
        ]}
      >
        {label.toUpperCase()}
      </Text>
      <TextInput
        style={[
          styles.editInput,
          { color: darkMode ? colors.textMainDark : colors.textMainLight },
        ]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
      />
    </View>
  </View>
);

const InfoItem = ({ icon, label, value, colors, darkMode }) => (
  <View style={styles.infoItem}>
    <View
      style={[
        styles.iconBox,
        { backgroundColor: darkMode ? colors.slate800 : colors.slate100 },
      ]}
    >
      <MaterialIcons name={icon} size={20} color={colors.primary} />
    </View>
    <View style={styles.infoContent}>
      <Text
        style={[
          styles.infoLabel,
          { color: darkMode ? colors.textSubDark : colors.textSubLight },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.infoValue,
          { color: darkMode ? colors.textMainDark : colors.textMainLight },
        ]}
      >
        {value}
      </Text>
    </View>
  </View>
);

const Divider = ({ colors, darkMode }) => (
  <View
    style={[
      styles.divider,
      { backgroundColor: darkMode ? colors.borderDark : colors.borderLight },
    ]}
  />
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  iconButtonBlur: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  headerTitle: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  scrollContent: { padding: 24, paddingBottom: 110 },
  photoSection: { alignItems: "center", marginBottom: 32 },
  photoContainer: {
    position: "relative",
    borderWidth: 3,
    borderRadius: 60,
    padding: 4,
    elevation: 12,
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowColor: "#000",
  },
  profileImage: { width: 110, height: 110, borderRadius: 55 },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  userName: {
    fontSize: 26,
    fontWeight: "900",
    marginTop: 16,
    letterSpacing: -0.5,
  },
  roleBadge: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(243, 156, 18, 0.1)",
  },
  userRole: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  card: {
    borderRadius: 24,
    padding: 12,
    elevation: 4,
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  infoValue: { fontSize: 16, fontWeight: "700" },
  divider: { height: 1, marginVertical: 4, marginLeft: 60, opacity: 0.5 },
  saveText: { fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  editInput: { padding: 0, fontSize: 16, fontWeight: "700", marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: { borderRadius: 32, padding: 28, elevation: 20 },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 28,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  modalInputBox: { marginBottom: 20 },
  modalLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
  },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    fontSize: 16,
    fontWeight: "600",
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 28 },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 16 },
  rowLabel: { fontSize: 16, fontWeight: "700" },
  actionsContainer: { gap: 14, marginTop: 10 },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
  },
  actionButtonText: { fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
});
