import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { register } from "../../../services/auth";
import Toast from "../../../components/Toast";

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const navigation = useNavigation();

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password) {
      setToast({
        visible: true,
        message: "Veuillez remplir tous les champs obligatoires",
        type: "error",
      });
      return;
    }

    setLoading(true);
    try {
      await register(firstName, lastName, email, password, phone);
      setToast({
        visible: true,
        message: "Compte créé avec succès !",
        type: "success",
      });
      setTimeout(() => {
        navigation.navigate("Dashboard");
      }, 1500);
    } catch (error) {
      setToast({
        visible: true,
        message: error.error || "Échec de l'inscription",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={{
        uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuATN5NL8GliW91_X8sBGOHugc3Y-1CFcz2_XrzY8qSQ63qF9GKRpKyl1q-1KhUSPAwdqCJcC-0mbFCDhDQaLGg6rLbzHV09KlcBoiFaRk0B2I7lAjlofeNAddkFsxzvS1xjQ5Ux5JerJ-tnkF-f0tFxiNgqiN8ZgLtCf81jOJ6ifQYD4ts9Gc4jCTJm_oNjXBov9r_yxhJs71DcIczNnbOHfPCC0w38U4gH-jJNkNcm9BMzBc_k-zTtqB_up5VdMKVw1K_SUZOS9s4",
      }}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoidingView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.mainContent}>
              {/* En-tête simplifié */}
              <View style={styles.header}>
                <Text style={styles.appName}>Créer un compte</Text>
                <Text style={styles.tagline}>REJOIGNEZ SMART POULTRY</Text>
              </View>

              <View style={styles.card}>
                {/* Prénom & Nom */}
                <View style={styles.row}>
                  <View
                    style={[styles.fieldContainer, { flex: 1, marginRight: 8 }]}
                  >
                    <Text style={styles.fieldLabel}>PRÉNOM</Text>
                    <View style={styles.inputContainer}>
                      <MaterialCommunityIcons
                        name="account-outline"
                        size={20}
                        color="rgba(255,255,255,0.6)"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.textInput}
                        placeholder="Jean"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={firstName}
                        onChangeText={setFirstName}
                      />
                    </View>
                  </View>
                  <View
                    style={[styles.fieldContainer, { flex: 1, marginLeft: 8 }]}
                  >
                    <Text style={styles.fieldLabel}>NOM</Text>
                    <View style={styles.inputContainer}>
                      <MaterialCommunityIcons
                        name="account-outline"
                        size={20}
                        color="rgba(255,255,255,0.6)"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.textInput}
                        placeholder="Dupont"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={lastName}
                        onChangeText={setLastName}
                      />
                    </View>
                  </View>
                </View>

                {/* Email */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>EMAIL</Text>
                  <View style={styles.inputContainer}>
                    <MaterialCommunityIcons
                      name="email-outline"
                      size={20}
                      color="rgba(255,255,255,0.6)"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder="jean@exemple.com"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* Téléphone */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>TÉLÉPHONE</Text>
                  <View style={styles.inputContainer}>
                    <MaterialCommunityIcons
                      name="phone-outline"
                      size={20}
                      color="rgba(255,255,255,0.6)"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder="06 12 34 56 78"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                {/* Mot de passe */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>MOT DE PASSE</Text>
                  <View style={styles.inputContainer}>
                    <MaterialCommunityIcons
                      name="lock-outline"
                      size={20}
                      color="rgba(255,255,255,0.6)"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder="••••••••"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeIcon}
                    >
                      <MaterialCommunityIcons
                        name={showPassword ? "eye" : "eye-off"}
                        size={20}
                        color="rgba(255,255,255,0.6)"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, loading && { opacity: 0.7 }]}
                  onPress={handleRegister}
                  disabled={loading}
                >
                  <Text style={styles.loginButtonText}>
                    {loading ? "INSCRIPTION..." : "S'INSCRIRE"}
                  </Text>
                  {!loading && (
                    <MaterialCommunityIcons
                      name="arrow-right"
                      size={18}
                      color="#ffffff"
                    />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Déjà un compte ?{" "}
                  <Text
                    style={styles.signUpLink}
                    onPress={() => navigation.navigate("Login")}
                  >
                    Connectez-vous
                  </Text>
                </Text>
              </View>
            </View>
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

// Styles identiques à LoginScreen pour cohérence
const styles = StyleSheet.create({
  backgroundImage: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  safeArea: { flex: 1 },
  keyboardAvoidingView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center" },
  mainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: { alignItems: "center", marginBottom: 30 },
  appName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  tagline: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 4,
    fontWeight: "500",
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    padding: 24,
    marginBottom: 20,
  },
  row: { flexDirection: "row" },
  fieldContainer: { marginBottom: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.9)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 6,
    marginLeft: 4,
  },
  inputContainer: { position: "relative" },
  inputIcon: { position: "absolute", left: 14, top: 16, zIndex: 10 },
  textInput: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingLeft: 48,
    paddingRight: 48,
    color: "#ffffff",
    fontSize: 15,
  },
  eyeIcon: { position: "absolute", right: 14, top: 16, zIndex: 10 },
  loginButton: {
    width: "100%",
    backgroundColor: "#F39C12",
    paddingVertical: 18,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 12,
    elevation: 8,
    shadowColor: "#F39C12",
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  loginButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 14,
  },
  footer: { marginTop: 10, alignItems: "center" },
  footerText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
  signUpLink: { color: "#F39C12", fontWeight: "900" },
});
