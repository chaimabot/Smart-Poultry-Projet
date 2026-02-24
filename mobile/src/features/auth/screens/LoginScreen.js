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
  Dimensions,
  Image,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient as LG } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

import { login } from "../../../services/auth";
import Toast from "../../../components/Toast";

const { width } = Dimensions.get("window");

export default function LoginScreen() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const handleLogin = async () => {
    if (!email || !password) {
      setToast({
        visible: true,
        message: "Veuillez remplir tous les champs",
        type: "error",
      });
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      navigation.reset({
        index: 0,
        routes: [{ name: "Dashboard" }],
      });
    } catch (error) {
      setToast({
        visible: true,
        message: error.error || "Échec de la connexion",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

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
          style={styles.keyboardAvoidingView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Top Branding Section */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <LG colors={["#22C55E", "#16A34A"]} style={styles.logoGradient}>
                  <MaterialCommunityIcons name="bird" size={48} color="#FFF" />
                </LG>
              </View>
              <Text style={styles.appName}>
                Smart <Text style={styles.greenText}>Poultry</Text>
              </Text>
              <Text style={styles.tagline}>PRECISION AGRI-TECH</Text>
            </View>

            {/* Login Form Section with Blur */}
            <BlurView
              intensity={Platform.OS === "ios" ? 20 : 40}
              tint="light"
              style={styles.blurCard}
            >
              <View style={styles.formSection}>
                <View style={styles.textHeader}>
                  <Text style={styles.welcomeTitle}>Connexion</Text>
                  <Text style={styles.welcomeSubtitle}>
                    Gérer votre exploitation en un clic.
                  </Text>
                </View>

                {/* Email Input */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>ADRESSE EMAIL</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="mail-outline"
                      size={20}
                      color="#64748B"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder="votre@email.com"
                      placeholderTextColor="#94A3B8"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* Password Input */}
                <View style={styles.inputWrapper}>
                  <View style={styles.labelRow}>
                    <Text style={styles.inputLabel}>MOT DE PASSE</Text>
                    <TouchableOpacity>
                      <Text style={styles.forgotText}>Oublié ?</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color="#64748B"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Votre mot de passe"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color="#64748B"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Login Button */}
                <TouchableOpacity
                  style={[styles.loginBtn, loading && styles.disabledBtn]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  <LG
                    colors={["#22C55E", "#15803D"]}
                    style={styles.btnGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.loginBtnText}>
                      {loading ? "CHARGEMENT..." : "SE CONNECTER"}
                    </Text>
                    {!loading && (
                      <Ionicons name="arrow-forward" size={18} color="#FFF" />
                    )}
                  </LG>
                </TouchableOpacity>

                <TouchableOpacity style={styles.socialBtn}>
                  <Ionicons name="logo-google" size={24} color="#1E293B" />
                  <Text style={styles.socialBtnText}>Google Account</Text>
                </TouchableOpacity>
              </View>

              {/* Footer Sign Up */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Pas de compte ? </Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate("Register")}
                >
                  <Text style={styles.signUpText}>Inscrivez-vous</Text>
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
  backgroundImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)", // Sophisticated darkening overlay
  },
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 25,
    paddingVertical: 40,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 35,
  },
  logoContainer: {
    width: 86,
    height: 86,
    borderRadius: 22,
    overflow: "hidden",
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    marginBottom: 15,
  },
  logoGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFF",
    letterSpacing: -1,
  },
  greenText: {
    color: "#22C55E",
  },
  tagline: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 2,
    marginTop: 5,
  },
  blurCard: {
    borderRadius: 30,
    overflow: "hidden", // Required for iOS rounded corners on BlurView
    padding: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.7)", // Fallback for Android
  },
  formSection: {
    width: "100%",
  },
  textHeader: {
    marginBottom: 25,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: "#475569",
    marginTop: 4,
  },
  inputWrapper: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  forgotText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#22C55E",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.8)",
    height: 54,
    paddingHorizontal: 15,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "600",
  },
  eyeBtn: {
    padding: 5,
  },
  loginBtn: {
    marginTop: 10,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 5,
  },
  btnGradient: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loginBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.5)",
    height: 54,
    gap: 10,
    marginTop: 20,
  },
  socialIcon: {
    width: 20,
    height: 20,
  },
  socialBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 25,
  },
  footerText: {
    fontSize: 13,
    color: "#475569",
  },
  signUpText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#15803D",
  },
  disabledBtn: {
    opacity: 0.7,
  },
});
