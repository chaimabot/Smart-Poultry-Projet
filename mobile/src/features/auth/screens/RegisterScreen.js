import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient as LG } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

import { requestAccess } from "../../../services/auth"; // <-- renommée (voir note)
import Toast from "../../../components/Toast";

export default function RegisterScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    region: "",
  });

  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const showToast = (message, type = "error") =>
    setToast({ visible: true, message, type });

  const handleRequestAccess = async () => {
    const { firstName, lastName, email, phone } = formData;

    if (!firstName || !lastName || !email || !phone) {
      showToast("Veuillez remplir tous les champs obligatoires (*)", "error");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast("Adresse e-mail invalide", "error");
      return;
    }

    setLoading(true);
    try {
      await requestAccess({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        farmName: formData.farmName,
        region: formData.region,
      });

      showToast(
        "Demande envoyée ! Vous recevrez vos identifiants par e-mail après validation.",
        "success",
      );

      setTimeout(() => {
        navigation.navigate("Login");
      }, 4000);
    } catch (error) {
      showToast(
        error?.error || "Échec de l'envoi. Veuillez réessayer.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const update = (field, val) =>
    setFormData((prev) => ({ ...prev, [field]: val }));

  return (
    <ImageBackground
      source={{
        uri: "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&w=1000&q=80",
      }}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <StatusBar style="light" />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex1}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <LG colors={["#22C55E", "#16A34A"]} style={styles.logoGradient}>
                  <MaterialCommunityIcons
                    name="account-plus"
                    size={40}
                    color="#FFF"
                  />
                </LG>
              </View>
              <Text style={styles.appName}>
                Demande d'<Text style={styles.greenText}>accès</Text>
              </Text>
              <Text style={styles.tagline}>
                REJOIGNEZ L'EXCELLENCE AGRI-TECH
              </Text>
            </View>

            {/* ── Card ── */}
            <BlurView
              intensity={Platform.OS === "ios" ? 20 : 40}
              tint="light"
              style={styles.blurCard}
            >
              {/* Info banner */}
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={18} color="#15803D" />
                <Text style={styles.infoText}>
                  Après validation par l'administrateur, vous recevrez vos
                  identifiants de connexion (e-mail + mot de passe) par e-mail.
                </Text>
              </View>

              {/* Prénom / Nom */}
              <View style={styles.row}>
                <View
                  style={[styles.inputWrapper, { flex: 1, marginRight: 10 }]}
                >
                  <Text style={styles.inputLabel}>PRÉNOM *</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Jean"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="words"
                      onChangeText={(v) => update("firstName", v)}
                    />
                  </View>
                </View>
                <View style={[styles.inputWrapper, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>NOM *</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Dupont"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="words"
                      onChangeText={(v) => update("lastName", v)}
                    />
                  </View>
                </View>
              </View>

              {/* Email */}
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>
                  ADRESSE E-MAIL * (pour recevoir vos identifiants)
                </Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color="#64748B"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="jean@exemple.com"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={(v) => update("email", v)}
                  />
                </View>
              </View>

              {/* Téléphone */}
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>TÉLÉPHONE *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="call-outline"
                    size={20}
                    color="#64748B"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="+216 99 000 000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    onChangeText={(v) => update("phone", v)}
                  />
                </View>
              </View>

              {/* Région */}
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>RÉGION</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="location-outline"
                    size={20}
                    color="#64748B"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ben Arous, Tunis…"
                    placeholderTextColor="#94A3B8"
                    onChangeText={(v) => update("region", v)}
                  />
                </View>
              </View>

              {/* Étapes */}
              <View style={styles.stepsBox}>
                <Text style={styles.stepsTitle}>Comment ça marche ?</Text>
                <View style={styles.stepRow}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepNum}>1</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Vous soumettez cette demande
                  </Text>
                </View>
                <View style={styles.stepRow}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepNum}>2</Text>
                  </View>
                  <Text style={styles.stepText}>
                    L'admin examine votre compte et valide votre accès
                  </Text>
                </View>
                <View style={styles.stepRow}>
                  <View
                    style={[styles.stepBadge, { backgroundColor: "#15803D" }]}
                  >
                    <Text style={styles.stepNum}>3</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Si validé, vous recevez vos identifiants par e-mail
                  </Text>
                </View>
              </View>

              {/* Bouton */}
              <TouchableOpacity
                style={[styles.loginBtn, loading && styles.disabledBtn]}
                onPress={handleRequestAccess}
                disabled={loading}
                activeOpacity={0.85}
              >
                <LG
                  colors={["#22C55E", "#15803D"]}
                  style={styles.btnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.loginBtnText}>
                    {loading ? "ENVOI EN COURS..." : "ENVOYER MA DEMANDE"}
                  </Text>
                  {!loading && (
                    <Ionicons name="send-outline" size={18} color="#FFF" />
                  )}
                </LG>
              </TouchableOpacity>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Déjà membre ? </Text>
                <TouchableOpacity onPress={() => navigation.navigate("Login")}>
                  <Text style={styles.signUpText}>Se connecter</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: { flex: 1, width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  safeArea: { flex: 1 },
  flex1: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 25,
    paddingVertical: 30,
    justifyContent: "center",
  },

  // Header
  header: { alignItems: "center", marginBottom: 25 },
  logoContainer: {
    width: 70,
    height: 70,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 10,
    marginBottom: 12,
  },
  logoGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FFF",
    letterSpacing: -0.5,
  },
  greenText: { color: "#22C55E" },
  tagline: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1.5,
    marginTop: 4,
  },

  // Card
  blurCard: {
    borderRadius: 30,
    overflow: "hidden",
    padding: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.72)",
  },

  // Info banner
  infoBox: {
    flexDirection: "row",
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    padding: 12,
    borderRadius: 14,
    marginBottom: 20,
    alignItems: "flex-start",
    gap: 8,
  },
  infoText: {
    fontSize: 11.5,
    color: "#15803D",
    fontWeight: "700",
    flex: 1,
    lineHeight: 17,
  },

  // Inputs
  row: { flexDirection: "row", justifyContent: "space-between" },
  inputWrapper: { marginBottom: 14 },
  inputLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    height: 50,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  textInput: { flex: 1, fontSize: 14, color: "#0F172A", fontWeight: "600" },

  // Steps
  stepsBox: {
    backgroundColor: "rgba(241,245,249,0.8)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    marginTop: 4,
  },
  stepsTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.4,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { fontSize: 11, fontWeight: "800", color: "#FFF" },
  stepText: { fontSize: 12, color: "#475569", fontWeight: "600", flex: 1 },

  // Button
  loginBtn: { borderRadius: 16, overflow: "hidden", marginTop: 6 },
  btnGradient: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loginBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  disabledBtn: { opacity: 0.65 },

  // Footer
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  footerText: { fontSize: 13, color: "#475569" },
  signUpText: { fontSize: 13, fontWeight: "800", color: "#15803D" },
});
